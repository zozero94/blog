import { GoogleGenAI } from '@google/genai';
import { GeneratedPost, AgentFeedback } from './types.js';
import { PublicFactData } from './public-data.js';
import { generateContentWithFallback, safeJsonParse, extractCleanPostFromRawText } from './model-resolver.js';
import { auditEngineeringAndArchitecture } from './system-auditor.js';

/**
 * ★ 1호점 금융/부동산 18인 전문 감수 위원회 (역할 완전 독립 · 정량 감점제)
 *
 * [위원회 공통 헌장]
 * - 각 위원은 오직 자신의 `scope`(전담 영역)만 채점한다. `forbidden`(타 위원 관할)은 절대 언급/채점하지 않는다.
 * - 채점은 10점 만점에서 시작하는 절대 감점제: `penalties`의 각 항목을 위반할 때마다 명시된 점수를 깎는다 (최저 1점).
 * - improvements(보완 지침)는 반드시 "어느 섹션에 · 무엇을 · 어떻게" 형식의 실행 가능한 지시 1~2개로 제한한다.
 */
export const REVIEWER_AGENTS = [
  {
    id: 'beginner',
    name: '초심자 독자 대변인',
    role: '금융/부동산 전문용어의 해설 여부와 일상 비유의 존재만 검증하는 용어 접근성 전담 위원',
    scope: '오직 "용어 난이도와 해설"만: 전문용어 등장 시 괄호 해설/비유 동반 여부, 첫 문단의 진입 장벽',
    forbidden: '수치 정확성, SEO, 레이아웃, 세법, 계산식은 타 위원 관할이므로 절대 채점 금지',
    penalties: [
      '해설 없이 사용된 전문용어(예: DSR, 스트레스 금리, 전세가율) 1개당 -1점 (최대 -4점)',
      '본문 전체에 일상 비유(월급/장바구니/치킨값 등)가 단 1개도 없으면 -2점',
      '첫 문단이 초심자가 이해할 수 없는 개념 나열로 시작하면 -2점',
    ],
  },
  {
    id: 'macro',
    name: '수석 거시경제 분석가',
    role: '금리·환율·유동성이 이번 이슈로 이어지는 거시 인과관계 체인의 완결성만 검증하는 전담 위원',
    scope: '오직 "거시 인과관계 체인"만: 원인(정책/지표) → 전달 경로 → 시장 결과의 3단 연결 논리',
    forbidden: '문장 가독성, 세법 수치, 실천 수칙, 글로벌 자산배분(별도 위원 존재)은 절대 채점 금지',
    penalties: [
      '원인→경로→결과 3단 인과관계 체인이 명시적으로 서술되지 않으면 -3점',
      '한국은행 기준금리 또는 연준(Fed) 정책 스탠스와의 연결 언급이 없으면 -2점',
      '거시 지표를 나열만 하고 이번 주제와의 연결 해석이 없으면 -2점',
    ],
  },
  {
    id: 'logic',
    name: '논리/정합성 검증관',
    role: '본문 내부의 주장 간 모순과 근거 없는 단정만 적발하는 논리 무결성 전담 위원',
    scope: '오직 "논리 모순"만: 앞뒤 주장 충돌, 결론과 근거의 불일치, 근거 없는 확정적 단정',
    forbidden: '수치의 사실 여부(팩트체커 관할), 문체, 구성 요소 유무는 절대 채점 금지',
    penalties: [
      '본문 내 상호 모순되는 주장 1건당 -3점',
      '결론이 본문에서 제시한 근거와 불일치하면 -3점',
      '"반드시 오른다/무조건 이득" 등 근거 없는 확정 단정 1건당 -2점',
    ],
  },
  {
    id: 'data_storyteller',
    name: '데이터 스토리텔러',
    role: '통계·수치를 "독자 개인의 손익"으로 번역했는지만 검증하는 데이터 해석 전담 위원',
    scope: '오직 "수치의 손익 번역"만: 인용된 지표가 독자의 월급/대출/자산 기준으로 환산되었는가',
    forbidden: '수치의 최신성(팩트체커 관할), 계산식 검산(계산관 관할)은 절대 채점 금지',
    penalties: [
      '공공데이터/지표 수치가 인용만 되고 "내 돈 기준" 해석(예: 월 상환액 O만원 증가)이 없으면 -3점',
      '비교 기준(전월/전년/평균 대비) 없이 던져진 수치 1건당 -1점 (최대 -3점)',
      '본문 전체 구체 수치가 3개 미만이면 -2점',
    ],
  },
  {
    id: 'seo',
    name: 'SEO & 수익화 전략가',
    role: '구글 E-E-A-T와 검색의도 충족 구조만 검증하는 검색 노출 전담 위원',
    scope: '오직 "검색 구조"만: 제목/h2의 키워드 배치, 도입부의 검색의도 즉답, 메타 일관성',
    forbidden: '내용의 사실 여부, 모바일 레이아웃(UX 아키텍트 관할)은 절대 채점 금지',
    penalties: [
      '제목에 핵심 검색 키워드가 없으면 -3점',
      'h2 소제목 중 검색 키워드를 포함한 것이 절반 미만이면 -2점',
      '도입부 200자 안에서 검색의도(독자가 알고 싶은 답)에 대한 즉답이 없으면 -2점',
      'summary/태그와 본문 주제가 불일치하면 -2점',
    ],
  },
  {
    id: 'policy',
    name: '정책/세법 리스크 감수관',
    role: 'DSR·LTV·세율 등 법정 수치와 시행 시기의 정확성만 검증하는 법령 팩트 전담 위원',
    scope: '오직 "법령/규제 수치"만: 규제 비율, 세율, 감면 요건, 시행/일몰 시기의 정확성',
    forbidden: '절세 전략 설계(세무 설계관 관할), 시장 전망, 문체는 절대 채점 금지',
    penalties: [
      'DSR/LTV/세율/공제 한도 등 법정 수치 오류 1건당 -4점',
      '제도의 시행 시기 또는 일몰 조항 미표기 시 -2점',
      '"개정 예정"인 사항을 "시행 중"처럼 서술(또는 그 반대)하면 -3점',
    ],
  },
  {
    id: 'action_coach',
    name: '실전 액션 코치',
    role: '독자가 오늘 당장 실행할 3대 행동 수칙의 구체성만 검증하는 실행력 전담 위원',
    scope: '오직 "실천 행동 수칙 섹션"만: 3대 수칙의 존재, 구체성, 신청/실행 동선',
    forbidden: '수칙의 세법 정확성(정책 감수관 관할), 문단 길이는 절대 채점 금지',
    penalties: [
      '"3대 실천 행동 수칙" 섹션 자체가 없으면 -5점',
      '수칙이 추상적(예: "관심을 갖자", "공부하자")이면 1건당 -2점',
      '신청/실행 경로(포털명 → 메뉴 → 버튼 클릭 동선)가 없으면 -2점',
    ],
  },
  {
    id: 'field',
    name: '부동산 현장/실수요 분석가',
    role: '입지·전세가율·거래량 등 현장 데이터 해석만 검증하는 부동산 실전 전담 위원',
    scope: '오직 "부동산 현장 데이터"만: 입지/학군, 전세가율, 거래량 대비 매물 소진 속도',
    forbidden: '대출 계산(계산관 관할), 세금(세무 관할), 거시 금리(거시 분석가 관할)는 절대 채점 금지',
    penalties: [
      '부동산 주제인데 입지/전세가율/거래량 중 2개 이상 분석이 빠지면 -3점',
      '구체 지역명 없이 "수도권", "지방" 수준으로만 뭉뚱그리면 -2점',
      '비부동산 주제라면: 실수요자(무주택/1주택) 체감 관점이 전혀 없을 때만 -2점, 그 외 8점 이상 부여',
    ],
  },
  {
    id: 'calculator',
    name: '자산 시뮬레이션 계산관',
    role: '금액 시뮬레이션 표의 존재·전제·검산만 검증하는 셈법 전담 위원',
    scope: '오직 "계산표"만: 구체 금액 비교표(Table)의 존재, 계산 전제 명시, 산술 검산',
    forbidden: '표의 모바일 스타일(UX 관할), 수치의 시점(팩트체커 관할)은 절대 채점 금지',
    penalties: [
      '구체적인 금액/수치 비교표(Table)가 본문에 없으면 -5점',
      '계산의 전제(원금·금리·기간·소득 구간)가 표 주변에 명시되지 않으면 -2점',
      '표 안의 산술 오류(검산 불일치) 1건당 -3점',
    ],
  },
  {
    id: 'sentiment',
    name: '시장 심리/사이클 분석가',
    role: '현재 시장의 심리 국면 진단과 군중심리 경고만 검증하는 행동재무 전담 위원',
    scope: '오직 "시장 심리"만: FOMO/공포·탐욕 국면 진단, 유동성 사이클 위치, 군중심리 경고',
    forbidden: '거시 인과관계(거시 분석가 관할), 손실 리스크 경고(세무/방어관 관할)는 절대 채점 금지',
    penalties: [
      '현재 시장이 심리 사이클의 어느 국면인지 진단이 없으면 -3점',
      'FOMO 추격매수 또는 공포 투매에 대한 행동경제학적 경고가 없으면 -2점',
      '심리 판단의 근거 지표(거래량, 심리지수, 검색량 등) 인용이 없으면 -2점',
    ],
  },
  {
    id: 'mobile_web_ux',
    name: '반응형 웹 & 모바일 UX 아키텍트',
    role: '360~430px 화면 기준 문단 분리·표 가독성·요약 박스만 검증하는 레이아웃 전담 위원',
    scope: '오직 "레이아웃"만: 문단 길이, 3줄 요약 박스, 표의 모바일 처리, 시각적 리듬',
    forbidden: '내용의 사실성/논리/SEO 키워드는 절대 채점 금지',
    penalties: [
      '5문장 이상 이어지는 긴 문단이 1개라도 존재하면 -6점',
      '도입부 3줄 핵심 요약 콜아웃 박스가 없으면 -3점',
      '4열 이상 표가 overflow-x 스크롤 처리 없이 배치되면 -2점',
      '<strong> 강조가 전혀 없는 h2 섹션이 있으면 -1점',
    ],
  },
  {
    id: 'realtime_factchecker',
    name: '실시간 시장 지표 팩트체커',
    role: '본문 수치와 오늘 실제 지표·제공된 공공데이터의 일치 여부만 전수 대조하는 시점 검증 전담 위원',
    scope: '오직 "수치의 시점 일치"만: 환율/금리/실거래가와 기준 시점 표기, 공공데이터 대조',
    forbidden: '수치의 해석(스토리텔러 관할), 법령 수치(정책 감수관 관할)는 절대 채점 금지',
    penalties: [
      '제공된 공공데이터 팩트와 본문 수치가 불일치하면 1건당 -4점',
      '기준 시점(날짜/월) 표기 없이 인용된 시장 수치 1건당 -2점 (최대 -4점)',
      '"현재", "최근"이라는 표현만 있고 구체 시점이 전혀 없으면 -2점',
    ],
  },
  {
    id: 'viral',
    name: '바이럴/공유 평가자',
    role: '단톡방·커뮤니티 공유를 부르는 킬러 문장의 존재만 검증하는 공유 유발 전담 위원',
    scope: '오직 "공유 유발 장치"만: 킬러 원라이너, 독자 상황 지칭, 반전 인사이트',
    forbidden: '제목의 SEO(SEO 전략가 관할), 사실 정확성은 절대 채점 금지',
    penalties: [
      '단톡방에 그대로 복사해 갈 만한 킬러 원라이너(한 문장 인사이트)가 없으면 -3점',
      '독자 상황 직접 지칭(예: "무주택자라면", "변동금리 대출자라면")이 없으면 -2점',
      '상식을 뒤집는 반전/역설 인사이트가 0개면 -2점',
    ],
  },
  {
    id: 'niche_tax_architect',
    name: '초밀착 세무 & 합법적 절세 설계관',
    role: '증여·양도·상속 셈법과 건보료 방어 등 절세 설계, 그리고 세금 리스크 경고만 검증하는 세무 전담 위원',
    scope: '오직 "절세 설계와 세금/손실 리스크 경고"만: 면제 한도 활용, 건보료 피부양자 방어, 추징 위험',
    forbidden: '법령 수치 원문 대조(정책 감수관 관할), 대출 계산(계산관 관할)은 절대 채점 금지',
    penalties: [
      '손실/세금 추징 리스크 경고 문단(⚠️)이 본문에 없으면 -6점',
      '증여/상속 면제 한도 등 절세 셈법 수치가 부정확하면 1건당 -4점',
      '건보료·피부양자 자격에 영향이 있는 주제인데 해당 검토가 없으면 -2점',
    ],
  },
  {
    id: 'life_cycle_curator',
    name: '생애주기 맞춤 복지·지원금 큐레이터',
    role: '세대별(청년/신혼/은퇴) 정부 지원 제도 연계만 검증하는 복지 연결 전담 위원',
    scope: '오직 "세대별 지원 제도 연계"만: 2030/3040/5060별 적용 포인트, 자격 요건, 연계 제도',
    forbidden: '제도의 법령 수치 정확성(정책 감수관 관할), 신청 동선의 구체성(액션 코치 관할)은 절대 채점 금지',
    penalties: [
      '세대별(청년/신혼·영끌/은퇴준비) 맞춤 적용 포인트 구분이 전혀 없으면 -3점',
      '이번 주제와 연계 가능한 정부 지원 제도/우대 상품 언급이 0건이면 -3점',
      '언급된 지원 제도의 핵심 자격 요건(나이/소득)이 없으면 -2점',
    ],
  },
  {
    id: 'global_macro_strategist',
    name: '글로벌 자산배분 & 대체투자 전략가',
    role: '국내 이슈를 미 국채·환율·금·빅테크 등 글로벌 자산 관점으로 연결했는지만 검증하는 글로벌 전담 위원',
    scope: '오직 "글로벌 연결"만: 미 10년물 금리, 달러/엔 환율, 금·원자재, 해외 주식과의 연결 시각',
    forbidden: '국내 거시 인과관계(거시 분석가 관할), 국내 부동산(현장 분석가 관할)은 절대 채점 금지',
    penalties: [
      '국내 이슈와 글로벌 지표(미 국채 금리/달러) 간 연결 시각이 전혀 없으면 -3점',
      '대체 자산(금/엔화/채권/리츠 등) 관점 언급이 0개면 -2점',
      '해외 자산을 다루면서 환헤지/환노출 구분 언급이 없으면 -2점',
    ],
  },
  {
    id: 'crisis_defense_counselor',
    name: '전세사기 & 금융 리스크 방어관',
    role: '최악 시나리오 방어 매뉴얼과 구제 기관 실전 동선만 검증하는 위기 대응 전담 위원',
    scope: '오직 "방어 매뉴얼"만: 역전세/깡통전세/금리 급등 등 최악 시나리오 대응, HUG·HF 구제 동선',
    forbidden: '세금 리스크(세무 설계관 관할), 시장 심리(심리 분석가 관할)는 절대 채점 금지',
    penalties: [
      '이 주제에서 벌어질 수 있는 최악 시나리오와 방어 매뉴얼이 없으면 -4점',
      '전세/보증 관련 주제인데 HUG/HF 등 구제 기관 실전 동선이 없으면 -3점',
      '사전 피해 예방 체크리스트(계약 전 확인 사항 등)가 없으면 -2점',
    ],
  },
  {
    id: 'cashflow_pipeline_analyst',
    name: '파이프라인 & 월 현금흐름 분석가',
    role: '자산 전략을 월 단위 패시브 인컴으로 환산했는지만 검증하는 현금흐름 전담 위원',
    scope: '오직 "월 현금흐름"만: 월배당/이자/연금의 월 환산액, 세후 기준, 재원의 지속가능성',
    forbidden: '일회성 시세차익 계산(계산관 관할), 글로벌 배분 비중(글로벌 전략가 관할)은 절대 채점 금지',
    penalties: [
      '투자/자산 주제인데 월 단위 현금흐름 환산(월 O만원)이 전혀 없으면 -3점',
      '현금흐름이 세전/세후 구분 없이 서술되면 -2점',
      '배당/이자 재원의 지속가능성(감액 위험) 검토가 없으면 -2점',
    ],
  },
  {
    id: 'single_link_precision',
    name: '단일 고정밀 링크 적합성 검증관',
    role: '본문에 주제와 100% 일치하는 단 1개의 공식/대표 링크만 정밀하게 배치되었는지 검증하는 링크 순도 전담 위원',
    scope: '오직 "단일 링크 정밀도와 남발 방지"만: 공식 포털 카드의 단 1개 존재 여부, 무분별한 네이버/유튜브/SNS 링크 남발 차단',
    forbidden: '링크 작동 기술(시스템 감사 관할), SEO 키워드는 절대 채점 금지',
    penalties: [
      '본문 내 불필요하거나 의미 없는 일반 검색/SNS 링크가 1개라도 남발되면 -5점',
      '주제와 100% 직결되는 핵심 공식 링크가 아니면 -4점',
      '핵심 링크가 2개 이상 산만하게 분산 배치되어 있으면 -3점',
    ],
  },
  {
    id: 'fact_verifiability',
    name: '객관적 사실 & 검증가능성 감사관',
    role: '출처 없는 뇌피셜, 주관적 과장, 과학적/통계적으로 입증할 수 없는 허위·과장 서술만 적발하는 사실 무결성 전담 위원',
    scope: '오직 "객관적 검증 가능성"만: 공인 데이터/공식 보도로 증명 불가능한 뇌피셜, 주관적 단정, 근거 없는 수치 추정',
    forbidden: '논리 모순(논리 검증관 관할), 수치의 시점(팩트체커 관할)은 절대 채점 금지',
    penalties: [
      '객관적으로 입증되지 않은 주관적 단정이나 뇌피셜 1건당 -4점',
      '공인 출처가 없는 통계나 근거 없는 인과관계 서술 1건당 -3점',
      '"무조건 대박", "100% 안전" 등 비과학적/비검증 과장 표현 1건당 -3점',
    ],
  },
  {
    id: 'legal_compliance',
    name: '법적 리스크 & 컴플라이언스 변호인',
    role: '명예훼손, 저작권, 허위사실 유포, 공정위 표시광고법, 금융소비자보호법 위반 요소만 검증하는 법률 전담 위원',
    scope: '오직 "법적 컴플라이언스"만: 특정인/상호 비방(명예훼손), 불법 투자 자문/확정 수익률 보장(금소법), 대가성 미표기',
    forbidden: '세법 수치 검증(정책/세무 관할), 문체는 절대 채점 금지',
    penalties: [
      '특정 개인이나 브랜드에 대한 근거 없는 비방/명예훼손 소지 표현 1건당 -5점',
      '확정 수익률 보장 또는 1:1 투자 자문 형태의 금소법 위반 소지 서술 1건당 -5점',
      '공정위 대가성 고지 누락 또는 부당 비교 광고 1건당 -4점',
    ],
  },
];

