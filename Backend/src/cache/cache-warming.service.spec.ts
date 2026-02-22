import { Test, TestingModule } from '@nestjs/testing';
import { CacheWarmingService } from './cache-warming.service';
import { CacheService } from './cache.service';
import { RedisService } from '../redis/redis.service';
// import { CacheConfigurationService } from './cache-configuration.service';

describe('CacheWarmingService', () => {
  let service: CacheWarmingService;
  let cacheService: CacheService;
  // let configService: CacheConfigurationService;

  const mockRedisClient = {
    hGetAll: jest.fn(),
    hSet: jest.fn(),
    hDel: jest.fn(),
    lRange: jest.fn(),
    lPush: jest.fn(),
    lTrim: jest.fn(),
    del: jest.fn(),
    multi: jest.fn(),
  };

  const mockRedisService = {
    client: mockRedisClient,
  };

  const mockCacheService = {
    set: jest.fn(),
    get: jest.fn(),
  };

  // const mockConfigService = {
  //   getCacheConfig: jest.fn().mockReturnValue({
  //     warmupOnStartup: false,
  //     scheduledWarmupEnabled: true,
  //   }),
  // };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheWarmingService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: RedisService, useValue: mockRedisService },
        // { provide: CacheConfigurationService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CacheWarmingService>(CacheWarmingService);
    cacheService = module.get<CacheService>(CacheService);
    // configService = module.get<CacheConfigurationService>(CacheConfigurationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerWarmupGroup', () => {
    it('should register new warmup group', async () => {
      const group = {
        name: 'user-data',
        entries: [
          {
            key: 'user:profiles',
            loader: async () => ({ data: 'profiles' }),
            priority: 'high' as const,
            schedule: 'startup' as const,
          },
        ],
        enabled: true,
      };

      mockRedisClient.hSet.mockResolvedValue(1);

      await service.registerWarmupGroup(group);

      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        'cache:warmup:groups',
        'user-data',
        expect.stringContaining('"name":"user-data"'),
      );
    });
  });

  describe('getWarmupGroup', () => {
    it('should return registered warmup group', async () => {
      const group = {
        name: 'test-group',
        entries: [],
        enabled: true,
      };

      // Simulate the group being registered
      await service.registerWarmupGroup(group);

      const result = service.getWarmupGroup('test-group');

      expect(result).toEqual(group);
    });

    it('should return undefined for non-existent group', () => {
      const result = service.getWarmupGroup('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getAllWarmupGroups', () => {
    it('should return all registered warmup groups', async () => {
      const groups = [
        {
          name: 'group1',
          entries: [],
          enabled: true,
        },
        {
          name: 'group2',
          entries: [],
          enabled: false,
        },
      ];

      for (const group of groups) {
        await service.registerWarmupGroup(group);
      }

      const result = service.getAllWarmupGroups();

      expect(result).toHaveLength(2);
      expect(result.map((g) => g.name)).toEqual(['group1', 'group2']);
    });
  });

  describe('warmupGroup', () => {
    it('should execute warmup for enabled group', async () => {
      const group = {
        name: 'test-group',
        entries: [
          {
            key: 'test-key',
            loader: async () => 'test-data',
            priority: 'high' as const,
            schedule: 'startup' as const,
          },
        ],
        enabled: true,
      };

      await service.registerWarmupGroup(group);
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.warmupGroup('test-group');

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(cacheService.set).toHaveBeenCalledWith(
        'test-key',
        'test-data',
        expect.objectContaining({ strategy: 'cache-aside' }),
      );
    });

    it('should handle warmup failures gracefully', async () => {
      const group = {
        name: 'failing-group',
        entries: [
          {
            key: 'fail-key',
            loader: async () => {
              throw new Error('Load failed');
            },
            priority: 'high' as const,
            schedule: 'startup' as const,
          },
        ],
        enabled: true,
      };

      await service.registerWarmupGroup(group);

      const result = await service.warmupGroup('failing-group');

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should skip disabled groups', async () => {
      const group = {
        name: 'disabled-group',
        entries: [
          {
            key: 'test-key',
            loader: async () => 'test-data',
            priority: 'high' as const,
            schedule: 'startup' as const,
          },
        ],
        enabled: false,
      };

      await service.registerWarmupGroup(group);

      const result = await service.warmupGroup('disabled-group');

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('warmupEntry', () => {
    it('should warm up single entry', async () => {
      const entry = {
        key: 'single-key',
        loader: async () => 'single-data',
        priority: 'high' as const,
        schedule: 'startup' as const,
      };

      mockCacheService.set.mockResolvedValue(undefined);

      await service.warmupEntry(entry);

      expect(cacheService.set).toHaveBeenCalledWith(
        'single-key',
        'single-data',
        expect.objectContaining({ strategy: 'cache-aside' }),
      );
    });

    it('should handle null/undefined data', async () => {
      const entry = {
        key: 'null-key',
        loader: async () => null,
        priority: 'high' as const,
        schedule: 'startup' as const,
      };

      await service.warmupEntry(entry);

      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('warmupBatch', () => {
    it('should warm up multiple entries in parallel', async () => {
      const entries = [
        {
          key: 'batch-1',
          loader: async () => 'data-1',
          priority: 'high' as const,
          schedule: 'startup' as const,
        },
        {
          key: 'batch-2',
          loader: async () => 'data-2',
          priority: 'medium' as const,
          schedule: 'startup' as const,
        },
      ];

      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.warmupBatch(entries);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(cacheService.set).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch', async () => {
      const entries = [
        {
          key: 'success-key',
          loader: async () => 'success-data',
          priority: 'high' as const,
          schedule: 'startup' as const,
        },
        {
          key: 'fail-key',
          loader: async () => {
            throw new Error('Failed');
          },
          priority: 'high' as const,
          schedule: 'startup' as const,
        },
      ];

      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.warmupBatch(entries);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('warmupByTag', () => {
    it('should warm up entries by tag', async () => {
      // Setup groups with tagged entries
      const group1 = {
        name: 'group1',
        entries: [
          {
            key: 'tagged-key-1',
            loader: async () => 'data-1',
            priority: 'high' as const,
            schedule: 'startup' as const,
            tags: ['important'],
          },
        ],
        enabled: true,
      };

      const group2 = {
        name: 'group2',
        entries: [
          {
            key: 'tagged-key-2',
            loader: async () => 'data-2',
            priority: 'high' as const,
            schedule: 'startup' as const,
            tags: ['important'],
          },
        ],
        enabled: true,
      };

      await service.registerWarmupGroup(group1);
      await service.registerWarmupGroup(group2);
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.warmupByTag('important');

      expect(result).toBe(2);
      expect(cacheService.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('setWarmupGroupEnabled', () => {
    it('should enable/disable warmup group', async () => {
      const group = {
        name: 'toggle-group',
        entries: [],
        enabled: true,
      };

      await service.registerWarmupGroup(group);
      mockRedisClient.hSet.mockResolvedValue(1);

      await service.setWarmupGroupEnabled('toggle-group', false);

      const updatedGroup = service.getWarmupGroup('toggle-group');
      expect(updatedGroup?.enabled).toBe(false);
    });

    it('should handle non-existent group', async () => {
      await service.setWarmupGroupEnabled('non-existent', true);
      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('getWarmupStats', () => {
    it('should return warmup statistics', async () => {
      const groups = [
        {
          name: 'group1',
          entries: [{ key: 'key1', loader: async () => 'data' } as any],
          enabled: true,
        },
        {
          name: 'group2',
          entries: [
            { key: 'key2', loader: async () => 'data' } as any,
            { key: 'key3', loader: async () => 'data' } as any,
          ],
          enabled: false,
        },
      ];

      for (const group of groups) {
        await service.registerWarmupGroup(group);
      }

      mockRedisClient.lRange.mockResolvedValue([]);

      const stats = await service.getWarmupStats();

      expect(stats).toEqual({
        totalGroups: 2,
        totalEntries: 3,
        enabledGroups: 1,
        recentRuns: [],
        isWarmingUp: false,
      });
    });
  });

  describe('getWarmupGroupDetails', () => {
    it('should return detailed group information', async () => {
      const group = {
        name: 'detailed-group',
        entries: [
          {
            key: 'detail-key',
            loader: async () => 'detail-data',
            priority: 'high' as const,
            schedule: 'startup' as const,
            tags: ['detail'],
          },
        ],
        enabled: true,
      };

      await service.registerWarmupGroup(group);
      mockCacheService.get.mockResolvedValue('cached-data');

      const details = await service.getWarmupGroupDetails('detailed-group');

      expect(details).toBeDefined();
      expect(details?.name).toBe('detailed-group');
      expect(details?.entryStats).toHaveLength(1);
      expect(details?.entryStats[0].key).toBe('detail-key');
      expect(details?.entryStats[0].cached).toBe(true);
    });

    it('should return null for non-existent group', async () => {
      const details = await service.getWarmupGroupDetails('non-existent');

      expect(details).toBeNull();
    });
  });
});
