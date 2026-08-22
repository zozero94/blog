import { GoogleGenAI } from '@google/genai';
import { CategoryConfig, GeneratedPost, NewsItem } from './types.js';
import { PublicFactData } from './public-data.js';
import { generateContentWithFallback } from './model-resolver.js';

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
          `<tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; background: #f8fafc; font-size: 14px; color: #1e293b;">${it.label}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #1d4ed8; font-weight: 700; font-size: 14px;">${it.value}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">${it.extra || '-'}</td>
          </tr>`
      )
      .join('');

    publicDataHtmlGuide = `
[필수 요구사항 - 모바일 최적화 공공기관 공식 팩트체크 박스]
본문 서론 직후에 반드시 아래 스타일의 세련된 모바일 반응형 HTML 공식 데이터 박스를 삽입하세요:
<div style="background-color: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 18px 20px; margin: 25px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
  <div style="display: flex; align-items: center; margin-bottom: 10px;">
    <span style="font-size: 18px; margin-right: 6px;">📌</span>
    <h4 style="margin: 0; color: #166534; font-size: 16px; font-weight: 700;">[${publicData.sourceName}] 공식 팩트체크 데이터</h4>
  </div>
  <p style="font-size: 13.5px; color: #4b5563; margin: 0 0 12px 0; line-height: 1.5;">공공기관에 등록된 실제 공인 데이터 및 지표 현황입니다.</p>
  <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
    <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 300px;">
      <thead>
        <tr style="background: #e2e8f0;">
          <th style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; font-size: 13px; color: #334155;">항목</th>
          <th style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; font-size: 13px; color: #334155;">공식 수치 / 지표</th>
          <th style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; font-size: 13px; color: #334155;">비고</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>
</div>`;
  }

  const systemInstruction = `당신은 대한민국 최고 수준의 경제/부동산/재테크 수석 칼럼니스트이자 웹 & 모바일 반응형 UI/UX 전문 콘텐츠 디렉터입니다.

[핵심 작성 및 UI/UX 원칙]
1. **단일 주제 집중 (Single Deep Dive)**: 주어진 **[단 1개의 핵심 주제: "${mainTopicTitle}"]**에 대해서만 깊이 있는 단독 칼럼을 완성하세요.
2. **다중 소스 교차 검증 (Cross-Verification)**: 3개 이상의 유사 언론 보도와 공공 데이터를 교차 검증하여 팩트 중심의 명쾌한 인과관계를 서술하세요.
3. **📱 웹 & 모바일 반응형 UI/UX 최적화 스타일**:
   - **문단 길이**: 스마트폰 작은 화면에서도 답답하지 않도록 한 문단은 2~4문장 이내로 끊어서 작성하세요.
   - **가독성 강조**: 핵심 키워드나 수치에는 <strong> 태그를 적극 적용하세요.
   - **도입부 3줄 요약 박스**: 
     <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 18px; border-radius: 8px; margin-bottom: 25px; line-height: 1.7;">
       <strong style="color: #1e40af; font-size: 15px;">💡 3줄 핵심 요약</strong>
       <ul style="margin: 8px 0 0 0; padding-left: 18px; font-size: 14.5px; color: #1e293b;">...</ul>
     </div>
   - **구성**:
     ① 도입부: 문제 제기 + 3줄 핵심 요약 박스
     ② 📌 [정부/공공기관 공식 팩트체크 박스]
     ③ <h2> 1. 현상 분석: 왜 지금 이 이슈가 터져 나왔는가? (배경 및 원인)
     ④ <h2> 2. 시장 심리와 파급력: 내 자산과 통장에 미치는 실질적 영향
     ⑤ <h2> 3. 실전 자산 시뮬레이션: 구체적 셈법 (이자/세금/수익률 계산표)
     ⑥ <h2> 4. 맞춤형 3대 실천 행동 수칙 (초심자/실수요자/투자자별)
     ⑦ <h2> 5. 가장 자주 묻는 FAQ 3선
     ⑧ 결론: 최종 제언 및 1줄 요약

[출력 형식]
반드시 다음 JSON 포맷으로만 응답하세요 (마크다운 백틱 없이 순수 JSON):
{
  "title": "클릭률을 극대화하는 매력적인 SEO 제목",
  "summary": "3줄 핵심 요약 (텔레그램 및 메타 미리보기용)",
  "metaDescription": "검색엔진 최적화 150자 내외 메타 디스크립션",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6"],
  "htmlContent": "<p>완성된 반응형 HTML 본문...</p>"
}`;

  const prompt = `[카테고리]: ${config.name} (${config.topic})
[선정된 단 1개의 핵심 주제]: ${mainTopicTitle}

[최소 3개 이상 언론 보도 교차 검증 소스]:
${sourcesText}

${publicDataPrompt}

${publicDataHtmlGuide}

위 정보를 바탕으로 모바일과 PC 양쪽에서 가장 읽기 편하고 신뢰도 높은 완결형 블로그 포스팅을 작성해 주세요.`;

  const response = await generateContentWithFallback(ai, {
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
