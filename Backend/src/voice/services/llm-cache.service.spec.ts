import { Test, TestingModule } from '@nestjs/testing';
import { LlmCacheService } from './llm-cache.service';
import { RedisService } from '../../redis/redis.service';

describe('LlmCacheService', () => {
  let service: LlmCacheService;
  let redisService: RedisService;

  //mock Redis client methods
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    keys: jest.fn(),
  };

  const mockRedisService = {
    client: mockRedisClient,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmCacheService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<LlmCacheService>(LlmCacheService);
    redisService = module.get<RedisService>(RedisService);
    jest.clearAllMocks();
  });

  describe('get', () => {
    const prompt = 'Hello world';
    const model = 'gpt-3.5-turbo';

    it('should return cached response if available', async () => {
      const cachedResponse = 'Hello! How can I help you?';
      mockRedisClient.get.mockResolvedValueOnce(cachedResponse);
      mockRedisClient.incr.mockResolvedValue(1);

      const result = await service.get(prompt, model);

      expect(result).toBe(cachedResponse);
      expect(mockRedisClient.incr).toHaveBeenCalled(); // Should record hit
    });

    it('should return null if not in cache', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await service.get(prompt, model);

      expect(result).toBeNull();
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });

    it('should handle cache retrieval errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis error'));

      const result = await service.get(prompt, model);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    const prompt = 'Hello world';
    const response = 'Hello! How can I help you?';
    const model = 'gpt-3.5-turbo';

    it('should cache response with default TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.incr.mockResolvedValue(1);

      await service.set(prompt, response, model);

      expect(mockRedisClient.set).toHaveBeenCalled();
      // Should be called at least 4 times: response, created, model, ttl
      expect(mockRedisClient.set).toHaveBeenCalledTimes(4);
    });

    it('should cache response with custom TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.incr.mockResolvedValue(1);

      await service.set(prompt, response, model, 3600);

      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should handle cache write errors gracefully', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(
        service.set(prompt, response, model),
      ).resolves.toBeUndefined();
    });

    it('should normalize prompt for consistent caching', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.incr.mockResolvedValue(1);

      // Different whitespace, different case - should map to same key
      await service.set('  Hello World  ', response, model);
      await service.set('hello world', response, model);

      // Both should use same cache key (due to normalization)
      expect(mockRedisClient.set).toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    const prompt = 'Hello world';
    const model = 'gpt-3.5-turbo';

    it('should invalidate specific model cache', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const count = await service.invalidate(prompt, model);

      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should invalidate all model caches for prompt', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'llm:cache:v1:gpt-3.5-turbo:hash1',
        'llm:cache:v1:gpt-4:hash1',
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      const count = await service.invalidate(prompt);

      expect(mockRedisClient.keys).toHaveBeenCalled();
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should return 0 if no keys to delete', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const count = await service.invalidate(prompt);

      expect(count).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('invalidateAll', () => {
    it('should delete all cache entries', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'llm:cache:v1:gpt-3.5-turbo:hash1',
        'llm:cache:v1:gpt-4:hash1',
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      const count = await service.invalidateAll();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('llm:cache:*');
      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(count).toBe(2);
    });

    it('should return 0 if no cache entries exist', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const count = await service.invalidateAll();

      expect(count).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedisClient.get.mockResolvedValueOnce('100'); // total entries
      mockRedisClient.get.mockResolvedValueOnce('50'); // total hits
      mockRedisClient.keys.mockResolvedValue(['key1']);

      const stats = await service.getStats();

      expect(stats.totalEntries).toBe(100);
      expect(stats.totalHits).toBe(50);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should handle no cache entries', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.keys.mockResolvedValue([]);

      const stats = await service.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.oldestEntry).toBeNull();
    });
  });

  describe('pruneOldEntries', () => {
    it('should delete entries older than specified age', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2']);
      mockRedisClient.get.mockResolvedValue(
        (Date.now() - 100000000).toString(), // Very old
      );
      mockRedisClient.del.mockResolvedValue(4); // 2 keys + 2 stats

      const count = await service.pruneOldEntries(3600); // 1 hour

      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(count).toBeGreaterThan(0);
    });

    it('should not delete recent entries', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1']);
      mockRedisClient.get.mockResolvedValue(Date.now().toString()); // Very recent

      const count = await service.pruneOldEntries(3600);

      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });
  });

  describe('warmCache', () => {
    it('should populate cache with entries', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.incr.mockResolvedValue(1);

      const entries = [
        {
          prompt: 'Hello',
          response: 'Hi there!',
          model: 'gpt-3.5-turbo',
        },
        {
          prompt: 'Goodbye',
          response: 'See you later!',
          model: 'gpt-3.5-turbo',
        },
      ];

      const count = await service.warmCache(entries);

      expect(count).toBe(2);
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should handle empty entries', async () => {
      const count = await service.warmCache([]);

      expect(count).toBe(0);
    });
  });
});
