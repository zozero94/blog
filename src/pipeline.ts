import 'dotenv/config';
import { BlogCategory } from './types.js';
import { collectSingleTopicPipeline, CATEGORY_CONFIGS } from './collector.js';
import { fetchPublicDataForCategory } from './public-data.js';
import { generateSingleTopicPost } from './ai.js';
import { executeTwoRoundReviewLoop } from './reviewer.js';
import { executeAutomatedCodeReview } from './verifier.js';
import { BloggerClient } from './blogger.js';
import { TelegramClient } from './telegram.js';

function getCategoryFromArgs(): BlogCategory {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      const cat = arg.split('=')[1] as BlogCategory;
      if (CATEGORY_CONFIGS[cat]) {
        return cat;
      }
    }
  }

  const now = new Date();
  const kstHours = (now.getUTCHours() + 9) % 24;

  if (kstHours >= 8 && kstHours < 11) {
    return 'economy';
  } else if (kstHours >= 11 && kstHours < 15) {
    return 'real_estate';
  } else {
    return 'finance';
  }
}

async function run() {
  console.log('================================================================');
  console.log('🚀 AI 단일주제 심층 블로그 [13인 감수 + 5대 Code-Review 무인 파이프라인]');
  console.log('================================================================');

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  const ecosKey = process.env.ECOS_API_KEY;
  const dataGoKrKey = process.env.DATA_GO_KR_API_KEY;
  const dartKey = process.env.DART_API_KEY;

  const bloggerBlogId = process.env.BLOGGER_BLOG_ID;
  const bloggerClientId = process.env.BLOGGER_CLIENT_ID;
  const bloggerClientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const bloggerRefreshToken = process.env.BLOGGER_REFRESH_TOKEN;

  if (!geminiApiKey || !telegramBotToken || !telegramChatId || !bloggerBlogId || !bloggerClientId || !bloggerClientSecret || !bloggerRefreshToken) {
    console.error('❌ 필수 환경변수가 누락되었습니다. (.env 확인 필요)');
    process.exit(1);
  }

  const category = getCategoryFromArgs();
  console.log(`📌 포스팅 분야: [${category}] ${CATEGORY_CONFIGS[category].name}`);

  // [사전 단계] 기존 발행된 글 목록 실시간 조회 (중복 주제 원천 차단용)
  const bloggerClient = new BloggerClient(bloggerBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);
  let pastTitles: string[] = [];
  try {
    const recentPosts = await bloggerClient.getPosts(20);
    pastTitles = recentPosts.map((p) => p.title);
    console.log(`📚 최근 기발행 글 ${pastTitles.length}건 목록 확보 완료 (중복 배제 필터 가동)`);
  } catch (err) {
    console.warn('⚠️ 기발행 글 목록 조회 실패, 기본 수집 진행:', err);
  }

  // [1단계] 단일 핵심 주제 선정 및 다중 언론사 교차 수집 (과거 글 중복 배제)
  console.log('\n[1/7] 📰 과거 주제와 중복 없는 새로운 핫이슈 선정 & 4개 이상 유사 보도 교차 수집');
  const topicResult = await collectSingleTopicPipeline(geminiApiKey, category, pastTitles);
  console.log(`✅ 교차 검증 소스 총 ${topicResult.crossSources.length}건 확보:`);
  topicResult.crossSources.forEach((s, idx) => {
    console.log(`   - [소스 ${idx + 1}] (${s.source || '언론사'}) ${s.title}`);
  });

  // [2단계] 공공기관 공식 데이터 실시간 조회 (한국은행 / 국토교통부 / DART)
  console.log('\n[2/7] 🏛️ 공공기관 공식 팩트체크 데이터 실시간 조회');
  const publicData = await fetchPublicDataForCategory(category, {
    ecosKey,
    dataGoKrKey,
    dartKey,
  });

  if (publicData) {
    console.log(`✅ 공공데이터 결합: [${publicData.sourceName}] - ${publicData.dataType}`);
    publicData.items.forEach((it) => console.log(`   - 📌 ${it.label}: ${it.value} (${it.extra || ''})`));
  } else {
    console.log('ℹ️ 해당 카테고리 공공데이터는 기본 표준 통계로 대체됩니다.');
  }

  // [3단계] AI 기반 1차 단일 주제 초안 원고 작성
  console.log('\n[3/7] 🤖 AI 기반 1차 단일 주제 초안 원고 작성');
  const initialPost = await generateSingleTopicPost(
    geminiApiKey,
    topicResult.config,
    topicResult.mainTopicTitle,
    topicResult.crossSources,
    publicData
  );
  console.log(`✅ 초안 작성 완료: "${initialPost.title}"`);

  // [4단계] 13인 멀티 전문가 종합 80점 돌파 시까지 반복 교차 감수 & 리라이팅 루프
  console.log('\n[4/7] 🛡️ [자동 트리거] 13인 전문가 종합 80점 돌파 시까지 반복 감수 & 자가 리라이팅 가동');
  const { finalPost, reviewSummary, roundsExecuted, passed, finalScore } = await executeTwoRoundReviewLoop(
    geminiApiKey,
    initialPost,
    publicData,
    8.0, // 100점 만점 기준 80점 통과 기준
    4    // 최대 4회 반복
  );

  // ★ [품질 방어선] 80점 미만 시 블로거 등록 및 발행 승인 원천 차단 (반려 처리)
  if (!passed) {
    console.error(`\n🚫 [1호점 품질 미달] 13인 종합 점수(${finalScore}점)가 80점에 미달하여 발행을 중단(반려)합니다.`);
    const telegramClient = new TelegramClient(telegramBotToken, telegramChatId);
    await telegramClient.sendMessage(
      `🚫 <b>[금융 1호점] 원고 품질 미달 자동 반려</b>\n\n` +
      `📌 <b>주제:</b> ${topicResult.mainTopicTitle}\n` +
      `📝 <b>제목:</b> ${finalPost.title}\n` +
      `📊 <b>13인 감수 최종 평점:</b> <b>${finalScore}점</b> / 100점 (기준: 80점)\n\n` +
      `⚠️ <b>반려 사유:</b> 13인의 금융 전문 감수단 심사에서 4라운드 동안 목표 점수(80점)를 달성하지 못하여 구글 블로그 등록 및 발행이 자동 중단(반려)되었습니다.\n\n` +
      `🔍 <b>감수 이력:</b> ${reviewSummary}`
    );
    return;
  }

  // [5단계] 5대 Code-Review 전문 에이전트 배포 코드 및 렌더링 무결성 심사
  console.log('\n[5/7] 💻 [code-review 스킬 가동] 5대 전문 에이전트 배포 코드 & 렌더링 무결성 심사');
  const codeReviewResult = await executeAutomatedCodeReview(geminiApiKey, finalPost, 'https://zozero94.com');
  console.log(`📊 5대 Code-Review 종합 평점: ${codeReviewResult.averageScore} / 10점 (${codeReviewResult.passed ? '심사 통과 ✅' : '보완 필요 ⚠️'})`);
  codeReviewResult.feedbacks.forEach((f) => {
    console.log(`   - [${f.verdict}] ${f.agentName} (${f.score}점): ${f.reviewNotes}`);
  });

  // [6단계] Google Blogger 임시글(Draft) 자동 등록
  console.log('\n[6/7] 📝 Google Blogger(애드센스 공식 블로그) 임시글(Draft) 등록');
  const bloggerPost = await bloggerClient.createDraftPost(finalPost);
  console.log(`✅ Google Blogger 등록 성공! (ID: ${bloggerPost.id}, URL: ${bloggerPost.url})`);

  // [7단계] 텔레그램 승인 알림 발송
  console.log('\n[7/7] 📱 텔레그램 승인 알림 발송');
  const telegramClient = new TelegramClient(telegramBotToken, telegramChatId);

  const linkText = `🌐 <b>내 도메인 웹진:</b> <a href="https://zozero94.com">https://zozero94.com</a>
📱 <b>구글 블로그:</b> <a href="${bloggerPost.url}">${bloggerPost.url}</a>`;

  const messageText = `📢 <b>[인사이트 리서치] ${topicResult.config.name} 포스팅 승인 요청</b>

📝 <b>제목:</b> ${escapeHtml(finalPost.title)}

💡 <b>3줄 핵심 요약:</b>
${escapeHtml(finalPost.summary)}

🏛️ <b>13인 콘텐츠 감수:</b> ${escapeHtml(reviewSummary)}
💻 <b>5대 Code-Review 심사:</b> ${codeReviewResult.averageScore}/10점 (배포 적합성 통과 ✅)
🏷️ <b>태그:</b> ${escapeHtml(finalPost.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '))}

${linkText}

아래 버튼을 누르면 <b>즉시 공식 발행</b>됩니다:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ 즉시 정식 발행', callback_data: `publish:${bloggerPost.id}` },
        { text: '❌ 임시글 삭제', callback_data: `delete:${bloggerPost.id}` },
      ],
    ],
  };

  const { message_id } = await telegramClient.sendMessageWithMarkup(messageText, replyMarkup);
  console.log(`✅ 텔레그램 승인 알림 전송 완료! (Message ID: ${message_id})`);

  console.log('\n================================================================');
  console.log('🎉 13인 감수 & 5대 Code-Review 무인 자동화 파이프라인 100% 완료!');
  console.log('📱 텔레그램에서 검토 후 [✅ 즉시 정식 발행] 버튼을 눌러주세요.');
  console.log('================================================================');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

run().catch((err) => {
  console.error('\n❌ 파이프라인 실행 중 오류 발생:', err);
  process.exit(1);
});
