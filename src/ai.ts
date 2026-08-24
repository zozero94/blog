import { GoogleGenAI } from '@google/genai';
import { CategoryConfig, GeneratedPost, NewsItem } from './types.js';
import { PublicFactData } from './public-data.js';
import { generateContentWithFallback, extractCleanPostFromRawText } from './model-resolver.js';

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
이 초안은 작성 직후 **18인 전문 감수 위원회의 절대 감점제 채점**을 받습니다. 아래 [감수단 사전 통과 체크리스트]의 항목이 하나라도 빠지면 해당 위원이 즉시 감점하므로, 초안 단계에서 전 항목을 반드시 포함하세요.

[★ 18인 감수단 사전 통과 체크리스트 — 누락 시 감점되는 필수 요소]
□ 3줄 핵심 요약 박스 (누락 시 UX 위원 -3점)
□ 🏛️ 공식 정부/공공기관 직통 포털 카드 (누락 시 SEO/신뢰성 감점)
□ 구체적인 금액/수치 비교표(Table) + 계산 전제(원금·금리·기간) 명시 (표 누락 시 계산관 -5점, 전제 누락 -2점)
□ ⚠️ 손실/세금 추징 리스크 경고 문단 (누락 시 세무 설계관 -6점)
□ 3대 실천 행동 수칙 + 신청 동선(포털명→메뉴→클릭 경로) (섹션 누락 시 액션 코치 -5점)
□ FAQ 3선 (Q&A 형식)
□ 모든 문단 2~4문장 (5문장 이상 문단 1개라도 존재 시 UX 위원 -6점)
□ 모든 시장 수치에 기준 시점(날짜/월) 표기 (미표기 수치 1건당 팩트체커 -2점)
□ 전문용어 첫 등장 시 괄호 해설 또는 일상 비유 (미해설 용어 1개당 -1점)
□ 원인→경로→결과의 거시 인과관계 3단 체인 서술
□ 세대별(청년/신혼/은퇴) 맞춤 적용 포인트 + 연계 정부 지원 제도 1건 이상
□ 단톡방 공유용 킬러 원라이너 1문장 + 독자 상황 지칭("무주택자라면" 등)
□ 투자/자산 주제인 경우: 월 단위 현금흐름 환산(세전/세후 구분) 및 글로벌 지표(미 국채/달러) 연결 시각

