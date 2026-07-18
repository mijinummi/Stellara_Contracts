// backend/src/auth/services/__tests__/rate-limit.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from '../rate-limit.service';
import { Redis } from 'ioredis';
import { InternalServerErrorException } from '@nestjs/common';

describe('RateLimitService #786 Concurrency & Robustness Suite', () => {
  let service: RateLimitService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: Redis,
          useValue: {
            eval: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    mockRedis = module.get(Redis);
  });

  it('guarantees atomic blocking over limits', async () => {
    mockRedis.eval.mockResolvedValue(0); // Emulate Redis blocking limit exceeded
    const isAllowed = await service.checkRateLimit('127.0.0.1', '/auth/login', 5, 60);
    expect(isAllowed).toBe(false);
  });

  it('enforces a strict fail-closed action on critical authentication routes when Redis drops offline', async () => {
    mockRedis.eval.mockRejectedValue(new Error('Redis connection timeout exception'));

    await expect(
      service.checkRateLimit('192.168.1.1', '/auth/login', 5, 60)
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('falls back to a fail-open action on regular standard informational content feeds', async () => {
    mockRedis.eval.mockRejectedValue(new Error('Redis connection timeout exception'));

    const isAllowed = await service.checkRateLimit('192.168.1.1', '/public/announcements', 5, 60);
    expect(isAllowed).toBe(true);
  });
});