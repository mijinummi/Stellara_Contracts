import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { RedisService } from '../redis/redis.service';
import { CacheConfigurationService } from './cache-configuration.service';

describe('CacheService', () => {
  let service: CacheService;
  let redisService: RedisService;
  let configService: CacheConfigurationService;

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    mGet: jest.fn(),
    mget: jest.fn(),
    multi: jest.fn(),
    incr: jest.fn(),
    hIncrBy: jest.fn(),
    lpush: jest.fn(),
    ltrim: jest.fn(),
    lPush: jest.fn(),
    lTrim: jest.fn(),
    keys: jest.fn(),
    info: jest.fn(),
    sMembers: jest.fn(),
    sAdd: jest.fn(),
    hset: jest.fn(),
    hdel: jest.fn(),
    hgetall: jest.fn(),
    zadd: jest.fn(),
    zrangebyscore: jest.fn(),
    zrem: jest.fn(),
    zcard: jest.fn(),
  };

  const mockRedisService = {
    client: mockRedisClient,
    pubClient: mockRedisClient,
    subClient: mockRedisClient,
    isRedisAvailable: jest.fn().mockReturnValue(true),
  };

  const mockConfigService = {
    getCacheConfig: jest.fn().mockReturnValue({
      defaultTTL: 3600,
      strategy: 'cache-aside',
      writeThroughEnabled: false,
      writeBehindEnabled: false,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: CacheConfigurationService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<CacheConfigurationService>(
      CacheConfigurationService,
    );

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return cached data when available', async () => {
      const key = 'test-key';
      const cachedData = JSON.stringify({
        data: 'cached-value',
        metadata: { createdAt: Date.now() },
      });

      mockRedisClient.get.mockResolvedValue(cachedData);
      mockRedisClient.incr.mockResolvedValue(1);

      const result = await service.get(key, async () => 'fresh-data');

      expect(result).toBe('cached-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('cache:test-key');
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:stats:hits');
    });

    it('should fetch from source and cache when not available', async () => {
      const key = 'test-key';
      const freshData = 'fresh-data';

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.set.mockResolvedValue('OK');
      
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        incr: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };
      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);

      const result = await service.get(key, async () => freshData);

      expect(result).toBe(freshData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('cache:test-key');
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:stats:misses');
      expect(mockPipeline.set).toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      const key = 'test-key';
      const freshData = 'fresh-data';

      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get(key, async () => freshData);

      expect(result).toBe(freshData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('cache:test-key');
    });
  });

  describe('set', () => {
    it('should set cache entry with default TTL', async () => {
      const key = 'test-key';
      const data = 'test-data';

      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        incr: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };
      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);

      await service.set(key, data);

      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledWith(
        'cache:test-key',
        expect.stringContaining('"data":"test-data"'),
        { EX: 3600 },
      );
    });

    it('should set cache entry with custom TTL', async () => {
      const key = 'test-key';
      const data = 'test-data';
      const ttl = 1800;

      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        incr: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };
      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);

      await service.set(key, data, { ttl });

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'cache:test-key',
        expect.any(String),
        { EX: ttl },
      );
    });

    it('should handle tags when provided', async () => {
      const key = 'test-key';
      const data = 'test-data';
      const tags = ['user', 'profile'];

      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        sAdd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        incr: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };

      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);

      await service.set(key, data, { tags });

      expect(mockPipeline.sAdd).toHaveBeenCalledWith(
        'cache:tag:user',
        'test-key',
      );
      expect(mockPipeline.sAdd).toHaveBeenCalledWith(
        'cache:tag:profile',
        'test-key',
      );
    });
  });

  describe('delete', () => {
    it('should delete cache entry successfully', async () => {
      const key = 'test-key';
      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.delete(key);

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('cache:test-key');
    });

    it('should return false when entry does not exist', async () => {
      const key = 'test-key';
      mockRedisClient.del.mockResolvedValue(0);

      const result = await service.delete(key);

      expect(result).toBe(false);
      expect(mockRedisClient.del).toHaveBeenCalledWith('cache:test-key');
    });
  });

  describe('deleteByTag', () => {
    it('should delete entries by tag', async () => {
      const tag = 'user';
      mockRedisClient.sMembers.mockResolvedValue(['key1', 'key2']);
      mockRedisClient.del.mockResolvedValue(3); // 2 keys + 1 tag set

      const result = await service.deleteByTag(tag);

      expect(result).toBe(2);
      expect(mockRedisClient.sMembers).toHaveBeenCalledWith('cache:tag:user');
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'cache:key1',
        'cache:key2',
        'cache:tag:user',
      ]);
    });

    it('should return 0 when no entries found for tag', async () => {
      const tag = 'user';
      mockRedisClient.sMembers.mockResolvedValue([]);

      const result = await service.deleteByTag(tag);

      expect(result).toBe(0);
      expect(mockRedisClient.sMembers).toHaveBeenCalledWith('cache:tag:user');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('mget', () => {
    it('should get multiple entries', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const cachedData = JSON.stringify({
        data: 'value',
        metadata: { createdAt: Date.now() },
      });
      mockRedisClient.mGet.mockResolvedValue([cachedData, null, cachedData]);

      const result = await service.mget(keys);

      expect(result).toEqual(['value', null, 'value']);
      expect(mockRedisClient.mGet).toHaveBeenCalledWith([
        'cache:key1',
        'cache:key2',
        'cache:key3',
      ]);
    });

    it('should handle empty keys array', async () => {
      const result = await service.mget([]);

      expect(result).toEqual([]);
      expect(mockRedisClient.mget).not.toHaveBeenCalled();
    });
  });

  describe('mset', () => {
    it('should set multiple entries', async () => {
      const entries = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2', options: { ttl: 1800 } },
      ];

      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK']),
      };
      mockRedisClient.multi = jest.fn().mockReturnValue(mockPipeline);

      await service.mset(entries);

      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
    });

    it('should handle empty entries array', async () => {
      await service.mset([]);

      expect(mockRedisClient.multi).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedisClient.get.mockImplementation((key) => {
        switch (key) {
          case 'cache:stats:hits':
            return Promise.resolve('100');
          case 'cache:stats:misses':
            return Promise.resolve('50');
          case 'cache:stats:total-keys':
            return Promise.resolve('200');
          default:
            return Promise.resolve('0');
        }
      });
      mockRedisClient.info.mockResolvedValue('used_memory:104857600');

      const stats = await service.getStats();

      expect(stats).toEqual({
        hits: 100,
        misses: 50,
        hitRate: 0.6666666666666666,
        evictions: 0,
        memoryUsage: 104857600,
        totalKeys: 200,
        avgLatency: 0,
      });
    });

    it('should handle error in stats collection', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const stats = await service.getStats();

      expect(stats).toEqual({
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
        memoryUsage: 0,
        totalKeys: 0,
        avgLatency: 0,
      });
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', async () => {
      mockRedisClient.keys
        .mockResolvedValueOnce(['cache:key1', 'cache:key2'])
        .mockResolvedValueOnce(['cache:tag:user']);
      mockRedisClient.del.mockResolvedValue(3);

      const result = await service.clear();

      expect(result).toBe(2);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('cache:*');
      expect(mockRedisClient.keys).toHaveBeenCalledWith('cache:tag:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'cache:key1',
        'cache:key2',
        'cache:tag:user',
      ]);
    });

    it('should return 0 when no entries to clear', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const result = await service.clear();

      expect(result).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });
});
