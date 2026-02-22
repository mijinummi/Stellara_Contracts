import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheService } from './cache.service';

export interface InvalidationMessage {
  type: 'key' | 'tag' | 'pattern' | 'clear';
  target: string;
  timestamp: number;
  source: string;
  reason?: string;
}

export interface InvalidationRule {
  pattern: string;
  dependencies: string[];
  cascade: boolean;
}

@Injectable()
export class CacheInvalidationService implements OnModuleInit {
  private readonly logger = new Logger(CacheInvalidationService.name);
  private readonly INVALIDATION_CHANNEL = 'cache:invalidation';
  private readonly RULES_KEY = 'cache:invalidation:rules';
  private readonly instanceId: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly cacheService: CacheService,
  ) {
    this.instanceId = `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async onModuleInit() {
    await this.setupPubSub();
    await this.loadInvalidationRules();
    this.logger.log(
      `CacheInvalidationService initialized for ${this.instanceId}`,
    );
  }

  // ==================== DIRECT INVALIDATION ====================

  /**
   * Invalidate specific cache key across all instances
   */
  async invalidateKey(key: string, reason?: string): Promise<void> {
    const message: InvalidationMessage = {
      type: 'key',
      target: key,
      timestamp: Date.now(),
      source: this.instanceId,
      reason,
    };

    await this.broadcastInvalidation(message);
    await this.cacheService.delete(key);
    this.logger.log(`Invalidated key: ${key}${reason ? ` (${reason})` : ''}`);
  }

  /**
   * Invalidate all keys with specific tag
   */
  async invalidateByTag(tag: string, reason?: string): Promise<void> {
    const message: InvalidationMessage = {
      type: 'tag',
      target: tag,
      timestamp: Date.now(),
      source: this.instanceId,
      reason,
    };

    await this.broadcastInvalidation(message);
    await this.cacheService.deleteByTag(tag);
    this.logger.log(
      `Invalidated by tag: ${tag}${reason ? ` (${reason})` : ''}`,
    );
  }

  /**
   * Invalidate keys matching pattern
   */
  async invalidateByPattern(pattern: string, reason?: string): Promise<number> {
    const message: InvalidationMessage = {
      type: 'pattern',
      target: pattern,
      timestamp: Date.now(),
      source: this.instanceId,
      reason,
    };

    await this.broadcastInvalidation(message);
    return await this.invalidatePatternLocally(pattern);
  }

  /**
   * Clear entire cache
   */
  async clearAll(reason?: string): Promise<void> {
    const message: InvalidationMessage = {
      type: 'clear',
      target: 'all',
      timestamp: Date.now(),
      source: this.instanceId,
      reason,
    };

    await this.broadcastInvalidation(message);
    await this.cacheService.clear();
    this.logger.warn(`Cache cleared${reason ? ` (${reason})` : ''}`);
  }

  // ==================== RULE-BASED INVALIDATION ====================

  /**
   * Add invalidation rule for automatic dependency management
   */
  async addInvalidationRule(
    keyPattern: string,
    dependencies: string[],
    cascade: boolean = true,
  ): Promise<void> {
    const rule: InvalidationRule = {
      pattern: keyPattern,
      dependencies,
      cascade,
    };

    await this.redisService.client.hSet(
      this.RULES_KEY,
      keyPattern,
      JSON.stringify(rule),
    );
    this.logger.log(`Added invalidation rule for pattern: ${keyPattern}`);
  }

  /**
   * Remove invalidation rule
   */
  async removeInvalidationRule(keyPattern: string): Promise<void> {
    await this.redisService.client.hDel(this.RULES_KEY, keyPattern);
    this.logger.log(`Removed invalidation rule for pattern: ${keyPattern}`);
  }

  /**
   * Invalidate based on rules when dependency changes
   */
  async invalidateDependents(key: string, reason?: string): Promise<string[]> {
    const rules = await this.getInvalidationRules();
    const affectedKeys: string[] = [];

    for (const [pattern, rule] of Object.entries(rules)) {
      if (rule.dependencies.includes(key)) {
        if (rule.pattern.includes('*')) {
          // Pattern-based invalidation
          const count = await this.invalidatePatternLocally(rule.pattern);
          this.logger.log(
            `Invalidated ${count} keys matching pattern: ${rule.pattern}`,
          );
        } else {
          // Direct key invalidation
          await this.cacheService.delete(rule.pattern);
          affectedKeys.push(rule.pattern);
        }

        // Cascade invalidation if configured
        if (rule.cascade) {
          const cascaded = await this.invalidateDependents(
            rule.pattern,
            `cascade from ${key}`,
          );
          affectedKeys.push(...cascaded);
        }
      }
    }

    if (affectedKeys.length > 0) {
      await this.broadcastDependentInvalidation(key, affectedKeys, reason);
    }

    return affectedKeys;
  }

  // ==================== BATCH INVALIDATION ====================

  /**
   * Batch invalidate multiple keys with transaction
   */
  async invalidateBatch(keys: string[], reason?: string): Promise<void> {
    const message: InvalidationMessage = {
      type: 'key',
      target: keys.join(','),
      timestamp: Date.now(),
      source: this.instanceId,
      reason: reason
        ? `${reason} (batch:${keys.length})`
        : `batch:${keys.length}`,
    };

    await this.broadcastInvalidation(message);

    // Use pipeline for efficiency
    const pipeline = this.redisService.client.multi();
    for (const key of keys) {
      pipeline.del(`cache:${key}`);
    }
    await pipeline.exec();

    this.logger.log(
      `Invalidated batch of ${keys.length} keys${reason ? ` (${reason})` : ''}`,
    );
  }

  /**
   * Invalidate by multiple tags
   */
  async invalidateByTags(tags: string[], reason?: string): Promise<number> {
    let totalDeleted = 0;

    for (const tag of tags) {
      await this.invalidateByTag(tag, reason);
      totalDeleted++; // invalidateByTag doesn't return count
    }

    return totalDeleted;
  }

  // ==================== TIME-BASED INVALIDATION ====================

  /**
   * Schedule invalidation for specific time
   */
  async scheduleInvalidation(
    key: string,
    delayMs: number,
    reason?: string,
  ): Promise<void> {
    const timestamp = Date.now() + delayMs;
    const message = JSON.stringify({
      key,
      timestamp,
      reason,
      source: this.instanceId,
    });

    await this.redisService.client.zAdd('cache:invalidation:schedule', {
      score: timestamp,
      value: message,
    });
    this.logger.log(
      `Scheduled invalidation for ${key} at ${new Date(timestamp).toISOString()}`,
    );
  }

  /**
   * Process scheduled invalidations
   */
  async processScheduledInvalidations(): Promise<void> {
    const now = Date.now();
    const expired = await this.redisService.client.zRangeByScore(
      'cache:invalidation:schedule',
      0,
      now,
    );

    if (expired.length === 0) return;

    const pipeline = this.redisService.client.multi();
    const keysToDelete: string[] = [];

    for (const item of expired) {
      const { key, reason } = JSON.parse(item);
      keysToDelete.push(key);
      pipeline.zRem('cache:invalidation:schedule', item);
    }

    await pipeline.exec();

    if (keysToDelete.length > 0) {
      await this.invalidateBatch(keysToDelete, 'scheduled');
      this.logger.log(
        `Processed ${keysToDelete.length} scheduled invalidations`,
      );
    }
  }

  // ==================== METRICS ====================

  /**
   * Get invalidation statistics
   */
  async getInvalidationStats(): Promise<any> {
    try {
      const [totalInvalidations, pendingSchedules] = await Promise.all([
        this.redisService.client
          .get('cache:stats:invalidations:total')
          .then((v) => parseInt((v as string) || '0', 10)),
        this.redisService.client
          .zCard('cache:invalidation:schedule')
          .then((count) => parseInt(count.toString(), 10)),
      ]);

      const recentInvalidations = await this.redisService.client.lRange(
        'cache:stats:invalidations:recent',
        0,
        49,
      );

      return {
        totalInvalidations,
        pendingSchedules,
        recentInvalidations: recentInvalidations.map((item) =>
          JSON.parse(item),
        ),
      };
    } catch (error) {
      this.logger.error(`Error getting invalidation stats: ${error.message}`);
      return {
        totalInvalidations: 0,
        pendingSchedules: 0,
        recentInvalidations: [],
      };
    }
  }

  // ==================== PRIVATE METHODS ====================

  private async setupPubSub(): Promise<void> {
    // Type assertion to handle Redis client subscribe method
    await (this.redisService.subClient as any).subscribe(
      this.INVALIDATION_CHANNEL,
    );

    this.redisService.subClient.on('message', async (channel, message) => {
      if (channel === this.INVALIDATION_CHANNEL) {
        await this.handleInvalidationMessage(message);
      }
    });

    // Process scheduled invalidations every minute
    setInterval(() => {
      this.processScheduledInvalidations().catch((error) => {
        this.logger.error(
          `Error processing scheduled invalidations: ${error.message}`,
        );
      });
    }, 60000);
  }

  private async handleInvalidationMessage(message: string): Promise<void> {
    try {
      const msg: InvalidationMessage = JSON.parse(message);

      // Skip messages from self
      if (msg.source === this.instanceId) {
        return;
      }

      this.logger.debug(
        `Received invalidation message: ${msg.type} ${msg.target}`,
      );

      switch (msg.type) {
        case 'key':
          if (msg.target.includes(',')) {
            // Batch invalidation
            const keys = msg.target.split(',');
            await this.invalidateBatchLocally(keys);
          } else {
            await this.cacheService.delete(msg.target);
          }
          break;
        case 'tag':
          await this.cacheService.deleteByTag(msg.target);
          break;
        case 'pattern':
          await this.invalidatePatternLocally(msg.target);
          break;
        case 'clear':
          await this.cacheService.clear();
          break;
      }

      // Record statistic
      await this.recordInvalidationStat(msg);
    } catch (error) {
      this.logger.error(
        `Error handling invalidation message: ${error.message}`,
      );
    }
  }

  private async broadcastInvalidation(
    message: InvalidationMessage,
  ): Promise<void> {
    try {
      await this.redisService.pubClient.publish(
        this.INVALIDATION_CHANNEL,
        JSON.stringify(message),
      );
    } catch (error) {
      this.logger.error(`Error broadcasting invalidation: ${error.message}`);
    }
  }

  private async broadcastDependentInvalidation(
    sourceKey: string,
    affectedKeys: string[],
    reason?: string,
  ): Promise<void> {
    const message: InvalidationMessage = {
      type: 'key',
      target: affectedKeys.join(','),
      timestamp: Date.now(),
      source: this.instanceId,
      reason: reason
        ? `${reason} (dependent of ${sourceKey})`
        : `dependent of ${sourceKey}`,
    };

    await this.broadcastInvalidation(message);
  }

  private async invalidateBatchLocally(keys: string[]): Promise<void> {
    const pipeline = this.redisService.client.multi();
    for (const key of keys) {
      pipeline.del(`cache:${key}`);
    }
    await pipeline.exec();
  }

  private async invalidatePatternLocally(pattern: string): Promise<number> {
    const redisPattern = pattern.startsWith('cache:')
      ? pattern
      : `cache:${pattern}`;
    const keys = await this.redisService.client.keys(redisPattern);

    if (keys.length === 0) return 0;

    const cleanKeys = keys.map((key) => key.replace('cache:', ''));
    await this.invalidateBatchLocally(cleanKeys);
    return keys.length;
  }

  private async loadInvalidationRules(): Promise<void> {
    try {
      const ruleKeys = await this.redisService.client.hKeys(this.RULES_KEY);
      this.logger.log(`Loaded ${ruleKeys.length} invalidation rules`);
    } catch (error) {
      this.logger.error(`Error loading invalidation rules: ${error.message}`);
    }
  }

  private async getInvalidationRules(): Promise<
    Record<string, InvalidationRule>
  > {
    try {
      const rules = await this.redisService.client.hGetAll(this.RULES_KEY);
      const parsedRules: Record<string, InvalidationRule> = {};

      for (const [key, value] of Object.entries(rules)) {
        parsedRules[key] = JSON.parse(value);
      }

      return parsedRules;
    } catch (error) {
      this.logger.error(`Error getting invalidation rules: ${error.message}`);
      return {};
    }
  }

  private async recordInvalidationStat(
    message: InvalidationMessage,
  ): Promise<void> {
    try {
      await Promise.all([
        this.redisService.client.incr('cache:stats:invalidations:total'),
        this.redisService.client.lPush(
          'cache:stats:invalidations:recent',
          JSON.stringify({
            type: message.type,
            target: message.target,
            timestamp: message.timestamp,
            source: message.source,
            reason: message.reason,
          }),
        ),
        this.redisService.client.lTrim(
          'cache:stats:invalidations:recent',
          0,
          49,
        ),
      ]);
    } catch (error) {
      this.logger.error(`Error recording invalidation stat: ${error.message}`);
    }
  }
}
