import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import { BlogCategory, CategoryConfig, NewsItem } from './types.js';
import { generateContentWithFallback, safeJsonParse } from './model-resolver.js';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const parser = new Parser({
  headers: {
    'User-Agent': BROWSER_UA,
  },
  timeout: 8000,
});

export const CATEGORY_CONFIGS: Record<BlogCategory, CategoryConfig> = {
  economy: {
    name: '시사·경제 & 글로벌',
    topic: '국내외 거시 경제, 한국은행/미국 연준(FOMC) 기준금리, 원달러/엔화 환율, 소비자물가, AI 빅테크/반도체 수출, 고용동향, 글로벌 공급망',
    searchKeywords: [
      '한국은행 기준금리', '미국 연준 금리 FOMC', '원달러 엔화 환율', '소비자물가지수',
      'AI 반도체 수출', '국민연금 개혁', '글로벌 경제전망', '유류세 유가', 'K-방산 무역수지'
    ],
    rssUrls: [
      'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
      `https://news.google.com/rss/search?q=${encodeURIComponent('한국은행 기준금리 OR 미국 연준 FOMC OR 환율')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('소비자물가 OR 엔화 투자 OR 수출 실적')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('AI 반도체 빅테크 OR 글로벌 경제전망')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '시사·경제',
    tags: ['경제', '시사이슈', '거시경제', '환율', '기준금리', '미국연준', '글로벌경제', '빅테크'],
  },
  real_estate: {
    name: '부동산 & 주거실전',
    topic: '아파트 청약 무순위 줍줍, 서울/수도권 실거래가 신고가, 법원 경매/공매 낙찰가율, 스트레스 DSR 2단계, 전세사기 HUG 보증금 반환, 3기 신도시, GTX 호재',
    searchKeywords: [
      '아파트 청약 줍줍 경쟁률', '서울 아파트 실거래가', '법원 경매 낙찰가율', '스트레스 DSR 대출',
      '부동산 양도세 취득세', 'HUG 전세보증보험', 'GTX 개통 호재', '3기 신도시 본청약', '재건축 분담금'
    ],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('아파트 청약 경쟁률 OR 무순위 줍줍 OR 분양가')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('아파트 실거래가 OR 매매가 상승 OR 전세가율')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('법원 경매 낙찰가율 OR 스트레스 DSR 대출규제')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('HUG 전세보증금 반환 OR 3기 신도시 본청약')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '부동산',
    tags: ['부동산', '아파트', '청약', '내집마련', '실거래가', '경매', '대출규제', 'DSR'],
  },
  finance: {
    name: '세테크 & 패시브인컴',
    topic: '초밀착 절세(상속/증여/건보료 방어), 월배당 ETF 포트폴리오, 중개형 ISA 비과세, 연금저축/IRP 세액공제, 2026 정부 지원금, 숨은 돈 찾기, 금/원자재',
    searchKeywords: [
      '월배당 ETF 포트폴리오', '중개형 ISA 절세', '상속세 증여세 차용증', '건강보험료 피부양자',
      '신생아 특례대출 지원금', '연말정산 소득공제', '퇴직연금 IRP 수령', 'KRX 금 현물 시세', '숨은 환급금'
    ],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('월배당 ETF OR 배당주 포트폴리오 OR SCHD')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('중개형 ISA 비과세 OR 연금저축 IRP 세액공제')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('상속세 증여세 절세 OR 건강보험료 피부양자')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('신생아 특례대출 OR 청년도약계좌 OR 정부지원금')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '재테크·금융',
    tags: ['재테크', '금융', '절세전략', '월배당', 'ETF', '정부지원금', '연금저축', '자산관리'],
  },
};

export interface SingleTopicResult {
  config: CategoryConfig;
  mainTopicTitle: string;
  searchKeywords: string[];
  crossSources: NewsItem[];
}

/**
 * 1. 구글 트렌드 대한민국 실시간 경제/비즈니스 핫토픽 수집
 */
async function fetchGoogleTrendsEconomy(): Promise<NewsItem[]> {
  const url = 'https://trends.google.com/trending/rss?geo=KR';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];

    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const itemXml = match[1];
      const titleMatch = itemXml.match(/<title>([^<]+)<\/title>/);
      const newsItemMatch = itemXml.match(/<ht:news_item_title>([^<]+)<\/ht:news_item_title>/);
      const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/);

      if (titleMatch) {
        const keyword = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const snippet = newsItemMatch ? newsItemMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : keyword;
        items.push({
          title: snippet || keyword,
          link: linkMatch ? linkMatch[1] : '',
          source: '구글 트렌드 실시간',
          contentSnippet: keyword,
        });
      }
    }
    return items.slice(0, 15);
  } catch (e) {
    return [];
  }
}

/**
 * 2. 포털 실시간 경제/부동산/금융 랭킹 뉴스 동적 수집
 */
async function fetchPortalRealtimeRankingNews(category: BlogCategory): Promise<NewsItem[]> {
  const queryMap: Record<BlogCategory, string[]> = {
    economy: ['실시간 거시경제 핫이슈', '한국은행 기준금리 환율 전망', '글로벌 증시 빅테크 동향'],
    real_estate: ['아파트 청약 줍줍 실시간', '서울 아파트 실거래가 급매물', '부동산 대출 규제 DSR 경매'],
    finance: ['실시간 절세 꿀팁 세테크', '월배당 ETF 연금저축 ISA', '2026 정부 지원금 혜택'],
  };

  const queries = queryMap[category];
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    try {
      const res = await fetch(`https://m.search.naver.com/search.naver?query=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const titleRegex = /class="news_tit"[^>]*title="([^"]+)"[^>]*href="([^"]+)"/g;
      let m;
      while ((m = titleRegex.exec(html)) !== null && items.length < 25) {
        const title = m[1].trim();
        const link = m[2].trim();
        if (!seen.has(title)) {
          seen.add(title);
          items.push({
            title,
            link,
            source: '포털 실시간 랭킹',
            contentSnippet: title,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return items;
}

/**
 * 3. 100개 이상의 방대한 최신 헤드라인 풀 병렬 고속 수집 (다중 소스 결합)
 */
async function fetchComprehensiveHeadlines(category: BlogCategory, rssUrls: string[]): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  // 1) Google News RSS 피드 병렬 수집
  const rssResults = await Promise.allSettled(rssUrls.map((url) => parser.parseURL(url)));
  for (const res of rssResults) {
    if (res.status === 'fulfilled' && res.value.items) {
      for (const it of res.value.items) {
        if (!it.title) continue;
        const clean = it.title.replace(/\s*-[^-]+$/, '').trim();
        if (clean.length < 8 || seen.has(clean)) continue;
        seen.add(clean);
        items.push({
          title: clean,
          link: it.link || '',
          pubDate: it.pubDate,
          contentSnippet: it.contentSnippet || it.content || '',
          source: it.creator || it.author || '주요 언론',
        });
      }
    }
  }

  // 2) 구글 트렌드 실시간 비즈니스 키워드 결합
  const trendItems = await fetchGoogleTrendsEconomy();
  for (const t of trendItems) {
    if (!seen.has(t.title)) {
      seen.add(t.title);
      items.push(t);
    }
  }

  // 3) 포털 실시간 랭킹 뉴스 결합
  const portalItems = await fetchPortalRealtimeRankingNews(category);
  for (const p of portalItems) {
    if (!seen.has(p.title)) {
      seen.add(p.title);
      items.push(p);
    }
  }

  return items;
}

/**
 * 4. 100개 풀에서 중복 없는 상위 N대 핵심 주제 선별 (순차적 폴백용)
 */
export async function selectHotTopicCandidates(
  apiKey: string,
  categoryConfig: CategoryConfig,
  headlines: NewsItem[],
  pastTitles: string[] = [],
  count: number = 3
): Promise<{ topic: string; keywords: string[] }[]> {
  const ai = new GoogleGenAI({ apiKey });

  const pastListText = pastTitles.length > 0
    ? pastTitles.map((t, idx) => `${idx + 1}. ${t}`).join('\n')
    : '(과거 발행 이력 없음)';

  const headlineList = headlines
    .slice(0, 100)
    .map((h, idx) => `${idx + 1}. [${h.source || '뉴스'}] ${h.title}`)
    .join('\n');

  const prompt = `당신은 ${categoryConfig.name} 분야 대한민국 최고의 수석 리서치 디렉터입니다.
아래 목록은 최근 블로그에 이미 발행된 글 제목들입니다:
${pastListText}

[엄격한 선별 기준]
1. ★ **과거 글과 40% 이상 중복되는 소재/키워드 엄격 탈락**:
   - 이미 '실거래가 급등'을 다뤘다면 이번엔 '경매 낙찰가율', '스트레스 DSR 대출', '절세 셈법', '정부 지원금' 등 완전히 다른 서브 카테고리를 선택하세요.
2. ★ **독자 클릭률과 실질적 가치(돈/자산)가 폭발할 주제 선별**:
   - 단순 뻔한 뉴스 브리핑이 아닌, 독자가 실제로 세금을 아끼거나 청약에 당첨되거나 자산을 지킬 수 있는 **가장 실전적이고 시의성 높은 1등 이슈 상위 ${count}개**를 선별하세요.

[100개 최신 헤드라인 풀]
${headlineList}

반드시 다음 JSON 배열 포맷으로만 응답하세요 (총 ${count}개):
[
  {
    "topic": "기존 글과 겹치지 않는 완전히 새로운 1개 핵심 이슈의 명확한 주제명 (예: 부모 자녀 간 5천만 원 차용증 작성법 및 증여세 면제 한도 총정리)",
    "keywords": ["심층교차검색용_키워드1", "심층교차검색용_키워드2", "심층교차검색용_키워드3"]
  }, ...
]`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.3 },
    });
    const parsed = safeJsonParse<any[]>(response.text || '[]', []);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item, idx) => ({
        topic: item.topic || headlines[idx]?.title || `${categoryConfig.name} 실전 핵심 분석 ${idx + 1}`,
        keywords: Array.isArray(item.keywords) && item.keywords.length > 0 ? item.keywords : categoryConfig.searchKeywords.slice(0, 3),
      }));
    }
  } catch (err) {
    console.warn('[TopicSelector] AI 다중 주제 선정 오류, 폴백 적용:', err);
  }

  // 폴백
  return headlines.slice(0, count).map((h, i) => ({
    topic: h.title || `${categoryConfig.name} 실전 핵심 이슈 ${i + 1}`,
    keywords: categoryConfig.searchKeywords.slice(0, 3),
  }));
}