[핵심 작성 및 UI/UX 원칙]
1. **단일 주제 집중 (Single Deep Dive)**: 주어진 **[단 1개의 핵심 주제: "${mainTopicTitle}"]**에 대해서만 깊이 있는 단독 칼럼을 완성하세요.
2. **다중 소스 교차 검증 (Cross-Verification)**: 3개 이상의 유사 언론 보도와 공공 데이터를 교차 검증하여 팩트 중심의 명쾌한 인과관계를 서술하세요. 제공된 공공데이터 수치는 절대 임의 변경/창작 금지.
3. **📱 웹 & 모바일 반응형 UI/UX 최적화 스타일**:
   - **문단 길이**: 스마트폰 작은 화면에서도 답답하지 않도록 한 문단은 2~4문장 이내로 끊어서 작성하세요.
   - **가독성 강조**: 핵심 키워드나 수치에는 <strong> 태그를 적극 적용하세요.
   - **표 처리**: 4열 이상 표는 반드시 <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;"> 래퍼로 감싸세요.
   - **도입부 3줄 요약 박스**: 
     <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 18px; border-radius: 8px; margin-bottom: 25px; line-height: 1.7;">
       <strong style="color: #1e40af; font-size: 15px;">💡 3줄 핵심 요약</strong>
       <ul style="margin: 8px 0 0 0; padding-left: 18px; font-size: 14.5px; color: #1e293b;">...</ul>
     </div>
   - **🏛️ 대한민국 공식 정부/공공기관 직통 바로가기 배너 카드 (필수 삽입)**:
     <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 14px 18px; margin: 20px 0; display: flex; align-items: center; justify-content: space-between;">
       <div>
         <strong style="color: #0f172a; font-size: 14px;">🏛️ 공식 출처 및 직통 신청 포털</strong>
         <p style="margin: 3px 0 0 0; font-size: 12.5px; color: #64748b;">공인된 정부/공공기관 공식 홈페이지에서 세부 정보 및 조회를 진행하세요.</p>
       </div>
       <a href="https://www.data.go.kr" target="_blank" rel="noreferrer noopener" referrerpolicy="no-referrer" style="display: inline-block; background: #1e293b; color: #ffffff; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap;">공식 포털 바로가기 &rarr;</a>
     </div>
   - **구성**:
     ① 도입부: 문제 제기 + 3줄 핵심 요약 박스 + 🏛️ [공식 포털 직통 배너]
     ② 📌 [정부/공공기관 공식 팩트체크 박스] (해당시)
     ③ <h2> 1. 현상 분석: 왜 지금 이 이슈가 터져 나왔는가? (원인→전달 경로→시장 결과의 3단 인과관계 체인 + 한국은행/연준 정책 스탠스 연결)
     ④ <h2> 2. 시장 심리와 파급력: 내 자산과 통장에 미치는 실질적 영향 (심리 사이클 국면 진단 + FOMO/공포 경고 + 수치의 "내 돈 기준" 환산)
     ⑤ <h2> 3. 실전 자산 시뮬레이션: 구체적 셈법 (대출 이자/세금 절감/수익률 정밀 2단 계산표 Table + 계산 전제 명시 + 검산 완료된 수치만 기재)
     ⑥ <h2> 4. ⚠️ 반드시 알아야 할 치명적 리스크와 주의사항 (세금 추징 위험, 원금 손실, 중도 해지 패널티 + 최악 시나리오 방어 매뉴얼/구제 기관 동선)
     ⑦ <h2> 5. 맞춤형 3대 실천 행동 수칙 & 신청 3단계 동선 (청년/신혼·실수요자/은퇴준비자 세대별 + 연계 정부 지원 제도와 자격 요건 + 실제 포털 클릭 경로 명시)
     ⑧ <h2> 6. 가장 자주 묻는 FAQ 3선 (<dl> 또는 <strong>Q/A</strong> 형식, 답변에 구체 수치/날짜 포함)
     ⑨ 결론: 최종 제언 + 단톡방 공유용 킬러 원라이너 1문장
     ⑩ 💡 [선택적 연관 도서/실전 준비물 카드] (★무조건 넣지 말고, 해당 금융/부동산 주제와 100% 직결되는 베스트셀러 경제 도서나 이사/실생활 꿀템이 명확한 경우에만 본문 맨 끝에 은은한 1줄 카드로 삽입):
        <div style="margin: 28px 0 10px 0; padding: 14px 18px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 13.5px; color: #475569;">
          <span style="font-size: 15px;">📚</span> <strong style="color: #1e293b;">함께 보면 좋은 전문가 추천 자료:</strong>
          <p style="margin: 6px 0 0 0;"><a href="https://www.coupang.com/np/search?q=[주제연관도서또는아이템명]" target="_blank" rel="noreferrer noopener" referrerpolicy="no-referrer" style="color: #2563eb; text-decoration: underline; font-weight: 600;">[해당 주제 필수 도서/준비물명] 최저가 및 세부 정보 확인하기 &rarr;</a></p>
          <p style="font-size: 11px; color: #94a3b8; margin-top: 6px; margin-bottom: 0;">※ 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다. (ID: AF2968960)</p>
        </div>

[🚫 절대 금지 항목]
- 텍스트 형태의 '📸 [이미지: ...]', '사진 가이드', 회색 빈 박스 등 모든 종류의 이미지 플레이스홀더 작성 절대 금지 (완결된 텍스트, 표, 공공데이터 박스로만 구성할 것).

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
      maxOutputTokens: 8192,
    },
  });

  const responseText = response.text || '';
  return extractCleanPostFromRawText(
    responseText,
    `[심층분석] ${mainTopicTitle}`,
    config.wpCategory,
    config.tags
  );
}
