import { Test, TestingModule } from '@nestjs/testing';
import { DeadLetterQueueService } from '../services/dead-letter-queue.service';
import { RedisService } from '../../redis/redis.service';
import { RetryStrategy } from '../types/enhanced-job.types';

describe('DeadLetterQueueService', () => {
  let service: DeadLetterQueueService;
  let redisService: RedisService;

  const mockRedisService = {
    client: {
      lPush: jest.fn(),
      lRange: jest.fn(),
      lLen: jest.fn(),
      lRem: jest.fn(),
      lTrim: jest.fn(),
      hGetAll: jest.fn(),
      hIncrBy: jest.fn(),
      hGet: jest.fn(),
      hSet: jest.fn(),
      zAdd: jest.fn(),
      zRangeByScore: jest.fn(),
      zRem: jest.fn(),
      zCard: jest.fn(),
      zRemRangeByScore: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterQueueService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<DeadLetterQueueService>(DeadLetterQueueService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('addToDLQ', () => {
    it('should add failed job to DLQ with correct structure', async () => {
      const queueName = 'test-queue';
      const jobData = { id: 1, text: 'test' };
      const error = new Error('Test error');
      const attempts = 3;
      const retryStrategy: RetryStrategy = {
        type: 'exponential',
        delay: 1000,
        maxAttempts: 5,
      };

      mockRedisService.client.lPush.mockResolvedValue(1);
      mockRedisService.client.hIncrBy.mockResolvedValue(1);

      await service.addToDLQ(
        queueName,
        jobData,
        error,
        attempts,
        retryStrategy,
      );

      expect(mockRedisService.client.lPush).toHaveBeenCalledWith(
        'queue:dlq:enhanced:test-queue',
        expect.stringContaining('"queueName":"test-queue"'),
      );
      expect(mockRedisService.client.hIncrBy).toHaveBeenCalledWith(
        'queue:dlq:meta:test-queue',
        'nonRetryable',
        1,
      );
    });

    it('should schedule retry for retryable jobs', async () => {
      const queueName = 'test-queue';
      const jobData = { id: 1 };
      const error = new Error('Network error');
      error.name = 'NetworkError';
      const attempts = 2;
      const retryStrategy: RetryStrategy = {
        type: 'exponential',
        delay: 1000,
        maxAttempts: 5,
      };

      mockRedisService.client.lPush.mockResolvedValue(1);
      mockRedisService.client.hIncrBy.mockResolvedValue(1);
      mockRedisService.client.zAdd.mockResolvedValue(1);

      await service.addToDLQ(
        queueName,
        jobData,
        error,
        attempts,
        retryStrategy,
      );

      expect(mockRedisService.client.zAdd).toHaveBeenCalledWith(
        'queue:dlq:retry:test-queue',
        expect.objectContaining({
          score: expect.any(Number),
          value: expect.stringMatching(/^dlq_/),
        }),
      );
    });
  });

  describe('getDLQItems', () => {
    it('should retrieve and parse DLQ items', async () => {
      const queueName = 'test-queue';
      const mockItems = [
        JSON.stringify({
          id: 'dlq_1',
          name: 'test-queue',
          data: { id: 1 },
          error: 'Test error',
          attempts: 3,
          maxAttempts: 5,
          failedAt: new Date().toISOString(),
          canRetry: false,
        }),
        'invalid-json',
      ];

      mockRedisService.client.lRange.mockResolvedValue(mockItems);

      const items = await service.getDLQItems(queueName);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('dlq_1');
      expect(items[0].canRetry).toBe(false);
    });

    it('should handle empty DLQ', async () => {
      mockRedisService.client.lRange.mockResolvedValue([]);

      const items = await service.getDLQItems('test-queue');

      expect(items).toHaveLength(0);
    });
  });

  describe('getDLQStats', () => {
    it('should return DLQ statistics', async () => {
      const queueName = 'test-queue';

      mockRedisService.client.lLen.mockResolvedValue(10);
      mockRedisService.client.hGetAll.mockResolvedValue({
        retryable: '3',
        nonRetryable: '7',
        total: '10',
      });
      mockRedisService.client.zCard.mockResolvedValue(2);

      const stats = await service.getDLQStats(queueName);

      expect(stats).toEqual({
        totalItems: 10,
        retryableItems: 3,
        nonRetryableItems: 7,
        scheduledRetries: 2,
      });
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisService.client.lLen.mockRejectedValue(new Error('Redis error'));

      const stats = await service.getDLQStats('test-queue');

      expect(stats).toEqual({
        totalItems: 0,
        retryableItems: 0,
        nonRetryableItems: 0,
        scheduledRetries: 0,
      });
    });
  });

  describe('retryFromDLQ', () => {
    it('should successfully retry DLQ item', async () => {
      const queueName = 'test-queue';
      const dlqItemId = 'dlq_123';

      const mockDLQItem = {
        id: dlqItemId,
        name: 'test-queue',
        data: { id: 1 },
        error: 'Test error',
        attempts: 3,
        maxAttempts: 5,
        failedAt: new Date().toISOString(),
        canRetry: true,
      };

      mockRedisService.client.lRange.mockResolvedValue([
        JSON.stringify(mockDLQItem),
      ]);
      mockRedisService.client.lRem.mockResolvedValue(1);
      mockRedisService.client.zRem.mockResolvedValue(1);
      mockRedisService.client.hIncrBy.mockResolvedValue(1);

      const result = await service.retryFromDLQ(queueName, dlqItemId);

      expect(result).toBe(true);
      expect(mockRedisService.client.lRem).toHaveBeenCalledWith(
        'queue:dlq:enhanced:test-queue',
        1,
        JSON.stringify(mockDLQItem),
      );
    });

    it('should return false for non-existent DLQ item', async () => {
      mockRedisService.client.lRange.mockResolvedValue([]);

      const result = await service.retryFromDLQ(
        'test-queue',
        'non-existent-id',
      );

      expect(result).toBe(false);
    });
  });

  describe('processScheduledRetries', () => {
    it('should process items scheduled for retry', async () => {
      const queueName = 'test-queue';
      const scheduledIds = ['dlq_1', 'dlq_2'];

      mockRedisService.client.zRangeByScore.mockResolvedValue(scheduledIds);

      // Mock retryFromDLQ to return true
      jest.spyOn(service, 'retryFromDLQ').mockResolvedValue(true);

      const retriedIds = await service.processScheduledRetries(queueName);

      expect(retriedIds).toEqual(['dlq_1', 'dlq_2']);
      expect(service.retryFromDLQ).toHaveBeenCalledTimes(2);
    });

    it('should handle empty scheduled retries', async () => {
      mockRedisService.client.zRangeByScore.mockResolvedValue([]);

      const retriedIds = await service.processScheduledRetries('test-queue');

      expect(retriedIds).toHaveLength(0);
    });
  });

  describe('purgeDLQ', () => {
    it('should purge old DLQ items', async () => {
      const queueName = 'test-queue';
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const oldItem = {
        id: 'dlq_old',
        failedAt: new Date(cutoffDate.getTime() - 86400000).toISOString(), // 31 days ago
      };

      const recentItem = {
        id: 'dlq_recent',
        failedAt: new Date().toISOString(), // Today
      };

      mockRedisService.client.lRange.mockResolvedValue([
        JSON.stringify(oldItem),
        JSON.stringify(recentItem),
      ]);
      mockRedisService.client.lRem.mockResolvedValue(1);

      const deletedCount = await service.purgeDLQ(queueName, 30);

      expect(deletedCount).toBe(1);
      expect(mockRedisService.client.lRem).toHaveBeenCalledWith(
        'queue:dlq:enhanced:test-queue',
        1,
        JSON.stringify(oldItem),
      );
    });
  });
});
