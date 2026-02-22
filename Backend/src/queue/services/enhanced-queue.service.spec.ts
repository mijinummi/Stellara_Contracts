import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from '../services/queue.service';
import { RetryStrategyService } from '../services/retry-strategy.service';
import { DeadLetterQueueService } from '../services/dead-letter-queue.service';
import { JobPriorityService } from '../services/job-priority.service';
import { JobMonitoringService } from '../services/job-monitoring.service';
import { RedisService } from '../../redis/redis.service';
import { BullModule, getQueueToken } from '@nestjs/bull';
import { JobPriorityLevel } from '../types/enhanced-job.types';

describe('Enhanced QueueService Integration', () => {
  let service: QueueService;
  let retryStrategyService: RetryStrategyService;
  let deadLetterQueueService: DeadLetterQueueService;
  let jobPriorityService: JobPriorityService;
  let jobMonitoringService: JobMonitoringService;
  let mockQueue: any;

  const mockRedisService = {
    client: {
      lPush: jest.fn(),
      lRange: jest.fn(),
      lLen: jest.fn(),
      lRem: jest.fn(),
      hGetAll: jest.fn(),
      hIncrBy: jest.fn(),
      zAdd: jest.fn(),
      zRangeByScore: jest.fn(),
      zRem: jest.fn(),
      zCard: jest.fn(),
    },
  };

  const createMockQueue = () => ({
    add: jest.fn(),
    getJob: jest.fn(),
    getJobs: jest.fn(),
    getJobCounts: jest.fn(),
    clean: jest.fn(),
    on: jest.fn(),
    process: jest.fn(),
  });

  beforeEach(async () => {
    mockQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({
          redis: {
            host: 'localhost',
            port: 6379,
          },
        }),
        BullModule.registerQueue({ name: 'test-queue' }),
      ],
      providers: [
        QueueService,
        RetryStrategyService,
        DeadLetterQueueService,
        JobPriorityService,
        JobMonitoringService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: getQueueToken('deploy-contract'),
          useValue: createMockQueue(),
        },
        {
          provide: getQueueToken('process-tts'),
          useValue: createMockQueue(),
        },
        {
          provide: getQueueToken('index-market-news'),
          useValue: createMockQueue(),
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    retryStrategyService =
      module.get<RetryStrategyService>(RetryStrategyService);
    deadLetterQueueService = module.get<DeadLetterQueueService>(
      DeadLetterQueueService,
    );
    jobPriorityService = module.get<JobPriorityService>(JobPriorityService);
    jobMonitoringService =
      module.get<JobMonitoringService>(JobMonitoringService);
  });

  describe('Enhanced Job Addition', () => {
    it('should add job with priority and retry strategy', async () => {
      const queueName = 'deploy-contract';
      const jobName = 'deploy';
      const jobData = {
        environment: 'production',
        contractCode: '0x123...',
        metadata: {
          tags: ['urgent', 'production'],
        },
      };

      const mockJob = { id: 'job-123', name: jobName };
      const mockQueue = service['getQueueByName'](queueName);
      mockQueue.add.mockResolvedValue(mockJob);

      const result = await service.addJob(queueName, jobName, jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        jobName,
        jobData,
        expect.objectContaining({
          priority: expect.any(Number),
          attempts: expect.any(Number),
          backoff: expect.objectContaining({
            type: 'exponential',
          }),
        }),
      );
      expect(result.id).toBe('job-123');
    });

    it('should add enhanced job with scheduling', async () => {
      const queueName = 'process-tts';
      const jobName = 'tts-process';
      const jobData = {
        text: 'Hello world',
        voiceId: 'voice-123',
        sessionId: 'session-456',
        realTime: true,
        metadata: {
          priority: { level: JobPriorityLevel.HIGH, weight: 10 },
        },
      };

      const schedule = {
        delay: 5000,
        priority: { level: JobPriorityLevel.HIGH, weight: 10 },
      };

      const mockJob = { id: 'job-456', name: jobName };
      const mockQueue = service['getQueueByName'](queueName);
      mockQueue.add.mockResolvedValue(mockJob);

      const result = await service.addEnhancedJob(
        queueName,
        jobName,
        jobData,
        schedule,
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        jobName,
        jobData,
        expect.objectContaining({
          delay: 5000,
          priority: 10,
          attempts: expect.any(Number),
        }),
      );
      expect(result.id).toBe('job-456');
    });
  });

  describe('Enhanced DLQ Operations', () => {
    it('should get enhanced DLQ items', async () => {
      const queueName = 'test-queue';
      const mockDLQItems = [
        {
          id: 'dlq-1',
          name: queueName,
          data: { text: 'test' },
          error: 'Network timeout',
          attempts: 3,
          maxAttempts: 5,
          canRetry: true,
          nextRetryAt: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      jest
        .spyOn(deadLetterQueueService, 'getDLQItems')
        .mockResolvedValue(mockDLQItems);

      const result = await service.getEnhancedDLQ(queueName);

      expect(result).toEqual(mockDLQItems);
      expect(deadLetterQueueService.getDLQItems).toHaveBeenCalledWith(
        queueName,
        50,
      );
    });

    it('should retry job from enhanced DLQ', async () => {
      const queueName = 'test-queue';
      const dlqItemId = 'dlq-123';

      jest
        .spyOn(deadLetterQueueService, 'retryFromDLQ')
        .mockResolvedValue(true);

      const result = await service.retryFromEnhancedDLQ(queueName, dlqItemId);

      expect(result).toBe(true);
      expect(deadLetterQueueService.retryFromDLQ).toHaveBeenCalledWith(
        queueName,
        dlqItemId,
      );
    });

    it('should process scheduled retries', async () => {
      const queueName = 'test-queue';
      const retriedIds = ['dlq-1', 'dlq-2'];

      jest
        .spyOn(deadLetterQueueService, 'processScheduledRetries')
        .mockResolvedValue(retriedIds);

      const result = await service.processScheduledRetries(queueName);

      expect(result).toEqual(retriedIds);
      expect(
        deadLetterQueueService.processScheduledRetries,
      ).toHaveBeenCalledWith(queueName);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should get queue metrics', async () => {
      const queueName = 'test-queue';
      const mockMetrics = {
        queueName,
        metrics: {
          totalJobs: 100,
          completedJobs: 80,
          failedJobs: 15,
          activeJobs: 3,
          delayedJobs: 2,
          successRate: 0.8,
          failureRate: 0.15,
          throughput: 25,
          dlqSize: 5,
        },
        timestamp: new Date(),
      };

      jest
        .spyOn(jobMonitoringService, 'getQueueMetrics')
        .mockResolvedValue(mockMetrics);

      const result = await service.getQueueMetrics(queueName);

      expect(result).toEqual(mockMetrics);
      expect(jobMonitoringService.getQueueMetrics).toHaveBeenCalledWith(
        queueName,
      );
    });

    it('should get queue health status', async () => {
      const queueName = 'test-queue';
      const mockHealth = {
        status: 'healthy',
        issues: [],
        recommendations: [],
      };

      jest
        .spyOn(jobMonitoringService, 'getQueueHealth')
        .mockResolvedValue(mockHealth);

      const result = await service.getQueueHealth(queueName);

      expect(result).toEqual(mockHealth);
      expect(jobMonitoringService.getQueueHealth).toHaveBeenCalledWith(
        queueName,
      );
    });

    it('should get performance analytics', async () => {
      const queueName = 'test-queue';
      const mockAnalytics = {
        averageProcessingTime: 2500,
        medianProcessingTime: 2000,
        p95ProcessingTime: 5000,
        p99ProcessingTime: 8000,
        jobsPerHour: 45,
        errorRate: 0.05,
        retryRate: 0.1,
      };

      jest
        .spyOn(jobMonitoringService, 'getPerformanceAnalytics')
        .mockResolvedValue(mockAnalytics);

      const result = await service.getPerformanceAnalytics(queueName);

      expect(result).toEqual(mockAnalytics);
      expect(jobMonitoringService.getPerformanceAnalytics).toHaveBeenCalledWith(
        queueName,
      );
    });
  });

  describe('Job Failure Handling', () => {
    it('should handle job failure with enhanced DLQ', async () => {
      const queueName = 'test-queue';
      const mockJob = {
        id: 'job-123',
        name: 'test-job',
        queue: { name: queueName },
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: { text: 'test' },
      };

      const error = new Error('Network timeout');
      error.name = 'NetworkError';

      jest.spyOn(retryStrategyService, 'shouldRetry').mockReturnValue(false);
      jest.spyOn(deadLetterQueueService, 'addToDLQ').mockResolvedValue();

      // Call the private method through reflection
      await service['handleJobFailure'](mockJob, error);

      expect(retryStrategyService.shouldRetry).toHaveBeenCalledWith(
        error,
        3,
        expect.any(Object),
      );
      expect(deadLetterQueueService.addToDLQ).toHaveBeenCalledWith(
        queueName,
        mockJob.data,
        error,
        3,
        expect.any(Object),
      );
    });
  });

  describe('Priority Determination', () => {
    it('should determine correct priority for different job types', async () => {
      const productionDeployJob = {
        environment: 'production',
        contractCode: '0x123...',
      };

      const mockJob = { id: 'job-456' };
      const mockQueue = service['getQueueByName']('deploy-contract');
      mockQueue.add.mockResolvedValue(mockJob);

      await service.addJob('deploy-contract', 'deploy', productionDeployJob);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'deploy',
        productionDeployJob,
        expect.objectContaining({
          priority: 20, // Critical priority
        }),
      );
    });

    it('should adjust priority based on tags', async () => {
      const urgentTTSJob = {
        text: 'Urgent message',
        voiceId: 'voice-123',
        metadata: {
          tags: ['urgent', 'real-time'],
        },
      };

      const mockJob = { id: 'job-789' };
      const mockQueue = service['getQueueByName']('process-tts');
      mockQueue.add.mockResolvedValue(mockJob);

      await service.addJob('process-tts', 'tts-process', urgentTTSJob);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'tts-process',
        urgentTTSJob,
        expect.objectContaining({
          priority: 10, // High priority due to tags
        }),
      );
    });
  });
});
