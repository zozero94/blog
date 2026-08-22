import { GeneratedPost, WordPressPostResponse } from './types.js';

export class WordPressClient {
  private siteId: string;
  private accessToken: string;
  private baseUrl: string;

  constructor(siteId: string, accessToken: string) {
    this.siteId = siteId;
    this.accessToken = accessToken;
    this.baseUrl = `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 임시글(Draft) 생성
   */
  async createDraftPost(post: GeneratedPost): Promise<WordPressPostResponse> {
    const url = `${this.baseUrl}/posts/new`;
    const body = {
      title: post.title,
      content: post.htmlContent,
      status: 'draft',
      categories: post.categories.join(','),
      tags: post.tags.join(','),
      excerpt: post.metaDescription,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WordPress API Draft 생성 실패 (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as WordPressPostResponse;
    return data;
  }

  /**
   * 글 즉시 발행 (Draft -> Publish)
   */
  async publishPost(postId: number | string): Promise<WordPressPostResponse> {
    const url = `${this.baseUrl}/posts/${postId}`;
    const body = {
      status: 'publish',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WordPress API 발행 실패 (${response.status}): ${errText}`);
    }

    return (await response.json()) as WordPressPostResponse;
  }

  /**
   * 글 삭제 (Trash)
   */
  async deletePost(postId: number | string): Promise<{ ID: number; status: string }> {
    const url = `${this.baseUrl}/posts/${postId}/delete`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WordPress API 삭제 실패 (${response.status}): ${errText}`);
    }

    return (await response.json()) as { ID: number; status: string };
  }
}
