import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface QuotaConfig {
  monthlyRequestLimit: number;
  monthlyTokenLimit: number;
  monthlyCostLimit: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  dailyCostLimit: number;
  perSessionRequestLimit: number;
  perSessionTokenLimit: number;
  perSessionCostLimit: number;
}

export interface UserQuota {
  userId: string;
  monthly: {
    requests: number;
    tokens: number;
    cost: number;
  };
  daily: {
    requests: number;
    tokens: number;
    cost: number;
  };
  session: {
    requests: number;
    tokens: number;
    cost: number;
  };
}

export interface QuotaUsage {
  userId: string;
  sessionId?: string;
  requests: number;
  tokens: number;
  cost: number;
  period: 'monthly' | 'daily' | 'session';
}

export interface QuotaExceededEvent {
  userId: string;
  sessionId?: string;
  quotaType: 'requests' | 'tokens' | 'cost';
  limit: number;
  usage: number;
  period: 'monthly' | 'daily' | 'session';
  timestamp: Date;
}

@Injectable()
export class AdvancedQuotaService {
  private readonly logger = new Logger(AdvancedQuotaService.name);
  private readonly DEFAULT_QUOTA: QuotaConfig = {
    monthlyRequestLimit: 1000,
    monthlyTokenLimit: 1000000,
    monthlyCostLimit: 100, // $100
    dailyRequestLimit: 100,
    dailyTokenLimit: 100000,
    dailyCostLimit: 10, // $10
    perSessionRequestLimit: 50,
    perSessionTokenLimit: 50000,
    perSessionCostLimit: 5, // $5
  };

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async enforceQuota(
    userId: string,
    sessionId?: string,
    quotaConfig?: Partial<QuotaConfig>
  ): Promise<UserQuota> {
    const config = { ...this.DEFAULT_QUOTA, ...quotaConfig };
    const now = new Date();
    const monthKey = this.getMonthKey(now);
    const dayKey = this.getDayKey(now);
    
    const monthlyUsage = await this.getUsage(userId, monthKey);
    const dailyUsage = await this.getUsage(userId, dayKey);
    let sessionUsage = { requests: 0, tokens: 0, cost: 0 };

    if (sessionId) {
      sessionUsage = await this.getSessionUsage(sessionId);
    }

    // Check monthly limits
    this.checkLimit('monthly', 'requests', monthlyUsage.requests, config.monthlyRequestLimit, userId, sessionId);
    this.checkLimit('monthly', 'tokens', monthlyUsage.tokens, config.monthlyTokenLimit, userId, sessionId);
    this.checkLimit('monthly', 'cost', monthlyUsage.cost, config.monthlyCostLimit, userId, sessionId);

    // Check daily limits
    this.checkLimit('daily', 'requests', dailyUsage.requests, config.dailyRequestLimit, userId, sessionId);
    this.checkLimit('daily', 'tokens', dailyUsage.tokens, config.dailyTokenLimit, userId, sessionId);
    this.checkLimit('daily', 'cost', dailyUsage.cost, config.dailyCostLimit, userId, sessionId);

    // Check session limits
    if (sessionId) {
      this.checkLimit('session', 'requests', sessionUsage.requests, config.perSessionRequestLimit, userId, sessionId);
      this.checkLimit('session', 'tokens', sessionUsage.tokens, config.perSessionTokenLimit, userId, sessionId);
      this.checkLimit('session', 'cost', sessionUsage.cost, config.perSessionCostLimit, userId, sessionId);
    }

    return {
      userId,
      monthly: monthlyUsage,
      daily: dailyUsage,
      session: sessionUsage,
    };
  }

  async recordUsage(
    userId: string,
    sessionId: string | undefined,
    tokens: number,
    cost: number
  ): Promise<void> {
    const now = new Date();
    const monthKey = this.getMonthKey(now);
    const dayKey = this.getDayKey(now);

    // Record usage in all time periods
    await this.incrementUsage(userId, monthKey, 1, tokens, cost);
    await this.incrementUsage(userId, dayKey, 1, tokens, cost);
    
    if (sessionId) {
      await this.incrementSessionUsage(sessionId, 1, tokens, cost);
    }

    this.logger.debug(`Recorded usage for user ${userId}: ${tokens} tokens, $${cost}`);
  }

  async resetMonthlyQuota(userId: string): Promise<void> {
    const now = new Date();
    const monthKey = this.getMonthKey(now);
    const key = `ai:quota:${userId}:${monthKey}`;
    await this.redis.del(key);
    this.logger.log(`Reset monthly quota for user ${userId}`);
  }

