import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

export interface CacheEntry {
  key: string;
  value: string;
  model: string;
  prompt: string;
  embedding?: number[];
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
  lastAccessed: Date;
}

export interface CacheConfig {
  ttlSeconds: number;
  maxSize: number;
  enableSemanticCache: boolean;
  similarityThreshold: number;
  cleanupIntervalMs: number;
}

export interface CacheStats {
  inMemory: {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
  redis: {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
  semantic: {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
  totalHits: number;
  totalMisses: number;
  hitRate: number;
}

@Injectable()
export class MultiLevelCacheService {
  private readonly logger = new Logger(MultiLevelCacheService.name);
  private readonly inMemoryCache = new Map<string, CacheEntry>();
  private readonly accessHistory: string[] = [];
  private readonly stats = {
    inMemory: { hits: 0, misses: 0 },
    redis: { hits: 0, misses: 0 },
    semantic: { hits: 0, misses: 0 },
  };
  private cleanupInterval: NodeJS.Timeout;

  private readonly DEFAULT_CONFIG: CacheConfig = {
    ttlSeconds: 86400, // 24 hours
    maxSize: 10000,
    enableSemanticCache: true,
    similarityThreshold: 0.8,
    cleanupIntervalMs: 300000, // 5 minutes
  };

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.startCleanupProcess();
  }

  async get(prompt: string, model: string, config?: Partial<CacheConfig>): Promise<string | null> {
    const cacheConfig = { ...this.DEFAULT_CONFIG, ...config };
    const cacheKey = this.generateCacheKey(prompt, model);

    // Level 1: In-memory cache
    const inMemoryResult = this.getInMemoryCache(cacheKey);
    if (inMemoryResult) {
      this.stats.inMemory.hits++;
      this.logger.debug(`In-memory cache hit for key: ${cacheKey}`);
      return inMemoryResult;
    }
    this.stats.inMemory.misses++;

    // Level 2: Redis cache
    const redisResult = await this.getRedisCache(cacheKey);
    if (redisResult) {
      this.stats.redis.hits++;
      this.logger.debug(`Redis cache hit for key: ${cacheKey}`);
      
      // Promote to in-memory cache
      this.setInMemoryCache(cacheKey, redisResult, model, prompt, cacheConfig);
      return redisResult;
    }
    this.stats.redis.misses++;

    // Level 3: Semantic cache (if enabled)
    if (cacheConfig.enableSemanticCache) {
      const semanticResult = await this.getSemanticCache(prompt, model, cacheConfig);
      if (semanticResult) {
        this.stats.semantic.hits++;
        this.logger.debug(`Semantic cache hit for prompt: ${prompt.substring(0, 50)}...`);
        
        // Promote to in-memory and Redis cache
        this.setInMemoryCache(cacheKey, semanticResult, model, prompt, cacheConfig);
        await this.setRedisCache(cacheKey, semanticResult, cacheConfig);
        return semanticResult;
      }
    }
    this.stats.semantic.misses++;

    this.logger.debug(`Cache miss for prompt: ${prompt.substring(0, 50)}...`);
    return null;
  }

  async set(
    prompt: string,
    response: string,
    model: string,
    config?: Partial<CacheConfig>
  ): Promise<void> {
    const cacheConfig = { ...this.DEFAULT_CONFIG, ...config };
    const cacheKey = this.generateCacheKey(prompt, model);

    // Set in all cache levels
    this.setInMemoryCache(cacheKey, response, model, prompt, cacheConfig);
    await this.setRedisCache(cacheKey, response, cacheConfig);
    
    if (cacheConfig.enableSemanticCache) {
      await this.setSemanticCache(prompt, response, model, cacheConfig);
    }

    this.logger.debug(`Cache set for key: ${cacheKey}`);
  }

  async invalidate(key: string): Promise<void> {
    // Remove from in-memory cache
    this.inMemoryCache.delete(key);
    
    // Remove from Redis
    const redisKey = `ai:cache:${key}`;
    await this.redis.del(redisKey);
    
    // Remove from semantic cache
    await this.invalidateSemanticCache(key);
    
    this.logger.debug(`Cache invalidated for key: ${key}`);
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    // Invalidate in-memory cache
    let count = 0;
    for (const key of this.inMemoryCache.keys()) {
      if (key.includes(pattern)) {
        this.inMemoryCache.delete(key);
        count++;
      }
    }
    
    // Invalidate Redis cache
    const redisPattern = `ai:cache:*${pattern}*`;
    const keys = await this.redis.keys(redisPattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      count += keys.length;
    }
    
    // Invalidate semantic cache
    await this.invalidateSemanticCacheByPattern(pattern);
    
    this.logger.debug(`Invalidated ${count} cache entries matching pattern: ${pattern}`);
    return count;
  }

  async clearAll(): Promise<void> {
    // Clear in-memory cache
    this.inMemoryCache.clear();
    this.accessHistory.length = 0;
    
    // Clear Redis cache
    const pattern = 'ai:cache:*';
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    
    // Clear semantic cache
    await this.clearSemanticCache();
    
    this.logger.log('All cache cleared');
  }

  getStats(): CacheStats {
    const totalHits = this.stats.inMemory.hits + this.stats.redis.hits + this.stats.semantic.hits;
    const totalMisses = this.stats.inMemory.misses + this.stats.redis.misses + this.stats.semantic.misses;
    const hitRate = totalHits / (totalHits + totalMisses) || 0;

    return {
      inMemory: {
        size: this.inMemoryCache.size,
        hitRate: this.stats.inMemory.hits / (this.stats.inMemory.hits + this.stats.inMemory.misses) || 0,
        totalHits: this.stats.inMemory.hits,
        totalMisses: this.stats.inMemory.misses,
      },
      redis: {
        size: -1, // Would need to scan Redis to get exact count
        hitRate: this.stats.redis.hits / (this.stats.redis.hits + this.stats.redis.misses) || 0,
        totalHits: this.stats.redis.hits,
        totalMisses: this.stats.redis.misses,
      },
      semantic: {
        size: -1, // Would need to scan semantic cache
        hitRate: this.stats.semantic.hits / (this.stats.semantic.hits + this.stats.semantic.misses) || 0,
        totalHits: this.stats.semantic.hits,
        totalMisses: this.stats.semantic.misses,
      },
      totalHits,
      totalMisses,
      hitRate,
    };
  }

  async warmCache(entries: Array<{ prompt: string; response: string; model: string; ttl?: number }>): Promise<number> {
    let count = 0;
    const config = { ...this.DEFAULT_CONFIG };

    for (const entry of entries) {
      try {
        await this.set(entry.prompt, entry.response, entry.model, {
          ...config,
          ttlSeconds: entry.ttl || config.ttlSeconds,
        });
        count++;
      } catch (error) {
        this.logger.error(`Failed to warm cache entry: ${error.message}`);
      }
    }

    this.logger.log(`Warmed ${count} cache entries`);
    return count;
  }

  private generateCacheKey(prompt: string, model: string): string {
    const normalizedPrompt = prompt.toLowerCase().trim();
    const hash = createHash('sha256').update(normalizedPrompt).digest('hex');
    return `${model}:${hash}`;
  }

  private getInMemoryCache(key: string): string | null {
    const entry = this.inMemoryCache.get(key);
    if (!entry) return null;

    // Check TTL
    if (new Date() > entry.expiresAt) {
      this.inMemoryCache.delete(key);
      return null;
    }

    // Update access stats
    entry.hitCount++;
    entry.lastAccessed = new Date();
    
    return entry.value;
  }

  private setInMemoryCache(
    key: string,
    value: string,
    model: string,
    prompt: string,
    config: CacheConfig
  ): void {
    const now = new Date();
    const entry: CacheEntry = {
      key,
      value,
      model,
      prompt,
      createdAt: now,
      expiresAt: new Date(now.getTime() + config.ttlSeconds * 1000),
      hitCount: 0,
      lastAccessed: now,
    };

    this.inMemoryCache.set(key, entry);
    this.accessHistory.push(key);

    // Implement LRU eviction
    if (this.inMemoryCache.size > config.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  private async getRedisCache(key: string): Promise<string | null> {
    const redisKey = `ai:cache:${key}`;
    return this.redis.get(redisKey);
  }

  private async setRedisCache(key: string, value: string, config: CacheConfig): Promise<void> {
    const redisKey = `ai:cache:${key}`;
    await this.redis.set(redisKey, value, 'EX', config.ttlSeconds);
  }

  private evictLeastRecentlyUsed(): void {
    while (this.inMemoryCache.size > this.DEFAULT_CONFIG.maxSize && this.accessHistory.length > 0) {
      const key = this.accessHistory.shift();
      if (key) {
        this.inMemoryCache.delete(key);
      }
    }
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.DEFAULT_CONFIG.cleanupIntervalMs);
  }

  private cleanupExpiredEntries(): void {
    const now = new Date();
    let count = 0;

    for (const [key, entry] of this.inMemoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.inMemoryCache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.debug(`Cleaned up ${count} expired cache entries`);
    }
  }

  // Semantic cache methods (simplified implementation)
  private async getSemanticCache(prompt: string, model: string, config: CacheConfig): Promise<string | null> {
    // This would implement vector similarity search
    // For now, returning null to indicate no semantic match
    return null;
  }

  private async setSemanticCache(prompt: string, response: string, model: string, config: CacheConfig): Promise<void> {
    // This would store prompt embeddings for semantic search
    // Implementation would require a vector database like Pinecone or Weaviate
    this.logger.debug('Semantic cache storage not implemented');
  }

  private async invalidateSemanticCache(key: string): Promise<void> {
    // Implementation would remove from vector database
    this.logger.debug('Semantic cache invalidation not implemented');
  }

  private async invalidateSemanticCacheByPattern(pattern: string): Promise<void> {
    // Implementation would remove entries matching pattern from vector database
    this.logger.debug('Semantic cache pattern invalidation not implemented');
  }

  private async clearSemanticCache(): Promise<void> {
    // Implementation would clear all entries from vector database
    this.logger.debug('Semantic cache clear not implemented');
  }

  // Cleanup on destroy
  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}