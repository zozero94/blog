import 'dotenv/config';
import { BlogCategory, AgentFeedback, GeneratedPost } from './types.js';
import { collectMultipleTopicCandidates, CATEGORY_CONFIGS } from './collector.js';
import { fetchPublicDataForCategory } from './public-data.js';
import { generateSingleTopicPost } from './ai.js';
import { executeIterativeReviewLoop, rewritePostWithFeedback } from './reviewer.js';
import {
  findOfficialFinancialSourceUrl,
  verifyUrlAndCaptureScreenshot,
  auditAndFixFinanceHtmlLinks,
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
  console.log('🚀 [금융 1호점] 21인 AI 에이전트 & 멀티모달 랜딩 검증 자동화 파이프라인');
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

  const bloggerClient = new BloggerClient(bloggerBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);
  const telegramClient = new TelegramClient(telegramBotToken, telegramChatId);

  // CLI 인자 및 환경변수 파싱
  const args = process.argv.slice(2);
  let revisePostId = process.env.REVISE_POST_ID || '';
  let userFeedback = process.env.USER_FEEDBACK || '';

  for (const arg of args) {
    if (arg.startsWith('--post-id=')) {
      revisePostId = arg.split('=')[1].replace(/^["']|["']$/g, '');
    } else if (arg.startsWith('--feedback=')) {
      userFeedback = arg.split('=')[1].replace(/^["']|["']$/g, '');
    }
  }

  // =========================================================================
  // ★ [원격 피드백 수정 모드] 기존 Blogger 글 로드 ➔ 사용자 지침 주입 ➔ 21인 감수 루프 ➔ Blogger PUT
  // =========================================================================
  if (revisePostId) {
    console.log(`\n🔄 [금융 1호점 피드백 원격 수정 모드 가동]`);
    console.log(`   - 대상 Post ID: "${revisePostId}"`);
    console.log(`   - 사용자 지침: "${userFeedback || '전면 고도화'}"`);

    const existingPost = await bloggerClient.getPostById(revisePostId);
    if (!existingPost) {
      throw new Error(`해당 Post ID(${revisePostId})의 글을 Blogger에서 찾을 수 없습니다.`);
    }

    const category = getCategoryFromArgs();
    const publicData = await fetchPublicDataForCategory(category, {
      ecosKey,
      dataGoKrKey,
      dartKey,
    });

    const officialSource = await findOfficialFinancialSourceUrl(
      geminiApiKey,
      existingPost.title,
      category
    );

    const verifiedSource = await verifyUrlAndCaptureScreenshot(
      geminiApiKey,
      officialSource.officialUrl,
      existingPost.title,
      'official'
    );

    const currentPost: GeneratedPost = {
      title: existingPost.title,
      summary: '기존 원고 피드백 수정',
      categories: [CATEGORY_CONFIGS[category].name],
      tags: existingPost.labels || [CATEGORY_CONFIGS[category].name, '재테크'],
      htmlContent: existingPost.content || '',
      metaDescription: existingPost.title || '금융/경제 분석',
      verifiedLinks: [verifiedSource],
    };

    const userFeedbackItem: AgentFeedback = {
      agentName: '★ 사용자 긴급 디렉팅',
      role: '텔레그램 원격 총괄 디렉터',
      score: 3,
      strengths: '기존 금융/경제 분석 맥락 유지',
      improvements: `[사용자 직접 지시]: ${userFeedback}. 이 지침을 다른 모든 규칙보다 100% 최우선으로 본문에 반영하여 수정할 것.`,
    };

    console.log('\n[수정 4단계] 21인 전문 감수단 & 사용자 피드백 결합 리라이팅 루프 실행...');
    const initialRewritten = await rewritePostWithFeedback(
      geminiApiKey,
      currentPost,
      [userFeedbackItem],
      publicData,
      1
    );

    const reviewResult = await executeIterativeReviewLoop(
      geminiApiKey,
      initialRewritten,
      publicData,
      7.5,
      4
    );

    const finalPost = reviewResult.finalPost;
    const reviewSummary = reviewResult.reviewSummary;

    finalPost.htmlContent = auditAndFixFinanceHtmlLinks(
      finalPost.htmlContent,
      { officialUrl: verifiedSource.finalUrl }
    );

    console.log(`\n[수정 5단계] Google Blogger 원고 즉시 교체 (Post ID: ${revisePostId})...`);
    await bloggerClient.updatePost(revisePostId, finalPost.title, finalPost.htmlContent, existingPost.labels || []);
    console.log(`✅ Blogger 글 수정 완료!`);

    const tagText = finalPost.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
    const previewWebzineUrl = `https://zozero94.com/post.html?id=${revisePostId}`;
    const cleanBloggerUrl = existingPost.url || `https://www.blogger.com/blog/post/edit/${bloggerBlogId}/${revisePostId}`;

    const messageText = `📢 <b>[금융/경제 1호점] 포스팅 피드백 수정 완료</b>

📝 <b>제목:</b> ${escapeHtml(finalPost.title)}

💡 <b>3줄 핵심 요약:</b>
${escapeHtml(finalPost.summary)}

🔗 <b>공식 팩트 출처:</b> <a href="${escapeHtml(verifiedSource.finalUrl)}">${escapeHtml(verifiedSource.pageTitle || officialSource.officialSiteName)}</a>
🏛️ <b>21인 콘텐츠 감수 & 5인 시스템 감사:</b> [피드백 반영] ${escapeHtml(reviewSummary)}
🏷️ <b>태그:</b> ${escapeHtml(tagText)}

🌐 <b>웹진 미리보기:</b> <a href="${previewWebzineUrl}">${previewWebzineUrl}</a>
📱 <b>구글 블로그:</b> <a href="${cleanBloggerUrl}">${cleanBloggerUrl}</a>

아래 버튼을 누르면 <b>즉시 공식 발행</b>됩니다:`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅ 즉시 정식 발행', callback_data: `publish:${bloggerBlogId}:${revisePostId}` },
          { text: '❌ 임시글 삭제', callback_data: `delete:${bloggerBlogId}:${revisePostId}` },
        ],
      ],
    };

    await telegramClient.sendMessageWithMarkup(messageText, replyMarkup);
    return;
  }

  const category = getCategoryFromArgs();
  console.log(`📌 포스팅 분야: [${category}] ${CATEGORY_CONFIGS[category].name}`);

  // [사전 단계] 기존 발행된 글 목록 실시간 조회 (중복 주제 원천 차단용)
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
      }, topicResult.mainTopicTitle);

      const officialSource = await findOfficialFinancialSourceUrl(geminiApiKey, topicResult.mainTopicTitle, category);
      console.log(`   - 🏛️ 공식 인증 포털: "${officialSource.officialSiteName}" (${officialSource.officialUrl})`);

      const verifiedOfficialLink = await verifyUrlAndCaptureScreenshot(
        geminiApiKey,
        officialSource.officialUrl,
        topicResult.mainTopicTitle,
        'official'
      );

      let verifiedUrl = officialSource.officialUrl;
      let verifiedSiteName = officialSource.officialSiteName || '공인 포털';
      if (!verifiedOfficialLink.isHealthy || !verifiedOfficialLink.isContentMatched || (verifiedOfficialLink.relevanceScore ?? 0) < 75) {
        console.warn(`⚠️ [1호점 공식 링크 불일치/파킹 감지] "${officialSource.officialUrl}" (${verifiedOfficialLink.relevanceScore}점) -> 대한민국 공인 포털로 안전 치환!`);
        verifiedUrl = 'https://www.data.go.kr';
        verifiedSiteName = '대한민국 공공데이터포털';
        verifiedOfficialLink.linkType = 'VERIFIED_SEARCH';
        verifiedOfficialLink.finalUrl = 'https://www.data.go.kr';
      }

      // [3단계] AI 기반 1차 단일 주제 초안 원고 작성
      console.log('\n[3/7] 🤖 AI 기반 1차 단일 주제 초안 원고 작성');
      const initialPost = await generateSingleTopicPost(
        geminiApiKey,
        topicResult.config,
        topicResult.mainTopicTitle,
        topicResult.crossSources,
        publicData,
        verifiedUrl,
        verifiedSiteName
      );
      initialPost.verifiedLinks = [verifiedOfficialLink];
      console.log(`✅ 초안 작성 완료: "${initialPost.title}"`);

      // [4단계] 21인 멀티 전문가 종합 75점 돌파 시까지 반복 교차 감수 & 리라이팅 루프
      console.log('\n[4/6] 🛡️ [자동 트리거] 21인 전문가 종합 75점 돌파 시까지 반복 감수 & 자가 리라이팅 가동');
      const { finalPost, reviewSummary, roundsExecuted, passed, finalScore } = await executeIterativeReviewLoop(
        geminiApiKey,
        initialPost,
        publicData,
        7.5, // 75점 기준
        4    // 최대 4회 반복
      );

      // ★ [품질 방어선] 75점 미만 시 차순위 주제로 자동 전환 & 재탐구
      if (!passed) {
        console.warn(`\n🚫 [후보 ${candidateIdx + 1} 반려] 21인 종합 점수(${finalScore}점)가 75점에 미달!`);
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

      // [5단계] 링크 무결성 정제 및 WAF/보안 속성 부여
      console.log('\n[5/6] 🔒 링크 무결성 정제 및 WAF/보안 속성 최종 부여');
      finalPost.htmlContent = auditAndFixFinanceHtmlLinks(finalPost.htmlContent, {
        officialUrl: verifiedUrl,
        coupang: `https://www.coupang.com/np/search?q=${encodeURIComponent(topicResult.searchKeywords[0] || topicResult.config.name)}`,
      });

      // [6단계] Google Blogger 임시글(Draft) 자동 등록 & 텔레그램 승인 알림 발송
      console.log('\n[6/6] 📝 Google Blogger(애드센스 공식 블로그) 임시글(Draft) 등록 및 알림 발송');
      const bloggerPost = await bloggerClient.createDraftPost(finalPost);
      console.log(`✅ Google Blogger 등록 성공! (ID: ${bloggerPost.id}, URL: ${bloggerPost.url})`);

      const linkText = `🌐 <b>웹진 미리보기:</b> <a href="https://zozero94.com/post.html?id=${bloggerPost.id}">https://zozero94.com/post.html?id=${bloggerPost.id}</a>
📱 <b>구글 블로그:</b> <a href="${bloggerPost.url}">${bloggerPost.url}</a>`;

      const messageText = `📢 <b>[인사이트 리서치] ${escapeHtml(topicResult.config.name)} 포스팅 승인 요청</b>

📝 <b>제목:</b> ${escapeHtml(finalPost.title)}

💡 <b>3줄 핵심 요약:</b>
${escapeHtml(finalPost.summary)}

🏛️ <b>21인 콘텐츠 감수 & 5인 시스템 감사:</b> ${escapeHtml(reviewSummary)}
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
