import { GoogleGenAI } from '@google/genai';
import { CategoryConfig, GeneratedPost, NewsItem } from './types.js';
import { PublicFactData } from './public-data.js';

export async function generateSingleTopicPost(
  apiKey: string,
  config: CategoryConfig,
  mainTopicTitle: string,
  crossSources: NewsItem[],
  publicData: PublicFactData | null
): Promise<GeneratedPost> {
  const ai = new GoogleGenAI({ apiKey });

  // 3개 이상 유사 보도 소스 텍스트 포맷팅
  const sourcesText = crossSources
    .map(
      (s, idx) =>
        `[보도 소스 ${idx + 1}]
- 기사 제목: ${s.title}
- 언론사/출처: ${s.source || '언론보도'} (${s.pubDate || '최신'})
- 핵심 내용 요약: ${s.contentSnippet || '본문 요약 없음'}`
    )
    .join('\n\n');

  // 공공기관 팩트 데이터 포맷팅
  let publicDataPrompt = '공공기관 연동 데이터: 없음 (일반 공인 통계 기준 서술)';
  let publicDataHtmlGuide = '';

  if (publicData && publicData.items.length > 0) {
    publicDataPrompt = `[${publicData.sourceName} 공식 공인 데이터]
- 데이터 분류: ${publicData.dataType}
${publicData.items.map((it) => `- ${it.label}: ${it.value} (${it.extra || ''})`).join('\n')}`;

    const tableRows = publicData.items
      .map(
        (it) =>
          `<tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">${it.label}</td><td style="padding: 8px; border: 1px solid #e2e8f0; color: #1e40af; font-weight: bold;">${it.value}</td><td style="padding: 8px; border: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">${it.extra || '-'}</td></tr>`
      )
      .join('');

    publicDataHtmlGuide = `
[필수 요구사항 - 공공기관 공식 팩트체크 박스]
본문 중간(서론과 1차 소주제 직후)에 반드시 아래 스타일의 HTML 공식 데이터 박스를 삽입하여 공신력을 극대화하세요:
<div style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 16px; margin: 24px 0;">
  <h4 style="margin-top: 0; color: #166534; font-size: 16px;">📌 [${publicData.sourceName}] 공식 팩트체크 데이터</h4>
  <p style="font-size: 14px; color: #374151; margin-bottom: 12px;">최근 공공기관에 등록된 실제 공인 데이터 및 지표 현황입니다.</p>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <thead>
      <tr style="background: #e2e8f0;">
        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">항목</th>
        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">공식 수치 / 지표</th>
        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">비고 / 기준</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</div>`;
  }

  const systemInstruction = `당신은 대한민국 최고의 경제/부동산/재테크 전문 수석 칼럼니스트이자 고수익 블로그 SEO 전문가입니다.

[핵심 작성 원칙]
1. **단일 주제 집중 (Single Deep Dive)**: 여러 잡다한 이슈를 섞지 말고, 주어진 **[단 1개의 핵심 주제: "${mainTopicTitle}"]**에 대해서만 깊이 있고 전문적인 단독 분석 칼럼을 완성하세요.
2. **다중 소스 교차 검증 (Cross-Verification)**: 제공된 3개 이상의 유사 언론 보도 소스를 비교 분석하여 팩트가 확인된 내용만을 근거로 삼고, 서로 다른 시각이나 쟁점을 균형 있게 다루세요.
3. **독자 체류시간 & 애드센스 최적화 구조**:
   - 가독성 높은 HTML 태그(<h2>, <h3>, <strong>, <ul>, <ol>, <blockquote>, <table>)를 적재적소에 배치하세요.
   - 구성:
     ① 도입부: 왜 지금 이 주제가 가장 뜨거운 이슈인지 + 핵심 요약 3줄 (Callout 박스)
     ② 📌 [정부/공공기관 공식 팩트체크 박스] (제시된 템플릿 준수)
     ③ <h2> 1. 현상 분석: 무엇이 왜 일어났는가? (원인과 배경)
     ④ <h2> 2. 독자/투자자 관점의 직접적 영향: 내 자산에는 어떤 변화가 오는가?
     ⑤ <h2> 3. 실전 대응 가이드: 지금 당장 실천할 수 있는 체크리스트 3가지
     ⑥ <h2> 4. 독자들이 가장 궁금해하는 FAQ 3선 (Q&A 형식)
     ⑦ 결론: 전문가 최종 제언 및 1줄 요약

[출력 형식]
반드시 다음 JSON 포맷으로만 응답하세요 (마크다운 백틱 없이 순수 JSON):
{
  "title": "클릭률을 극대화하는 매력적인 SEO 제목 (예: [단독분석] 주제...)",
  "summary": "3줄 핵심 요약 (텔레그램 및 메타 미리보기용)",
  "metaDescription": "구글 검색엔진 노출용 150자 내외 메타 디스크립션",
  "tags": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5", "키워드6"],
  "htmlContent": "<p>...</p><h2>...</h2>..."
}`;

  const prompt = `[카테고리]: ${config.name} (${config.topic})
[선정된 단 1개의 핵심 주제]: ${mainTopicTitle}

[최소 3개 이상 언론 보도 교차 검증 소스]:
${sourcesText}

${publicDataPrompt}

${publicDataHtmlGuide}

위의 교차 검증된 보도 자료와 공공기관 공식 데이터를 바탕으로, 독자들에게 최고의 신뢰와 실질적인 해결책을 주는 완결형 단일 주제 블로그 포스팅을 작성해 주세요.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  });

  const responseText = response.text || '';
  try {
    const parsed = JSON.parse(responseText);
    return {
      title: parsed.title || `[심층분석] ${mainTopicTitle}`,
      summary: parsed.summary || '최신 시장 동향 및 공공 데이터 기반 교차 분석',
      htmlContent: parsed.htmlContent || `<p>${responseText}</p>`,
      tags: Array.isArray(parsed.tags) ? parsed.tags : config.tags,
      categories: [config.wpCategory],
      metaDescription: parsed.metaDescription || parsed.summary || '',
    };
  } catch (err) {
    console.error('[AI] JSON 파싱 에러, 폴백 처리:', err);
    return {
      title: `[심층분석] ${mainTopicTitle}`,
      summary: '최신 교차 검증 데이터 기반 심층 분석',
      htmlContent: `<div>${responseText.replace(/\n/g, '<br/>')}</div>`,
      tags: config.tags,
      categories: [config.wpCategory],
      metaDescription: mainTopicTitle,
    };
  }
}
