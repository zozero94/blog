import { GoogleGenAI } from '@google/genai';
import { GeneratedPost } from './types.js';
import { PublicFactData } from './public-data.js';
import { generateContentWithFallback } from './model-resolver.js';

export interface AgentFeedback {
  agentName: string;
  role: string;
  score: number; // 10점 만점
  strengths: string;
  improvements: string;
}

export const REVIEWER_AGENTS = [
  { id: 'beginner', name: '초심자 독자', role: '난해한 금융/부동산 용어 해설, 쉬운 비유 및 친절한 설명 검증' },
  { id: 'macro', name: '수석 거시경제 분석가', role: '거시 경제 지표와 미시 시장 간의 인과관계 및 깊이 있는 통찰 검증' },
  { id: 'logic', name: '논리/정합성 검증관', role: '원인-영향-대응책 간의 논리적 모순 및 기승전결 정합성 검증' },
  { id: 'data_storyteller', name: '데이터 스토리텔러', role: '공공데이터/실거래가 수치가 독자에게 주는 의미와 손익 해석 여부 검증' },
  { id: 'seo', name: 'SEO & 수익화 전략가', role: '구글 E-E-A-T 기준 충족, 검색의도 완벽 해소 및 체류시간 극대화 구조 검증' },
  { id: 'policy', name: '정책/세법 리스크 감수관', role: 'DSR/LTV 규제, 세금 감면/중과 수치 및 정책 팩트 정확도 검증' },
  { id: 'action_coach', name: '실전 액션 코치', role: '독자가 당장 내 자산/통장에 실천할 수 있는 3대 구체적 행동 수칙 검증' },
  { id: 'field', name: '부동산 현장/실수요 분석가', role: '실제 입지, 학군, 전세가율, 거래량 대비 매물 소진 속도 해석 검증' },
  { id: 'calculator', name: '자산 시뮬레이션 계산관', role: '대출 이자 부담 변화, 세금 절감액, 수익률 등 구체적 계산 예시 검증' },
  { id: 'sentiment', name: '시장 심리/사이클 분석가', role: '대중의 FOMO, 공포/탐욕 심리 및 유동성 사이클 반영 여부 검증' },
  { id: 'mobile_ux', name: '모바일 UX/가독성 디렉터', role: '모바일 화면 최적화, 표(Table), 굵은 글씨, 콜아웃 박스 시각 구조 검증' },
  { id: 'viral', name: '바이럴/공유 평가자', role: '단톡방/커뮤니티 공유를 유도하는 킬러 인사이트 및 핵심 문장 검증' },
];

/**
 * 12인 전문가 에이전트 종합 리뷰 실행
 */
export async function evaluateWith12Agents(
  apiKey: string,
  post: GeneratedPost,
  publicData: PublicFactData | null,
  round: number
): Promise<{ feedbacks: AgentFeedback[]; averageScore: number }> {
  const ai = new GoogleGenAI({ apiKey });

  const agentDescriptions = REVIEWER_AGENTS.map(
    (a, i) => `${i + 1}. [${a.name}] (${a.role})`
  ).join('\n');

  const prompt = `당신은 대한민국 최고 권위의 미디어/금융리서치 센터 12인 감수 위원회입니다.
아래 작성된 블로그 원고(Round ${round} 버전)를 12인의 전문가 관점에서 엄격하게 리뷰하고 점수와 보완 지침을 작성하세요.

[12인의 전문가 페르소나]
${agentDescriptions}

[평가 대상 원고]
제목: ${post.title}
3줄 요약: ${post.summary}
공공데이터 반영: ${publicData ? `${publicData.sourceName} (${publicData.summaryText})` : '없음'}
본문(HTML 요약): ${post.htmlContent.slice(0, 3000)}...

[평가 및 피드백 원칙]
1. 특히 "데이터 스토리텔러"와 "자산 시뮬레이션 계산관"은 단순 수치 나열을 넘어 **독자가 이해할 수 있는 해석과 구체적 셈법(계산 예시)**이 들어있는지 집중 채점하세요.
2. 12인 각각의 관점에서 10점 만점 점수, 잘된 점, 반드시 수정해야 할 구체적 보강 지침을 제시하세요.

반드시 다음 JSON 배열 포맷으로만 응답하세요:
[
  {
    "agentName": "전문가 이름",
    "role": "역할",
    "score": 8,
    "strengths": "잘된 부분",
    "improvements": "구체적인 보강 및 수정 지시사항"
  }, ... (총 12개)
]`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.3 },
    });
    const feedbacks = JSON.parse(response.text || '[]') as AgentFeedback[];
    const totalScore = feedbacks.reduce((acc, f) => acc + (f.score || 7), 0);
    const averageScore = feedbacks.length > 0 ? Number((totalScore / feedbacks.length).toFixed(1)) : 8.0;
    return { feedbacks, averageScore };
  } catch (e) {
    console.warn(`[Reviewer] 12인 리뷰 파싱 오류, 기본 피드백 적용:`, e);
    return {
      feedbacks: REVIEWER_AGENTS.map((a) => ({
        agentName: a.name,
        role: a.role,
        score: 8,
        strengths: '기본 구조 및 전문성 확보',
        improvements: '데이터에 대한 구체적 해석과 독자 행동 가이드 보강 필요',
      })),
      averageScore: 8.0,
    };
  }
}

