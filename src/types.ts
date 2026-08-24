export type BlogCategory = 'economy' | 'real_estate' | 'finance';

export interface CategoryConfig {
  name: string;
  topic: string;
  searchKeywords: string[];
  rssUrls: string[];
  wpCategory: string;
  tags: string[];
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate?: string;
  contentSnippet?: string;
  source?: string;
}

export interface VerifiedLink {
  originalUrl: string;
  finalUrl: string;
  status: number;
  isHealthy: boolean;
  pageTitle: string;
  screenshotBase64?: string;
  isContentMatched: boolean;
  relevanceScore?: number; // 0~100점
  suggestedCorrection?: string;
  verificationNotes: string;
  linkType?: 'DIRECT_OFFICIAL' | 'VERIFIED_SEARCH' | 'MAP_PLACE' | 'PURCHASE_CTA';
}

export interface GeneratedPost {
  title: string;
  summary: string;
  htmlContent: string;
  tags: string[];
  categories: string[];
  metaDescription: string;
  verifiedLinks?: VerifiedLink[];
}

export interface AgentFeedback {
  agentName: string;
  role: string;
  score: number;
  strengths: string;
  improvements: string;
}

export interface WordPressPostResponse {
  ID: number;
  URL: string;
  short_URL: string;
  title: string;
  status: string;
}
