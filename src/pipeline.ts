import 'dotenv/config';
import { BlogCategory } from './types.js';
import { collectSingleTopicPipeline, CATEGORY_CONFIGS } from './collector.js';
import { fetchPublicDataForCategory } from './public-data.js';
import { generateSingleTopicPost } from './ai.js';
import { executeTwoRoundReviewLoop } from './reviewer.js';
import { WordPressClient } from './wordpress.js';
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

  // 인자 미지정 시 현재 한국 시간(KST) 기준 자동 판정
  const now = new Date();
  const kstHours = (now.getUTCHours() + 9) % 24;

  if (kstHours >= 8 && kstHours < 11) {
    return 'economy'; // 09:00 시사·경제
  } else if (kstHours >= 11 && kstHours < 15) {
    return 'real_estate'; // 12:00 부동산
  } else {
    return 'finance'; // 16:00 재테크·금융
  }
}

async function run() {
  console.log('================================================================');
  console.log('🚀 AI 단일주제 심층 블로그 + 12인 2회 감수 파이프라인');
  console.log('================================================================');

  // 환경변수 검증
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const wpSiteId = process.env.WP_SITE_ID;
  const wpAccessToken = process.env.WP_ACCESS_TOKEN;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  const ecosKey = process.env.ECOS_API_KEY;
  const dataGoKrKey = process.env.DATA_GO_KR_API_KEY;
  const dartKey = process.env.DART_API_KEY;

  if (!geminiApiKey || !wpSiteId || !wpAccessToken || !telegramBotToken || !telegramChatId) {
    console.error('❌ 필수 환경변수가 누락되었습니다. (.env 확인 필요)');
    process.exit(1);
  }

  const category = getCategoryFromArgs();
  console.log(`📌 포스팅 분야: [${category}] ${CATEGORY_CONFIGS[category].name}`);

  // [파이프라인 1단계] 단일 핵심 주제 선정 및 3단계 교차 보도 수집
  console.log('\n[1/6] 📰 핫이슈 단일 주제 선정 & 3개 이상 유사 보도 교차 수집');
  const topicResult = await collectSingleTopicPipeline(geminiApiKey, category);
  console.log(`✅ 교차 검증 소스 총 ${topicResult.crossSources.length}건 확보:`);
  topicResult.crossSources.forEach((s, idx) => {
    console.log(`   - [소스 ${idx + 1}] (${s.source || '언론사'}) ${s.title}`);
  });

  // [파이프라인 2단계] 공공기관 공식 데이터 실시간 조회 (한국은행 / 국토교통부 / DART)
  console.log('\n[2/6] 🏛️ 공공기관 공식 팩트체크 데이터 실시간 조회');
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

  // [파이프라인 3단계] Gemini AI 1차 초안 원고 생성
  console.log('\n[3/6] 🤖 Gemini AI 기반 1차 단일 주제 초안 원고 작성');
  const initialPost = await generateSingleTopicPost(
    geminiApiKey,
    topicResult.config,
    topicResult.mainTopicTitle,
    topicResult.crossSources,
    publicData
  );
  console.log(`✅ 초안 작성 완료: "${initialPost.title}"`);

  // [파이프라인 4단계 - ★ 스킬 자동 트리거] 12인 멀티 전문가 2회 교차 감수 & 리라이팅 루프
  console.log('\n[4/6] 🛡️ [자동 트리거] 12인 멀티 전문가 에이전트 2회 반복 감수 & 리라이팅 가동');
  const { finalPost, reviewSummary } = await executeTwoRoundReviewLoop(
    geminiApiKey,
    initialPost,
    publicData
  );

  // [파이프라인 5단계] 워드프레스 Draft 등록
  console.log('\n[5/6] 📝 2회 감수를 마친 최종 완성본을 워드프레스 임시글(Draft)로 등록');
  const wpClient = new WordPressClient(wpSiteId, wpAccessToken);
  const wpPost = await wpClient.createDraftPost(finalPost);
  console.log(`✅ 워드프레스 등록 성공!`);
  console.log(`   - Post ID: ${wpPost.ID}`);
  console.log(`   - 미리보기 URL: ${wpPost.URL}`);

  // [파이프라인 6단계] 텔레그램 승인 알림 발송 (12인 감수 결과 요약 포함)
  console.log('\n[6/6] 📱 텔레그램 승인 알림 및 12인 감수 요약 발송');
  const telegramClient = new TelegramClient(telegramBotToken, telegramChatId);
  const modifiedSummaryPost = {
    ...finalPost,
    summary: `${finalPost.summary}\n\n🏛️ <b>12인 전문가 감수 결과:</b> ${reviewSummary}`,
  };

  const { message_id } = await telegramClient.sendDraftApproval(
    topicResult.config.name,
    modifiedSummaryPost,
    wpPost
  );
  console.log(`✅ 텔레그램 알림 전송 완료! (Message ID: ${message_id})`);

  console.log('\n================================================================');
  console.log('🎉 12인 2회 감수 자동화 파이프라인 사이클 100% 완료!');
  console.log('📱 텔레그램에서 최종 완성본을 검토하고 [✅ 즉시 발행] 버튼을 눌러주세요.');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('\n❌ 파이프라인 실행 중 오류 발생:', err);
  process.exit(1);
});
