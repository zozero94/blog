import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wpSiteId = process.env.WP_SITE_ID || '256898514';
  const wpToken = process.env.WP_ACCESS_TOKEN || 'cdp)1mQgj!y)ssz0(ncH7zm08Ulsc@7InVA5814gyQL*k$aHVF$G#)95brx7^Ah5';

  // Vercel Edge 캐싱 (10초 캐시, 60초 백그라운드 갱신)
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { id, category } = req.query;

    // 단일 포스트 상세 조회
    if (id) {
      const url = `https://public-api.wordpress.com/rest/v1.1/sites/${wpSiteId}/posts/${id}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${wpToken}` },
      });
      if (!response.ok) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const data = await response.json();
      return res.status(200).json(data);
    }

    // 포스트 목록 조회
    let url = `https://public-api.wordpress.com/rest/v1.1/sites/${wpSiteId}/posts/?number=20&status=publish`;
    if (category) {
      url += `&category=${encodeURIComponent(String(category))}`;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${wpToken}` },
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
