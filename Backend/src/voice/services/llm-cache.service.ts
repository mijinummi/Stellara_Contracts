import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

export interface CacheEntry {
  content: string;
  model: string;
  timestamp: number;
  ttl: number;
  hitCount: number;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  hitRate: number;
  oldestEntry: { key: string; age: number } | null;
}

@Injectable()
export class LlmCacheService {
  private readonly logger = new Logger(LlmCacheService.name);

  // Redis key prefixes
  private readonly CACHE_PREFIX = 'llm:cache:';
  private readonly CACHE_STATS_PREFIX = 'llm:cache:stats:';
  private readonly CACHE_VERSION = 'v1';
  private readonly DEFAULT_TTL = 86400; // 24 hours in seconds

  constructor(private readonly redisService: RedisService) {}

  /**
   * Gets cached response for a prompt, if available and valid
   */
  async get(prompt: string, model: string): Promise<string | null> {
    try {
      const cacheKey = this.generateCacheKey(prompt, model);
      const cached = await this.redisService.client.get(cacheKey);

      if (cached) {
        // Record hit
        const statsKey = this.generateStatsKey(cacheKey);
        await Promise.all([
          this.redisService.client.incr(`${statsKey}:hits`),
          this.redisService.client.incr('llm:cache:total-hits'),
        ]);

        this.logger.debug(`Cache hit for prompt (${model})`);
        return cached;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error retrieving from cache: ${error.message}`,
        error.stack,
      );
      return null; // Fail gracefully - cache miss
    }
  }

  /**
   * Sets a cached response for a prompt
   */
  async set(
    prompt: string,
    response: string,
    model: string,
    ttl?: number,
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(prompt, model);
      const effectiveTtl = ttl || this.DEFAULT_TTL;

      // Store response
      await this.redisService.client.set(cacheKey, response, {
        EX: effectiveTtl,
      });

      // Initialize stats
      const statsKey = this.generateStatsKey(cacheKey);
      await Promise.all([
        this.redisService.client.set(
          `${statsKey}:created`,
          Date.now().toString(),
          {
            EX: effectiveTtl,
          },
        ),
        this.redisService.client.set(`${statsKey}:model`, model, {
          EX: effectiveTtl,
        }),
        this.redisService.client.set(
          `${statsKey}:ttl`,
          effectiveTtl.toString(),
          {
            EX: effectiveTtl,
          },
        ),
        this.redisService.client.incr('llm:cache:total-entries'),
      ]);

      this.logger.debug(`Cached response for prompt (${model})`);
    } catch (error) {
      this.logger.error(
        `Error caching response: ${error.message}`,
        error.stack,
      );
      // Fail gracefully - cache write failure shouldn't block response
    }
  }

  /**
   * Invalidates cache for a specific prompt (e.g., after model update)
   */
  async invalidate(prompt: string, model?: string): Promise<number> {
    try {
      let keys: string[];

      if (model) {
        // Invalidate specific model cache
        const cacheKey = this.generateCacheKey(prompt, model);
        keys = [cacheKey];
      } else {
        // Invalidate all models for this prompt
        const promptHash = crypto
          .createHash('sha256')
          .update(prompt.trim().toLowerCase())
          .digest('hex');
        const pattern = `${this.CACHE_PREFIX}${this.CACHE_VERSION}:*:${promptHash}`;
        keys = await this.redisService.client.keys(pattern);
      }

      if (keys.length === 0) {
        return 0;
      }

      // Delete cache entries and their stats
      const statsKeys = keys.map((key) => this.generateStatsKey(key));
      const allKeys = [...keys, ...statsKeys];

      await this.redisService.client.del(allKeys);

      this.logger.log(
        `Invalidated ${keys.length} cache entries for prompt${model ? ` (${model})` : ''}`,
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
   * Invalidates all cache entries (e.g., after major model update)
   */
  async invalidateAll(): Promise<number> {
    try {
      const keys = await this.redisService.client.keys(`${this.CACHE_PREFIX}*`);

      if (keys.length === 0) {
        return 0;
      }

      await this.redisService.client.del(keys);

      this.logger.log(`Invalidated all ${keys.length} cache entries`);
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Error invalidating all cache: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Gets cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const [totalEntries, totalHits] = await Promise.all([
        this.redisService.client
          .get('llm:cache:total-entries')
          .then((v) => parseInt(v || '0', 10)),
        this.redisService.client
          .get('llm:cache:total-hits')
          .then((v) => parseInt(v || '0', 10)),
      ]);

      const hitRate = totalEntries > 0 ? totalHits / totalEntries : 0;

      // Find oldest entry
      const cacheKeys = await this.redisService.client.keys(
        `${this.CACHE_PREFIX}*`,
      );
      let oldestEntry: { key: string; age: number } | null = null;

      if (cacheKeys.length > 0) {
        const now = Date.now();
        let oldestTime = Infinity;

        for (const key of cacheKeys) {
          const statsKey = this.generateStatsKey(key);
          const createdStr = await this.redisService.client.get(
            `${statsKey}:created`,
          );

          if (createdStr) {
            const created = parseInt(createdStr, 10);
            if (created < oldestTime) {
              oldestTime = created;
              oldestEntry = {
                key: key.replace(this.CACHE_PREFIX, ''),
                age: Math.floor((now - created) / 1000),
              };
            }
          }
        }
      }

      return {
        totalEntries,
        totalHits,
        hitRate,
        oldestEntry,
      };
    } catch (error) {
      this.logger.error(
        `Error getting cache stats: ${error.message}`,
        error.stack,
      );
      return {
        totalEntries: 0,
        totalHits: 0,
        hitRate: 0,
        oldestEntry: null,
      };
    }
  }

  /**
   * Clears cache entries older than specified age
   */
  async pruneOldEntries(maxAgeSeconds: number): Promise<number> {
    try {
      const cacheKeys = await this.redisService.client.keys(
        `${this.CACHE_PREFIX}*`,
      );
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const key of cacheKeys) {
        const statsKey = this.generateStatsKey(key);
        const createdStr = await this.redisService.client.get(
          `${statsKey}:created`,
        );

        if (createdStr) {
          const created = parseInt(createdStr, 10);
          const ageSeconds = (now - created) / 1000;

          if (ageSeconds > maxAgeSeconds) {
            keysToDelete.push(key);
            keysToDelete.push(statsKey);
          }
        }
      }

      if (keysToDelete.length > 0) {
        await this.redisService.client.del(keysToDelete);
        this.logger.log(`Pruned ${keysToDelete.length / 2} old cache entries`);
        return keysToDelete.length / 2;
      }

      return 0;
    } catch (error) {
      this.logger.error(`Error pruning cache: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * Warms cache by pre-populating common responses
   */
  async warmCache(
    entries: Array<{
      prompt: string;
      response: string;
      model: string;
      ttl?: number;
    }>,
  ): Promise<number> {
    try {
      let count = 0;

      for (const entry of entries) {
        await this.set(entry.prompt, entry.response, entry.model, entry.ttl);
        count++;
      }

      this.logger.log(`Warmed cache with ${count} entries`);
      return count;
    } catch (error) {
      this.logger.error(`Error warming cache: ${error.message}`, error.stack);
      return 0;
    }
  }

  // ========== PRIVATE HELPERS ==========

  /**
   * Generates deterministic cache key based on prompt and model
   */
  private generateCacheKey(prompt: string, model: string): string {
    const normalizedPrompt = prompt.trim().toLowerCase();
    const hash = crypto
      .createHash('sha256')
      .update(normalizedPrompt)
      .digest('hex');
    return `${this.CACHE_PREFIX}${this.CACHE_VERSION}:${model}:${hash}`;
  }

  /**
   * Generates stats key for a cache entry
   */
  private generateStatsKey(cacheKey: string): string {
    return `${cacheKey}:stats`;
  }
}
