// backend/src/auth/services/rate-limit.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { Redis } from 'ioredis'; // Or your active Redis wrapper provider

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  
  // Define atomic Lua script to run evaluation natively inside Redis engine memory
  private readonly rateLimitLuaScript = `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])

    local current = redis.call('get', key)
    if current and tonumber(current) >= limit then
        return 0
    else
        current = redis.call('incr', key)
        if tonumber(current) == 1 then
            redis.call('expire', key, window)
        end
        return 1
    end
  `;

  constructor(private readonly redisClient: Redis) {}

  /**
   * Assesses an incoming request's rate eligibility atomically.
   * Enforces a fail-closed policy on Redis network disruptions to safeguard auth targets.
   */
  async checkRateLimit(ip: string, route: string, limit = 5, windowInSeconds = 60): Promise<boolean> {
    const cacheKey = `rate_limit:${route}:${ip}`;

    try {
      // Execute the evaluation atomically inside Redis
      const result = await this.redisClient.eval(
        this.rateLimitLuaScript,
        1, // Number of keys
        cacheKey,
        limit.toString(),
        windowInSeconds.toString()
      );

      return result === 1;
    } catch (redisError) {
      this.logger.error(`Redis connection failure on key [${cacheKey}]:`, redisError);

      // CRITICAL SECURITY REFACTOR: Fail Closed for sensitive authentication paths
      if (route.includes('/auth') || route.includes('/login') || route.includes('/register')) {
        this.logger.warn(`Fail-Closed policy enforced on sensitive route: ${route}. Blocking request.`);
        throw new InternalServerErrorException('Security verification infrastructure temporarily unavailable.');
      }

      // Fail Open gracefully for non-sensitive public routes (e.g., public content feeds)
      this.logger.warn(`Fail-Open policy fallback for public route: ${route}. Allowing request.`);
      return true;
    }
  }
}