  async resetDailyQuota(userId: string): Promise<void> {
    const now = new Date();
    const dayKey = this.getDayKey(now);
    const key = `ai:quota:${userId}:${dayKey}`;
    await this.redis.del(key);
    this.logger.log(`Reset daily quota for user ${userId}`);
  }

  async resetSessionQuota(sessionId: string): Promise<void> {
    const key = `ai:quota:session:${sessionId}`;
    await this.redis.del(key);
    this.logger.log(`Reset session quota for session ${sessionId}`);
  }

  async setUserQuotaConfig(userId: string, config: Partial<QuotaConfig>): Promise<void> {
    const key = `ai:quota:config:${userId}`;
    await this.redis.set(key, JSON.stringify(config), 'EX', 2592000); // 30 days
    this.logger.log(`Set custom quota config for user ${userId}`);
  }

  async getUserQuotaConfig(userId: string): Promise<QuotaConfig> {
    const key = `ai:quota:config:${userId}`;
    const config = await this.redis.get(key);
    
    if (config) {
      return { ...this.DEFAULT_QUOTA, ...JSON.parse(config) };
    }
    
    return this.DEFAULT_QUOTA;
  }

  async getUserCurrentUsage(userId: string): Promise<UserQuota> {
    const now = new Date();
    const monthKey = this.getMonthKey(now);
    const dayKey = this.getDayKey(now);

    const monthly = await this.getUsage(userId, monthKey);
    const daily = await this.getUsage(userId, dayKey);

    return {
      userId,
      monthly,
      daily,
      session: { requests: 0, tokens: 0, cost: 0 }, // Session usage requires session ID
    };
  }

  async getSessionCurrentUsage(sessionId: string): Promise<Omit<QuotaUsage, 'userId' | 'period'>> {
    return this.getSessionUsage(sessionId);
  }

  private checkLimit(
    period: 'monthly' | 'daily' | 'session',
    type: 'requests' | 'tokens' | 'cost',
    usage: number,
    limit: number,
    userId: string,
    sessionId?: string
  ): void {
    if (usage >= limit) {
      const event: QuotaExceededEvent = {
        userId,
        sessionId,
        quotaType: type,
        limit,
        usage,
        period,
        timestamp: new Date(),
      };

      this.eventEmitter.emit('quota.exceeded', event);
      this.logger.warn(`Quota exceeded for user ${userId}: ${type} ${usage}/${limit} (${period})`);

      throw new Error(`Quota exceeded: ${type} limit of ${limit} reached for ${period} period`);
    }
  }

  private async getUsage(userId: string, periodKey: string): Promise<{ requests: number; tokens: number; cost: number }> {
    const key = `ai:quota:${userId}:${periodKey}`;
    const data = await this.redis.hgetall(key);
    
    return {
      requests: parseInt(data.requests || '0', 10),
      tokens: parseInt(data.tokens || '0', 10),
      cost: parseFloat(data.cost || '0'),
    };
  }

  private async getSessionUsage(sessionId: string): Promise<{ requests: number; tokens: number; cost: number }> {
    const key = `ai:quota:session:${sessionId}`;
    const data = await this.redis.hgetall(key);
    
    return {
      requests: parseInt(data.requests || '0', 10),
      tokens: parseInt(data.tokens || '0', 10),
      cost: parseFloat(data.cost || '0'),
    };
  }

  private async incrementUsage(
    userId: string,
    periodKey: string,
    requests: number,
    tokens: number,
    cost: number
  ): Promise<void> {
    const key = `ai:quota:${userId}:${periodKey}`;
    const pipe = this.redis.pipeline();
    
    pipe.hincrby(key, 'requests', requests);
    pipe.hincrby(key, 'tokens', tokens);
    pipe.hincrbyfloat(key, 'cost', cost);
    
    // Set expiration (35 days for monthly, 2 days for daily)
    const ttl = periodKey.includes('month') ? 3024000 : 172800;
    pipe.expire(key, ttl);
    
    await pipe.exec();
  }

  private async incrementSessionUsage(
    sessionId: string,
    requests: number,
    tokens: number,
    cost: number
  ): Promise<void> {
    const key = `ai:quota:session:${sessionId}`;
    const pipe = this.redis.pipeline();
    
    pipe.hincrby(key, 'requests', requests);
    pipe.hincrby(key, 'tokens', tokens);
    pipe.hincrbyfloat(key, 'cost', cost);
    
    // Set expiration to 24 hours for session quotas
    pipe.expire(key, 86400);
    
    await pipe.exec();
  }

  private getMonthKey(date: Date): string {
    return `month:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private getDayKey(date: Date): string {
    return `day:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}