import { GeneratedPost } from './types.js';

export interface BloggerPostResponse {
  id: string;
  url: string;
  title: string;
  status: string;
}

export class BloggerClient {
  private blogId: string;
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;

  constructor(blogId: string, clientId: string, clientSecret: string, refreshToken: string) {
    this.blogId = blogId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
  }

  /**
   * Refresh Token으로 새로운 Access Token 발급
   */
  private async getAccessToken(): Promise<string> {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google OAuth Access Token 갱신 실패: ${errText}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  /**
   * 구글 블로그(Blogger)에 임시글(Draft) 등록
   */
  async createDraftPost(post: GeneratedPost): Promise<BloggerPostResponse> {
    const accessToken = await this.getAccessToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${this.blogId}/posts/?isDraft=true`;

    const body = {
      kind: 'blogger#post',
      title: post.title,
      content: post.htmlContent,
      labels: post.tags,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Blogger Draft 생성 실패 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      url: data.url,
      title: data.title,
      status: data.status,
    };
  }

  /**
   * 구글 블로그(Blogger) 글 즉시 발행 (Publish)
   */
  async publishPost(postId: string): Promise<BloggerPostResponse> {
    const accessToken = await this.getAccessToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${this.blogId}/posts/${postId}/publish`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Blogger 발행 실패 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      url: data.url,
      title: data.title,
      status: data.status,
    };
  }

  /**
   * 구글 블로그(Blogger) 글 삭제
   */
  async deletePost(postId: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${this.blogId}/posts/${postId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Blogger 삭제 실패 (${res.status}): ${errText}`);
    }
  }
}