/**
 * 21인 전문가 에이전트 종합 리뷰 실행 (10점 만점 / 100점 환산)
 * - 각 위원은 자신의 전담 영역만, 절대 감점제로 채점한다.
 */
export async function evaluateWith12Agents(
  apiKey: string,
  post: GeneratedPost,
  publicData: PublicFactData | null,
  round: number
): Promise<{ feedbacks: AgentFeedback[]; averageScore: number }> {
  const ai = new GoogleGenAI({ apiKey });

  const agentDescriptions = REVIEWER_AGENTS.map(
    (a, i) =>
      `${i + 1}. [${a.name}]
   - 전담 영역(이것만 채점): ${a.scope}
   - 채점 금지 영역: ${a.forbidden}
   - 정량 감점 규칙(10점 시작, 위반 시 감점, 최저 1점):
${a.penalties.map((p) => `     · ${p}`).join('\n')}`
  ).join('\n\n');

  const prompt = `당신은 대한민국 최고 권위의 금융 리서치 센터 21인 감수 위원회 시뮬레이터입니다.
아래 블로그 원고(Round ${round} 버전)를 21인 각자의 관점에서 **독립적으로** 채점하세요.

[위원회 공통 헌장 — 절대 준수]
1. 각 위원은 자신의 "전담 영역"만 채점하고, "채점 금지 영역"은 절대 언급하지 않는다. (역할 중복 채점 = 무효)
2. 채점은 10점에서 시작하는 절대 감점제: 아래 각 위원의 "정량 감점 규칙"을 기계적으로 적용하고, improvements에 어떤 규칙으로 몇 점을 감점했는지 명시한다. 최저 점수는 1점.
3. improvements는 "어느 섹션에 · 무엇을 · 어떻게"가 담긴 실행 가능한 지시 최대 2개로 작성한다. 모호한 지시("보강 필요") 금지.
4. 감점 사유가 전혀 없으면 9~10점을 부여하고 improvements에 "감점 없음 - 현행 유지"라고 쓴다. (관대화 방지: 감점 사유가 있는데 8점 이상을 주는 것 금지)

[21인의 전문가 페르소나 및 감점 규칙]
${agentDescriptions}

[평가 대상 원고]
제목: ${post.title}
카테고리: ${post.categories.join(', ')}
태그: ${post.tags.join(', ')}
본문(HTML):
${post.htmlContent.slice(0, 4000)}...

[원고 작성 시 반영된 공공데이터 팩트 (팩트체커 대조용)]
${publicData ? JSON.stringify(publicData, null, 2) : '공공데이터 없음'}

반드시 다음 JSON 배열 포맷으로만 응답하세요 (agentName은 위 페르소나 이름과 정확히 일치):
[
  {
    "agentName": "전문가 이름",
    "role": "전담 영역 한 줄",
    "score": 7,
    "strengths": "전담 영역 안에서 훌륭한 점 (1문장)",
    "improvements": "[적용 감점 규칙과 점수] + 어느 섹션에 무엇을 어떻게 고칠지 실행 지시 (최대 2개)"
  }, ... (총 21개, 배열 순서는 페르소나 순서와 동일)
]`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = safeJsonParse<AgentFeedback[]>(response.text || '[]', []);
    const validFeedbacks = parsed.length > 0 ? parsed : REVIEWER_AGENTS.map((a) => ({
      agentName: a.name,
      role: a.role,
      score: 6,
      strengths: '기본적인 분석 흐름이 충실함',
      improvements: '모바일 가독성 및 자산 시뮬레이션 수치 보강 필요',
    }));

    const totalScore = validFeedbacks.reduce((acc, f) => acc + (f.score || 6), 0);
    const averageScore = Number((totalScore / validFeedbacks.length).toFixed(1));

    return { feedbacks: validFeedbacks, averageScore };
  } catch (e) {
    return {
      feedbacks: REVIEWER_AGENTS.map((a) => ({
        agentName: a.name,
        role: a.role,
        score: 6,
        strengths: '기본 흐름 분석 중',
        improvements: '모바일 가독성 및 팩트 재검증 필요',
      })),
      averageScore: 6.0,
    };
  }
}

