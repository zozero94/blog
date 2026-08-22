import { GoogleGenAI } from '@google/genai';

/**
 * 2026 최신 Gemini 가용 모델 우선순위 풀
 */
export const CANDIDATE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash-latest',
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
        err?.status === 404 ||
        err?.message?.includes('404') ||
        err?.message?.includes('RESOURCE_EXHAUSTED');

      if (isOverloaded) {
        console.warn(`[Gemini] 모델 ${modelName} 호출 실패 -> 다음 안정 모델로 자동 전환 중...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[Gemini] 모든 가용 모델 호출 실패. 마지막 오류: ${lastError?.message || lastError}`);
}
