import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wpSiteId = process.env.WP_SITE_ID || '256898514';
  const wpToken = process.env.WP_ACCESS_TOKEN;

  try {
    const { id, category } = req.query;

    // 단일 포스트 상세 조회
    if (id) {
      const url = `https://public-api.wordpress.com/rest/v1.1/sites/${wpSiteId}/posts/${id}`;
      const response = await fetch(url, {
        headers: wpToken ? { Authorization: `Bearer ${wpToken}` } : {},
      });
      if (!response.ok) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const data = await response.json();
      return res.status(200).json(data);
    }

    // 포스트 목록 조회 (최근 발행된 글 20개)
    let url = `https://public-api.wordpress.com/rest/v1.1/sites/${wpSiteId}/posts/?number=20&status=publish`;
    if (category) {
      url += `&category=${encodeURIComponent(String(category))}`;
    }

    const response = await fetch(url, {
      headers: wpToken ? { Authorization: `Bearer ${wpToken}` } : {},
    });

    if (!response.ok) {
      return res.status(200).json({ posts: [] });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch posts' });
  }
}
