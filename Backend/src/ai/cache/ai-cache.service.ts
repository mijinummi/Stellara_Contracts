import { Injectable, Inject } from '@nestjs/common';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';

@Injectable()
export class AiCacheService {
  private readonly TTL = 3600;
  private cache = new Map<string, string>();

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis | null) {}

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      return this.redis.get(key);
    }
    return this.cache.get(key) || null;
  }

  async set(key: string, value: string) {
    if (this.redis) {
      await this.redis.set(key, value, 'EX', this.TTL);
    } else {
      this.cache.set(key, value);
    }
  }

  buildKey(input: string, model: string) {
    return `ai:${model}:${createHash('sha256').update(input).digest('hex')}`;
  }
}
