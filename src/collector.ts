import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import { BlogCategory, CategoryConfig, NewsItem } from './types.js';
import { generateContentWithFallback } from './model-resolver.js';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
});

export const CATEGORY_CONFIGS: Record<BlogCategory, CategoryConfig> = {
  economy: {
    name: '시사·경제',
    topic: '국내외 거시 경제, 환율, 금리 변동, 물가 및 주요 산업 이슈',
    searchKeywords: ['기준금리', '원달러 환율', '물가 동향', '거시경제'],
    rssUrls: [
      'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
      `https://news.google.com/rss/search?q=${encodeURIComponent('한국은행 기준금리 OR 환율 OR 경제전망')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '시사·경제',
    tags: ['경제', '시사이슈', '거시경제', '환율', '기준금리', '경제전망'],
  },
  real_estate: {
    name: '부동산',
    topic: '부동산 정책, 청약 일정, 아파트 실거래가, 대출 규제, 재건축',
    searchKeywords: ['부동산 정책', '아파트 실거래가', '청약 경쟁률', '주택담보대출'],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('부동산 정책 OR 아파트 실거래 OR 청약')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('주택담보대출 규제 OR 전세가 OR 분양가')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '부동산',
    tags: ['부동산', '아파트', '청약', '부동산정책', '내집마련', '실거래가'],
  },
  finance: {
    name: '재테크·금융',
    topic: '주식, 배당주, ETF, 절세(ISA/연금저축), 고금리 예적금, 자산배분',
    searchKeywords: ['배당주 ETF', 'ISA 절세', '주식 투자 전략', '예적금 금리'],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('배당주 투자 OR ETF 추천 OR 주식시장')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('연금저축펀드 OR ISA 계좌 절세 OR 고금리 예금')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '재테크·금융',
    tags: ['재테크', '금융', '주식투자', 'ETF', '절세전략', '배당금'],
  },
};

export interface SingleTopicResult {
  config: CategoryConfig;
  mainTopicTitle: string;
  searchKeywords: string[];
  crossSources: NewsItem[];
}

/**
 * 1. 초기 헤드라인 풀 수집
 */
async function fetchHeadlines(rssUrls: string[], limit = 12): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  for (const url of rssUrls) {
    try {
      const feed = await parser.parseURL(url);
      if (feed.items) {
        for (const it of feed.items) {
          if (!it.title) continue;
          const clean = it.title.replace(/\s*-[^-]+$/, '').trim();
          if (seen.has(clean)) continue;
          seen.add(clean);

          items.push({
            title: clean,
            link: it.link || '',
            pubDate: it.pubDate,
            contentSnippet: it.contentSnippet || it.content || '',
            source: it.creator || it.author || '언론사 뉴스',
          });
          if (items.length >= limit) break;
        }
      }
    } catch (e) {
      // ignore individual feed errors
    }
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * 2. Gemini를 활용해 '오늘의 단일 1등 핵심 주제' 1개 선정
 */
async function selectSingleHotTopic(
  apiKey: string,
  categoryConfig: CategoryConfig,
  headlines: NewsItem[]
): Promise<{ topic: string; keywords: string[] }> {
  const ai = new GoogleGenAI({ apiKey });

  const headlineList = headlines.map((h, i) => `${i + 1}. ${h.title}`).join('\n');
  const prompt = `당신은 탑티어 경제/부동산/재테크 전문 에디터입니다.
아래 수집된 [${categoryConfig.name}] 분야 최신 뉴스 헤드라인 목록을 보고, 오늘 대중의 관심도(검색량)가 가장 높고 애드센스 고단가 및 독자 체류시간 확보에 가장 유리한 '단 1개의 핵심 이슈'를 선정하세요.

[수집된 헤드라인 목록]
${headlineList}

반드시 다음 JSON 포맷으로만 응답하세요:
{
  "topic": "선정된 1개 핵심 이슈의 명확한 주제명 (예: 한국은행 기준금리 인하 결정과 대출금리 영향)",
  "keywords": ["심층교차검색용_키워드1", "심층교차검색용_키워드2", "심층교차검색용_키워드3"]
}`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const parsed = JSON.parse(response.text || '{}');
    return {
      topic: parsed.topic || headlines[0]?.title || categoryConfig.name,
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0 ? parsed.keywords : [categoryConfig.searchKeywords[0]],
    };
  } catch (err) {
    console.warn('[TopicSelector] AI 주제 선정 기본값 폴백:', err);
    return {
      topic: headlines[0]?.title || `${categoryConfig.name} 핵심 이슈`,
      keywords: categoryConfig.searchKeywords,
    };
  }
}

/**
 * 3. 선정된 단일 주제로 유사 보도 기사 최소 3~5건 심층 교차 수집
 */
async function fetchRelatedCrossSources(keywords: string[], minSources = 4): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  for (const kw of keywords) {
    const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(kw)}&hl=ko&gl=KR&ceid=KR:ko`;
    try {
      const feed = await parser.parseURL(searchUrl);
      if (feed.items) {
        for (const it of feed.items) {
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
    } catch (e) {
      // ignore
    }
    if (items.length >= minSources) break;
  }
  return items;
}

/**
 * 전체 수집 파이프라인: 단일 주제 선정 + 3단계 교차 검증 소스 확보
 */
export async function collectSingleTopicPipeline(
  geminiApiKey: string,
  category: BlogCategory
): Promise<SingleTopicResult> {
  const config = CATEGORY_CONFIGS[category];

  // 1. 헤드라인 풀 수집
  console.log(`   [1-1] ${config.name} 최신 헤드라인 풀 수집 중...`);
  const initialHeadlines = await fetchHeadlines(config.rssUrls, 10);

  // 2. 단 1개의 핫토픽 선정
  console.log(`   [1-2] AI 기반 단일 1등 핵심 이슈 선정 중...`);
  const selected = await selectSingleHotTopic(geminiApiKey, config, initialHeadlines);
  console.log(`   🎯 선정된 단일 주제: "${selected.topic}"`);
  console.log(`   🔑 교차검증 키워드: ${selected.keywords.join(', ')}`);

  // 3. 3단계 이상 교차 검증용 유사 기사 심층 수집
  console.log(`   [1-3] 선정된 주제에 대한 3개 이상 유사 보도 소스 교차 수집 중...`);
  const crossSources = await fetchRelatedCrossSources(selected.keywords, 4);

  // 만약 심층 수집 결과가 부족하면 초기 헤드라인 중 상위 기사로 보충
  if (crossSources.length < 3) {
    for (const h of initialHeadlines) {
      if (!crossSources.some((c) => c.title === h.title)) {
        crossSources.push(h);
      }
      if (crossSources.length >= 3) break;
    }
  }

  return {
    config,
    mainTopicTitle: selected.topic,
    searchKeywords: selected.keywords,
    crossSources,
  };
}
