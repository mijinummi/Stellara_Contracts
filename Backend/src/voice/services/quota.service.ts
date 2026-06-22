import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface QuotaConfig {
  monthlyLimit: number;
  perSessionLimit: number;
  requestsPerMinute: number;
}

export interface QuotaStatus {
  monthlyUsage: number;
  monthlyLimit: number;
  sessionUsage: number;
  sessionLimit: number;
  requestsThisMinute: number;
  requestsPerMinuteLimit: number;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  // Default quota configuration
  private readonly defaultConfig: QuotaConfig = {
    monthlyLimit: 1000,
    perSessionLimit: 100,
    requestsPerMinute: 20,
  };

  // Redis key prefixes
  private readonly MONTHLY_QUOTA_PREFIX = 'quota:monthly:';
  private readonly SESSION_QUOTA_PREFIX = 'quota:session:';
  private readonly RPM_PREFIX = 'quota:rpm:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Enforces quota checks before allowing an LLM request
   * Throws HttpException if any limit is exceeded
   */
  async enforceQuota(
    userId: string,
    sessionId: string,
    config: Partial<QuotaConfig> = {},
  ): Promise<QuotaStatus> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const now = new Date();

    try {
      // Check monthly quota
      await this.checkMonthlyQuota(userId, now, mergedConfig.monthlyLimit);

      // Check session quota
      await this.checkSessionQuota(sessionId, mergedConfig.perSessionLimit);

      // Check requests per minute
      await this.checkRequestsPerMinute(
        userId,
        now,
        mergedConfig.requestsPerMinute,
      );

      // Get current status
      return await this.getQuotaStatus(userId, sessionId, now, mergedConfig);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Unexpected error in quota enforcement: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Quota check failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Gets current quota status without enforcing limits
   */
  async getQuotaStatus(
    userId: string,
    sessionId: string,
    now: Date = new Date(),
    config: Partial<QuotaConfig> = {},
  ): Promise<QuotaStatus> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const monthKey = this.getMonthKey(userId, now);
    const sessionKey = this.getSessionKey(sessionId);
    const rpmKey = this.getRpmKey(userId, now);

    const [monthlyUsage, sessionUsage, rpmUsage] = await Promise.all([
      this.redisService.client
        .get(monthKey)
        .then((v) => parseInt(v || '0', 10)),
      this.redisService.client
        .get(sessionKey)
        .then((v) => parseInt(v || '0', 10)),
      this.redisService.client.get(rpmKey).then((v) => parseInt(v || '0', 10)),
    ]);

    return {
      monthlyUsage,
      monthlyLimit: mergedConfig.monthlyLimit,
      sessionUsage,
      sessionLimit: mergedConfig.perSessionLimit,
      requestsThisMinute: rpmUsage,
      requestsPerMinuteLimit: mergedConfig.requestsPerMinute,
    };
  }

  /**
   * Records a successful LLM request against quotas
   */
  async recordRequest(
    userId: string,
    sessionId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const monthKey = this.getMonthKey(userId, now);
    const sessionKey = this.getSessionKey(sessionId);
    const rpmKey = this.getRpmKey(userId, now);

    try {
      await Promise.all([
        this.incrementWithExpiry(
          monthKey,
          this.getMonthExpiry(now),
          'monthly quota',
        ),
        this.incrementWithExpiry(sessionKey, 604800, 'session quota'), // 7 days
        this.incrementWithExpiry(rpmKey, 60, 'RPM quota'),
      ]);
    } catch (error) {
      this.logger.error(
        `Error recording quota usage: ${error.message}`,
        error.stack,
      );
      // Don't throw - quota recording failure shouldn't block the request
    }
  }

