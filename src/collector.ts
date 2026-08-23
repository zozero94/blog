import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import { BlogCategory, CategoryConfig, NewsItem } from './types.js';
import { generateContentWithFallback, safeJsonParse } from './model-resolver.js';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
});

export const CATEGORY_CONFIGS: Record<BlogCategory, CategoryConfig> = {
  economy: {
    name: '시사·경제',
    topic: '국내외 거시 경제, 환율, 금리 변동, 물가, 고용, 수출입 및 주요 산업 이슈',
    searchKeywords: ['기준금리', '원달러 환율', '물가 동향', '거시경제', '수출입 동향', '고용동향'],
    rssUrls: [
      'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
      `https://news.google.com/rss/search?q=${encodeURIComponent('한국은행 OR 환율 OR 소비자물가 OR 경기전망')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('수출 실적 OR 관세 OR 경제성장률')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '시사·경제',
    tags: ['경제', '시사이슈', '거시경제', '환율', '기준금리', '경제전망'],
  },
  real_estate: {
    name: '부동산',
    topic: '부동산 정책, 청약 무순위 줍줍, 아파트 실거래가, 대출 규제(DSR), 재건축/재개발, 전월세 시장',
    searchKeywords: ['부동산 정책', '아파트 실거래가', '청약 줍줍', '주택담보대출', '재건축', '전세사기 예방'],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('아파트 분양 OR 청약 경쟁률 OR 무순위 줍줍')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('부동산 정책 OR 디딤돌대출 OR 스트레스DSR')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('재건축 재개발 OR 전세보증금 OR 아파트 매매')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '부동산',
    tags: ['부동산', '아파트', '청약', '부동산정책', '내집마련', '실거래가'],
  },
  finance: {
    name: '재테크·금융',
    topic: '국내/미국 주식, 배당주, ETF, 절세(ISA/연금저축/IRP), 고금리 예적금 파킹통장, 공모주 청약, 자산배분',
    searchKeywords: ['배당주 ETF', 'ISA 절세', '연금저축펀드', '파킹통장 금리', '공모주 청약', '미국 증시'],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('월배당 ETF OR 배당주 추천 OR 미국 주식')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('연금저축 절세 OR ISA 계좌 비과세 OR 파킹통장')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('공모주 청약 OR 금융소득종합과세 OR 채권 투자')}&hl=ko&gl=KR&ceid=KR:ko`,
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
 * 1. 초기 헤드라인 풀 수집 (중복 제거 및 최신순 정렬)
 */
async function fetchHeadlines(rssUrls: string[], limit = 20): Promise<NewsItem[]> {
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
 * 2. Gemini를 활용해 과거 발행 글과 중복되지 않는 '완전히 새로운 단일 1등 핫이슈' 선정
 */
async function selectSingleHotTopic(
  apiKey: string,
  categoryConfig: CategoryConfig,
  headlines: NewsItem[],
  pastTitles: string[] = []
): Promise<{ topic: string; keywords: string[] }> {
  const ai = new GoogleGenAI({ apiKey });

  const headlineList = headlines.map((h, i) => `${i + 1}. ${h.title}`).join('\n');
  const pastListText = pastTitles.length > 0
    ? pastTitles.map((t, i) => ` - [기발행 ${i + 1}] ${t}`).join('\n')
    : '없음 (첫 발행)';

  const prompt = `당신은 최고 권위의 경제/부동산/재테크 전문 수석 에디터입니다.
아래 수집된 [${categoryConfig.name}] 분야 최신 뉴스 헤드라인 목록에서, **기존에 이미 다룬 주제와 겹치지 않는 완전히 새로운 각도의 1등 핫이슈**를 단 1개 선정하세요.

[🚨 절대 규칙: 과거 발행된 글과의 중복 배제 (Negative Deduplication)]
아래 목록은 최근 블로그에 이미 발행된 글 제목들입니다:
${pastListText}

위 과거 글들과 **소재, 핵심 키워드, 주요 논점(예: 이미 실거래가 급등을 다뤘다면 이번엔 청약/대출/분양가 등 다른 소재)이 50% 이상 겹치는 이슈는 엄격히 탈락**시키세요!
헤드라인 풀 중에서 아직 다루지 않은 가장 시의성 높고 독자 유입에 유리한 새로운 주제를 선정하세요.

[수집된 최신 헤드라인 후보 풀]
${headlineList}

반드시 다음 JSON 포맷으로만 응답하세요:
{
  "topic": "기존 글과 중복되지 않는 완전히 새로운 1개 핵심 이슈의 명확한 주제명 (예: 청약홈 무순위 줍줍 분양가 시세차익 분석 또는 2026 개정 세법 증여세 절세 전략)",
  "keywords": ["심층교차검색용_키워드1", "심층교차검색용_키워드2", "심층교차검색용_키워드3"]
}`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.3 },
    });
    const parsed = safeJsonParse<any>(response.text || '{}', {});
    if (parsed.topic && Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
      return {
        topic: parsed.topic,
        keywords: parsed.keywords,
      };
    }
  } catch (err) {
    console.warn('[TopicSelector] AI 주제 선정 오류, 폴백 적용:', err);
  }

  // 폴백: 과거 글 제목과 안 겹치는 첫 번째 헤드라인 탐색
  const nonDuplicate = headlines.find((h) => {
    return !pastTitles.some((pt) => {
      const words = h.title.split(' ').filter((w) => w.length >= 2);
      const matchCount = words.filter((w) => pt.includes(w)).length;
      return matchCount >= 3;
    });
  });

  return {
    topic: nonDuplicate?.title || headlines[0]?.title || `${categoryConfig.name} 핵심 이슈 분석`,
    keywords: categoryConfig.searchKeywords,
  };
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
 * 전체 수집 파이프라인: 과거 발행 이력 기반 중복 배제 + 단일 주제 선정 + 3단계 교차 검증 소스 확보
 */
export async function collectSingleTopicPipeline(
  geminiApiKey: string,
  category: BlogCategory,
  pastTitles: string[] = []
): Promise<SingleTopicResult> {
  const config = CATEGORY_CONFIGS[category];

  // 1. 헤드라인 풀 수집 (20개로 확대하여 다양한 후보군 확보)
  console.log(`   [1-1] ${config.name} 최신 헤드라인 풀 수집 중...`);
  const initialHeadlines = await fetchHeadlines(config.rssUrls, 20);

  // 2. 과거 글과 중복되지 않는 단 1개의 핫토픽 선정
  console.log(`   [1-2] AI 기반 중복 배제 & 새로운 1등 핵심 이슈 선정 중... (기발행 글 ${pastTitles.length}건 대조)`);
  const selected = await selectSingleHotTopic(geminiApiKey, config, initialHeadlines, pastTitles);
  console.log(`   🎯 선정된 새로운 단일 주제: "${selected.topic}"`);
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