/**
 * 18인의 피드백을 반영하여 원고 전면 리라이팅
 * - 감점 위원(낮은 점수) 지시 우선 반영 + 충돌 조정 규칙 내장
 */
export async function rewritePostWithFeedback(
  apiKey: string,
  currentPost: GeneratedPost,
  feedbacks: AgentFeedback[],
  publicData: PublicFactData | null,
  round: number
): Promise<GeneratedPost> {
  const ai = new GoogleGenAI({ apiKey });

  // 낮은 점수(치명 지적) 순으로 정렬하여 우선순위를 프롬프트에 그대로 노출
  const sorted = [...feedbacks].sort((a, b) => (a.score || 10) - (b.score || 10));
  const critical = sorted.filter((f) => (f.score || 10) <= 7);
  const passedNotes = sorted.filter((f) => (f.score || 10) >= 8);

  const criticalSummary = critical
    .map(
      (f, i) =>
        `[우선순위 ${i + 1} | ${f.agentName} | ${f.score}/10점]\n★ 필수 반영 지시: ${f.improvements}`
    )
    .join('\n\n');

  const keepSummary = passedNotes
    .map((f) => `- [${f.agentName}] 유지할 강점: ${f.strengths}`)
    .join('\n');

  const systemInstruction = `당신은 대한민국 최고 권위의 금융/경제 수석 전문 에디터이자 콘텐츠 디렉터입니다.
21인 감수 위원회의 피드백(Round ${round})을 반영하여 기존 원고를 전면 리라이팅하세요.

[피드백 반영 우선순위 및 충돌 조정 규칙 — 절대 준수]
1. **감점 지시 100% 우선 반영**: "필수 반영 지시" 목록은 우선순위(낮은 점수) 순이다. 위에서부터 하나도 빠짐없이 본문에 반영한다.
2. **🚫 AI 상투적 자기소개 및 뇌피셜 배제**: "안녕하세요", "최고 수준의 분석가입니다", "오늘은 ~에 대해 알아보겠습니다" 등 인위적 AI 도입부 전면 삭제하고 곧바로 본론 팩트로 시작한다. 객관적으로 입증 불가능한 뇌피셜은 전면 삭제/정정한다.
3. **🔗 단일 공식 포털 링크 원칙**: 본문 전체에서 링크는 단 1개의 공식 포털 카드만 유지하고, 불필요한 네이버/유튜브/SNS 링크는 전면 삭제한다.
4. **🛡️ 법적 컴플라이언스 준수**: 특정인/브랜드 비방(명예훼손) 및 불법 투자권유/확정수익 단정 표현을 전면 배제한다.
5. **충돌 시 서열**: ① 팩트/법령/법적 컴플라이언스 정정 > ② 단일 링크/필수 구성 요소 추가 > ③ 구조/레이아웃 > ④ 문체/표현.
6. **강점 보존**: 8점 이상 위원이 칭찬한 요소는 삭제/훼손하지 말고 유지한다.
7. **필수 골격 불변**: 3줄 요약 박스, 공식 포털 직통 카드(단 1개), 시뮬레이션 계산표(Table), ⚠️ 리스크 경고 문단, 3대 실천 수칙, FAQ 3선은 반드시 생성/보존한다.
8. **공공데이터 수치 불변**: 제공된 공공데이터 팩트의 수치는 임의로 변경/창작하지 않는다.
9. **모바일 반응형**: 모든 문단은 2~4문장, 핵심 수치는 <strong>, 표는 overflow-x 스크롤 래퍼 유지.
10. 🚫 [이미지: ...], 사진 영역 등 어떠한 플레이스홀더도 절대 작성 금지.

[출력 형식]
반드시 다음 JSON 형식으로만 응답하세요:
{
  "title": "클릭률을 극대화하는 매력적인 SEO 제목",
  "summary": "3줄 핵심 요약",
  "htmlContent": "<p>완성된 고품질 반응형 HTML 본문...</p>",
  "categories": ["카테고리"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}`;

  const prompt = `[현재 원고 제목]: ${currentPost.title}
[카테고리]: ${currentPost.categories.join(', ')}
[태그]: ${currentPost.tags.join(', ')}

[현재 본문 HTML]:
${currentPost.htmlContent}

[공공데이터 팩트 (수치 변경 금지)]:
${publicData ? JSON.stringify(publicData, null, 2) : '공공데이터 없음'}

[★ 필수 반영 지시 — 우선순위 순 (하나도 누락 금지)]:
${criticalSummary || '치명 지적 없음 — 아래 강점을 유지하며 완성도만 다듬을 것'}

[유지해야 할 강점]:
${keepSummary || '없음'}

위 지시를 우선순위 순으로 전부 반영한 최종 리라이팅 원고를 작성하세요.`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
    });

    const responseText = response.text || '';
    return extractCleanPostFromRawText(
      responseText,
      currentPost.title,
      currentPost.categories[0] || '경제',
      currentPost.tags
    );
  } catch (e) {
    console.error(`[Reviewer] Round ${round} 리라이팅 오류, 이전 원고 유지:`, e);
    return currentPost;
  }
}

