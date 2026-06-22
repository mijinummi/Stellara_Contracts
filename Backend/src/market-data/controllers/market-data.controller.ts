import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { MarketDataService } from '../services/market-data.service';
import { NewsService } from '../services/news.service';
import { CacheMetricsService } from '../services/cache-metrics.service';
import { MarketCacheService } from '../services/market-cache.service';
import {
  MarketSnapshotDto,
  GetMarketSnapshotQueryDto,
} from '../dto/market-snapshot.dto';
import {
  NewsResponseDto,
  GetNewsQueryDto,
  NewsCategory,
} from '../dto/news.dto';
import {
  CacheStatsDto,
  CacheInvalidateDto,
  CacheInvalidateResponseDto,
} from '../dto/cache-stats.dto';
import { CacheNamespace } from '../types/cache-config.types';

@ApiTags('Market Data')
@Controller('market-data')
export class MarketDataController {
  private readonly logger = new Logger(MarketDataController.name);

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly newsService: NewsService,
    private readonly cacheMetricsService: CacheMetricsService,
    private readonly cacheService: MarketCacheService,
  ) {}

  /**
   * Get market snapshot
   */
  @Get('snapshot')
  @ApiOperation({ summary: 'Get market snapshot with asset prices' })
  @ApiResponse({
    status: 200,
    description: 'Market snapshot retrieved',
    type: MarketSnapshotDto,
  })
  @ApiQuery({
    name: 'assets',
    required: false,
    description: 'Comma-separated asset codes',
  })
  @ApiQuery({
    name: 'bypassCache',
    required: false,
    description: 'Bypass cache',
  })
  async getMarketSnapshot(
    @Query() query: GetMarketSnapshotQueryDto,
  ): Promise<MarketSnapshotDto> {
    const assetFilter = query.assets
      ? query.assets.split(',').map((a) => a.trim().toUpperCase())
      : undefined;
    const bypassCache =
      query.bypassCache === true || query.bypassCache === 'true';

    this.logger.debug(`Fetching market snapshot (bypassCache: ${bypassCache})`);
    return this.marketDataService.getMarketSnapshot(assetFilter, bypassCache);
  }

  /**
   * Get crypto news
   */
  @Get('news')
  @ApiOperation({ summary: 'Get crypto news articles' })
  @ApiResponse({
    status: 200,
    description: 'News articles retrieved',
    type: NewsResponseDto,
  })
  @ApiQuery({ name: 'category', required: false, enum: NewsCategory })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of articles (1-100)',
  })
  @ApiQuery({
    name: 'bypassCache',
    required: false,
    description: 'Bypass cache',
  })
  async getNews(@Query() query: GetNewsQueryDto): Promise<NewsResponseDto> {
    const limit = query.limit || 20;
    const bypassCache =
      query.bypassCache === true || query.bypassCache === 'true';

    this.logger.debug(
      `Fetching news (category: ${query.category || 'all'}, limit: ${limit}, bypassCache: ${bypassCache})`,
    );
    return this.newsService.getNews(query.category, limit, bypassCache);
  }

  /**
   * Get cache statistics for all namespaces
   */
  @Get('cache/stats')
  @ApiOperation({ summary: 'Get overall cache statistics' })
  @ApiResponse({ status: 200, description: 'Cache statistics retrieved' })
  async getCacheStats(): Promise<{
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    namespaces: CacheStatsDto[];
    timestamp: Date;
  }> {
    this.logger.debug('Fetching cache statistics');
    return this.cacheMetricsService.getOverallStats();
  }

  /**
   * Get cache statistics for market data namespace
   */
  @Get('cache/stats/market')
  @ApiOperation({ summary: 'Get cache statistics for market data' })
  @ApiResponse({
    status: 200,
    description: 'Market data cache statistics',
    type: CacheStatsDto,
  })
  async getMarketDataCacheStats(): Promise<CacheStatsDto> {
    return this.cacheMetricsService.getMarketDataStats();
  }

  /**
   * Get cache statistics for news namespace
   */
  @Get('cache/stats/news')
  @ApiOperation({ summary: 'Get cache statistics for news' })
  @ApiResponse({
    status: 200,
    description: 'News cache statistics',
    type: CacheStatsDto,
  })
  async getNewsCacheStats(): Promise<CacheStatsDto> {
    return this.cacheMetricsService.getNewsStats();
  }

  /**
   * Invalidate cache
   */
  @Post('cache/invalidate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate cache entries' })
  @ApiResponse({
    status: 200,
    description: 'Cache invalidated',
    type: CacheInvalidateResponseDto,
  })
  async invalidateCache(
    @Body() dto: CacheInvalidateDto,
  ): Promise<CacheInvalidateResponseDto> {
    this.logger.log(`Cache invalidation requested: ${JSON.stringify(dto)}`);

    let invalidatedCount = 0;

    if (dto.namespace) {
      // Invalidate entire namespace
      const namespace = dto.namespace as CacheNamespace;
      invalidatedCount = await this.cacheService.invalidateNamespace(namespace);
    } else if (dto.pattern) {
      // Invalidate by pattern (default to market snapshot namespace)
      invalidatedCount = await this.cacheService.invalidateByPattern(
        dto.pattern,
        CacheNamespace.MARKET_SNAPSHOT,
      );
    } else if (dto.keys && dto.keys.length > 0) {
      // Invalidate specific keys (default to market snapshot namespace)
      invalidatedCount = await this.cacheService.invalidate(
        dto.keys,
        CacheNamespace.MARKET_SNAPSHOT,
      );
    }

    return {
      success: true,
      invalidatedCount,
      message: `Successfully invalidated ${invalidatedCount} cache entries`,
    };
  }

  /**
   * Invalidate market data cache
   */
  @Post('cache/invalidate/market')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate market data cache' })
  @ApiResponse({ status: 200, description: 'Market cache invalidated' })
  async invalidateMarketCache(): Promise<CacheInvalidateResponseDto> {
    this.logger.log('Invalidating market data cache');
    const count = await this.marketDataService.invalidateMarketCache();

    return {
      success: true,
      invalidatedCount: count,
      message: `Invalidated ${count} market data cache entries`,
    };
  }

  /**
   * Invalidate news cache
   */
  @Post('cache/invalidate/news')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate news cache' })
  @ApiResponse({ status: 200, description: 'News cache invalidated' })
  async invalidateNewsCache(): Promise<CacheInvalidateResponseDto> {
    this.logger.log('Invalidating news cache');
    const count = await this.newsService.invalidateNewsCache();

    return {
      success: true,
      invalidatedCount: count,
      message: `Invalidated ${count} news cache entries`,
    };
  }
}
