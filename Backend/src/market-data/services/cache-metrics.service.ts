import { Injectable, Logger } from '@nestjs/common';
import { MarketCacheService } from './market-cache.service';
import { CacheNamespace } from '../types/cache-config.types';
import { CacheStatsDto } from '../dto/cache-stats.dto';

@Injectable()
export class CacheMetricsService {
  private readonly logger = new Logger(CacheMetricsService.name);

  constructor(private readonly cacheService: MarketCacheService) {}

  /**
   * Get cache statistics for a specific namespace
   */
  async getNamespaceStats(namespace: CacheNamespace): Promise<CacheStatsDto> {
    const stats = await this.cacheService.getStats(namespace);

    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
      totalKeys: stats.totalKeys,
      namespace: stats.namespace,
      timestamp: new Date(),
    };
  }

  /**
   * Get overall cache statistics across all namespaces
   */
  async getOverallStats(): Promise<{
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    namespaces: CacheStatsDto[];
    timestamp: Date;
  }> {
    const overallStats = await this.cacheService.getOverallStats();

    const namespaceStats: CacheStatsDto[] = overallStats.namespaces.map(
      (ns) => ({
        hits: ns.hits,
        misses: ns.misses,
        hitRate: ns.hitRate,
        totalKeys: ns.totalKeys,
        namespace: ns.namespace,
        timestamp: new Date(),
      }),
    );

    return {
      totalHits: overallStats.totalHits,
      totalMisses: overallStats.totalMisses,
      hitRate: overallStats.hitRate,
      namespaces: namespaceStats,
      timestamp: new Date(),
    };
  }

  /**
   * Get cache statistics for market data namespace
   */
  async getMarketDataStats(): Promise<CacheStatsDto> {
    return this.getNamespaceStats(CacheNamespace.MARKET_SNAPSHOT);
  }

  /**
   * Get cache statistics for news namespace
   */
  async getNewsStats(): Promise<CacheStatsDto> {
    return this.getNamespaceStats(CacheNamespace.NEWS);
  }

  /**
   * Get cache statistics for price data namespace
   */
  async getPriceDataStats(): Promise<CacheStatsDto> {
    return this.getNamespaceStats(CacheNamespace.PRICE_DATA);
  }

  /**
   * Log cache statistics to console
   */
  async logCacheStats(): Promise<void> {
    const stats = await this.getOverallStats();

    this.logger.log('=== Cache Statistics ===');
    this.logger.log(`Total Hits: ${stats.totalHits}`);
    this.logger.log(`Total Misses: ${stats.totalMisses}`);
    this.logger.log(`Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);

    for (const ns of stats.namespaces) {
      this.logger.log(`\n[${ns.namespace}]`);
      this.logger.log(`  Hits: ${ns.hits}`);
      this.logger.log(`  Misses: ${ns.misses}`);
      this.logger.log(`  Hit Rate: ${(ns.hitRate * 100).toFixed(2)}%`);
      this.logger.log(`  Total Keys: ${ns.totalKeys}`);
    }
  }
}
