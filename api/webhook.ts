import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BloggerClient } from '../src/blogger.js';
import { TelegramClient } from '../src/telegram.js';

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  const defaultBloggerBlogId = process.env.BLOGGER_BLOG_ID;
  const trendBloggerBlogId = process.env.TREND_BLOGGER_BLOG_ID || '2498717653629376483';
  const bloggerClientId = process.env.BLOGGER_CLIENT_ID;
  const bloggerClientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const bloggerRefreshToken = process.env.BLOGGER_REFRESH_TOKEN;
  const githubPat = process.env.GITHUB_PAT || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (!telegramBotToken || !telegramChatId || !defaultBloggerBlogId || !bloggerClientId || !bloggerClientSecret || !bloggerRefreshToken) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const telegram = new TelegramClient(telegramBotToken, telegramChatId);

  try {
    const update = req.body;

    // =========================================================================
    // 1. 텔레그램 버튼 클릭 이벤트 (Callback Query: 승인 / 삭제)
    // =========================================================================
    const callbackQuery = update?.callback_query;
    if (callbackQuery) {
      const senderChatId = callbackQuery.from?.id?.toString() || callbackQuery.message?.chat?.id?.toString();

      // 인가된 사용자(본인)인지 검증
      if (senderChatId !== telegramChatId.toString()) {
        console.warn(`Unauthorized callback attempt from chatId: ${senderChatId}`);
        if (callbackQuery.id) {
          await fetch(`https://api.telegram.org/bot${telegramBotToken}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '권한이 없습니다.', show_alert: true }),
          }).catch(() => {});
        }
        return res.status(200).json({ error: 'Unauthorized' });
      }

      if (callbackQuery.id) {
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQuery.id, text: '요청을 처리 중입니다...' }),
        }).catch(() => {});
      }

      const callbackData = callbackQuery.data;
      const parts = callbackData.split(':');
      const action = parts[0];
      const messageId = callbackQuery.message?.message_id;

      // 버튼 중복 클릭 방지: 즉시 인라인 키보드 제거
      if (messageId) {
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: senderChatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] },
          }),
        }).catch(() => {});
      }
      
      let targetBlogId = defaultBloggerBlogId;
      let targetPostId = '';

      if (parts.length === 3) {
        // Format: action:blogId:postId
        targetBlogId = parts[1];
        targetPostId = parts[2];
      } else if (parts.length === 2) {
        const rawId = parts[1];
        targetPostId = rawId.includes('_') ? rawId.split('_')[1] : rawId;
      }

      const blogger = new BloggerClient(targetBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);
      const isTrendBlog = targetBlogId === trendBloggerBlogId || targetBlogId === '2498717653629376483';
      const domainUrl = isTrendBlog ? 'https://trend.zozero94.com' : 'https://zozero94.com';
      const blogTypeKo = isTrendBlog ? '트렌드 블로그 2호점' : '금융/경제 블로그 1호점';

      if (action === 'publish') {
        let publishedUrl = '';
        if (targetPostId && targetPostId !== 'none') {
          const result = await blogger.publishPost(targetPostId);
          publishedUrl = result.url || domainUrl;
        }

        await telegram.sendMessage(
          `🎉 <b>[발행 완료] ${blogTypeKo} 글이 정식 공개되었습니다!</b>\n\n🌐 <b>내 도메인:</b> <a href="${domainUrl}">${domainUrl}</a>\n📱 <b>구글 블로그:</b> <a href="${publishedUrl}">${publishedUrl}</a>`
        );
      } else if (action === 'delete') {
        if (targetPostId && targetPostId !== 'none') {
          await blogger.deletePost(targetPostId);
        }

        await telegram.sendMessage(`🗑️ <b>[삭제 완료]</b> ${blogTypeKo} 임시글이 안전하게 삭제되었습니다.`);
      }

      return res.status(200).json({ success: true });
    }

    // =========================================================================
    // 2. 텔레그램 텍스트 메시지 수신 (수동 트리거 명령어 처리)
    // =========================================================================
    const message = update?.message;
    if (message && message.text) {
      const text = message.text.trim();
      const senderChatId = message.chat?.id?.toString();

      // 인가된 사용자(본인)인지 검증
      if (senderChatId !== telegramChatId.toString()) {
        console.warn(`Unauthorized access attempt from chatId: ${senderChatId}`);
        return res.status(200).json({ message: 'Unauthorized' });
      }

      // 1) 답장(Reply) 기반 피드백 원격 수정 처리
      if (message.reply_to_message && message.reply_to_message.text) {
        const replyText = message.reply_to_message.text;
        const idMatch = replyText.match(/(?:id=|Post ID:\s*<code>?|Blogger ID:\s*<code>?)(\d{10,20})/i);
        const targetPostId = idMatch ? idMatch[1] : '';

        if (targetPostId) {
          const isTrendBlog = replyText.includes('2호점') || replyText.includes('trend.zozero94.com');
          const repoName = isTrendBlog ? 'zozero94/trend' : 'zozero94/blog';
          const workflowFile = isTrendBlog ? 'daily-trend-post.yml' : 'auto-posting.yml';
          const blogNameKo = isTrendBlog ? '트렌드 2호점' : '금융/경제 1호점';
          const reviewerCountKo = isTrendBlog ? '18인의 트렌드 감수단' : '21인의 금융/경제 감수단';

          if (!githubPat) {
            await telegram.sendMessage(
              `⚠️ <b>GitHub Token 미설정</b>\nGitHub Actions를 원격 트리거하려면 Vercel 환경변수에 <code>GITHUB_PAT</code>를 등록해야 합니다.`
            );
            return res.status(200).json({ success: false });
          }

          await telegram.sendMessage(
            `⏳ <b>[${blogNameKo} 피드백 접수 ➔ 파이프라인 재가동]</b>\n\n` +
            `📝 <b>수정 대상 ID:</b> <code>${targetPostId}</code>\n` +
            `💬 <b>사용자 지침:</b> "${escapeHtml(text)}"\n\n` +
            `🚀 ${reviewerCountKo} 및 멀티모달 랜딩 검증, 5인 엔지니어링 감사를 100% 거쳐 원고를 재작성합니다.\n⏱️ 약 1분 후 새로 감수된 승인 알림이 발송됩니다.`
          );

          const ghRes = await fetch(`https://api.github.com/repos/${repoName}/actions/workflows/${workflowFile}/dispatches`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${githubPat}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'TelegramBot-Webhook',
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                postId: targetPostId,
                userFeedback: text,
              },
            }),
          });

          if (!ghRes.ok) {
            const errText = await ghRes.text();
            await telegram.sendMessage(`❌ GitHub Actions 트리거 실패:\n<code>${errText}</code>`);
          }

          return res.status(200).json({ success: true, mode: 'reply_feedback', postId: targetPostId });
        }
      }

      // 2) 도움말 명령어
      if (text === '/start' || text === '/help' || text === '도움말' || text === '메뉴') {
        const helpMsg = `🤖 <b>AI 블로그 자동화 텔레그램 컨트롤러</b>

원하시는 명령어를 입력하거나 승인 카드에 <b>답장(Reply)</b>을 남기시면 AI가 즉시 분석 및 글 생성을 시작합니다:

💬 <b>원고 피드백 수정 (가장 편리한 방법)</b>
• 봇이 보낸 승인 메시지에 <b>[답장]</b> 누르고 수정 지시 입력!
  ➔ 예: <i>"링크 네이버 지도로 교체하고 2번째 문단 대기시간 팁 보강해줘"</i>
  ➔ 18인/21인 감수단 + 멀티모달 검증 파이프라인 100% 자동 재완주

🔥 <b>트렌드 웹진 2호점 (trend.zozero94.com)</b>
• <code>트렌드</code> 또는 <code>/trend</code>
  ➔ 실시간 1등 트렌드 즉시 자동 작성
• <code>트렌드 [키워드]</code> 또는 <code>/trend [키워드]</code>
  ➔ 예: <code>트렌드 두바이초콜릿</code>, <code>/trend 런던베이글</code>

📊 <b>금융/부동산 1호점 (zozero94.com)</b>
• <code>금융</code> 또는 <code>/finance</code>
  ➔ 실시간 재테크/금융 팩트체크 칼럼 작성
• <code>부동산</code> 또는 <code>/realestate</code>
  ➔ 아파트 청약/실거래가 팩트체크 칼럼 작성
• <code>경제</code> 또는 <code>/economy</code>
  ➔ 시사/거시경제 칼럼 작성`;

        await telegram.sendMessage(helpMsg);
        return res.status(200).json({ success: true });
      }

      // 3) 트렌드 웹진 2호점 신규 생성 트리거
      if (text.startsWith('/trend') || text.startsWith('트렌드') || text.startsWith('트랜드')) {
        let customKeyword = '';
        if (text.startsWith('/trend')) {
          customKeyword = text.replace('/trend', '').trim();
        } else if (text.startsWith('트렌드')) {
          customKeyword = text.replace('트렌드', '').trim();
        } else if (text.startsWith('트랜드')) {
          customKeyword = text.replace('트랜드', '').trim();
        }

        if (!githubPat) {
          await telegram.sendMessage(
            `⚠️ <b>GitHub Token 미설정</b>\nGitHub Actions를 원격 트리거하려면 Vercel 환경변수에 <code>GITHUB_PAT</code>를 등록해야 합니다.`
          );
          return res.status(200).json({ success: false });
        }

        await telegram.sendMessage(
          `🚀 <b>[트렌드 2호점 가동]</b>\n${customKeyword ? `🎯 타겟 키워드: <b>"${escapeHtml(customKeyword)}"</b>\n` : '📡 실시간 1등 대세 트렌드 탐색 중...\n'}18인의 전문 위원회 감수 루프 (최소 2회 + 75점 돌파제) 및 멀티모달 검증을 가동합니다!\n\n⏱️ 약 1~2분 후 승인 알림이 도착합니다.`
        );

        const ghRes = await fetch('https://api.github.com/repos/zozero94/trend/actions/workflows/daily-trend-post.yml/dispatches', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubPat}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'TelegramBot-Webhook',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: { keyword: customKeyword },
          }),
        });

        if (!ghRes.ok) {
          const errText = await ghRes.text();
          await telegram.sendMessage(`❌ GitHub Actions 트리거 실패:\n<code>${errText}</code>`);
        }

        return res.status(200).json({ success: true });
      }

      // 4) 금융/부동산 1호점 신규 생성 트리거
      if (text.startsWith('/finance') || text.startsWith('/economy') || text.startsWith('/realestate') || text === '금융' || text === '부동산' || text === '경제') {
        let category = 'auto';
        if (text.includes('부동산') || text.startsWith('/realestate')) category = 'real_estate';
        else if (text.includes('경제') || text.startsWith('/economy')) category = 'economy';
        else if (text.includes('금융') || text.startsWith('/finance')) category = 'finance';

        if (!githubPat) {
          await telegram.sendMessage(
            `⚠️ <b>GitHub Token 미설정</b>\nGitHub Actions를 원격 트리거하려면 Vercel 환경변수에 <code>GITHUB_PAT</code>를 등록해야 합니다.`
          );
          return res.status(200).json({ success: false });
        }

        await telegram.sendMessage(
          `📊 <b>[금융/부동산 1호점 가동]</b>\n카테고리: <b>${category}</b>\n한국은행·국토부 공공데이터 결합 및 21인 감수 루프를 시작합니다!\n\n⏱️ 약 1~2분 후 승인 알림이 도착합니다.`
        );

        const ghRes = await fetch('https://api.github.com/repos/zozero94/blog/actions/workflows/auto-posting.yml/dispatches', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubPat}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'TelegramBot-Webhook',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: { category },
          }),
        });

        if (!ghRes.ok) {
          const errText = await ghRes.text();
          await telegram.sendMessage(`❌ GitHub Actions 트리거 실패:\n<code>${errText}</code>`);
        }

        return res.status(200).json({ success: true });
      }
    }

    return res.status(200).json({ message: 'No actionable message found' });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    try {
      await telegram.sendMessage(`❌ 처리 중 오류가 발생했습니다:\n<code>${error.message}</code>`);
    } catch {}
    return res.status(500).json({ error: error.message });
  }
}
