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

    // 포스트 목록 조회 (최신 30건 가져온 후 유연 필터링)
    const url = `https://public-api.wordpress.com/rest/v1.1/sites/${wpSiteId}/posts/?number=30&status=publish`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${wpToken}` },
    });

    if (!response.ok) {
      return res.status(200).json({ posts: [] });
    }

    const data = await response.json();
    let posts = data.posts || [];

    // 카테고리 필터링 요청이 있는 경우 유연 매칭 (경제/부동산/재테크)
    if (category) {
      const catQuery = String(category).replace(/[·\s]/g, '').toLowerCase();
      posts = posts.filter((p: any) => {
        const catKeys = Object.keys(p.categories || {});
        return catKeys.some((k) => {
          const cleanK = k.replace(/[·\s]/g, '').toLowerCase();
          return cleanK.includes(catQuery) || catQuery.includes(cleanK);
        });
      });
    }

    return res.status(200).json({ found: posts.length, posts });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch posts' });
  }
}