/**
 * 5. 선정된 단일 주제로 유사 보도 기사 최소 4건 이상 심층 교차 수집 (병렬)
 */
async function fetchRelatedCrossSources(keywords: string[], minSources = 4): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  const feeds = await Promise.allSettled(
    keywords.map((kw) =>
      parser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(kw)}&hl=ko&gl=KR&ceid=KR:ko`)
    )
  );

  for (const res of feeds) {
    if (res.status === 'fulfilled' && res.value.items) {
      for (const it of res.value.items) {
        if (!it.title) continue;
        const clean = it.title.replace(/\s*-[^-]+$/, '').trim();
        if (seen.has(clean)) continue;
        seen.add(clean);

        items.push({
          title: clean,
          link: it.link || '',
          pubDate: it.pubDate,
          contentSnippet: it.contentSnippet || it.content || '',
          source: it.creator || it.author || '뉴스 출처',
        });
        if (items.length >= minSources) break;
      }
    }
    if (items.length >= minSources) break;
  }
  return items;
}

/**
 * 상위 N대 후보군 동시 수집 파이프라인 (자동 폴백용)
 */
export async function collectMultipleTopicCandidates(
  geminiApiKey: string,
  category: BlogCategory,
  pastTitles: string[] = [],
  count: number = 3
): Promise<SingleTopicResult[]> {
  const config = CATEGORY_CONFIGS[category];

  console.log(`   [1-1] ${config.name} 실시간 포털 랭킹 + 구글 트렌드 + RSS 풀에서 100개 헤드라인 병렬 수집 중...`);
  const initialHeadlines = await fetchComprehensiveHeadlines(category, config.rssUrls);
  console.log(`   ✅ 유효 실시간 헤드라인 총 ${initialHeadlines.length}건 확보 완료`);

  console.log(`   [1-2] AI 기반 중복 배제 & 상위 ${count}대 실전 대세 이슈 선별 중... (기발행 글 ${pastTitles.length}건 대조)`);
  const candidates = await selectHotTopicCandidates(geminiApiKey, config, initialHeadlines, pastTitles, count);

  const results: SingleTopicResult[] = [];
  for (const sel of candidates) {
    const crossSources = await fetchRelatedCrossSources(sel.keywords, 4);
    if (crossSources.length < 3) {
      for (const h of initialHeadlines) {
        if (!crossSources.some((c) => c.title === h.title)) {
          crossSources.push(h);
        }
        if (crossSources.length >= 4) break;
      }
    }
    results.push({
      config,
      mainTopicTitle: sel.topic,
      searchKeywords: sel.keywords,
      crossSources,
    });
  }

  return results;
}

/**
 * 전체 수집 파이프라인 (단일 1위 반환 호환용)
 */
export async function collectSingleTopicPipeline(
  geminiApiKey: string,
  category: BlogCategory,
  pastTitles: string[] = []
): Promise<SingleTopicResult> {
  const candidates = await collectMultipleTopicCandidates(geminiApiKey, category, pastTitles, 1);
  return candidates[0];
}