/**
 * 최소 2회 이상 + 75점 돌파제 + 5인 개발/아키텍처 감사 + 메인 총괄 에디터 최종 마스터 검수 루프
 */
export async function executeIterativeReviewLoop(
  apiKey: string,
  initialPost: GeneratedPost,
  publicData: PublicFactData | null,
  targetScore: number = 7.5,
  maxRounds: number = 4
): Promise<{ finalPost: GeneratedPost; reviewSummary: string; roundsExecuted: number; passed: boolean; finalScore: number }> {
  console.log('\n================================================================');
  console.log(`🏛️ [1호점 21인 감수 엔진 가동] 최소 2회 + 75점(7.5/10) 돌파제 루프 시작`);
  console.log('================================================================');

  let currentPost = initialPost;
  let currentScore = 0;
  let lastFeedbacks: AgentFeedback[] = [];
  const scoreHistory: number[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    console.log(`\n🔍 [Round ${round}/${maxRounds}] 21인의 금융/경제/세무/부동산/법률 전문가가 원고 정밀 평가 중...`);
    const evalResult = await evaluateWith12Agents(apiKey, currentPost, publicData, round);
    currentScore = evalResult.averageScore;
    lastFeedbacks = evalResult.feedbacks;
    scoreHistory.push(currentScore);

    const scoreOutOf100 = Math.round(currentScore * 10);
    console.log(`📊 [Round ${round} 채점 결과] 21인 종합 평균: ${currentScore} / 10점 (${scoreOutOf100}점 / 100점)`);

    evalResult.feedbacks.slice(0, 3).forEach((f) => {
      console.log(`   - [${f.agentName}] (${f.score}점): ${f.improvements}`);
    });

    // 최소 2회 이상 실행 + 75점 돌파 시 통과
    if (round >= 2 && currentScore >= targetScore) {
      console.log(`\n🎉 🎯 [기준 통과] Round ${round}에서 종합점수 ${scoreOutOf100}점으로 75점 기준 돌파 성공!`);
      break;
    }

    if (round < maxRounds) {
      console.log(`\n✍️ [Round ${round} 리라이팅] 21인 지적사항을 반영하여 전면 리라이팅 진행 중...`);
      currentPost = await rewritePostWithFeedback(apiKey, currentPost, lastFeedbacks, publicData, round);
      console.log(`✅ [Round ${round} 리라이팅 완료]: "${currentPost.title}"`);
    }
  }

  // =========================================================================
  // ★ [4.8단계: 5인의 개발/아키텍처 집중형 엔지니어링 감사]
  // =========================================================================
  console.log('\n💻 [4.8단계] 5인의 개발/아키텍처 집중형 엔지니어링 에이전트 시스템 감사 가동...');
  const devAudit = auditEngineeringAndArchitecture(currentPost);
  currentPost.htmlContent = devAudit.sanitizedHtml;
  console.log(`🛠️ 개발/아키텍처 종합 평점: ${devAudit.averageDevScore} / 10점 (${devAudit.overallPassed ? '전원 통과' : '경미한 수정'})`);
  devAudit.feedbacks.forEach((f) => {
    console.log(`   - [${f.agentName}] (${f.score}점): ${f.recommendations.join(', ')}`);
  });

  // =========================================================================
  // ★ [메인 총괄 에이전트] 총괄 편집국장 최종 마스터 검수 및 발행 승인 단계
  // =========================================================================
  console.log('\n👑 [메인 총괄 에이전트] 총괄 수석 에디터(편집국장) 최종 마스터 검수 및 폴리싱 가동...');
  const masterPost = await executeFinanceChiefEditorFinalInspection(
    apiKey,
    currentPost,
    publicData,
    scoreHistory.map((s, idx) => `R${idx + 1}:${Math.round(s * 10)}점`).join(' ➔ '),
    devAudit.feedbacks.map((f) => `[${f.agentName}] ${f.recommendations.join(', ')}`).join('\n')
  );
  console.log(`🎖️ [최종 마스터 승인 완료] 수석 편집국장 최종 검수 완료: "${masterPost.title}"`);

  const finalScore = Math.round(currentScore * 10);
  const passed = currentScore >= targetScore;

  return {
    finalPost: masterPost,
    reviewSummary: `${scoreHistory.map((s, idx) => `R${idx + 1}:${Math.round(s * 10)}점`).join(' ➔ ')} | Dev:${devAudit.averageDevScore}점`,
    roundsExecuted: scoreHistory.length,
    passed,
    finalScore,
  };
}

