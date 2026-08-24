import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import { BlogCategory, CategoryConfig, NewsItem } from './types.js';
import { generateContentWithFallback, safeJsonParse } from './model-resolver.js';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  },
  timeout: 5000,
});

export const CATEGORY_CONFIGS: Record<BlogCategory, CategoryConfig> = {
  economy: {
    name: '시사·경제',
    topic: '국내외 거시 경제, 환율, 금리 변동, 물가, 글로벌 빅테크/AI 혁신, 국민연금/복지 정책, 수출입 및 생활 경제',
    searchKeywords: [
      '기준금리', '원달러 환율', '소비자물가', '국민연금 개혁', 'AI 반도체 빅테크',
      '수출 실적', '고용동향', '유류세 유가', '지정학 공급망', '전기요금 인상'
    ],
    rssUrls: [
      'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
      `https://news.google.com/rss/search?q=${encodeURIComponent('한국은행 기준금리 OR 원달러 환율 OR 외환시장')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('소비자물가지수 OR 생활물가 OR 유가 유류세')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('엔비디아 OR AI 데이터센터 OR 반도체 수출')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('국민연금 개혁안 OR 기초연금 수급 OR 정년연장')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('미국 연준 FOMC 금리 OR 글로벌 경제전망')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('K-방산 수출 OR K-푸드 무역수지 OR 관세')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('청년도약계좌 OR 청년 고용지원금 OR 실업률')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '시사·경제',
    tags: ['경제', '시사이슈', '거시경제', '환율', '기준금리', '경제전망', '국민연금', '빅테크'],
  },
  real_estate: {
    name: '부동산',
    topic: '부동산 정책, 청약 무순위 줍줍, 아파트 실거래가, 법원 경매/공매, 대출 규제(DSR), 부동산 세무, 재건축/재개발, GTX 교통 호재',
    searchKeywords: [
      '아파트 청약 줍줍', '아파트 실거래가', '법원 경매 낙찰가율', '스트레스 DSR 2단계',
      '부동산 양도세 절세', 'GTX 개통 호재', '3기 신도시', '재건축 분담금', '전세보증보험'
    ],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('무순위 줍줍 OR 아파트 청약 경쟁률 OR 분양가')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('서울 아파트 실거래가 OR 매매가 상승 OR 신고가')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('아파트 법원 경매 OR 공매 낙찰가율 OR 권리분석')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('주택담보대출 규제 OR 스트레스 DSR OR 디딤돌대출')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('1세대1주택 비과세 OR 부동산 취득세 양도세 절세')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('GTX 노선 개통 OR 3기 신도시 본청약 OR 토지보상')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('재건축 안전진단 OR 재개발 추가분담금 OR 정비사업')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('전세가율 상승 OR 전세보증금 반환보증 OR 오피스텔')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '부동산',
    tags: ['부동산', '아파트', '청약', '부동산정책', '내집마련', '실거래가', '경매', '부동산세무'],
  },
  finance: {
    name: '재테크·금융',
    topic: '월배당 ETF, 국내/미국 주식, 절세(ISA/연금저축/IRP), 금(Gold)·원자재 투자, 연말정산·세테크, 보험 리모델링, 파킹통장, 공모주 청약',
    searchKeywords: [
      '월배당 ETF 포트폴리오', 'ISA 계좌 절세', '금 시세 투자법', '연말정산 소득공제',
      '실손보험 리모델링', '고금리 파킹통장', '퇴직연금 IRP', '공모주 청약', '금융소득종합과세'
    ],
    rssUrls: [
      `https://news.google.com/rss/search?q=${encodeURIComponent('월배당 ETF OR 배당주 포트폴리오 OR SCHD')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('중개형 ISA 비과세 OR 연금저축펀드 세액공제 OR IRP')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('KRX 금 현물 시세 OR 금 ETF OR 원자재 투자')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('연말정산 환급금 OR 신용카드 체크카드 공제 OR 절세')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('4세대 실손보험 전환 OR 숨은 보험금 조회 OR 암보험')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('고금리 파킹통장 금리 OR 특판 예적금 OR CMA')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('퇴직연금 디폴트옵션 OR 퇴직소득세 감면 OR IRP 수령')}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent('공모주 청약 일정 OR 상장 첫날 매도 OR 비트코인 세제')}&hl=ko&gl=KR&ceid=KR:ko`,
    ],
    wpCategory: '재테크·금융',
    tags: ['재테크', '금융', '주식투자', 'ETF', '절세전략', '배당금', '연말정산', '자산관리'],
  },
};

export interface SingleTopicResult {
  config: CategoryConfig;
  mainTopicTitle: string;
  searchKeywords: string[];
  crossSources: NewsItem[];
}

/**
 * 1. 100개 이상의 방대한 최신 헤드라인 풀 병렬 고속 수집
 */
async function fetchHeadlines(rssUrls: string[], limit = 100): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  // 8~10개 RSS 피드 동시 병렬 요청 (타임아웃 안전)
  const results = await Promise.allSettled(
    rssUrls.map((url) => parser.parseURL(url))
  );

  for (const res of results) {
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
          contentSnippet: (it.contentSnippet || it.content || '').slice(0, 150),
          source: it.creator || it.author || '뉴스 미디어',
        });
        if (items.length >= limit) break;
      }
    }
    if (items.length >= limit) break;
  }

  return items;
}

