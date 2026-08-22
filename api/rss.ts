import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wpSiteId = process.env.WP_SITE_ID || '256898514';
  const wpToken = process.env.WP_ACCESS_TOKEN;

  try {
    const url = `https://public-api.wordpress.com/rest/v1.1/sites/${wpSiteId}/posts/?number=20&status=publish`;
    const response = await fetch(url, {
      headers: wpToken ? { Authorization: `Bearer ${wpToken}` } : {},
    });

    const data = await response.json();
    const posts = data.posts || [];

    const rssItems = posts.map((p: any) => {
      const pubDate = new Date(p.date).toUTCString();
      const link = `https://zozero94.com/post.html?id=${p.ID}`;
      const title = escapeXml(p.title || '');
      const rawDesc = (p.excerpt || p.content || '').replace(/<[^>]*>?/gm, '').trim();
      const description = escapeXml(rawDesc.slice(0, 300));

      return `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
    }).join('\n');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>인사이트 머니 &amp; 리얼티 (Insight Money &amp; Realty)</title>
    <link>https://zozero94.com</link>
    <description>국토교통부 · 한국은행 · DART 공인 데이터 기반 팩트체크 경제, 부동산, 재테크 분석 칼럼</description>
    <language>ko-KR</language>
    <atom:link href="https://zozero94.com/rss.xml" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    return res.status(200).send(rssXml);
  } catch (err) {
    console.error('RSS Generation Error:', err);
    return res.status(500).send('Error generating RSS');
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
