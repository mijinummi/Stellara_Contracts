import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  tokensPerMinute: number;
  tokensPerHour: number;
  costPerMinute: number;
  costPerHour: number;
  burstLimit: number; // Maximum requests in a burst
  burstWindowMs: number; // Window for burst detection (ms)
}

export interface RateLimitStatus {
  userId: string;
  minute: {
    requests: number;
    tokens: number;
    cost: number;
  };
  hour: {
    requests: number;
    tokens: number;
    cost: number;
  };
  burst: {
    requests: number;
    windowStart: Date;
    windowEnd: Date;
  };
  limits: RateLimitConfig;
  canMakeRequest: boolean;
}

interface LimitExceeded {
  type: 'rpm' | 'rph' | 'tpm' | 'tph' | 'cpm' | 'cph' | 'burst';
  current: number;
  limit: number;
}

export interface RateLimitExceededEvent {
  userId: string;
  limitType: 'rpm' | 'rph' | 'tpm' | 'tph' | 'cpm' | 'cph' | 'burst';
  current: number;
  limit: number;
  timestamp: Date;
}

@Injectable()
export class AdvancedRateLimitService {
  private readonly logger = new Logger(AdvancedRateLimitService.name);
  private readonly DEFAULT_LIMITS: RateLimitConfig = {
    requestsPerMinute: 20,
    requestsPerHour: 1000,
    tokensPerMinute: 100000,
    tokensPerHour: 1000000,
    costPerMinute: 1.0, // $1 per minute
    costPerHour: 50.0, // $50 per hour
    burstLimit: 5,
    burstWindowMs: 10000, // 10 seconds
  };

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async checkRateLimit(
    userId: string,
    tokens: number = 0,
    cost: number = 0,
    customLimits?: Partial<RateLimitConfig>
  ): Promise<RateLimitStatus> {
    const limits = { ...this.DEFAULT_LIMITS, ...customLimits };
    const now = new Date();
    const minuteKey = this.getMinuteKey(now);
    const hourKey = this.getHourKey(now);

    // Get current usage
    const minuteUsage = await this.getUsage(userId, minuteKey);
    const hourUsage = await this.getUsage(userId, hourKey);
    const burstStatus = await this.checkBurstLimit(userId, limits);

    // Check all limits
    const limitsExceeded: LimitExceeded[] = [];

    // Requests per minute
    if (minuteUsage.requests >= limits.requestsPerMinute) {
      limitsExceeded.push({
        type: 'rpm',
        current: minuteUsage.requests,
        limit: limits.requestsPerMinute,
      });
    }

    // Requests per hour
    if (hourUsage.requests >= limits.requestsPerHour) {
      limitsExceeded.push({
        type: 'rph',
        current: hourUsage.requests,
        limit: limits.requestsPerHour,
      });
    }

    // Tokens per minute
    if (minuteUsage.tokens >= limits.tokensPerMinute) {
      limitsExceeded.push({
        type: 'tpm',
        current: minuteUsage.tokens,
        limit: limits.tokensPerMinute,
      });
    }

    // Tokens per hour
    if (hourUsage.tokens >= limits.tokensPerHour) {
      limitsExceeded.push({
        type: 'tph',
        current: hourUsage.tokens,
        limit: limits.tokensPerHour,
      });
    }

    // Cost per minute
    if (minuteUsage.cost >= limits.costPerMinute) {
      limitsExceeded.push({
        type: 'cpm',
        current: minuteUsage.cost,
        limit: limits.costPerMinute,
      });
    }

    // Cost per hour
    if (hourUsage.cost >= limits.costPerHour) {
      limitsExceeded.push({
        type: 'cph',
        current: hourUsage.cost,
        limit: limits.costPerHour,
      });
    }

    // Burst limit
    if (burstStatus.requests >= limits.burstLimit) {
      limitsExceeded.push({
        type: 'burst',
        current: burstStatus.requests,
        limit: limits.burstLimit,
      });
    }

    const canMakeRequest = limitsExceeded.length === 0;

    // Emit events for exceeded limits
    if (!canMakeRequest) {
      limitsExceeded.forEach(limit => {
        const event: RateLimitExceededEvent = {
          userId,
          limitType: limit.type,
          current: limit.current,
          limit: limit.limit,
          timestamp: now,
        };
        this.eventEmitter.emit('rate-limit.exceeded', event);
        this.logger.warn(`Rate limit exceeded for user ${userId}: ${limit.type} ${limit.current}/${limit.limit}`);
      });
    }

    return {
      userId,
      minute: minuteUsage,
      hour: hourUsage,
      burst: burstStatus,
      limits,
      canMakeRequest,
    };
  }

  async recordRequest(
    userId: string,
    tokens: number,
    cost: number
  ): Promise<void> {
    const now = new Date();
    const minuteKey = this.getMinuteKey(now);
    const hourKey = this.getHourKey(now);

    // Record in both minute and hour windows
    await this.incrementUsage(userId, minuteKey, 1, tokens, cost);
    await this.incrementUsage(userId, hourKey, 1, tokens, cost);
    
    // Record for burst detection
    await this.recordBurstRequest(userId);

    this.logger.debug(`Recorded request for user ${userId}: ${tokens} tokens, $${cost}`);
  }

