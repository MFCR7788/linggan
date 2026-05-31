export interface SearchResult {
  title: string;
  content: string;
  url: string;
  source: 'twitter' | 'bing' | 'google' | 'duckduckgo' | 'hackernews' | 'sogou' | 'bilibili' | 'weibo' | 'zhihu' | 'toutiao' | 'baidu' | 'douyin' | string;
  sourceId?: string;
  publishedAt?: Date;
  viewCount?: number;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  commentCount?: number;
  danmakuCount?: number;
  score?: number;
  author?: {
    name: string;
    username?: string;
    avatar?: string;
    followers?: number;
    verified?: boolean;
  };
}

export interface SearchSourceResult {
  name: string;
  results: SearchResult[];
  error?: string;
}

export interface AIAnalysis {
  isReal: boolean;
  relevance: number;
  relevanceReason: string;
  keywordMentioned: boolean;
  importance: 'low' | 'medium' | 'high' | 'urgent';
  summary: string;
}
