import 'dotenv/config';
import { BloggerClient } from '../src/blogger.js';

async function main() {
  const blogger = new BloggerClient(
    process.env.BLOGGER_BLOG_ID!,
    process.env.BLOGGER_CLIENT_ID!,
    process.env.BLOGGER_CLIENT_SECRET!,
    process.env.BLOGGER_REFRESH_TOKEN!
  );

  const posts = await blogger.getPosts(10);
  console.log(`Found ${posts.length} posts in Blogger 1호점 (zozero94.com):`);

  const token = await (blogger as any).getAccessToken();

  for (const post of posts) {
    if (!post.id) continue;
    console.log(`- ${post.id}: ${post.title}`);

    let updatedContent = post.content;
    // Replace any desktop coupang links with mobile coupang links
    updatedContent = updatedContent.replace(/href=['"]https:\/\/(?:www|m)\.coupang\.com\/np\/search\?component=&q=([^'"]*)&channel=user['"]/gi, 'href="https://m.coupang.com/nm/search?q=$1"');
    updatedContent = updatedContent.replace(/href=['"]https:\/\/www\.coupang\.com\/np\/search\?q=([^'"]*)['"]/gi, 'href="https://m.coupang.com/nm/search?q=$1"');
    // Strip dummy image placeholders
    updatedContent = updatedContent.replace(/<div[^>]*>[\s\S]*?(📸|\[이미지:|Alt:|이미지 가이드|포토존)[\s\S]*?<\/div>/gi, '');
    updatedContent = updatedContent.replace(/📸\s*\[이미지:[^\]]*\]/gi, '');

    if (updatedContent !== post.content) {
      const url = `https://www.googleapis.com/blogger/v3/blogs/${process.env.BLOGGER_BLOG_ID}/posts/${post.id}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: post.id,
          title: post.title,
          content: updatedContent,
          labels: post.labels,
        }),
      });
      if (res.ok) {
        console.log(`  ✅ Cleaned and updated post ${post.id}`);
      }
    }
  }
}
main();
