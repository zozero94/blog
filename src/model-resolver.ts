import { GoogleGenAI } from '@google/genai';
import { GeneratedPost } from './types.js';

/**
 * 2026 최신 Gemini 공식 가용 모델 우선순위 풀
 */
export const CANDIDATE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-pro-latest',
];

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: {
      systemInstruction?: string;
      responseMimeType?: string;
      temperature?: number;
      maxOutputTokens?: number;
    };
  }
) {
  let lastError: any = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const isRetryable =
        err?.status === 503 ||
        err?.message?.includes('503') ||
        err?.status === 500 ||
        err?.message?.includes('500') ||
        err?.status === 502 ||
        err?.message?.includes('502') ||
        err?.message?.includes('high demand') ||
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.status === 404 ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('fetch failed') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('ETIMEDOUT');

      if (isRetryable) {
        console.warn(`[Gemini] 모델 ${modelName} 호출 실패 (${err?.message?.slice(0, 80)}) -> 다음 가용 모델로 자동 전환 중...`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[Gemini] 모든 가용 모델 호출 실패. 마지막 오류: ${lastError?.message || lastError}`);
}

/**
 * LLM JSON 응답 안전 파싱 헬퍼 (프리앰블 텍스트 자동 정제)
 */
export function safeJsonParse<T>(rawText: string, fallback: T): T {
  if (!rawText) return fallback;
  try {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    }
    return JSON.parse(cleaned) as T;
  } catch (e) {
    try {
      const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]) as T;
      }
      const sanitized = rawText
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ''))
        .trim();
      return JSON.parse(sanitized) as T;
    } catch (e2) {
      return fallback;
    }
  }
}

/**
 * JSON 파싱 실패 시에도 순수 HTML 본문과 제목을 100% 정제 추출하는 복구 파서
 */
export function extractCleanPostFromRawText(
  rawText: string,
  defaultTitle: string,
  category: string,
  tags: string[]
): GeneratedPost {
  // 1. 정상 JSON 파싱 시도
  const parsed = safeJsonParse<any>(rawText, null);
  if (parsed && parsed.title && parsed.htmlContent) {
    return {
      title: cleanText(parsed.title),
      summary: cleanText(parsed.summary || '최신 공인 데이터 기반 교차 분석'),
      htmlContent: cleanHtml(parsed.htmlContent),
      tags: Array.isArray(parsed.tags) ? parsed.tags : tags,
      categories: [category],
      metaDescription: cleanText(parsed.metaDescription || parsed.summary || defaultTitle),
    };
  }

  // 2. 정규식을 통한 비정형 JSON 복구 (Unescaped string 파싱)
  let title = defaultTitle;
  const titleMatch = rawText.match(/"title"\s*:\s*"([^"]+)"/);
  if (titleMatch) title = titleMatch[1];

  let summary = '최신 공인 데이터 및 언론 보도 심층 분석';
  const summaryMatch = rawText.match(/"summary"\s*:\s*"([^"]+)"/);
  if (summaryMatch) summary = summaryMatch[1];

  let htmlContent = '';
  const htmlMatch = rawText.match(/"htmlContent"\s*:\s*"([\s\S]*)/);
  if (htmlMatch) {
    let rawHtml = htmlMatch[1];
    rawHtml = rawHtml
      .replace(/"\s*,\s*"\w+"[\s\S]*$/, '')
      .replace(/"\s*}\s*```?$/, '')
      .replace(/"\s*$/, '');
    htmlContent = cleanHtml(rawHtml);
  } else {
    // 3. 본문 내 순수 HTML 태그 영역만 탐색
    const tagMatch = rawText.match(/(<(div|p|h2|h1|section)[\s\S]*<\/(div|p|h2|h1|section)>)/);
    if (tagMatch) {
      htmlContent = cleanHtml(tagMatch[1]);
    } else {
      // JSON 키워드 찌꺼기 완전 제거
      const sanitized = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .replace(/\{\s*"title"[\s\S]*?"htmlContent"\s*:\s*"?/gi, '')
        .replace(/"\s*,\s*"(tags|summary|metaDescription)"[\s\S]*$/, '')
        .trim();
      htmlContent = `<p>${sanitized.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
    }
  }

  return {
    title: cleanText(title),
    summary: cleanText(summary),
    htmlContent,
    tags,
    categories: [category],
    metaDescription: cleanText(summary),
  };
}

function cleanText(str: string): string {
  return str.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\r/g, '').trim();
}

function cleanHtml(html: string): string {
  let cleaned = html
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\t/g, '  ')
    .trim();

  // 만약 앞뒤에 JSON 잔재(따옴표나 괄호)가 남아있다면 제거
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // 시작 부분의 JSON 키워드 박멸
  cleaned = cleaned.replace(/^\{\s*"title"[\s\S]*?"htmlContent"\s*:\s*"?/i, '');

  return cleaned;
}
