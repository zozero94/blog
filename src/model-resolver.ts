import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from '@google/genai';

export const CANDIDATE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
];

export type FlexibleGenerateParams = Omit<GenerateContentParameters, 'model'> & { model?: string };

/**
 * 일시적 트래픽 폭주(503/429) 발생 시 다음 최신 모델로 자동 Fallback 및 재시도 실행
 */
export async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: FlexibleGenerateParams
): Promise<GenerateContentResponse> {
  const preferredModel = process.env.GEMINI_MODEL;
  const modelsToTry = preferredModel
    ? [preferredModel, ...CANDIDATE_MODELS.filter((m) => m !== preferredModel)]
    : CANDIDATE_MODELS;

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('429') || errMsg.includes('high demand')) {
        console.warn(`[Gemini] 모델 ${model} 일시적 부하 감지 -> 다음 안정 모델로 자동 전환 중...`);
        // 1.5초 대기 후 다음 모델 시도
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      // 503이 아닌 다른 치명적 에러면 throw
      throw err;
    }
  }

  throw lastError;
}

export async function getOptimalGeminiModel(apiKey: string): Promise<string> {
  return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}
