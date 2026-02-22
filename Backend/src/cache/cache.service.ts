import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheConfigurationService } from './cache-configuration.service';

export interface CacheEntry<T = any> {
  data: T;
  metadata: {
    createdAt: number;
    expiresAt: number;
    ttl: number;
    version?: string;
    tags?: string[];
  };
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  version?: string;
  strategy?: 'cache-aside' | 'write-through' | 'write-behind';
  compress?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  memoryUsage: number;
  totalKeys: number;
  avgLatency: number;
}

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private readonly CACHE_PREFIX = 'cache:';
  private readonly STATS_PREFIX = 'cache:stats:';
  private readonly TAG_PREFIX = 'cache:tag:';

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: CacheConfigurationService,
  ) {}

  async onModuleInit() {
    this.logger.log('CacheService initialized');
    await this.initializeMetrics();
  }

  // ==================== CACHE-ASIDE PATTERN ====================

  /**
   * Cache-aside pattern implementation
   * Get data from cache, if not found, fetch from source and cache it
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const startTime = Date.now();

    try {
      // Try cache first
      const cached = await this.getFromCache<T>(key);
      if (cached !== null) {
        await this.recordHit(key);
        this.logger.debug(`Cache hit for key: ${key}`);
        return cached;
      }

      // Cache miss - fetch from source
      await this.recordMiss(key);
      this.logger.debug(`Cache miss for key: ${key}, fetching from source`);

      const data = await fetcher();
      if (data !== undefined && data !== null) {
        await this.set(key, data, options);
      }

      const latency = Date.now() - startTime;
      await this.recordLatency(key, latency);

      return data;
    } catch (error) {
      this.logger.error(
        `Error in cache-aside for key ${key}: ${error.message}`,
      );
      // Fallback to source on cache failure
      return await fetcher();
    }
  }

  // ==================== WRITE-THROUGH PATTERN ====================

  /**
   * Write-through pattern implementation
   * Data is written to cache and source simultaneously
   */
  async set<T>(
    key: string,
    data: T,
    options: CacheOptions = {},
  ): Promise<void> {
    const config = this.configService.getCacheConfig();
    const ttl = options.ttl || config.defaultTTL;
    const strategy = options.strategy || 'cache-aside';

    try {
      // Store in cache with metadata
      const cacheEntry: CacheEntry<T> = {
        data,
        metadata: {
          createdAt: Date.now(),
          expiresAt: Date.now() + ttl * 1000,
          ttl,
          version: options.version,
          tags: options.tags,
        },
      };

      const serializedData = this.serializeData(cacheEntry, options.compress);

      const pipeline = this.redisService.client.multi();
      pipeline.set(`${this.CACHE_PREFIX}${key}`, serializedData, { EX: ttl });

      // Add tags if provided
      if (options.tags?.length) {
        for (const tag of options.tags) {
          pipeline.sAdd(`${this.TAG_PREFIX}${tag}`, key);
          pipeline.expire(`${this.TAG_PREFIX}${tag}`, ttl);
        }
      }

      // Update stats
      pipeline.incr(`${this.STATS_PREFIX}total-keys`);
      await pipeline.exec();

      this.logger.debug(`Cached data for key: ${key} with TTL: ${ttl}s`);

      // Execute write-through if configured
      if (strategy === 'write-through' && config.writeThroughEnabled) {
        await this.executeWriteThrough(key, data);
      }
    } catch (error) {
      this.logger.error(`Error setting cache for key ${key}: ${error.message}`);
      throw error;
    }
  }

  // ==================== WRITE-BEHIND PATTERN ====================

  /**
   * Write-behind pattern with background persistence
   */
  async setWithWriteBehind<T>(
    key: string,
    data: T,
    options: CacheOptions = {},
  ): Promise<void> {
    // Immediate cache write
    await this.set(key, data, { ...options, strategy: 'cache-aside' });

    // Background write to persistent storage
    if (this.configService.getCacheConfig().writeBehindEnabled) {
      setImmediate(async () => {
        try {
          await this.executeWriteBehind(key, data);
        } catch (error) {
          this.logger.error(
            `Write-behind failed for key ${key}: ${error.message}`,
          );
        }
      });
    }
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Get multiple keys in a single operation
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    if (keys.length === 0) return [];

    try {
      const cacheKeys = keys.map((key) => `${this.CACHE_PREFIX}${key}`);
      const results = await this.redisService.client.mGet(cacheKeys);

      return await Promise.all(
        results.map(async (result, index) => {
          if (result === null) {
            await this.recordMiss(keys[index]);
            return null;
          }

          await this.recordHit(keys[index]);
          return this.deserializeData<T>(result as string);
        }),
      );
    } catch (error) {
      this.logger.error(`Error in mget: ${error.message}`);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs
   */
  async mset<T>(
    entries: Array<{ key: string; value: T; options?: CacheOptions }>,
  ): Promise<void> {
    if (entries.length === 0) return;

    try {
      const pipeline = this.redisService.client.multi();

      for (const entry of entries) {
        const cacheEntry: CacheEntry<T> = {
          data: entry.value,
          metadata: {
            createdAt: Date.now(),
            expiresAt: Date.now() + (entry.options?.ttl || 3600) * 1000,
            ttl: entry.options?.ttl || 3600,
            version: entry.options?.version,
            tags: entry.options?.tags,
          },
        };

        const serializedData = this.serializeData(
          cacheEntry,
          entry.options?.compress,
        );
        const ttl = entry.options?.ttl || 3600;

        pipeline.set(`${this.CACHE_PREFIX}${entry.key}`, serializedData, {
          EX: ttl,
        });

        if (entry.options?.tags?.length) {
          for (const tag of entry.options.tags) {
            pipeline.sAdd(`${this.TAG_PREFIX}${tag}`, entry.key);
            pipeline.expire(`${this.TAG_PREFIX}${tag}`, ttl);
          }
        }
      }

      await pipeline.exec();
      this.logger.debug(`Batch set ${entries.length} cache entries`);
    } catch (error) {
      this.logger.error(`Error in mset: ${error.message}`);
      throw error;
    }
  }

  // ==================== INVALIDATION ====================

  /**
   * Delete cache entry by key
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redisService.client.del(
        `${this.CACHE_PREFIX}${key}`,
      );
      return result > 0;
    } catch (error) {
      this.logger.error(`Error deleting cache key ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete cache entries by tag
   */
  async deleteByTag(tag: string): Promise<number> {
    try {
      const tagKey = `${this.TAG_PREFIX}${tag}`;
      const keys = await this.redisService.client.sMembers(tagKey);

      if (keys.length === 0) return 0;

      const cacheKeys = keys.map((key) => `${this.CACHE_PREFIX}${key}`);
      const result = await this.redisService.client.del([...cacheKeys, tagKey]);

      this.logger.log(`Deleted ${keys.length} cache entries by tag: ${tag}`);
      return keys.length;
    } catch (error) {
      this.logger.error(`Error deleting by tag ${tag}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<number> {
    try {
      const keys = await this.redisService.client.keys(`${this.CACHE_PREFIX}*`);
      const tagKeys = await this.redisService.client.keys(
        `${this.TAG_PREFIX}*`,
      );

      if (keys.length === 0 && tagKeys.length === 0) return 0;

      const result = await this.redisService.client.del([...keys, ...tagKeys]);
      this.logger.log(`Cleared ${keys.length} cache entries`);
      return keys.length;
    } catch (error) {
      this.logger.error(`Error clearing cache: ${error.message}`);
      return 0;
    }
  }

  // ==================== METRICS & STATS ====================

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const [hits, misses, totalKeys, memoryUsage] = await Promise.all([
        this.redisService.client
          .get(`${this.STATS_PREFIX}hits`)
          .then((v) => parseInt((v as string) || '0', 10)),
        this.redisService.client
          .get(`${this.STATS_PREFIX}misses`)
          .then((v) => parseInt((v as string) || '0', 10)),
        this.redisService.client
          .get(`${this.STATS_PREFIX}total-keys`)
          .then((v) => parseInt((v as string) || '0', 10)),
        this.getMemoryUsage(),
      ]);

      const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
      const avgLatency = await this.getAverageLatency();

      return {
        hits,
        misses,
        hitRate,
        evictions: 0, // Will be tracked separately
        memoryUsage,
        totalKeys,
        avgLatency,
      };
    } catch (error) {
      this.logger.error(`Error getting cache stats: ${error.message}`);
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
        memoryUsage: 0,
        totalKeys: 0,
        avgLatency: 0,
      };
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const result = await this.redisService.client.get(
        `${this.CACHE_PREFIX}${key}`,
      );
      if (result === null) return null;

      return this.deserializeData<T>(result as string);
    } catch (error) {
      this.logger.error(`Error getting from cache: ${error.message}`);
      return null;
    }
  }

  private async recordHit(key: string): Promise<void> {
    await this.redisService.client.incr(`${this.STATS_PREFIX}hits`);
    await this.redisService.client.hIncrBy(
      `${this.STATS_PREFIX}key-hits`,
      key,
      1,
    );
  }

  private async recordMiss(key: string): Promise<void> {
    await this.redisService.client.incr(`${this.STATS_PREFIX}misses`);
    await this.redisService.client.hIncrBy(
      `${this.STATS_PREFIX}key-misses`,
      key,
      1,
    );
  }

  private async recordLatency(key: string, latency: number): Promise<void> {
    const latencyKey = `${this.STATS_PREFIX}latencies:${key}`;
    await this.redisService.client.lPush(latencyKey, latency.toString());
    await this.redisService.client.lTrim(latencyKey, 0, 99); // Keep last 100 values
  }

  private async getAverageLatency(): Promise<number> {
    // This would aggregate latencies across keys
    // For simplicity, returning 0 - would be enhanced in full implementation
    return 0;
  }

  private async getMemoryUsage(): Promise<number> {
    try {
      const info = await this.redisService.client.info('memory');
      const match = info.match(/used_memory:(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch (error) {
      return 0;
    }
  }

  private async initializeMetrics(): Promise<void> {
    const pipeline = this.redisService.client.multi();
    pipeline.setNX(`${this.STATS_PREFIX}hits`, '0');
    pipeline.setNX(`${this.STATS_PREFIX}misses`, '0');
    pipeline.setNX(`${this.STATS_PREFIX}total-keys`, '0');
    await pipeline.exec();
  }

  private serializeData<T>(
    entry: CacheEntry<T>,
    compress: boolean = false,
  ): string {
    const json = JSON.stringify(entry);
    if (compress && json.length > 1024) {
      // In a real implementation, you'd use zlib or similar
      // For now, just return JSON
      return json;
    }
    return json;
  }

  private deserializeData<T>(data: string): T {
    const entry: CacheEntry<T> = JSON.parse(data);
    return entry.data;
  }

  private async executeWriteThrough<T>(key: string, data: T): Promise<void> {
    // Implementation would depend on your persistence layer
    // This is a placeholder for database writes
    this.logger.debug(`Write-through executed for key: ${key}`);
  }

  private async executeWriteBehind<T>(key: string, data: T): Promise<void> {
    // Implementation would queue writes for background processing
    this.logger.debug(`Write-behind queued for key: ${key}`);
  }
}
