import 'dotenv/config';

const siteId = process.env.WP_SITE_ID!;
const token = process.env.WP_ACCESS_TOKEN!;

async function seedQualityPosts() {
  console.log('🚀 3대 대표 분야 최고품질 칼럼 공식 복구 및 정식 발행 시작...');

  const posts = [
    {
      title: '한국은행 기준금리 동결과 원/달러 환율 1,410원대: 하반기 유동성 사이클과 자산 방어 전략',
      categories: ['경제'],
      tags: ['기준금리', '환율전망', '한국은행', '거시경제', '달러투자'],
      content: `<div style="font-family: 'Pretendard', sans-serif; color: #1e293b; line-height: 1.8; max-width: 720px; margin: 0 auto; padding: 16px;">
<div style="background-color: #eff6ff; border-left: 5px solid #3b82f6; padding: 20px; border-radius: 8px; margin-bottom: 28px;">
  <strong style="color: #1e40af; font-size: 17px; display: block; margin-bottom: 8px;">💡 3줄 핵심 요약</strong>
  <ul style="margin: 0; padding-left: 20px; color: #1e3a8a; font-size: 15px;">
    <li>한국은행 기준금리 2.75% 유지 속 고환율(1,414원) 장기화 국면 진입</li>
    <li>미국 연준(Fed) 금리 정책과의 격차로 인한 외국인 수급 변동성 확대</li>
    <li>달러 자산 분산 배분 및 고금리 파킹통장·단기채를 활용한 유동성 방어 전략 필수</li>
  </ul>
</div>

<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 28px;">
  <div style="font-weight: 700; color: #0f172a; margin-bottom: 10px;">🏛️ 공공기관 공식 팩트체크 데이터</div>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr style="border-bottom: 1px solid #cbd5e1;"><td style="padding: 8px 0; color: #64748b;">한국은행 기준금리</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #0f172a;">2.75% (동결)</td></tr>
    <tr><td style="padding: 8px 0; color: #64748b;">원/달러 환율 (매매기준율)</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #2563eb;">1,414.90원</td></tr>
  </table>
</div>

<h2>1. 현상과 배경: 왜 환율은 내려오지 않는가?</h2>
<p>최근 글로벌 통화 시장에서 달러화 강세 기조가 유지되면서 원/달러 환율이 1,410원 선에서 높은 변동성을 보이고 있습니다. 한국은행은 물가 안정과 가계부채 관리를 고려해 기준금리를 2.75%로 유지하고 있으며, 시장은 미국 연방준비제도(Fed)의 피벗 시점에 촉각을 곤두세우고 있습니다.</p>

<h2>2. 시장 심리와 사이클: 외국인 자금 흐름과 원화 가치</h2>
<p>한미 금리차가 유지되는 환경에서는 국내 증시와 채권 시장에서 외국인 투자자들의 환헤지 비용이 증가하게 됩니다. 이에 따라 원화 자산보다는 달러 자산에 대한 선호도가 일시적으로 높아지는 사이클이 지속되고 있습니다.</p>

<h2>3. 실전 자산 시뮬레이션: 환율·금리 변동 시 내 자산 손익</h2>
<div style="overflow-x: auto; margin: 20px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: center;">
    <thead>
      <tr style="background: #f1f5f9; color: #334155;">
        <th style="padding: 10px; border: 1px solid #e2e8f0;">시나리오</th>
        <th style="padding: 10px; border: 1px solid #e2e8f0;">원/달러 환율</th>
        <th style="padding: 10px; border: 1px solid #e2e8f0;">1억원 포트폴리오 영향</th>
        <th style="padding: 10px; border: 1px solid #e2e8f0;">권장 대응책</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: 600;">고환율 지속</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">1,420원 돌파</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #dc2626;">수입물가 상승 / 원화가치 하락</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">미국 배당주 및 달러 ETF 30% 유지</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: 600;">금리 인하 개시</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">1,350원 하향</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #2563eb;">채권 가격 상승 / 증시 반등</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">중장기 국채 및 성장주 비중 확대</td>
      </tr>
    </tbody>
  </table>
</div>

<h2>4. 독자 맞춤형 3대 실천 행동 수칙</h2>
<ol style="padding-left: 20px; line-height: 1.8;">
  <li><strong>비상금 파킹통장 활용</strong>: 연 3.0~3.5%대 단기 수시입출금 통장에 3~6개월 생활비 확보</li>
  <li><strong>달러 자산 분할 매수</strong>: 환율 조정기마다 미국 고배당 ETF(SCHD 등) 적립식 매수</li>
  <li><strong>고정금리 대출 비중 점검</strong>: 향후 금리 인하 속도를 감안한 혼합형 대출 갈아타기 검토</li>
</ol>

<h2>5. 자주 묻는 질문 (FAQ)</h2>
<p><strong>Q: 지금 달러 환전을 더 해야 할까요?</strong><br/>A: 1,410원 이상에서는 일시 매수보다 분할 매도 또는 단기 채권 ETF를 통한 간접 투자가 안전합니다.</p>
<p><strong>Q: 국내 기준금리는 언제 내리나요?</strong><br/>A: 수도권 집값 및 가계대출 추이에 따라 한국은행 금융통화위원회의 신중한 결정이 예상됩니다.</p>
</div>`,
    },
    {
      title: '월 300만원 배당금 파이프라인: 2026 ISA·연금저축 월배당 ETF 포트폴리오 끝장 가이드',
      categories: ['재테크'],
      tags: ['월배당ETF', '배당금', 'ISA계좌', '연금저축', '절세전략', '파이어족'],
      content: `<div style="font-family: 'Pretendard', sans-serif; color: #1e293b; line-height: 1.8; max-width: 720px; margin: 0 auto; padding: 16px;">
<div style="background-color: #eff6ff; border-left: 5px solid #3b82f6; padding: 20px; border-radius: 8px; margin-bottom: 28px;">
  <strong style="color: #1e40af; font-size: 17px; display: block; margin-bottom: 8px;">💡 3줄 핵심 요약</strong>
  <ul style="margin: 0; padding-left: 20px; color: #1e3a8a; font-size: 15px;">
    <li>개정된 ISA 계좌 납입한도(연 4,000만원)와 비과세 혜택(최대 1,000만원) 극대화</li>
    <li>미국배당다우존스 + 커버드콜 ETF 조합으로 연 7~9%대 안정적 월배당 현금흐름 구축</li>
    <li>일반 계좌 대비 배당소득세(15.4%) 및 금융소득종합과세 완전 방어 전략</li>
  </ul>
</div>

<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 28px;">
  <div style="font-weight: 700; color: #0f172a; margin-bottom: 10px;">🏛️ 공공기관 공식 팩트체크 데이터</div>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr style="border-bottom: 1px solid #cbd5e1;"><td style="padding: 8px 0; color: #64748b;">금융감독원 DART 공시</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #0f172a;">주요 기업 주주명부폐쇄 및 분기배당 일정 확인</td></tr>
    <tr><td style="padding: 8px 0; color: #64748b;">ISA 계좌 비과세 한도</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #2563eb;">일반형 500만원 / 서민형 1,000만원</td></tr>
  </table>
</div>

<h2>1. 현상과 배경: 직장인 월배당 ETF 열풍의 이유</h2>
<p>조기 은퇴와 안정적인 월 현금흐름을 추구하는 투자자들 사이에서 '월배당 ETF'가 필수 투자처로 자리 잡았습니다. 특히 매월 15일과 말일에 분배금을 지급하는 ETF들을 조합하여 제2의 월급 통장을 만드는 전략이 주목받고 있습니다.</p>

<h2>2. 시장 심리와 사이클: 성장형 배당 vs 고수익 커버드콜</h2>
<p>배당 성장을 추구하는 전통적인 배당성장 ETF(SCHD 추종)와 즉각적인 고배당을 제공하는 커버드콜(Covered Call) ETF를 7:3 황금비율로 분산할 때, 원금 보존과 높은 현금흐름을 동시에 달성할 수 있습니다.</p>

<h2>3. 실전 자산 시뮬레이션: 월 300만원 달성을 위한 필요 자산</h2>
<div style="overflow-x: auto; margin: 20px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: center;">
    <thead>
      <tr style="background: #f1f5f9; color: #334155;">
        <th style="padding: 10px; border: 1px solid #e2e8f0;">목표 월 배당금</th>
        <th style="padding: 10px; border: 1px solid #e2e8f0;">필요 투자 원금 (연 8% 기준)</th>
        <th style="padding: 10px; border: 1px solid #e2e8f0;">일반계좌 세금(15.4%)</th>
        <th style="padding: 10px; border: 1px solid #e2e8f0;">ISA/연금 절세 효과</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: 600;">월 100만원</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">약 1억 5,000만원</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #dc2626;">연 184만원 차감</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #2563eb;">전액 비과세/과세이연</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: 600;">월 300만원</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">약 4억 5,000만원</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #dc2626;">연 554만원 차감 + 종소세</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #2563eb;">연 500만원 이상 절세</td>
      </tr>
    </tbody>
  </table>
</div>

<h2>4. 독자 맞춤형 3대 실천 행동 수칙</h2>
<ol style="padding-left: 20px; line-height: 1.8;">
  <li><strong>계좌 개설 순서</strong>: 중개형 ISA ➔ 연금저축펀드 ➔ IRP 순으로 개설하여 절세 한도 채우기</li>
  <li><strong>배당금 전액 재투자</strong>: 초기 5년간 배당금을 복리로 재투자하여 원금 증식 가속화</li>
  <li><strong>원금 손실 방어</strong>: 기초지수 하락에 취약한 초고수익 커버드콜은 전체 비중의 30% 이하로 제한</li>
</ol>
</div>`,
    },
  ];

  for (const p of posts) {
    const res = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/new`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: p.title,
        content: p.content,
        categories: p.categories.join(','),
        tags: p.tags.join(','),
        status: 'publish',
      }),
    });
    const data = await res.json();
    console.log(`✅ [발행 완료] ID: ${data.ID} | ${data.title}`);
  }
}

seedQualityPosts();
