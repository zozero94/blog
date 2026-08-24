import { GeneratedPost } from './types.js';

export interface BloggerPostResponse {
  id: string;
  url: string;
  title: string;
  status: string;
  content?: string;
  published?: string;
  labels?: string[];
}

export class BloggerClient {
  private blogId: string;
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(blogId: string, clientId: string, clientSecret: string, refreshToken: string) {
    this.blogId = blogId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
  }

  /**
   * Refresh Token으로 Access Token 발급 및 메모리 캐싱
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedAccessToken;
    }

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
    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
    return this.cachedAccessToken!;
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
      labels: [...post.tags, ...post.categories],
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
      throw new Error(`Blogger 글 발행 실패 (${res.status}): ${errText}`);
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
   * 구글 블로그(Blogger) 글 삭제 (Delete)
   */
  async deletePost(postId: string): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${this.blogId}/posts/${postId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      const errText = await res.text();
      throw new Error(`Blogger 글 삭제 실패 (${res.status}): ${errText}`);
    }

    return true;
  }

  /**
   * 공개된 포스트 목록 조회
   */
  async getPosts(maxResults: number = 20): Promise<BloggerPostResponse[]> {
    const accessToken = await this.getAccessToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${this.blogId}/posts?maxResults=${maxResults}&fetchBodies=true&status=live`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      status: item.status,
      content: item.content,
      published: item.published,
      labels: item.labels || [],
    }));
  }

  /**
   * 단일 포스트 상세 조회
   */
  async getPostById(postId: string): Promise<BloggerPostResponse | null> {
    const accessToken = await this.getAccessToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${this.blogId}/posts/${postId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;

    const item = await res.json();
    return {
      id: item.id,
      url: item.url,
      title: item.title,
      status: item.status,
      content: item.content,
      published: item.published,
      labels: item.labels || [],
    };
  }
}
