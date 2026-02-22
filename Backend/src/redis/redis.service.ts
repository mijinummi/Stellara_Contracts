import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client!: RedisClientType;
  public pubClient!: RedisClientType;
  public subClient!: RedisClientType;
  private isConnected = false;

  async onModuleInit() {
    try {
      const url =
        process.env.REDIS_URL ||
        `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

      this.client = createClient({ url });
      this.pubClient = createClient({ url });
      this.subClient = createClient({ url });

      await Promise.all([
        this.client.connect(),
        this.pubClient.connect(),
        this.subClient.connect(),
      ]);
      this.isConnected = true;
      this.logger.log('Redis connected successfully');
    } catch (error) {
      this.logger.warn('Redis connection failed, using in-memory mock');
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await Promise.all([
        this.client.quit(),
        this.pubClient.quit(),
        this.subClient.quit(),
      ]);
    }
  }

  isRedisAvailable(): boolean {
    return this.isConnected;
  }
}
