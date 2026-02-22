import { Test, TestingModule } from '@nestjs/testing';
import { CacheInvalidationService } from './cache-invalidation.service';
import { RedisService } from '../redis/redis.service';
import { CacheService } from './cache.service';

describe('CacheInvalidationService', () => {
  let service: CacheInvalidationService;
  let redisService: RedisService;
  let cacheService: CacheService;

  const mockRedisClient = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    hset: jest.fn(),
    hSet: jest.fn(),
    hdel: jest.fn(),
    hGetAll: jest.fn(),
    hgetall: jest.fn(),
    zadd: jest.fn(),
    zAdd: jest.fn(),
    zrangebyscore: jest.fn(),
    zRangeByScore: jest.fn(),
    zrem: jest.fn(),
    zCard: jest.fn(),
    zcard: jest.fn(),
    lrange: jest.fn(),
    lRange: jest.fn(),
    lpush: jest.fn(),
    lTrim: jest.fn(),
    incr: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    multi: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    mget: jest.fn(),
    sAdd: jest.fn(),
    sMembers: jest.fn(),
    hIncrBy: jest.fn(),
    lPush: jest.fn(),
    info: jest.fn(),
  };

  const mockRedisService = {
    client: mockRedisClient,
    pubClient: { publish: mockRedisClient.publish },
    subClient: {
      subscribe: mockRedisClient.subscribe,
      on: jest.fn(),
    },
  };

  const mockCacheService = {
    delete: jest.fn(),
    deleteByTag: jest.fn(),
    clear: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheInvalidationService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<CacheInvalidationService>(CacheInvalidationService);
    redisService = module.get<RedisService>(RedisService);
    cacheService = module.get<CacheService>(CacheService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invalidateKey', () => {
    it('should invalidate specific key and broadcast message', async () => {
      const key = 'test-key';
      const reason = 'test reason';

      mockRedisClient.publish.mockResolvedValue(1);
      mockCacheService.delete.mockResolvedValue(true);

      await service.invalidateKey(key, reason);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cache:invalidation',
        expect.stringContaining('"type":"key"'),
      );
      expect(cacheService.delete).toHaveBeenCalledWith(key);
    });
  });

  describe('invalidateByTag', () => {
    it('should invalidate entries by tag', async () => {
      const tag = 'user';
      const reason = 'user update';

      mockRedisClient.publish.mockResolvedValue(1);
      mockCacheService.deleteByTag.mockResolvedValue(5);

      await service.invalidateByTag(tag, reason);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cache:invalidation',
        expect.stringContaining('"type":"tag"'),
      );
      expect(cacheService.deleteByTag).toHaveBeenCalledWith(tag);
    });
  });

  describe('invalidateByPattern', () => {
    it('should invalidate entries by pattern', async () => {
      const pattern = 'user:*:profile';
      const reason = 'profile schema change';

      mockRedisClient.publish.mockResolvedValue(1);
      mockRedisClient.keys.mockResolvedValue([
        'cache:user:123:profile',
        'cache:user:456:profile',
      ]);
      
      const mockPipeline = {
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };
      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);

      const result = await service.invalidateByPattern(pattern, reason);

      expect(result).toBe(2);
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cache:invalidation',
        expect.stringContaining('"type":"pattern"'),
      );
      expect(mockRedisClient.keys).toHaveBeenCalledWith('cache:user:*:profile');
    });
  });

  describe('clearAll', () => {
    it('should clear entire cache', async () => {
      const reason = 'maintenance';

      mockRedisClient.publish.mockResolvedValue(1);
      mockCacheService.clear.mockResolvedValue(100);

      await service.clearAll(reason);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cache:invalidation',
        expect.stringContaining('"type":"clear"'),
      );
      expect(cacheService.clear).toHaveBeenCalled();
    });
  });

  describe('addInvalidationRule', () => {
    it('should add invalidation rule', async () => {
      const keyPattern = 'user:*:profile';
      const dependencies = ['user:*'];
      const cascade = true;

      mockRedisClient.hSet.mockResolvedValue(1);

      await service.addInvalidationRule(keyPattern, dependencies, cascade);

      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        'cache:invalidation:rules',
        keyPattern,
        expect.stringContaining('"pattern":"user:*:profile"'),
      );
    });
  });

  describe('invalidateDependents', () => {
    it('should invalidate dependent entries based on rules', async () => {
      const key = 'user:123';
      const reason = 'user data updated';

      // The rule dependencies should include the key being invalidated
      mockRedisClient.hGetAll.mockResolvedValue({
        'user:123:profile': JSON.stringify({
          pattern: 'user:123:profile',
          dependencies: ['user:123'],
          cascade: false,
        }),
      });

      // When pattern doesn't have wildcard, it calls cacheService.delete directly
      mockRedisClient.publish.mockResolvedValue(1);
      mockCacheService.delete.mockResolvedValue(true);

      const result = await service.invalidateDependents(key, reason);

      expect(result).toEqual(['user:123:profile']);
      expect(mockCacheService.delete).toHaveBeenCalledWith('user:123:profile');
    });
  });

  describe('invalidateBatch', () => {
    it('should invalidate multiple keys in batch', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const reason = 'bulk update';

      mockRedisClient.publish.mockResolvedValue(1);
      const mockPipeline = {
        del: jest.fn().mockReturnThis(),
        sAdd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };
      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);

      await service.invalidateBatch(keys, reason);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cache:invalidation',
        expect.stringContaining('batch:3'),
      );
      expect(mockPipeline.del).toHaveBeenCalledTimes(3);
    });
  });

  describe('scheduleInvalidation', () => {
    it('should schedule future invalidation', async () => {
      const key = 'test-key';
      const delayMs = 5000;
      const reason = 'scheduled cleanup';

      mockRedisClient.zAdd.mockResolvedValue(1);

      await service.scheduleInvalidation(key, delayMs, reason);

      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'cache:invalidation:schedule',
        expect.objectContaining({
          score: expect.any(Number),
          value: expect.stringContaining('"key":"test-key"'),
        }),
      );
    });
  });

  describe('processScheduledInvalidations', () => {
    it('should process expired scheduled invalidations', async () => {
      const expiredItems = [
        JSON.stringify({ key: 'key1', reason: 'scheduled' }),
        JSON.stringify({ key: 'key2', reason: 'scheduled' }),
      ];

      mockRedisClient.zRangeByScore.mockResolvedValue(expiredItems);
      const mockPipeline = {
        zRem: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };
      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);
      mockCacheService.delete.mockResolvedValue(true);

      await service.processScheduledInvalidations();

      expect(mockRedisClient.zRangeByScore).toHaveBeenCalledWith(
        'cache:invalidation:schedule',
        0,
        expect.any(Number),
      );
      expect(mockPipeline.zRem).toHaveBeenCalledTimes(2);
    });
  });

  describe('getInvalidationStats', () => {
    it('should return invalidation statistics', async () => {
      mockRedisClient.get.mockImplementation((key) => {
        if (key === 'cache:stats:invalidations:total')
          return Promise.resolve('42');
        return Promise.resolve('0');
      });
      mockRedisClient.zCard.mockResolvedValue(5);
      mockRedisClient.lRange.mockResolvedValue([]);

      const stats = await service.getInvalidationStats();

      expect(stats).toEqual({
        totalInvalidations: 42,
        pendingSchedules: 5,
        recentInvalidations: [],
      });
    });
  });
});
