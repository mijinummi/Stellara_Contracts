import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  CacheMetrics,
  CacheNamespace,
  CACHE_TTL_CONFIG,
} from '../types/cache-config.types';
import * as crypto from 'crypto';

@Injectable()
export class MarketCacheService {
  private readonly logger = new Logger(MarketCacheService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get cached data by key and namespace
   * Records cache hit if found
   */
  async get<T>(key: string, namespace: CacheNamespace): Promise<T | null> {
    try {
      const cacheKey = this.generateCacheKey(key, namespace);
      const cached = await this.redisService.client.get(cacheKey);

      if (cached) {
        // Record cache hit
        await Promise.all([
          this.redisService.client.incr(`${namespace}:stats:hits`),
          this.redisService.client.incr('market:cache:total-hits'),
        ]);

        this.logger.debug(`Cache hit: ${cacheKey}`);
        return JSON.parse(cached) as T;
      }

      // Record cache miss
      await Promise.all([
        this.redisService.client.incr(`${namespace}:stats:misses`),
        this.redisService.client.incr('market:cache:total-misses'),
      ]);

      this.logger.debug(`Cache miss: ${cacheKey}`);
      return null;
    } catch (error) {
      this.logger.error(
        `Error retrieving from cache: ${error.message}`,
        error.stack,
      );
      return null; // Fail gracefully
    }
  }

  /**
   * Set data in cache with TTL
   */
  async set<T>(
    key: string,
    value: T,
    namespace: CacheNamespace,
    customTtl?: number,
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key, namespace);
      const ttl = customTtl || this.getTtlForNamespace(namespace);

      // Store data
      await this.redisService.client.set(cacheKey, JSON.stringify(value), {
        EX: ttl,
      });

      // Update metadata
      await Promise.all([
        this.redisService.client.set(
          `${cacheKey}:metadata`,
          JSON.stringify({
            createdAt: Date.now(),
            ttl,
            namespace,
          }),
          { EX: ttl },
        ),
        this.redisService.client.incr(`${namespace}:stats:total-entries`),
      ]);

      this.logger.debug(`Cached data: ${cacheKey} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Error setting cache: ${error.message}`, error.stack);
      // Fail gracefully - cache write failure shouldn't block operation
    }
  }

  /**
   * Invalidate specific cache key(s)
   */
  async invalidate(keys: string[], namespace: CacheNamespace): Promise<number> {
    try {
      if (keys.length === 0) {
        return 0;
      }

      const cacheKeys = keys.map((key) =>
        this.generateCacheKey(key, namespace),
      );
      const metadataKeys = cacheKeys.map((key) => `${key}:metadata`);
      const allKeys = [...cacheKeys, ...metadataKeys];

      await this.redisService.client.del(allKeys);

      this.logger.log(
        `Invalidated ${keys.length} cache entries in ${namespace}`,
      );
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Error invalidating cache: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  async invalidateByPattern(
    pattern: string,
    namespace: CacheNamespace,
  ): Promise<number> {
    try {
      const searchPattern = `${namespace}:${pattern}*`;
      const keys = await this.redisService.client.keys(searchPattern);

      if (keys.length === 0) {
        return 0;
      }

      await this.redisService.client.del(keys);

      this.logger.log(
        `Invalidated ${keys.length} cache entries matching pattern: ${pattern}`,
      );
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Error invalidating by pattern: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Invalidate entire namespace
   */
  async invalidateNamespace(namespace: CacheNamespace): Promise<number> {
    try {
      const keys = await this.redisService.client.keys(`${namespace}:*`);

      if (keys.length === 0) {
        return 0;
      }

      await this.redisService.client.del(keys);

      // Reset stats for namespace
      await Promise.all([
        this.redisService.client.del(`${namespace}:stats:hits`),
        this.redisService.client.del(`${namespace}:stats:misses`),
        this.redisService.client.del(`${namespace}:stats:total-entries`),
      ]);

      this.logger.log(
        `Invalidated entire namespace: ${namespace} (${keys.length} keys)`,
      );
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Error invalidating namespace: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Get cache statistics for a namespace
   */
  async getStats(namespace: CacheNamespace): Promise<CacheMetrics> {
    try {
      const [hits, misses, totalKeys] = await Promise.all([
        this.redisService.client
          .get(`${namespace}:stats:hits`)
          .then((v) => parseInt(v || '0', 10)),
        this.redisService.client
          .get(`${namespace}:stats:misses`)
          .then((v) => parseInt(v || '0', 10)),
        this.redisService.client
          .keys(`${namespace}:*`)
          .then(
            (keys) =>
              keys.filter(
                (k) => !k.includes(':stats:') && !k.includes(':metadata'),
              ).length,
          ),
      ]);

      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : 0;

      return {
        hits,
        misses,
        hitRate,
        totalKeys,
        namespace,
      };
    } catch (error) {
      this.logger.error(
        `Error getting cache stats: ${error.message}`,
        error.stack,
      );
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalKeys: 0,
        namespace,
      };
    }
  }

  /**
   * Get overall cache statistics across all namespaces
   */
  async getOverallStats(): Promise<{
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    namespaces: CacheMetrics[];
  }> {
    try {
      const [totalHits, totalMisses] = await Promise.all([
        this.redisService.client
          .get('market:cache:total-hits')
          .then((v) => parseInt(v || '0', 10)),
        this.redisService.client
          .get('market:cache:total-misses')
          .then((v) => parseInt(v || '0', 10)),
      ]);

      const total = totalHits + totalMisses;
      const hitRate = total > 0 ? totalHits / total : 0;

      // Get stats for each namespace
      const namespaces = await Promise.all(
        Object.values(CacheNamespace).map((ns) => this.getStats(ns)),
      );

      return {
        totalHits,
        totalMisses,
        hitRate,
        namespaces,
      };
    } catch (error) {
      this.logger.error(
        `Error getting overall stats: ${error.message}`,
        error.stack,
      );
      return {
        totalHits: 0,
        totalMisses: 0,
        hitRate: 0,
        namespaces: [],
      };
    }
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string, namespace: CacheNamespace): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(key, namespace);
      const exists = await this.redisService.client.exists(cacheKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(
        `Error checking cache existence: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Get remaining TTL for a cached key
   */
  async getTtl(key: string, namespace: CacheNamespace): Promise<number> {
    try {
      const cacheKey = this.generateCacheKey(key, namespace);
      return await this.redisService.client.ttl(cacheKey);
    } catch (error) {
      this.logger.error(`Error getting TTL: ${error.message}`, error.stack);
      return -1;
    }
  }

  // ========== PRIVATE HELPERS ==========

  /**
   * Generate deterministic cache key
   */
  private generateCacheKey(key: string, namespace: CacheNamespace): string {
    // Create hash of the key to avoid issues with special characters
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return `${namespace}:${hash.substring(0, 16)}`;
  }

  /**
   * Get default TTL for a namespace
   */
  private getTtlForNamespace(namespace: CacheNamespace): number {
    switch (namespace) {
      case CacheNamespace.MARKET_SNAPSHOT:
        return CACHE_TTL_CONFIG.MARKET_SNAPSHOT;
      case CacheNamespace.NEWS:
        return CACHE_TTL_CONFIG.NEWS;
      case CacheNamespace.ASSET_DATA:
        return CACHE_TTL_CONFIG.ASSET_DATA;
      case CacheNamespace.PRICE_DATA:
        return CACHE_TTL_CONFIG.PRICE_DATA;
      default:
        return 300; // 5 minutes default
    }
  }
}
