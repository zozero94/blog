import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WordPressClient } from '../src/wordpress.js';
import { BloggerClient } from '../src/blogger.js';
import { TelegramClient } from '../src/telegram.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).send('Telegram Webhook Endpoint is Running');
  }

  const wpSiteId = process.env.WP_SITE_ID;
  const wpAccessToken = process.env.WP_ACCESS_TOKEN;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatId = process.env.TELEGRAM_CHAT_ID;

  const bloggerBlogId = process.env.BLOGGER_BLOG_ID;
  const bloggerClientId = process.env.BLOGGER_CLIENT_ID;
  const bloggerClientSecret = process.env.BLOGGER_CLIENT_SECRET;
  const bloggerRefreshToken = process.env.BLOGGER_REFRESH_TOKEN;

  if (!telegramBotToken || !allowedChatId) {
    console.error('Environment variables missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const telegram = new TelegramClient(telegramBotToken, allowedChatId);
  const wp = (wpSiteId && wpAccessToken) ? new WordPressClient(wpSiteId, wpAccessToken) : null;
  const blogger = (bloggerBlogId && bloggerClientId && bloggerClientSecret && bloggerRefreshToken)
    ? new BloggerClient(bloggerBlogId, bloggerClientId, bloggerClientSecret, bloggerRefreshToken)
    : null;

  try {
    const update = req.body;
    const callbackQuery = update?.callback_query;

    if (!callbackQuery) {
      return res.status(200).json({ ok: true });
    }

    const callbackId = callbackQuery.id;
    const fromId = String(callbackQuery.from?.id);
    const data = callbackQuery.data as string;
    const message = callbackQuery.message;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;

    if (fromId !== allowedChatId) {
      await telegram.answerCallbackQuery(callbackId, '⚠️ 권한이 없습니다.');
      return res.status(200).json({ ok: true });
    }

    if (!data || !messageId || !chatId) {
      await telegram.answerCallbackQuery(callbackId, '잘못된 요청입니다.');
      return res.status(200).json({ ok: true });
    }

    const [action, combinedIds] = data.split(':');
    const [wpIdStr, bloggerIdStr] = (combinedIds || '').split('_');

    const originalText = message.text || '';

    if (action === 'publish') {
      await telegram.answerCallbackQuery(callbackId, '듀얼 블로그 동시 발행 처리 중...');
      const results: string[] = [];

      // 1. 내 도메인 (zozero94.com) 반영
      if (wp && wpIdStr && wpIdStr !== 'none') {
        try {
          await wp.publishPost(wpIdStr);
          results.push(`🌐 <b>내 도메인 웹진:</b> <a href="https://zozero94.com">https://zozero94.com</a>`);
        } catch (e) {
          console.error('WP Publish Error:', e);
        }
      }

      // 2. 구글 블로거 (Blogger) 발행
      if (blogger && bloggerIdStr && bloggerIdStr !== 'none') {
        try {
          const publishedBlogger = await blogger.publishPost(bloggerIdStr);
          results.push(`📱 <b>구글 블로그:</b> <a href="${publishedBlogger.url}">${publishedBlogger.url}</a>`);
        } catch (e) {
          console.error('Blogger Publish Error:', e);
        }
      }

      const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n🎉 <b>[듀얼 발행 완료]</b> 워드프레스와 구글 블로그에 정식 공개되었습니다!\n${results.join('\n')}`;
      await telegram.editMessageText(chatId, messageId, updatedText);

      return res.status(200).json({ ok: true, action: 'publish', wpId: wpIdStr, bloggerId: bloggerIdStr });
    } else if (action === 'delete') {
      await telegram.answerCallbackQuery(callbackId, '삭제 처리 중...');

      if (wp && wpIdStr && wpIdStr !== 'none') {
        try { await wp.deletePost(wpIdStr); } catch (e) {}
      }
      if (blogger && bloggerIdStr && bloggerIdStr !== 'none') {
        try { await blogger.deletePost(bloggerIdStr); } catch (e) {}
      }

      const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ <b>[삭제 완료]</b> 양쪽 블로그의 임시글이 정상적으로 삭제되었습니다.`;
      await telegram.editMessageText(chatId, messageId, updatedText);

      return res.status(200).json({ ok: true, action: 'delete' });
    }

    await telegram.answerCallbackQuery(callbackId, '알 수 없는 명령입니다.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
