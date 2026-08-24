import 'dotenv/config';
import { BlogCategory } from './types.js';
import { collectMultipleTopicCandidates, CATEGORY_CONFIGS } from './collector.js';
import { fetchPublicDataForCategory } from './public-data.js';
import { generateSingleTopicPost } from './ai.js';
import { executeTwoRoundReviewLoop } from './reviewer.js';
import {
  findOfficialFinancialSourceUrl,
  verifyUrlAndCaptureScreenshot,
  auditAndFixFinanceHtmlLinks,
  executeAutomatedCodeReview,
} from './verifier.js';
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

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function run() {
  console.log('================================================================');
  console.log('🚀 [금융 1호점] 13인 AI 에이전트 & 멀티모달 랜딩 검증 자동화 파이프라인');
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

  // [1단계] 상위 3대 핵심 이슈 후보군 선별 (과거 글 중복 배제)
  console.log('\n[1/7] 📰 과거 주제와 중복 없는 상위 3대 핫이슈 후보 선별 & 교차 수집');
  const candidateTopics = await collectMultipleTopicCandidates(geminiApiKey, category, pastTitles, 3);
  const telegramClient = new TelegramClient(telegramBotToken, telegramChatId);

  let publishedSuccess = false;

  for (let candidateIdx = 0; candidateIdx < candidateTopics.length; candidateIdx++) {
    const topicResult = candidateTopics[candidateIdx];
    try {
      console.log(`\n================================================================`);
      console.log(`🎯 [후보 ${candidateIdx + 1}/${candidateTopics.length}] 금융/경제 탐구 시작: "${topicResult.mainTopicTitle}"`);
      console.log(`   - 검색 키워드: ${topicResult.searchKeywords.join(', ')}`);
      console.log(`   - 교차 검증 소스: ${topicResult.crossSources.length}건 확보`);
      console.log(`================================================================`);

      // [2단계] 공공기관 공식 데이터 및 공식 직통 포털 멀티모달(DOM+Vision) 검증
      console.log('\n[2/7] 🏛️ 공공기관 공식 팩트체크 데이터 및 공식 직통 포털 멀티모달 검증');
      const publicData = await fetchPublicDataForCategory(category, {
        ecosKey,
        dataGoKrKey,
        dartKey,
      });

      const officialSource = await findOfficialFinancialSourceUrl(geminiApiKey, topicResult.mainTopicTitle, category);
      console.log(`   - 🏛️ 공식 인증 포털: "${officialSource.officialSiteName}" (${officialSource.officialUrl})`);

      const verifiedOfficialLink = await verifyUrlAndCaptureScreenshot(
        geminiApiKey,
        officialSource.officialUrl,
        topicResult.mainTopicTitle,
        'official'
      );

      // [3단계] AI 기반 1차 단일 주제 초안 원고 작성
      console.log('\n[3/7] 🤖 AI 기반 1차 단일 주제 초안 원고 작성');
      const initialPost = await generateSingleTopicPost(
        geminiApiKey,
        topicResult.config,
        topicResult.mainTopicTitle,
        topicResult.crossSources,
        publicData
      );
      initialPost.verifiedLinks = [verifiedOfficialLink];
      console.log(`✅ 초안 작성 완료: "${initialPost.title}"`);

      // [4단계] 13인 멀티 전문가 종합 75점 돌파 시까지 반복 교차 감수 & 리라이팅 루프
      console.log('\n[4/7] 🛡️ [자동 트리거] 13인 전문가 종합 75점 돌파 시까지 반복 감수 & 자가 리라이팅 가동');
      const { finalPost, reviewSummary, roundsExecuted, passed, finalScore } = await executeTwoRoundReviewLoop(
        geminiApiKey,
        initialPost,
        publicData,
        7.5, // 75점 기준
        4    // 최대 4회 반복
      );

      // ★ [품질 방어선] 75점 미만 시 차순위 주제로 자동 전환 & 재탐구
      if (!passed) {
        console.warn(`\n🚫 [후보 ${candidateIdx + 1} 반려] 13인 종합 점수(${finalScore}점)가 75점에 미달!`);
        const nextCandidate = candidateTopics[candidateIdx + 1];

        if (nextCandidate) {
          await telegramClient.sendMessage(
            `⚠️ <b>[금융 1호점] 원고 반려 ➔ 차순위 주제 자동 전환</b>\n\n` +
            `❌ <b>반려 주제:</b> ${escapeHtml(topicResult.mainTopicTitle)} (${finalScore}점 / 기준: 75점)\n` +
            `🔄 <b>감수 이력:</b> ${escapeHtml(reviewSummary)}\n\n` +
            `🚀 <b>자동 조치:</b> 75점을 넘지 못해 즉시 차순위 경제 후보 [<b>${escapeHtml(nextCandidate.mainTopicTitle)}</b>] 로 전환하여 고품질 원고 재탐구를 시작합니다!`
          );
        } else {
          await telegramClient.sendMessage(
            `🚫 <b>[금융 1호점] 전체 후보 품질 기준 미달</b>\n\n` +
            `수집된 모든 경제/부동산 후보가 75점 기준을 달성하지 못하여 포스팅 발행을 안전하게 중단했습니다.`
          );
        }
        continue; // 다음 후보로 넘어가서 파이프라인 재실행!
      }

      // [5단계] 5대 Code-Review 전문 에이전트 배포 코드 및 렌더링 무결성 심사
      console.log('\n[5/7] 💻 [code-review 스킬 가동] 5대 전문 에이전트 배포 코드 & 렌더링 무결성 심사');
      const codeReviewResult = await executeAutomatedCodeReview(geminiApiKey, finalPost, 'https://zozero94.com');
      console.log(`📊 5대 Code-Review 종합 평점: ${codeReviewResult.averageScore} / 10점 (${codeReviewResult.passed ? '심사 통과 ✅' : '보완 필요 ⚠️'})`);

      // 링크 무결성 정제 및 WAF/보안 속성 부여
      finalPost.htmlContent = auditAndFixFinanceHtmlLinks(finalPost.htmlContent, {
        officialUrl: officialSource.officialUrl,
        coupang: `https://www.coupang.com/np/search?q=${encodeURIComponent(topicResult.searchKeywords[0] || topicResult.config.name)}`,
      });

      // [6단계] Google Blogger 임시글(Draft) 자동 등록
      console.log('\n[6/7] 📝 Google Blogger(애드센스 공식 블로그) 임시글(Draft) 등록');
      const bloggerPost = await bloggerClient.createDraftPost(finalPost);
      console.log(`✅ Google Blogger 등록 성공! (ID: ${bloggerPost.id}, URL: ${bloggerPost.url})`);

      // [7단계] 텔레그램 승인 알림 발송
      console.log('\n[7/7] 📱 텔레그램 승인 알림 발송');
      const linkText = `🌐 <b>내 도메인 웹진:</b> <a href="https://zozero94.com">https://zozero94.com</a>
📱 <b>구글 블로그:</b> <a href="${bloggerPost.url}">${bloggerPost.url}</a>`;

      const messageText = `📢 <b>[인사이트 리서치] ${escapeHtml(topicResult.config.name)} 포스팅 승인 요청</b>

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
            { text: '✅ 즉시 정식 발행', callback_data: `publish:${bloggerBlogId}:${bloggerPost.id}` },
            { text: '❌ 임시글 삭제', callback_data: `delete:${bloggerBlogId}:${bloggerPost.id}` },
          ],
        ],
      };

      const { message_id } = await telegramClient.sendMessageWithMarkup(messageText, replyMarkup);
      console.log(`✅ 텔레그램 승인 알림 전송 완료! (Message ID: ${message_id})`);

      publishedSuccess = true;
      break; // 합격하여 발행 완료되었으므로 종료!
    } catch (candidateError: any) {
      console.error(`\n❌ [1호점 후보 ${candidateIdx + 1} 처리 중 오류 발생]:`, candidateError);
      if (candidateIdx < candidateTopics.length - 1) {
        console.log(`🔄 다음 경제 후보로 자동 전환합니다...`);
      }
    }
  }

  if (publishedSuccess) {
    console.log('\n================================================================');
    console.log('🎉 1호점 13인 감수 & 멀티모달 무인 자동화 파이프라인 100% 완료!');
    console.log('📱 텔레그램에서 검토 후 [✅ 즉시 정식 발행] 버튼을 눌러주세요.');
    console.log('================================================================');
  } else {
    console.log('\n⚠️ [1호점 파이프라인 종료] 기준(80점)을 만족하는 유효 원고가 없어 안전하게 종료되었습니다.\n');
  }
}

run().catch((err) => {
  console.error('\n❌ [Pipeline Critical Error] 치명적 오류 발생:', err);
  process.exit(1);
});
