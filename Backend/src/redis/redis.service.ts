import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public client!: RedisClientType;
  public pubClient!: RedisClientType;
  public subClient!: RedisClientType;

  async onModuleInit() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    this.client = createClient({ url });
    this.pubClient = createClient({ url });
    this.subClient = createClient({ url });

    await Promise.all([
      this.client.connect(),
      this.pubClient.connect(),
      this.subClient.connect(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.client.quit(),
      this.pubClient.quit(),
      this.subClient.quit(),
    ]);
  }

  /**
   * Cursor-based key scan — safe to use in production (does not block Redis).
   * Returns all keys matching the given glob pattern.
   */
  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const reply = await this.client.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = reply.cursor;
      keys.push(...reply.keys);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Refresh the TTL of an existing key without changing its value.
   * Returns true if the key exists and the TTL was updated.
   */
  async refreshTTL(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }
}