/**
 * 2. Gemini를 활용해 과거 20개 발행 글과 중복되지 않는 '완전히 새로운 100개 풀 기반 단일 1등 핫이슈' 선정
 */
async function selectSingleHotTopic(
  apiKey: string,
  categoryConfig: CategoryConfig,
  headlines: NewsItem[],
  pastTitles: string[] = []
): Promise<{ topic: string; keywords: string[] }> {
  const ai = new GoogleGenAI({ apiKey });

  // 100개 헤드라인을 번호 매겨 전달
  const headlineList = headlines.slice(0, 100).map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n');
  const pastListText = pastTitles.length > 0
    ? pastTitles.map((t, i) => ` - [기발행 ${i + 1}] ${t}`).join('\n')
    : '없음 (첫 발행)';

  const prompt = `당신은 대한민국 최고 수준의 경제·부동산·재테크 전문 수석 디렉터입니다.
아래 수집된 100개의 방대한 [${categoryConfig.name}] 최신 뉴스 헤드라인 풀에서, **기존에 이미 다룬 주제와 겹치지 않는 완전히 새로운 서브 도메인의 1등 핫이슈**를 단 1개 선정하세요.

[🚨 절대 규칙: 과거 발행된 글과의 중복 배제 (Negative Deduplication)]
아래 목록은 최근 블로그에 이미 발행된 글 제목들입니다:
${pastListText}

위 과거 글들과 **소재, 핵심 키워드, 주요 논점(예: 이미 실거래가 급등을 다뤘다면 이번엔 경매/청약/세무/대출/GTX 등 다른 서브 카테고리 선택)이 40% 이상 겹치는 이슈는 엄격히 탈락**시키세요!
100개의 방대한 후보 풀 중에서 아직 다루지 않은 가장 시의성 높고 독자 클릭률과 체류시간이 폭발할 새로운 주제를 선정하세요.

[100개 최신 헤드라인 후보 풀]
${headlineList}

반드시 다음 JSON 포맷으로만 응답하세요:
{
  "topic": "기존 글과 중복되지 않는 완전히 새로운 1개 핵심 이슈의 명확한 주제명 (예: 법원 경매 유찰 아파트 반값 낙찰 전략 또는 2026 연말정산 신용카드·체크카드 황금비율 절세 꿀팁)",
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

  // 폴백: 과거 글 제목과 단어 중복이 없는 첫 번째 헤드라인 선택
  const nonDuplicate = headlines.find((h) => {
    return !pastTitles.some((pt) => {
      const words = h.title.split(' ').filter((w) => w.length >= 2);
      const matchCount = words.filter((w) => pt.includes(w)).length;
      return matchCount >= 2;
    });
  });

  return {
    topic: nonDuplicate?.title || headlines[0]?.title || `${categoryConfig.name} 핵심 이슈 분석`,
    keywords: categoryConfig.searchKeywords.slice(0, 3),
  };
}

/**
 * 2. 100개 풀에서 중복 없는 상위 N대 핵심 주제 동시 선별 (순차적 폴백용)
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
    .map((h, idx) => `${idx + 1}. ${h.title}`)
    .join('\n');

  const prompt = `당신은 ${categoryConfig.name} 분야 최고의 수석 에디터입니다.
아래 목록은 최근 블로그에 이미 발행된 글 제목들입니다:
${pastListText}

위 과거 글들과 **소재, 핵심 키워드, 주요 논점이 40% 이상 겹치는 이슈는 엄격히 탈락**시키세요!
100개의 방대한 후보 풀 중에서 아직 다루지 않은 가장 시의성 높고 독자 클릭률과 체류시간이 폭발할 새로운 상위 ${count}개 주제를 선별하세요.

[100개 최신 헤드라인 후보 풀]
${headlineList}

반드시 다음 JSON 배열 포맷으로만 응답하세요 (총 ${count}개):
[
  {
    "topic": "기존 글과 중복되지 않는 새로운 핵심 이슈 명확한 주제명 1",
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
        topic: item.topic || headlines[idx]?.title || `${categoryConfig.name} 핵심 이슈 ${idx + 1}`,
        keywords: Array.isArray(item.keywords) && item.keywords.length > 0 ? item.keywords : categoryConfig.searchKeywords.slice(0, 3),
      }));
    }
  } catch (err) {
    console.warn('[TopicSelector] AI 다중 주제 선정 오류, 단일 선정 폴백:', err);
  }

  const single = await selectSingleHotTopic(apiKey, categoryConfig, headlines, pastTitles);
  return [single];
}

/**
 * 3. 선정된 단일 주제로 유사 보도 기사 최소 4건 이상 심층 교차 수집 (병렬)
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

  console.log(`   [1-1] ${config.name} 8대 세부 도메인에서 100개 헤드라인 풀 병렬 수집 중...`);
  const initialHeadlines = await fetchHeadlines(config.rssUrls, 100);
  console.log(`   ✅ 유효 헤드라인 총 ${initialHeadlines.length}건 확보 완료`);

  console.log(`   [1-2] AI 기반 중복 배제 & 상위 ${count}대 핵심 이슈 선별 중... (기발행 글 ${pastTitles.length}건 대조)`);
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
