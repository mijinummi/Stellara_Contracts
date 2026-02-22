import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CacheService } from './cache.service';
import { RedisService } from '../redis/redis.service';
// import { CacheConfigurationService } from './cache-configuration.service';

export interface WarmupEntry {
  key: string;
  loader: () => Promise<any>;
  ttl?: number;
  priority: 'high' | 'medium' | 'low';
  schedule?: 'startup' | 'hourly' | 'daily' | 'weekly';
  tags?: string[];
}

export interface WarmupGroup {
  name: string;
  entries: WarmupEntry[];
  enabled: boolean;
  lastRun?: number;
  successCount?: number;
  errorCount?: number;
}

export interface WarmupSchedule {
  groupId: string;
  cronExpression: string;
  enabled: boolean;
}

@Injectable()
export class CacheWarmingService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmingService.name);
  private readonly WARMUP_GROUPS_KEY = 'cache:warmup:groups';
  private readonly WARMUP_SCHEDULES_KEY = 'cache:warmup:schedules';
  private warmupGroups: Map<string, WarmupGroup> = new Map();
  private isWarmingUp = false;

  constructor(
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
    // private readonly configService: CacheConfigurationService,
  ) {}

  async onModuleInit() {
    await this.loadWarmupGroups();
    await this.loadWarmupSchedules();
    this.logger.log('CacheWarmingService initialized');
  }

  // ==================== WARMUP GROUP MANAGEMENT ====================

  /**
   * Register a new warmup group
   */
  async registerWarmupGroup(group: WarmupGroup): Promise<void> {
    this.warmupGroups.set(group.name, group);
    await this.saveWarmupGroup(group);
    this.logger.log(
      `Registered warmup group: ${group.name} (${group.entries.length} entries)`,
    );
  }

  /**
   * Get warmup group by name
   */
  getWarmupGroup(name: string): WarmupGroup | undefined {
    return this.warmupGroups.get(name);
  }

  /**
   * Get all warmup groups
   */
  getAllWarmupGroups(): WarmupGroup[] {
    return Array.from(this.warmupGroups.values());
  }

  /**
   * Enable/disable warmup group
   */
  async setWarmupGroupEnabled(name: string, enabled: boolean): Promise<void> {
    const group = this.warmupGroups.get(name);
    if (group) {
      group.enabled = enabled;
      await this.saveWarmupGroup(group);
      this.logger.log(
        `Warmup group ${name} ${enabled ? 'enabled' : 'disabled'}`,
      );
    }
  }

  // ==================== WARMUP EXECUTION ====================

  /**
   * Execute warmup for specific group
   */
  async warmupGroup(
    groupName: string,
  ): Promise<{ success: number; failed: number; duration: number }> {
    if (this.isWarmingUp) {
      this.logger.warn(
        `Warmup already in progress, skipping group: ${groupName}`,
      );
      return { success: 0, failed: 0, duration: 0 };
    }

    const group = this.warmupGroups.get(groupName);
    if (!group || !group.enabled) {
      this.logger.log(`Warmup group ${groupName} not found or disabled`);
      return { success: 0, failed: 0, duration: 0 };
    }

    this.isWarmingUp = true;
    const startTime = Date.now();
    let successCount = 0;
    let failedCount = 0;

    try {
      this.logger.log(
        `Starting warmup for group: ${groupName} (${group.entries.length} entries)`,
      );

      // Sort by priority
      const sortedEntries = [...group.entries].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Execute warmup entries
      for (const entry of sortedEntries) {
        try {
          await this.warmupEntry(entry);
          successCount++;
        } catch (error) {
          this.logger.error(
            `Warmup failed for key ${entry.key}: ${error.message}`,
          );
          failedCount++;
        }
      }

      const duration = Date.now() - startTime;
      group.lastRun = Date.now();
      group.successCount = successCount;
      group.errorCount = failedCount;

      await this.saveWarmupGroup(group);

      this.logger.log(
        `Warmup completed for group ${groupName}: ${successCount} success, ${failedCount} failed in ${duration}ms`,
      );

      return { success: successCount, failed: failedCount, duration };
    } finally {
      this.isWarmingUp = false;
    }
  }

  /**
   * Warm up specific entry
   */
  async warmupEntry(entry: WarmupEntry): Promise<void> {
    try {
      const data = await entry.loader();
      if (data !== undefined && data !== null) {
        await this.cacheService.set(entry.key, data, {
          ttl: entry.ttl,
          tags: entry.tags,
          strategy: 'cache-aside',
        });
        this.logger.debug(`Warmed up key: ${entry.key}`);
      }
    } catch (error) {
      this.logger.error(`Failed to warm up key ${entry.key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Force warmup of specific key
   */
  async warmupKey(
    key: string,
    loader: () => Promise<any>,
    ttl?: number,
  ): Promise<void> {
    const entry: WarmupEntry = {
      key,
      loader,
      ttl,
      priority: 'high',
      schedule: 'startup',
    };

    await this.warmupEntry(entry);
    this.logger.log(`Forced warmup completed for key: ${key}`);
  }

  // ==================== SCHEDULED WARMUP ====================

  /**
   * Add scheduled warmup
   */
  async addScheduledWarmup(
    groupId: string,
    cronExpression: string,
  ): Promise<void> {
    const schedule: WarmupSchedule = {
      groupId,
      cronExpression,
      enabled: true,
    };

    await this.redisService.client.hSet(
      this.WARMUP_SCHEDULES_KEY,
      groupId,
      JSON.stringify(schedule),
    );

    this.logger.log(
      `Added scheduled warmup for group ${groupId} with cron: ${cronExpression}`,
    );
  }

  /**
   * Remove scheduled warmup
   */
  async removeScheduledWarmup(groupId: string): Promise<void> {
    await this.redisService.client.hDel(this.WARMUP_SCHEDULES_KEY, groupId);
    this.logger.log(`Removed scheduled warmup for group ${groupId}`);
  }

  /**
   * Hourly warmup job
   */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlyWarmup(): Promise<void> {
    // if (!this.configService.getCacheConfig().scheduledWarmupEnabled) return;
    await this.executeScheduledWarmups('hourly');
  }

  /**
   * Daily warmup job
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyWarmup(): Promise<void> {
    // if (!this.configService.getCacheConfig().scheduledWarmupEnabled) return;
    await this.executeScheduledWarmups('daily');
  }

  /**
   * Weekly warmup job
   */
  @Cron('0 0 * * 0') // Every Sunday at midnight
  async weeklyWarmup(): Promise<void> {
    // if (!this.configService.getCacheConfig().scheduledWarmupEnabled) return;
    await this.executeScheduledWarmups('weekly');
  }

  // ==================== BATCH WARMUP ====================

  /**
   * Warm up multiple entries in parallel
   */
  async warmupBatch(
    entries: WarmupEntry[],
  ): Promise<{ success: number; failed: number }> {
    this.logger.log(`Starting batch warmup for ${entries.length} entries`);

    const results = await Promise.allSettled(
      entries.map((entry) => this.warmupEntry(entry)),
    );

    const successCount = results.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    const failedCount = results.filter(
      (result) => result.status === 'rejected',
    ).length;

    this.logger.log(
      `Batch warmup completed: ${successCount} success, ${failedCount} failed`,
    );
    return { success: successCount, failed: failedCount };
  }

  /**
   * Warm up by tag
   */
  async warmupByTag(tag: string): Promise<number> {
    let warmedCount = 0;

    for (const group of this.warmupGroups.values()) {
      if (!group.enabled) continue;

      const taggedEntries = group.entries.filter((entry) =>
        entry.tags?.includes(tag),
      );
      if (taggedEntries.length > 0) {
        const result = await this.warmupBatch(taggedEntries);
        warmedCount += result.success;
      }
    }

    this.logger.log(`Warmed up ${warmedCount} entries for tag: ${tag}`);
    return warmedCount;
  }

  // ==================== MONITORING ====================

  /**
   * Get warmup statistics
   */
  async getWarmupStats(): Promise<any> {
    const groups = this.getAllWarmupGroups();
    const totalEntries = groups.reduce(
      (sum, group) => sum + group.entries.length,
      0,
    );

    const recentRuns = await this.redisService.client.lRange(
      'cache:warmup:runs',
      0,
      9,
    );

    return {
      totalGroups: groups.length,
      totalEntries,
      enabledGroups: groups.filter((g) => g.enabled).length,
      recentRuns: recentRuns.map((run) => JSON.parse(run)),
      isWarmingUp: this.isWarmingUp,
    };
  }

  /**
   * Get warmup group details
   */
  async getWarmupGroupDetails(groupName: string): Promise<any> {
    const group = this.getWarmupGroup(groupName);
    if (!group) return null;

    const entryStats = await Promise.all(
      group.entries.map(async (entry) => {
        try {
          const exists = await this.cacheService.get(
            entry.key,
            async () => null,
          );
          return {
            key: entry.key,
            priority: entry.priority,
            schedule: entry.schedule,
            cached: exists !== null,
            tags: entry.tags,
          };
        } catch (error) {
          return {
            key: entry.key,
            priority: entry.priority,
            schedule: entry.schedule,
            cached: false,
            error: error.message,
            tags: entry.tags,
          };
        }
      }),
    );

    return {
      ...group,
      entryStats,
    };
  }

  // ==================== PRIVATE METHODS ====================

  private async loadWarmupGroups(): Promise<void> {
    try {
      const groups = await this.redisService.client.hGetAll(
        this.WARMUP_GROUPS_KEY,
      );

      for (const [name, groupJson] of Object.entries(groups)) {
        const group: WarmupGroup = JSON.parse(groupJson as string);
        this.warmupGroups.set(name, group);
      }

      this.logger.log(`Loaded ${this.warmupGroups.size} warmup groups`);
    } catch (error) {
      this.logger.error(`Error loading warmup groups: ${error.message}`);
    }
  }

  private async saveWarmupGroup(group: WarmupGroup): Promise<void> {
    try {
      await this.redisService.client.hSet(
        this.WARMUP_GROUPS_KEY,
        group.name,
        JSON.stringify(group),
      );
    } catch (error) {
      this.logger.error(
        `Error saving warmup group ${group.name}: ${error.message}`,
      );
    }
  }

  private async loadWarmupSchedules(): Promise<void> {
    // Schedules are handled by NestJS Cron decorators
    // This method is for future extension
  }

  private async executeScheduledWarmups(
    scheduleType: 'hourly' | 'daily' | 'weekly',
  ): Promise<void> {
    let executedCount = 0;

    for (const group of this.warmupGroups.values()) {
      if (!group.enabled) continue;

      const scheduledEntries = group.entries.filter(
        (entry) => entry.schedule === scheduleType,
      );
      if (scheduledEntries.length > 0) {
        try {
          const result = await this.warmupBatch(scheduledEntries);
          executedCount += result.success;
        } catch (error) {
          this.logger.error(
            `Scheduled warmup failed for group ${group.name}: ${error.message}`,
          );
        }
      }
    }

    if (executedCount > 0) {
      await this.recordWarmupRun(scheduleType, executedCount);
      this.logger.log(
        `Executed scheduled ${scheduleType} warmup for ${executedCount} entries`,
      );
    }
  }

  private async recordWarmupRun(
    scheduleType: string,
    entryCount: number,
  ): Promise<void> {
    const runRecord = {
      timestamp: Date.now(),
      scheduleType,
      entryCount,
      instanceId: process.env.HOSTNAME || 'unknown',
    };

    await Promise.all([
      this.redisService.client.lPush(
        'cache:warmup:runs',
        JSON.stringify(runRecord),
      ),
      this.redisService.client.lTrim('cache:warmup:runs', 0, 99),
    ]);
  }

  // Mock redisService for now - will be injected properly
  // This is kept for backward compatibility - now uses proper injection above
  // private get redisService(): any {
  //   return {
  //     client: {
  //       hGetAll: async () => ({}),
  //       hSet: async () => {},
  //       hDel: async () => {},
  //       lRange: async () => [],
  //       lPush: async () => {},
  //       lTrim: async () => {},
  //     },
  //   };
  // }
}
