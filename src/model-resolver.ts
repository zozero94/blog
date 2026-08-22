import { GoogleGenAI } from '@google/genai';

let cachedLatestModel: string | null = null;

/**
 * 구글 Gemini API에서 현재 사용 가능한 가장 최신/최고 버전의 모델을 실시간 자동 감지
 */
export async function getOptimalGeminiModel(apiKey: string): Promise<string> {
  // 사용자가 명시적으로 환경변수를 준 경우 우선 사용
  if (process.env.GEMINI_MODEL) {
    return process.env.GEMINI_MODEL;
  }

  if (cachedLatestModel) {
    return cachedLatestModel;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const pager = await ai.models.list();
    const flashModels: string[] = [];

    for await (const m of pager) {
      const name = m.name?.replace(/^models\//, '') || '';
      // 안정적인 주력 flash 모델 필터링
      if (
        name.startsWith('gemini-') &&
        name.endsWith('-flash') &&
        !name.includes('preview') &&
        !name.includes('tts') &&
        !name.includes('image') &&
        !name.includes('audio')
      ) {
        flashModels.push(name);
      }
    }

    // 버전 번호 기준 내림차순 정렬 (예: gemini-3.7-flash > gemini-3.6-flash > gemini-3.5-flash)
    flashModels.sort((a, b) => {
      const vA = parseFloat(a.replace('gemini-', '').replace('-flash', '')) || 0;
      const vB = parseFloat(b.replace('gemini-', '').replace('-flash', '')) || 0;
      return vB - vA;
    });

    if (flashModels.length > 0) {
      cachedLatestModel = flashModels[0];
      return cachedLatestModel;
    }
  } catch (err) {
    console.warn('[ModelResolver] 실시간 모델 자동 탐색 실패, 기본 최신 모델로 폴백:', err);
  }

  // 기본 안전 폴백
  cachedLatestModel = 'gemini-3.7-flash';
  return cachedLatestModel;
}
