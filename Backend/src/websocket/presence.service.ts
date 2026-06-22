import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PresenceService {
  constructor(private readonly redis: RedisService) {}

  async userConnected(userId: string, socketId: string) {
    await this.redis.client.sAdd('presence:online', userId);
    await this.redis.client.set(`user:${userId}:socket`, socketId);
  }

  async userDisconnected(userId: string) {
    await this.redis.client.sRem('presence:online', userId);
    await this.redis.client.del(`user:${userId}:socket`);
  }

  async joinRoom(userId: string, roomId: string) {
    await this.redis.client.sAdd(`room:${roomId}:users`, userId);
  }

  async getRoomUsers(roomId: string): Promise<string[]> {
    return this.redis.client.sMembers(`room:${roomId}:users`);
  }
}
