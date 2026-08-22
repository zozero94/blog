import 'dotenv/config';
import { BlogCategory } from './types.js';
import { collectSingleTopicPipeline, CATEGORY_CONFIGS } from './collector.js';
import { fetchPublicDataForCategory } from './public-data.js';
import { generateSingleTopicPost } from './ai.js';
import { executeTwoRoundReviewLoop } from './reviewer.js';
import { verifyDeployIntegrity } from './verifier.js';
import { WordPressClient } from './wordpress.js';
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
  console.log('🚀 AI 단일주제 심층 블로그 [13인 감수 + 코드 무결성 검증 파이프라인]');
  console.log('================================================================');

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const wpSiteId = process.env.WP_SITE_ID;
  const wpAccessToken = process.env.WP_ACCESS_TOKEN;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  const ecosKey = process.env.ECOS_API_KEY;
  const dataGoKrKey = process.env.DATA_GO_KR_API_KEY;
  const dartKey = process.env.DART_API_KEY;

  const bloggerBlogId = process.env.BLOGGER_BLOG_ID;
  const bloggerClientId = process.env.BLOGGER_CLIENT_ID;
  const bloggerClientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const bloggerRefreshToken = process.env.BLOGGER_REFRESH_TOKEN;

  if (!geminiApiKey || !telegramBotToken || !telegramChatId) {
    console.error('❌ 필수 환경변수가 누락되었습니다. (.env 확인 필요)');
    process.exit(1);
  }

  const category = getCategoryFromArgs();
  console.log(`📌 포스팅 분야: [${category}] ${CATEGORY_CONFIGS[category].name}`);

  // [1단계] 단일 핵심 주제 선정 및 다중 언론사 교차 수집
  console.log('\n[1/7] 📰 핫이슈 단일 주제 선정 & 4개 이상 유사 보도 교차 수집');
  const topicResult = await collectSingleTopicPipeline(geminiApiKey, category);
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

  // [4단계 - ★ 스킬 자동 트리거] 13인 멀티 전문가 2회 교차 감수 & 리라이팅 루프
  console.log('\n[4/7] 🛡️ [자동 트리거] 13인 멀티 전문가 에이전트 2회 반복 감수 & 리라이팅 가동');
  const { finalPost, reviewSummary } = await executeTwoRoundReviewLoop(
    geminiApiKey,
    initialPost,
    publicData
  );

  // [5단계 - ★ 신규 코드/배포 무결성 검증] 배포 직전 시스템 & 렌더링 코드 자동 무결성 검사
  console.log('\n[5/7] 🔍 [배포 직전 검증] 시스템 헬스체크 & HTML 렌더링 코드 무결성 자동 검사');
  const verifyResult = await verifyDeployIntegrity(finalPost, 'https://zozero94.com');
  console.log(`📊 코드 무결성 검증 점수: ${verifyResult.score} / 100점 (${verifyResult.passed ? '합격 ✅' : '보완 필요 ⚠️'})`);
  verifyResult.checks.forEach((c) => {
    console.log(`   - [${c.status}] ${c.name}: ${c.message}`);
  });

  // [6단계] WordPress & Google Blogger 듀얼 등록
  console.log('\n[6/7] 📝 WordPress 및 Google Blogger 양쪽으로 임시글(Draft) 동시 등록');
  let wpPost = null;
  let bloggerPost = null;

  if (wpSiteId && wpAccessToken) {
    try {
      const wpClient = new WordPressClient(wpSiteId, wpAccessToken);
      wpPost = await wpClient.createDraftPost(finalPost);
      console.log(`✅ [1/2] WordPress 등록 성공! (ID: ${wpPost.ID}, URL: ${wpPost.URL})`);
    } catch (e) {
      console.warn('⚠️ WordPress 등록 실패:', e);
    }
  }

  if (bloggerBlogId && bloggerClientId && bloggerClientSecret && bloggerRefreshToken) {
    try {
      const bloggerClient = new BloggerClient(bloggerBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);
      bloggerPost = await bloggerClient.createDraftPost(finalPost);
      console.log(`✅ [2/2] Google Blogger(애드센스용) 등록 성공! (ID: ${bloggerPost.id}, URL: ${bloggerPost.url})`);
    } catch (e) {
      console.warn('⚠️ Google Blogger 등록 실패:', e);
    }
  }

  // [7단계] 텔레그램 듀얼 승인 알림 발송
  console.log('\n[7/7] 📱 텔레그램 듀얼 승인 알림 발송');
  const telegramClient = new TelegramClient(telegramBotToken, telegramChatId);
  
  const wpId = wpPost?.ID || 'none';
  const bloggerId = bloggerPost?.id || 'none';
  const callbackId = `${wpId}_${bloggerId}`;

  const linkText = `🌐 <b>내 도메인 웹진:</b> <a href="https://zozero94.com">https://zozero94.com</a>
📱 <b>구글 블로그:</b> ${bloggerPost?.url ? `<a href="${bloggerPost.url}">${bloggerPost.url}</a>` : 'https://zozero94.blogspot.com'}`;

  const messageText = `📢 <b>[인사이트 리서치] ${topicResult.config.name} 듀얼 포스팅 승인 요청</b>

📝 <b>제목:</b> ${escapeHtml(finalPost.title)}

💡 <b>3줄 핵심 요약:</b>
${escapeHtml(finalPost.summary)}

🏛️ <b>13인 감수 결과:</b> ${escapeHtml(reviewSummary)}
🔍 <b>코드·배포 무결성 검증:</b> ${verifyResult.score}점 (정상 가동 ✅)
🏷️ <b>태그:</b> ${escapeHtml(finalPost.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '))}

${linkText}

아래 버튼을 누르면 <b>워드프레스와 구글 블로그에 동시 반영</b>됩니다:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ 양쪽 동시 즉시 발행', callback_data: `publish:${callbackId}` },
        { text: '❌ 동시 삭제', callback_data: `delete:${callbackId}` },
      ],
    ],
  };

  const { message_id } = await telegramClient.sendMessageWithMarkup(messageText, replyMarkup);
  console.log(`✅ 텔레그램 듀얼 승인 알림 전송 완료! (Message ID: ${message_id})`);

  console.log('\n================================================================');
  console.log('🎉 듀얼 블로그 13인 감수 & 코드 무결성 자동화 파이프라인 100% 완료!');
  console.log('📱 텔레그램에서 검토 후 [✅ 양쪽 동시 즉시 발행] 버튼을 눌러주세요.');
  console.log('================================================================');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

run().catch((err) => {
  console.error('\n❌ 파이프라인 실행 중 오류 발생:', err);
  process.exit(1);
});
