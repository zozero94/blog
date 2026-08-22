import { GeneratedPost, WordPressPostResponse } from './types.js';

export class TelegramClient {
  private botToken: string;
  private chatId: string;
  private baseUrl: string;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * 일반 텍스트 메시지 전송
   */
  async sendMessage(text: string): Promise<{ message_id: number }> {
    const url = `${this.baseUrl}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Telegram API 메시지 전송 실패 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return { message_id: data.result.message_id };
  }

  /**
   * 커스텀 마크업과 함께 메시지 전송
   */
  async sendMessageWithMarkup(
    text: string,
    replyMarkup: any
  ): Promise<{ message_id: number }> {
    const url = `${this.baseUrl}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: replyMarkup,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Telegram API 메시지 전송 실패 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return { message_id: data.result.message_id };
  }

  /**
   * 임시글 승인 요청 메시지 및 인라인 버튼 전송 (단일 워드프레스용 레거시 호환)
   */
  async sendDraftApproval(
    categoryName: string,
    post: GeneratedPost,
    wpPost: WordPressPostResponse
  ): Promise<{ message_id: number }> {
    const tagText = post.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
    const text = `📢 <b>[AI 자동화] ${categoryName} 포스팅 승인 요청</b>

📝 <b>제목:</b> ${escapeHtml(post.title)}

💡 <b>3줄 핵심 요약:</b>
${escapeHtml(post.summary)}

🏷️ <b>태그:</b> ${escapeHtml(tagText)}
🔗 <b>미리보기 URL:</b> <a href="${wpPost.URL}">${wpPost.URL}</a>
🆔 <b>Post ID:</b> <code>${wpPost.ID}</code>

아래 버튼을 눌러 발행 여부를 결정해주세요:`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅ 즉시 발행', callback_data: `publish:${wpPost.ID}` },
          { text: '❌ 글 삭제', callback_data: `delete:${wpPost.ID}` },
        ],
      ],
    };

    return await this.sendMessageWithMarkup(text, replyMarkup);
  }

  /**
   * 콜백 쿼리 응답 (버튼 클릭 시 로딩 해제)
   */
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    const url = `${this.baseUrl}/answerCallbackQuery`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
  }

  /**
   * 메시지 내용 및 버튼 상태 업데이트
   */
  async editMessageText(
    chatId: string | number,
    messageId: number,
    newText: string
  ): Promise<void> {
    const url = `${this.baseUrl}/editMessageText`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: newText,
        parse_mode: 'HTML',
      }),
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
