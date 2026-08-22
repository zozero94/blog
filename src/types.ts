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

export interface GeneratedPost {
  title: string;
  summary: string;
  htmlContent: string;
  tags: string[];
  categories: string[];
  metaDescription: string;
}

export interface WordPressPostResponse {
  ID: number;
  URL: string;
  short_URL: string;
  title: string;
  status: string;
}
