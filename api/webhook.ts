import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BloggerClient } from '../src/blogger.js';
import { TelegramClient } from '../src/telegram.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  const bloggerBlogId = process.env.BLOGGER_BLOG_ID;
  const bloggerClientId = process.env.BLOGGER_CLIENT_ID;
  const bloggerClientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const bloggerRefreshToken = process.env.BLOGGER_REFRESH_TOKEN;

  if (!telegramBotToken || !telegramChatId || !bloggerBlogId || !bloggerClientId || !bloggerClientSecret || !bloggerRefreshToken) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const telegram = new TelegramClient(telegramBotToken, telegramChatId);
  const blogger = new BloggerClient(bloggerBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken);

  try {
    const update = req.body;
    const callbackQuery = update?.callback_query;

    if (!callbackQuery) {
      return res.status(200).json({ message: 'No callback query found' });
    }

    const callbackData = callbackQuery.data;
    const [action, rawId] = callbackData.split(':');
    const bloggerPostId = rawId.includes('_') ? rawId.split('_')[1] : rawId;

    if (action === 'publish') {
      let publishedUrl = '';
      if (bloggerPostId && bloggerPostId !== 'none') {
        const result = await blogger.publishPost(bloggerPostId);
        publishedUrl = result.url || 'https://zozero94.blogspot.com';
      }

      await telegram.sendMessage(
        `🎉 <b>[발행 완료] 글이 정식 공개되었습니다!</b>\n\n🌐 <b>내 도메인:</b> <a href="https://zozero94.com">https://zozero94.com</a>\n📱 <b>구글 블로그:</b> <a href="${publishedUrl}">${publishedUrl}</a>`
      );
    } else if (action === 'delete') {
      if (bloggerPostId && bloggerPostId !== 'none') {
        await blogger.deletePost(bloggerPostId);
      }

      await telegram.sendMessage('🗑️ <b>[삭제 완료]</b> 해당 임시글이 안전하게 삭제되었습니다.');
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
