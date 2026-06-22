import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './services/llm.service';
import { RedisService } from '../redis/redis.service';
import { QuotaService } from './services/quota.service';
import { LlmCacheService } from './services/llm-cache.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('LlmService', () => {
  let service: LlmService;
  let quotaService: QuotaService;
  let cacheService: LlmCacheService;
  let redisService: RedisService;

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  };

  const mockRedisService = {
    client: mockRedisClient,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        QuotaService,
        LlmCacheService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    quotaService = module.get<QuotaService>(QuotaService);
    cacheService = module.get<LlmCacheService>(LlmCacheService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateResponse', () => {
    const userId = 'user123';
    const sessionId = 'session123';
    const prompt = 'Hello';
    const model = 'gpt-3.5-turbo';

    it('should return cached response if available', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // No custom quota
      mockRedisClient.get.mockResolvedValueOnce(null); // No custom quota
      mockRedisClient.get.mockResolvedValueOnce(null); // Monthly usage
      mockRedisClient.get.mockResolvedValueOnce(null); // Session usage
      mockRedisClient.get.mockResolvedValueOnce(null); // RPM usage
      mockRedisClient.incr.mockResolvedValue(1); // Initialize counters
      mockRedisClient.get.mockResolvedValueOnce('cached response'); // Cache hit

      const result = await service.generateResponse(userId, sessionId, prompt, {
        model,
      });

      expect(result.cached).toBe(true);
      expect(result.content).toBe('cached response');
      expect(result.model).toBe(model);
    });

    it('should call LLM and cache response if not in cache', async () => {
      mockRedisClient.get.mockResolvedValue(null); // Not cached
      mockRedisClient.incr.mockResolvedValue(1); // Quotas OK

      const result = await service.generateResponse(userId, sessionId, prompt, {
        model,
      });

      expect(result.cached).toBe(false);
      expect(result.content).toBeDefined();
      expect(result.model).toBe(model);
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should throw error if monthly quota is exceeded', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // No custom quota
      mockRedisClient.get.mockResolvedValueOnce('1001'); // Exceeds quota

      await expect(
        service.generateResponse(userId, sessionId, prompt),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if session quota is exceeded', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // No custom quota
      mockRedisClient.get.mockResolvedValueOnce('100'); // Monthly OK
      mockRedisClient.get.mockResolvedValueOnce('101'); // Session exceeds limit

      await expect(
        service.generateResponse(userId, sessionId, prompt),
      ).rejects.toThrow(HttpException);
    });

    it('should respect caching preference', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);

      const result = await service.generateResponse(userId, sessionId, prompt, {
        useCache: false,
      });

      expect(result.content).toBeDefined();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should record quota usage by default', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);

      await service.generateResponse(userId, sessionId, prompt);

      expect(mockRedisClient.incr).toHaveBeenCalled();
    });

    it('should skip quota recording if disabled', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);

      jest.spyOn(quotaService, 'recordRequest').mockResolvedValue();

      await service.generateResponse(userId, sessionId, prompt, {
        recordQuota: false,
      });

      expect(quotaService.recordRequest).not.toHaveBeenCalled();
    });
  });

  describe('generateResponseWithFallback', () => {
    const userId = 'user123';
    const sessionId = 'session123';
    const prompt = 'Hello';

    it('should return successful response when available', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);

      const result = await service.generateResponseWithFallback(
        userId,
        sessionId,
        prompt,
      );

      expect(result.content).toBeDefined();
      expect(result.content).not.toContain("I'm sorry");
    });

    it('should return fallback message on quota exceeded', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.get.mockResolvedValueOnce('1001'); // Quota exceeded

      const result = await service.generateResponseWithFallback(
        userId,
        sessionId,
        prompt,
      );

      expect(result.content).toContain("I'm sorry");
      expect(result.cached).toBe(false);
    });

    it('should never throw exceptions', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.generateResponseWithFallback(userId, sessionId, prompt),
      ).resolves.toBeDefined();
    });
  });

  describe('getQuotaStatus', () => {
    const userId = 'user123';
    const sessionId = 'session123';

    it('should return current quota status', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.get.mockResolvedValueOnce(null);

      const status = await service.getQuotaStatus(userId, sessionId);

      expect(status.monthlyUsage).toBeDefined();
      expect(status.sessionUsage).toBeDefined();
      expect(status.requestsThisMinute).toBeDefined();
    });
  });

  describe('cache operations', () => {
    const prompt = 'test prompt';
    const model = 'gpt-3.5-turbo';

    it('should get cache statistics', async () => {
      mockRedisClient.get.mockResolvedValueOnce('100');
      mockRedisClient.get.mockResolvedValueOnce('50');
      mockRedisClient.keys.mockResolvedValue([]);

      const stats = await service.getCacheStats();

      expect(stats.totalEntries).toBe(100);
      expect(stats.totalHits).toBe(50);
    });

    it('should invalidate cache for specific prompt', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1']);
      mockRedisClient.del.mockResolvedValue(1);

      const count = await service.invalidateCache(prompt, model);

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should invalidate all cache', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2']);
      mockRedisClient.del.mockResolvedValue(2);

      const count = await service.invalidateAllCache();

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('admin operations', () => {
    const userId = 'user123';

    it('should reset user quota', async () => {
      mockRedisClient.keys.mockResolvedValue(['quota:monthly:user123:2024-1']);
      mockRedisClient.del.mockResolvedValue(1);

      await expect(service.resetUserQuota(userId)).resolves.toBeUndefined();
    });

    it('should warm cache with entries', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.incr.mockResolvedValue(1);

      const entries = [
        {
          prompt: 'Hello',
          response: 'Hi!',
          model: 'gpt-3.5-turbo',
        },
      ];

      const count = await service.warmCache(entries);

      expect(count).toBe(1);
    });
  });
});
