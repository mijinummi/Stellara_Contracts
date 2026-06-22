import { Injectable, Logger } from '@nestjs/common';
import { MarketCacheService } from './market-cache.service';
import { CacheNamespace } from '../types/cache-config.types';
import { NewsArticleDto, NewsCategory, NewsResponseDto } from '../dto/news.dto';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(private readonly cacheService: MarketCacheService) {}

  /**
   * Get crypto news with cache fallback
   */
  async getNews(
    category?: NewsCategory,
    limit: number = 20,
    bypassCache: boolean = false,
  ): Promise<NewsResponseDto> {
    const cacheKey = this.generateNewsKey(category, limit);

    // Try cache first (unless bypassed)
    if (!bypassCache) {
      const cached = await this.cacheService.get<NewsResponseDto>(
        cacheKey,
        CacheNamespace.NEWS,
      );

      if (cached) {
        this.logger.debug('Serving news from cache');
        return { ...cached, cached: true };
      }
    }

    // Cache miss or bypass - fetch fresh data
    this.logger.debug('Fetching fresh news from API');
    const news = await this.fetchNews(category, limit);

    // Cache the result
    await this.cacheService.set(cacheKey, news, CacheNamespace.NEWS);

    return { ...news, cached: false };
  }

  /**
   * Get single news article by ID
   */
  async getArticleById(articleId: string): Promise<NewsArticleDto | null> {
    const cacheKey = `article:${articleId}`;

    // Try cache first
    const cached = await this.cacheService.get<NewsArticleDto>(
      cacheKey,
      CacheNamespace.NEWS,
    );

    if (cached) {
      this.logger.debug(`Serving article ${articleId} from cache`);
      return cached;
    }

    // Fetch from API
    const article = await this.fetchArticleById(articleId);

    if (article) {
      // Cache the result with longer TTL for individual articles
      await this.cacheService.set(cacheKey, article, CacheNamespace.NEWS, 3600); // 1 hour
    }

    return article;
  }

  /**
   * Invalidate news cache
   */
  async invalidateNewsCache(category?: NewsCategory): Promise<number> {
    if (category) {
      // Invalidate specific category
      return await this.cacheService.invalidateByPattern(
        `news:${category}`,
        CacheNamespace.NEWS,
      );
    } else {
      // Invalidate all news
      return await this.cacheService.invalidateNamespace(CacheNamespace.NEWS);
    }
  }

  // ========== PRIVATE HELPERS ==========

  /**
   * Fetch news from external API
   * This is a mock implementation - replace with actual API calls (CryptoPanic, CoinGecko, NewsAPI)
   */
  private async fetchNews(
    category?: NewsCategory,
    limit: number = 20,
  ): Promise<NewsResponseDto> {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Mock news data - replace with actual API integration
    const mockArticles: NewsArticleDto[] = [
      {
        id: 'news-1',
        title: 'Stellar Network Processes Record Transaction Volume',
        summary:
          'The Stellar blockchain has achieved a new milestone, processing over 10 million transactions in a single day...',
        url: 'https://stellar.org/blog/record-transaction-volume',
        publishedAt: new Date(Date.now() - 3600000),
        source: 'Stellar Blog',
        imageUrl: 'https://example.com/stellar-news-1.jpg',
        category: NewsCategory.STELLAR,
        tags: ['stellar', 'blockchain', 'transactions'],
      },
      {
        id: 'news-2',
        title: 'Bitcoin Surges Past $50,000 Mark',
        summary:
          'Bitcoin has broken through the $50,000 resistance level amid growing institutional adoption...',
        url: 'https://example.com/bitcoin-50k',
        publishedAt: new Date(Date.now() - 7200000),
        source: 'CryptoNews',
        imageUrl: 'https://example.com/bitcoin-news.jpg',
        category: NewsCategory.MARKET,
        tags: ['bitcoin', 'market', 'price'],
      },
      {
        id: 'news-3',
        title: 'New DeFi Protocol Launches on Stellar',
        summary:
          'A new decentralized finance protocol has launched on Stellar, offering yield farming opportunities...',
        url: 'https://example.com/stellar-defi',
        publishedAt: new Date(Date.now() - 10800000),
        source: 'DeFi Pulse',
        imageUrl: 'https://example.com/defi-news.jpg',
        category: NewsCategory.DEFI,
        tags: ['stellar', 'defi', 'yield-farming'],
      },
      {
        id: 'news-4',
        title: 'SEC Announces New Cryptocurrency Regulations',
        summary:
          'The Securities and Exchange Commission has unveiled new regulatory framework for digital assets...',
        url: 'https://example.com/sec-regulations',
        publishedAt: new Date(Date.now() - 14400000),
        source: 'Regulatory News',
        imageUrl: 'https://example.com/regulation-news.jpg',
        category: NewsCategory.REGULATION,
        tags: ['regulation', 'sec', 'compliance'],
      },
      {
        id: 'news-5',
        title: 'Soroban Smart Contracts Gain Traction',
        summary:
          'Developers are increasingly adopting Soroban for building decentralized applications on Stellar...',
        url: 'https://example.com/soroban-adoption',
        publishedAt: new Date(Date.now() - 18000000),
        source: 'Stellar Developers',
        imageUrl: 'https://example.com/soroban-news.jpg',
        category: NewsCategory.TECHNOLOGY,
        tags: ['stellar', 'soroban', 'smart-contracts'],
      },
      {
        id: 'news-6',
        title: 'Major Bank Partners with Stellar for Cross-Border Payments',
        summary:
          'A leading international bank has announced partnership with Stellar to facilitate faster cross-border transactions...',
        url: 'https://example.com/bank-stellar-partnership',
        publishedAt: new Date(Date.now() - 21600000),
        source: 'Financial Times',
        imageUrl: 'https://example.com/partnership-news.jpg',
        category: NewsCategory.STELLAR,
        tags: ['stellar', 'banking', 'partnerships'],
      },
    ];

    // Filter by category if specified
    let filteredArticles = mockArticles;
    if (category) {
      filteredArticles = mockArticles.filter(
        (article) => article.category === category,
      );
    }

    // Limit results
    const limitedArticles = filteredArticles.slice(0, limit);

    return {
      articles: limitedArticles,
      total: limitedArticles.length,
      timestamp: new Date(),
      cached: false,
    };
  }

  /**
   * Fetch single article by ID
   * This is a mock implementation - replace with actual API calls
   */
  private async fetchArticleById(
    articleId: string,
  ): Promise<NewsArticleDto | null> {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mock implementation - in production, this would fetch from actual API
    if (articleId === 'news-1') {
      return {
        id: 'news-1',
        title: 'Stellar Network Processes Record Transaction Volume',
        summary:
          'The Stellar blockchain has achieved a new milestone, processing over 10 million transactions in a single day...',
        url: 'https://stellar.org/blog/record-transaction-volume',
        publishedAt: new Date(Date.now() - 3600000),
        source: 'Stellar Blog',
        imageUrl: 'https://example.com/stellar-news-1.jpg',
        category: NewsCategory.STELLAR,
        tags: ['stellar', 'blockchain', 'transactions'],
      };
    }

    return null;
  }

  /**
   * Generate cache key for news query
   */
  private generateNewsKey(category?: NewsCategory, limit?: number): string {
    const parts = ['news'];
    if (category) {
      parts.push(category);
    }
    if (limit) {
      parts.push(`limit:${limit}`);
    }
    return parts.join(':');
  }
}
