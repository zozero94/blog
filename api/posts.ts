import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BloggerClient } from '../src/blogger.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const blogId = process.env.BLOGGER_BLOG_ID || '';
  const clientId = process.env.BLOGGER_CLIENT_ID || '';
  const clientSecret = process.env.BLOGGER_CLIENT_SECRET || '';
  const refreshToken = process.env.BLOGGER_REFRESH_TOKEN || '';

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { id, category } = req.query;
    const blogger = new BloggerClient(blogId, clientId, clientSecret, refreshToken);

    // 단일 포스트 상세 조회
    if (id) {
      const post = await blogger.getPostById(String(id));
      if (!post) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.status(404).json({ error: 'Post not found' });
      }

      // 프론트엔드 호환 포맷 변환
      const formatted = {
        ID: post.id,
        title: post.title,
        date: post.published || new Date().toISOString(),
        content: post.content,
        categories: { [detectCategory(post.labels || [])]: {} },
        tags: (post.labels || []).reduce((acc: any, t: string) => {
          acc[t] = {};
          return acc;
        }, {}),
      };

      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
      return res.status(200).json(formatted);
    }

    // 포스트 목록 조회
    const rawPosts = await blogger.getPosts(30);

    let posts = rawPosts.map((p) => {
      const cat = detectCategory(p.labels || []);
      const cleanHtml = (p.content || '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      const excerpt = cleanHtml.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 180);

      return {
        ID: p.id,
        title: p.title,
        date: p.published || new Date().toISOString(),
        excerpt: `<p>${excerpt}...</p>`,
        content: p.content,
        categories: { [cat]: {} },
        tags: (p.labels || []).reduce((acc: any, t: string) => {
          acc[t] = {};
          return acc;
        }, {}),
      };
    });

    // 카테고리 필터링
    if (category) {
      const catQuery = String(category).replace(/[·\s]/g, '').toLowerCase();
      posts = posts.filter((p) => {
        const catKeys = Object.keys(p.categories || {});
        return catKeys.some((k) => {
          const cleanK = k.replace(/[·\s]/g, '').toLowerCase();
          return cleanK.includes(catQuery) || catQuery.includes(cleanK);
        });
      });
    }

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
    return res.status(200).json({ found: posts.length, posts });
  } catch (error) {
    console.error('API Error:', error);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(500).json({ error: 'Failed to fetch posts from Google Blogger' });
  }
}

function detectCategory(labels: string[]): string {
  const text = labels.join(' ');
  if (text.includes('부동산') || text.includes('아파트') || text.includes('청약')) return '부동산';
  if (text.includes('재테크') || text.includes('ETF') || text.includes('배당') || text.includes('ISA')) return '재테크';
  return '경제';
}
