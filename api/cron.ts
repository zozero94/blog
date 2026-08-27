import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const githubPat = process.env.GITHUB_PAT || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!githubPat) {
    return res.status(500).json({ error: 'Missing GITHUB_PAT in environment' });
  }

  const now = new Date();
  const utcHours = now.getUTCHours();
  const kstHours = (utcHours + 9) % 24;

  const target = (req.query.target as string) || 'auto';
  const triggered: string[] = [];

  try {
    // 1. 트렌드 2호점 트리거 (12시 KST, 18시 KST 또는 target=trend/all)
    if (target === 'trend' || target === 'all' || (target === 'auto' && (kstHours === 12 || kstHours === 18))) {
      const ghRes = await fetch('https://api.github.com/repos/zozero94/trend/actions/workflows/daily-trend-post.yml/dispatches', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VercelCron-Dispatcher',
        },
        body: JSON.stringify({ ref: 'main', inputs: {} }),
      });
      if (ghRes.ok) triggered.push('trend-blog (2호점)');
      else console.error('Trend dispatch error:', await ghRes.text());
    }

    // 2. 금융 1호점 트리거 (09시, 12시, 16시 KST 또는 target=finance/all)
    if (target === 'finance' || target === 'all' || (target === 'auto' && (kstHours === 9 || kstHours === 12 || kstHours === 16))) {
      let category = 'auto';
      if (kstHours === 9) category = 'economy';
      else if (kstHours === 12) category = 'real_estate';
      else if (kstHours === 16) category = 'finance';

      const ghRes = await fetch('https://api.github.com/repos/zozero94/blog/actions/workflows/auto-posting.yml/dispatches', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VercelCron-Dispatcher',
        },
        body: JSON.stringify({ ref: 'main', inputs: { category } }),
      });
      if (ghRes.ok) triggered.push(`finance-blog (1호점 - ${category})`);
      else console.error('Finance dispatch error:', await ghRes.text());
    }

    return res.status(200).json({
      success: true,
      utcHours,
      kstHours,
      triggered,
      message: triggered.length > 0 ? `Successfully triggered: ${triggered.join(', ')}` : 'No scheduled jobs for this hour',
    });
  } catch (error: any) {
    console.error('Cron Dispatch Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