/**
 * 1호점 금융/경제 메인 총괄 에이전트 (총괄 수석 에디터 / 편집국장) 최종 마스터 검수 & 폴리싱
 * - 편집국장은 "새 내용 창작"이 아니라 "최종 승인 폴리싱"만 수행한다.
 */
export async function executeFinanceChiefEditorFinalInspection(
  apiKey: string,
  post: GeneratedPost,
  publicData: PublicFactData | null,
  reviewHistory: string,
  devIssuesSummary: string = ''
): Promise<GeneratedPost> {
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `당신은 대한민국 최고 권위의 금융/경제 리서치 총괄 편집국장(Editor-in-Chief Main Agent)입니다.
21인 콘텐츠 감수 위원회와 5인 엔지니어링 감사를 모두 통과한 원고에 대해 "최종 발행 승인 폴리싱"만 수행하세요.

[편집국장의 권한과 한계 — 절대 준수]
1. **폴리싱 전용**: 새 주장/새 수치를 창작하지 않는다. 이미 감수된 팩트·수치·계산표·링크는 절대 변경 금지.
2. **🚫 AI 상투적 자기소개 완전 퇴출**: 도입부에 "안녕하세요", "최고의 분석가" 등 AI식 자기소개 잔재가 남아있다면 전면 삭제하고 자연스럽게 본론으로 시작하도록 다듬는다.
3. **🔗 단 1개의 공식 링크만 유지**: 불필요하거나 의미 없는 일반 검색 링크는 전면 삭제하고, 오직 단 1개의 공식 포털 카드만 유지한다.
4. **삭제 금지 골격**: 3줄 요약 박스, 공식 포털 직통 카드(단 1개), 계산표(Table), ⚠️ 리스크 경고, 3대 실천 수칙, FAQ 3선은 반드시 그대로 보존한다.
5. **허용 작업 (오직 이것만)**:
   - 지루한 서론/중복 수식어/번역투 문장 제거 및 문장 다듬기
   - 섹션 간 연결 브릿지 문장 추가로 리듬감 부여
   - 제목의 마지막 헤드라인 폴리싱 (핵심 키워드는 유지)
   - 5인 엔지니어링 감사가 보고한 잔여 기술 이슈(닫는 태그, 보안 속성)의 최종 반영 확인
6. 🚫 플레이스홀더([이미지: ...]) 발견 시 해당 문구만 삭제한다.

[출력 형식]
반드시 다음 JSON 포맷으로만 응답하세요:
{
  "title": "편집국장이 최종 확정한 마스터 헤드라인",
  "summary": "3줄 핵심 요약",
  "htmlContent": "<p>완성된 최종 마스터 HTML 본문...</p>",
  "categories": ["카테고리"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}`;

  const prompt = `[21인 콘텐츠 감수 이력]: ${reviewHistory}
[5인 개발/아키텍처 감사 보고]: ${devIssuesSummary || '기술적 이슈 없음 (전원 합격)'}
[원고 제목]: ${post.title}
[카테고리]: ${post.categories.join(', ')}

[본문]:
${post.htmlContent}

위 원고를 편집국장 권한 범위(폴리싱 전용) 안에서 최종 마스터본으로 승인해 주세요.`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.5,
        maxOutputTokens: 8192,
      },
    });

    const responseText = response.text || '';
    return extractCleanPostFromRawText(
      responseText,
      post.title,
      post.categories[0] || '경제',
      post.tags
    );
  } catch (e) {
    return post;
  }
}

export const executeTwoRoundReviewLoop = executeIterativeReviewLoop;