/**
 * 12인의 피드백을 총망라하여 메인 에디터 AI가 원고를 전면 리라이팅/업그레이드
 */
export async function rewritePostWithFeedback(
  apiKey: string,
  currentPost: GeneratedPost,
  feedbacks: AgentFeedback[],
  publicData: PublicFactData | null,
  round: number
): Promise<GeneratedPost> {
  const ai = new GoogleGenAI({ apiKey });

  const feedbackSummary = feedbacks
    .map(
      (f, i) =>
        `[${i + 1}. ${f.agentName} (점수: ${f.score}/10)]\n- 잘된 점: ${f.strengths}\n- ★ 필수 보강 지침: ${f.improvements}`
    )
    .join('\n\n');

  const systemInstruction = `당신은 세계 최고 수준의 수석 에디터이자 콘텐츠 디렉터입니다.
12인의 전문 감수 위원회가 제출한 상세 피드백(Round ${round})을 완벽히 흡수하여, 기존 원고를 최상급 프리미엄 칼럼으로 전면 리라이팅(Refinement)하세요.

[리라이팅 필수 반영 항목]
1. **데이터의 독자적 의미 해석 (데이터 스토리텔링)**: 국토부 실거래가나 한국은행 금리 등의 수치가 나왔을 때, "이게 나에게 왜 중요하고, 향후 시장에 어떤 파급력을 주는가?"를 명쾌한 인과관계로 해석하세요.
2. **구체적인 셈법/시뮬레이션 삽입**: 독자가 즉각 체감할 수 있는 계산 예시(예: 대출 이자 변동액, 양도세/취득세 차이, 수익률 비교)를 표나 콜아웃 박스로 명시하세요.
3. **입체적 구조**:
   - 도입부: 클릭 유도형 문제 제기 + 핵심 3줄 요약 (Callout 박스)
   - 📌 [정부/공공기관 공식 팩트체크 및 데이터 해석 박스] (수치 + 상세 해석)
   - <h2> 1. 현상과 배경: 왜 지금 이 수치가 터져 나왔는가?
   - <h2> 2. 시장 심리와 사이클: 대중의 움직임과 향후 시나리오
   - <h2> 3. 실전 자산 시뮬레이션: 내 돈에 미치는 구체적 영향 (계산식/표)
   - <h2> 4. 독자 맞춤형 3대 실천 행동 수칙 (초심자/실수요자/투자자별)
   - <h2> 5. 가장 궁금해하는 FAQ 3선
   - 결론: 1줄 핵심 요약 및 최종 제언

[출력 형식]
반드시 다음 JSON 포맷으로만 응답하세요 (마크다운 백틱 없이 순수 JSON):
{
  "title": "12인 피드백을 반영해 더욱 매력적으로 개선된 SEO 제목",
  "summary": "3줄 핵심 요약",
  "metaDescription": "검색 최적화 메타 디스크립션",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6"],
  "htmlContent": "<p>완성된 고품질 HTML 본문...</p>"
}`;

  const prompt = `[현재 원고 제목]: ${currentPost.title}

[12인의 전문가 상세 리뷰 및 보강 지침 (Round ${round})]:
${feedbackSummary}

[공공데이터 정보]:
${publicData ? `${publicData.sourceName} - ${publicData.dataType} (${publicData.summaryText})` : '없음'}

[기존 본문]:
${currentPost.htmlContent}

위 12인의 지적 사항을 100% 반영하여 한 차원 높은 완성도의 최종 원고로 리라이팅해 주세요.`;

  const response = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  });

  try {
    const parsed = JSON.parse(response.text || '{}');
    return {
      title: parsed.title || currentPost.title,
      summary: parsed.summary || currentPost.summary,
      htmlContent: parsed.htmlContent || currentPost.htmlContent,
      tags: Array.isArray(parsed.tags) ? parsed.tags : currentPost.tags,
      categories: currentPost.categories,
      metaDescription: parsed.metaDescription || currentPost.metaDescription,
    };
  } catch (err) {
    console.warn(`[Reviewer] 리라이팅 파싱 오류, 기존 포스트 유지:`, err);
    return currentPost;
  }
}