  /**
   * Resets quota for a specific user (admin function)
   */
  async resetUserQuota(userId: string): Promise<void> {
    try {
      const keys = await this.redisService.client.keys(
        `${this.MONTHLY_QUOTA_PREFIX}${userId}:*`,
      );
      if (keys.length > 0) {
        await this.redisService.client.del(keys);
        this.logger.log(`Reset quota for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(
        `Error resetting user quota: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Resets session quota (when session is closed)
   */
  async resetSessionQuota(sessionId: string): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      await this.redisService.client.del(sessionKey);
    } catch (error) {
      this.logger.error(
        `Error resetting session quota: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sets custom quota for a user (admin function)
   */
  async setUserMonthlyQuota(userId: string, limit: number): Promise<void> {
    try {
      const now = new Date();
      const monthKey = this.getMonthKey(userId, now);
      const currentUsage = await this.redisService.client
        .get(monthKey)
        .then((v) => parseInt(v || '0', 10));

      if (currentUsage >= limit) {
        this.logger.warn(
          `Cannot set quota of ${limit} for user ${userId} - current usage is ${currentUsage}`,
        );
      }

      await this.redisService.client.set(
        `${this.MONTHLY_QUOTA_PREFIX}${userId}:limit`,
        limit.toString(),
        { EX: this.getMonthExpiry(now) },
      );
      this.logger.log(`Set monthly quota for user ${userId} to ${limit}`);
    } catch (error) {
      this.logger.error(
        `Error setting user quota: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Gets custom quota for a user, or returns default
   */
  async getUserMonthlyQuota(userId: string): Promise<number> {
    try {
      const now = new Date();
      const limitKey = `${this.MONTHLY_QUOTA_PREFIX}${userId}:limit`;
      const customLimit = await this.redisService.client.get(limitKey);

      if (customLimit) {
        return parseInt(customLimit, 10);
      }
      return this.defaultConfig.monthlyLimit;
    } catch (error) {
      this.logger.error(
        `Error getting user quota: ${error.message}`,
        error.stack,
      );
      return this.defaultConfig.monthlyLimit;
    }
  }

  // ========== PRIVATE HELPERS ==========

  private async checkMonthlyQuota(
    userId: string,
    now: Date,
    limit: number,
  ): Promise<void> {
    const monthKey = this.getMonthKey(userId, now);

    // Try to get custom quota
    const customLimit = await this.redisService.client.get(
      `${this.MONTHLY_QUOTA_PREFIX}${userId}:limit`,
    );
    const effectiveLimit = customLimit ? parseInt(customLimit, 10) : limit;

    const currentUsage = await this.redisService.client.get(monthKey);
    const usage = parseInt(currentUsage || '0', 10);

    if (usage >= effectiveLimit) {
      this.logger.warn(
        `User ${userId} exceeded monthly quota: ${usage}/${effectiveLimit}`,
      );
      throw new HttpException(
        `Monthly LLM quota exceeded (${usage}/${effectiveLimit}). Please try again next month or contact support.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async checkSessionQuota(
    sessionId: string,
    limit: number,
  ): Promise<void> {
    const sessionKey = this.getSessionKey(sessionId);
    const currentUsage = await this.redisService.client.get(sessionKey);
    const usage = parseInt(currentUsage || '0', 10);

    if (usage >= limit) {
      this.logger.warn(
        `Session ${sessionId} exceeded quota: ${usage}/${limit}`,
      );
      throw new HttpException(
        `Session LLM quota exceeded (${usage}/${limit}). Please start a new session.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async checkRequestsPerMinute(
    userId: string,
    now: Date,
    limit: number,
  ): Promise<void> {
    const rpmKey = this.getRpmKey(userId, now);
    const currentUsage = await this.redisService.client.get(rpmKey);
    const usage = parseInt(currentUsage || '0', 10);

    if (usage >= limit) {
      this.logger.warn(`User ${userId} exceeded RPM limit: ${usage}/${limit}`);
      throw new HttpException(
        `Rate limit exceeded. Maximum ${limit} requests per minute.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async incrementWithExpiry(
    key: string,
    ttlSeconds: number,
    label: string,
  ): Promise<void> {
    const client = this.redisService.client;
    const newValue = await client.incr(key);

    // Only set expiry on first increment
    if (newValue === 1) {
      await client.expire(key, ttlSeconds);
    }
  }

  private getMonthKey(userId: string, now: Date): string {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    return `${this.MONTHLY_QUOTA_PREFIX}${userId}:${year}-${month}`;
  }

  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_QUOTA_PREFIX}${sessionId}`;
  }

  private getRpmKey(userId: string, now: Date): string {
    const minuteTimestamp = Math.floor(now.getTime() / 60000);
    return `${this.RPM_PREFIX}${userId}:${minuteTimestamp}`;
  }

  private getMonthExpiry(now: Date): number {
    // Calculate seconds until end of current month
    const nextMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const ttlMs = nextMonth.getTime() - now.getTime();
    return Math.ceil(ttlMs / 1000);
  }
}