  async resetUserRateLimit(userId: string): Promise<void> {
    const pattern = `ai:ratelimit:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    this.logger.log(`Reset rate limit for user ${userId}`);
  }

  async getUserRateLimitConfig(userId: string): Promise<RateLimitConfig> {
    const key = `ai:ratelimit:config:${userId}`;
    const config = await this.redis.get(key);
    
    if (config) {
      return { ...this.DEFAULT_LIMITS, ...JSON.parse(config) };
    }
    
    return this.DEFAULT_LIMITS;
  }

  async setUserRateLimitConfig(userId: string, config: Partial<RateLimitConfig>): Promise<void> {
    const key = `ai:ratelimit:config:${userId}`;
    await this.redis.set(key, JSON.stringify(config), 'EX', 2592000); // 30 days
    this.logger.log(`Set custom rate limit config for user ${userId}`);
  }

  async getUserCurrentRateLimit(userId: string): Promise<RateLimitStatus> {
    const config = await this.getUserRateLimitConfig(userId);
    return this.checkRateLimit(userId, 0, 0, config);
  }

  async getRateLimitStats(userId: string): Promise<any> {
    const now = new Date();
    const minuteKey = this.getMinuteKey(now);
    const hourKey = this.getHourKey(now);

    const minuteUsage = await this.getUsage(userId, minuteKey);
    const hourUsage = await this.getUsage(userId, hourKey);
    const burstStatus = await this.getBurstStatus(userId);

    return {
      minute: {
        usage: minuteUsage,
        percentage: {
          requests: (minuteUsage.requests / this.DEFAULT_LIMITS.requestsPerMinute) * 100,
          tokens: (minuteUsage.tokens / this.DEFAULT_LIMITS.tokensPerMinute) * 100,
          cost: (minuteUsage.cost / this.DEFAULT_LIMITS.costPerMinute) * 100,
        }
      },
      hour: {
        usage: hourUsage,
        percentage: {
          requests: (hourUsage.requests / this.DEFAULT_LIMITS.requestsPerHour) * 100,
          tokens: (hourUsage.tokens / this.DEFAULT_LIMITS.tokensPerHour) * 100,
          cost: (hourUsage.cost / this.DEFAULT_LIMITS.costPerHour) * 100,
        }
      },
      burst: burstStatus
    };
  }

  private async getUsage(userId: string, timeKey: string): Promise<{ requests: number; tokens: number; cost: number }> {
    const key = `ai:ratelimit:${userId}:${timeKey}`;
    const data = await this.redis.hgetall(key);
    
    return {
      requests: parseInt(data.requests || '0', 10),
      tokens: parseInt(data.tokens || '0', 10),
      cost: parseFloat(data.cost || '0'),
    };
  }

  private async incrementUsage(
    userId: string,
    timeKey: string,
    requests: number,
    tokens: number,
    cost: number
  ): Promise<void> {
    const key = `ai:ratelimit:${userId}:${timeKey}`;
    const pipe = this.redis.pipeline();
    
    pipe.hincrby(key, 'requests', requests);
    pipe.hincrby(key, 'tokens', tokens);
    pipe.hincrbyfloat(key, 'cost', cost);
    
    // Set TTL based on the time unit (1 day for hours, 1 hour for minutes)
    const ttl = timeKey.includes('hour') ? 86400 : 3600;
    pipe.expire(key, ttl);
    
    await pipe.exec();
  }

  private async checkBurstLimit(userId: string, limits: RateLimitConfig): Promise<{
    requests: number;
    windowStart: Date;
    windowEnd: Date;
  }> {
    const key = `ai:ratelimit:burst:${userId}`;
    const now = Date.now();
    const windowStart = now - limits.burstWindowMs;
    
    // Get requests in the burst window
    const requests = await this.redis.zrangebyscore(key, windowStart, now);
    const requestCount = requests.length;
    
    return {
      requests: requestCount,
      windowStart: new Date(windowStart),
      windowEnd: new Date(now),
    };
  }

  private async recordBurstRequest(userId: string): Promise<void> {
    const key = `ai:ratelimit:burst:${userId}`;
    const now = Date.now();
    
    const pipe = this.redis.pipeline();
    pipe.zadd(key, now.toString(), `${userId}:${now}`);
    pipe.zremrangebyscore(key, 0, now - 60000); // Remove entries older than 1 minute
    pipe.expire(key, 60); // Expire key after 1 minute
    
    await pipe.exec();
  }

  private async getBurstStatus(userId: string): Promise<any> {
    const key = `ai:ratelimit:burst:${userId}`;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const requests = await this.redis.zrangebyscore(key, oneMinuteAgo, now);
    
    return {
      requests: requests.length,
      timeframe: 'last_minute',
    };
  }

  private getMinuteKey(date: Date): string {
    return `minute:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private getHourKey(date: Date): string {
    return `hour:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
  }
}