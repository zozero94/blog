import { WordPressClient } from '../src/wordpress.js';
import { TelegramClient } from '../src/telegram.js';
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Telegram Webhook Endpoint is Running');
    }
    const wpSiteId = process.env.WP_SITE_ID;
    const wpAccessToken = process.env.WP_ACCESS_TOKEN;
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    if (!wpSiteId || !wpAccessToken || !telegramBotToken || !allowedChatId) {
        console.error('Environment variables missing');
        return res.status(500).json({ error: 'Server configuration error' });
    }
    const telegram = new TelegramClient(telegramBotToken, allowedChatId);
    const wp = new WordPressClient(wpSiteId, wpAccessToken);
    try {
        const update = req.body;
        const callbackQuery = update?.callback_query;
        if (!callbackQuery) {
            // 일반 메시지나 기타 이벤트는 무시하고 200 반환
            return res.status(200).json({ ok: true });
        }
        const callbackId = callbackQuery.id;
        const fromId = String(callbackQuery.from?.id);
        const data = callbackQuery.data;
        const message = callbackQuery.message;
        const chatId = message?.chat?.id;
        const messageId = message?.message_id;
        // 본인 확인 (인증된 관리자만 처리)
        if (fromId !== allowedChatId) {
            await telegram.answerCallbackQuery(callbackId, '⚠️ 권한이 없습니다.');
            return res.status(200).json({ ok: true });
        }
        if (!data || !messageId || !chatId) {
            await telegram.answerCallbackQuery(callbackId, '잘못된 요청입니다.');
            return res.status(200).json({ ok: true });
        }
        const [action, postIdStr] = data.split(':');
        const postId = parseInt(postIdStr, 10);
        if (!postId || isNaN(postId)) {
            await telegram.answerCallbackQuery(callbackId, '유효하지 않은 Post ID입니다.');
            return res.status(200).json({ ok: true });
        }
        const originalText = message.text || '';
        if (action === 'publish') {
            await telegram.answerCallbackQuery(callbackId, '발행 처리 중...');
            const published = await wp.publishPost(postId);
            const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n🎉 <b>[발행 완료]</b> 블로그에 정식 공개되었습니다!\n🔗 <b>글 보러가기:</b> <a href="${published.URL}">${published.URL}</a>`;
            await telegram.editMessageText(chatId, messageId, updatedText);
            return res.status(200).json({ ok: true, action: 'publish', postId });
        }
        else if (action === 'delete') {
            await telegram.answerCallbackQuery(callbackId, '삭제 처리 중...');
            await wp.deletePost(postId);
            const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ <b>[삭제 완료]</b> 해당 임시글이 정상적으로 휴지통으로 이동되었습니다.`;
            await telegram.editMessageText(chatId, messageId, updatedText);
            return res.status(200).json({ ok: true, action: 'delete', postId });
        }
        await telegram.answerCallbackQuery(callbackId, '알 수 없는 명령입니다.');
        return res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}