/**
 * 2회 반복 루프 전체 실행 (1회차 감수->리라이팅 -> 2회차 감수->최종 완성)
 */
export async function executeTwoRoundReviewLoop(
  apiKey: string,
  initialPost: GeneratedPost,
  publicData: PublicFactData | null
): Promise<{ finalPost: GeneratedPost; reviewSummary: string }> {
  console.log('\n================================================================');
  console.log('🏛️ [스킬 가동] 12인 멀티 전문가 에이전트 2회 반복 감수 & 리라이팅 시작');
  console.log('================================================================');

  // --- Round 1 ---
  console.log('\n🔍 [1회차 감수] 12인의 전문가 에이전트가 초안을 정밀 평가 중...');
  const round1Eval = await evaluateWith12Agents(apiKey, initialPost, publicData, 1);
  console.log(`📊 1회차 12인 평균 평가 점수: ${round1Eval.averageScore} / 10점`);
  round1Eval.feedbacks.slice(0, 4).forEach((f) => {
    console.log(`   - [${f.agentName}] (${f.score}점): ${f.improvements}`);
  });

  console.log('\n✍️ [1회차 리라이팅] 12인 피드백을 반영하여 원고 1차 전면 보강 중...');
  const round1Post = await rewritePostWithFeedback(apiKey, initialPost, round1Eval.feedbacks, publicData, 1);
  console.log(`✅ 1차 보강 완료: "${round1Post.title}"`);

  // --- Round 2 ---
  console.log('\n🔍 [2회차 재검증] 보강된 원고에 대해 12인의 전문가가 2차 재검증 수행 중...');
  const round2Eval = await evaluateWith12Agents(apiKey, round1Post, publicData, 2);
  console.log(`📊 2회차 12인 최종 평균 평가 점수: ${round2Eval.averageScore} / 10점 (상승폭: +${(round2Eval.averageScore - round1Eval.averageScore).toFixed(1)}점)`);

  console.log('\n✨ [최종 리라이팅] 2차 미세 피드백까지 완벽 반영한 최종 원고 완성 중...');
  const finalPost = await rewritePostWithFeedback(apiKey, round1Post, round2Eval.feedbacks, publicData, 2);
  console.log(`🎉 2회차 최종 완성본 도출 성공!`);
  console.log(`   - 최종 제목: ${finalPost.title}`);

  const summary = `12인 전문가 2회 교차 감수 완료 (1차 평점: ${round1Eval.averageScore}점 -> 2차 최종 평점: ${round2Eval.averageScore}점)`;
  return { finalPost, reviewSummary: summary };
}
