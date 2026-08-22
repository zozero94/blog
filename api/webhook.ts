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
    return res.status(200).json({ error: 'Server configuration error' });
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

      // WordPress와 Blogger 동시 병렬 발행 처리 (Promise.allSettled)
      const tasks: Promise<{ platform: string; url: string }>[] = [];

      if (wp && wpIdStr && wpIdStr !== 'none') {
        tasks.push(
          wp.publishPost(wpIdStr).then(() => ({
            platform: '🌐 내 도메인 웹진',
            url: 'https://zozero94.com',
          }))
        );
      }

      if (blogger && bloggerIdStr && bloggerIdStr !== 'none') {
        tasks.push(
          blogger.publishPost(bloggerIdStr).then((b) => ({
            platform: '📱 구글 블로그',
            url: b.url,
          }))
        );
      }

      const settled = await Promise.allSettled(tasks);
      const successResults: string[] = [];
      const failResults: string[] = [];

      settled.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          successResults.push(`${r.value.platform}: <a href="${r.value.url}">${r.value.url}</a>`);
        } else {
          failResults.push(`❌ 서비스 ${idx + 1} 발행 실패 (${r.reason?.message || '오류'})`);
        }
      });

      let statusHeader = '🎉 <b>[듀얼 발행 완료]</b> 워드프레스와 구글 블로그에 정식 공개되었습니다!';
      if (failResults.length > 0) {
        statusHeader = '⚠️ <b>[부분 발행 완료]</b> 일부 서비스 발행 중 오류가 발생했습니다.';
      }

      const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n${statusHeader}\n${successResults.join('\n')}${failResults.length > 0 ? '\n' + failResults.join('\n') : ''}`;
      await telegram.editMessageText(chatId, messageId, updatedText);

      return res.status(200).json({ ok: true, action: 'publish', success: successResults.length, fail: failResults.length });
    } else if (action === 'delete') {
      await telegram.answerCallbackQuery(callbackId, '삭제 처리 중...');

      const delTasks: Promise<any>[] = [];
      if (wp && wpIdStr && wpIdStr !== 'none') delTasks.push(wp.deletePost(wpIdStr).catch(e => console.error('WP del error', e)));
      if (blogger && bloggerIdStr && bloggerIdStr !== 'none') delTasks.push(blogger.deletePost(bloggerIdStr).catch(e => console.error('Blogger del error', e)));

      await Promise.allSettled(delTasks);

      const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ <b>[삭제 완료]</b> 양쪽 블로그의 임시글이 정상적으로 삭제되었습니다.`;
      await telegram.editMessageText(chatId, messageId, updatedText);

      return res.status(200).json({ ok: true, action: 'delete' });
    }

    await telegram.answerCallbackQuery(callbackId, '알 수 없는 명령입니다.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
