import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BloggerClient } from '../src/blogger.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const blogId = process.env.BLOGGER_BLOG_ID || '';
  const clientId = process.env.BLOGGER_CLIENT_ID || '';
  const clientSecret = process.env.BLOGGER_CLIENT_SECRET || '';
  const refreshToken = process.env.BLOGGER_REFRESH_TOKEN || '';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const blogger = new BloggerClient(blogId, clientId, clientSecret, refreshToken);
    const posts = await blogger.getPosts(20);

    const rssItems = posts.map((p) => {
      const pubDate = new Date(p.published || new Date()).toUTCString();
      const link = `https://zozero94.com/post.html?id=${p.id}`;
      const title = escapeXml(p.title || '');
      const rawDesc = (p.content || '').replace(/<[^>]*>?/gm, '').trim();
      const description = escapeXml(rawDesc.slice(0, 300));

      return `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
    }).join('');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>인사이트 머니 &amp; 리얼티</title>
    <link>https://zozero94.com</link>
    <description>국토부·한국은행·DART 공인 데이터 기반 경제·부동산·재테크 전문 미디어</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://zozero94.com/rss.xml" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

    return res.status(200).send(rssXml);
  } catch (error) {
    console.error('RSS Error:', error);
    return res.status(500).send('<error>Failed to generate RSS</error>');
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
