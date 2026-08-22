import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BloggerClient } from '../src/blogger.js';
import { TelegramClient } from '../src/telegram.js';

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

  if (!telegramBotToken || !telegramChatId || !defaultBloggerBlogId || !bloggerClientId || !bloggerClientSecret || !bloggerRefreshToken) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const telegram = new TelegramClient(telegramBotToken, telegramChatId);

  try {
    const update = req.body;
    const callbackQuery = update?.callback_query;

    if (!callbackQuery) {
      return res.status(200).json({ message: 'No callback query found' });
    }

    const callbackData = callbackQuery.data;
    const parts = callbackData.split(':');
    const action = parts[0];
    
    let targetBlogId = defaultBloggerBlogId;
    let targetPostId = '';

    if (parts.length === 3) {
      // Format: action:blogId:postId (e.g. publish:2498717653629376483:796673244040025272)
      targetBlogId = parts[1];
      targetPostId = parts[2];
    } else if (parts.length === 2) {
      // Legacy format: action:postId
      const rawId = parts[1];
      targetPostId = rawId.includes('_') ? rawId.split('_')[1] : rawId;
      // If the post ID belongs to the trend blog or 1호점에서 404 났던 경우 자동 탐지
    }

    const blogger = new BloggerClient(targetBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);
    const isTrendBlog = targetBlogId === trendBloggerBlogId || targetBlogId === '2498717653629376483';
    const domainUrl = isTrendBlog ? 'https://trend.zozero94.com' : 'https://zozero94.com';
    const blogTypeKo = isTrendBlog ? '트렌드 블로그 2호점' : '금융/경제 블로그 1호점';

    if (action === 'publish') {
      let publishedUrl = '';
      if (targetPostId && targetPostId !== 'none') {
        try {
          const result = await blogger.publishPost(targetPostId);
          publishedUrl = result.url || domainUrl;
        } catch (pubErr: any) {
          // 만약 defaultBlogId에서 404가 났다면 trendBloggerBlogId로 2차 시도
          if (!isTrendBlog) {
            const fallbackBlogger = new BloggerClient(trendBloggerBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);
            const fallbackResult = await fallbackBlogger.publishPost(targetPostId);
            publishedUrl = fallbackResult.url || 'https://trend.zozero94.com';
          } else {
            throw pubErr;
          }
        }
      }

      await telegram.sendMessage(
        `🎉 <b>[발행 완료] ${blogTypeKo} 글이 정식 공개되었습니다!</b>\n\n🌐 <b>내 도메인:</b> <a href="${domainUrl}">${domainUrl}</a>\n📱 <b>구글 블로그:</b> <a href="${publishedUrl}">${publishedUrl}</a>`
      );
    } else if (action === 'delete') {
      if (targetPostId && targetPostId !== 'none') {
        try {
          await blogger.deletePost(targetPostId);
        } catch (delErr) {
          if (!isTrendBlog) {
            const fallbackBlogger = new BloggerClient(trendBloggerBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);
            await fallbackBlogger.deletePost(targetPostId);
          }
        }
      }

      await telegram.sendMessage(`🗑️ <b>[삭제 완료]</b> ${blogTypeKo} 임시글이 안전하게 삭제되었습니다.`);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    try {
      await telegram.sendMessage(`❌ 처리 중 오류가 발생했습니다:\n<code>${error.message}</code>`);
    } catch {}
    return res.status(500).json({ error: error.message });
  }
}
