import { GoogleGenAI } from '@google/genai';

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
      const isOverloaded =
        err?.status === 503 ||
        err?.message?.includes('503') ||
        err?.message?.includes('high demand') ||
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.status === 404 ||
        err?.message?.includes('RESOURCE_EXHAUSTED');

      if (isOverloaded) {
        console.warn(`[Gemini] 모델 ${modelName} 일시적 부하 감지 -> 다음 가용 모델로 자동 전환 중...`);
        // 1초 지연 후 다음 모델 시도
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[Gemini] 모든 가용 모델 호출 실패. 마지막 오류: ${lastError?.message || lastError}`);
}

/**
 * LLM JSON 응답 안전 파싱 헬퍼 (제어문자 및 마크다운 백틱 정제)
 */
export function safeJsonParse<T>(rawText: string, fallback: T): T {
  if (!rawText) return fallback;
  try {
    let cleaned = rawText.trim();
    // 마크다운 ```json ... ``` 블록 제거
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    }
    return JSON.parse(cleaned) as T;
  } catch (e) {
    // 줄바꿈/제어문자 정제 후 2차 시도
    try {
      const sanitized = rawText
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ''))
        .trim();
      return JSON.parse(sanitized) as T;
    } catch (e2) {
      console.warn('[safeJsonParse] 파싱 실패, 기본값 적용:', e);
      return fallback;
    }
  }
}
