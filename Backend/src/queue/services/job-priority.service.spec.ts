import { Test, TestingModule } from '@nestjs/testing';
import { JobPriorityService } from '../services/job-priority.service';
import { JobPriority, JobPriorityLevel } from '../types/enhanced-job.types';

describe('JobPriorityService', () => {
  let service: JobPriorityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobPriorityService],
    }).compile();

    service = module.get<JobPriorityService>(JobPriorityService);
  });

  describe('getPriorityWeight', () => {
    it('should return correct weights for each priority level', () => {
      const lowPriority: JobPriority = {
        level: JobPriorityLevel.LOW,
        weight: 1,
      };
      const normalPriority: JobPriority = {
        level: JobPriorityLevel.NORMAL,
        weight: 5,
      };
      const highPriority: JobPriority = {
        level: JobPriorityLevel.HIGH,
        weight: 10,
      };
      const criticalPriority: JobPriority = {
        level: JobPriorityLevel.CRITICAL,
        weight: 20,
      };

      expect(service.getPriorityWeight(lowPriority)).toBe(1);
      expect(service.getPriorityWeight(normalPriority)).toBe(5);
      expect(service.getPriorityWeight(highPriority)).toBe(10);
      expect(service.getPriorityWeight(criticalPriority)).toBe(20);
    });
  });

  describe('determineJobPriority', () => {
    it('should use explicitly set priority from metadata', () => {
      const jobData = { text: 'test' };
      const metadata = {
        priority: { level: JobPriorityLevel.HIGH, weight: 10 },
      };

      const priority = service.determineJobPriority(
        'process-tts',
        jobData,
        metadata,
      );
      expect(priority.level).toBe(JobPriorityLevel.HIGH);
    });

    it('should determine priority for contract deployment jobs', () => {
      const productionJob = { environment: 'production' };
      const priority = service.determineJobPriority(
        'deploy-contract',
        productionJob,
      );
      expect(priority.level).toBe(JobPriorityLevel.CRITICAL);

      const urgentJob = { urgent: true };
      const urgentPriority = service.determineJobPriority(
        'deploy-contract',
        urgentJob,
      );
      expect(urgentPriority.level).toBe(JobPriorityLevel.HIGH);

      const stagingJob = { environment: 'staging' };
      const stagingPriority = service.determineJobPriority(
        'deploy-contract',
        stagingJob,
      );
      expect(stagingPriority.level).toBe(JobPriorityLevel.NORMAL);

      const devJob = { environment: 'development' };
      const devPriority = service.determineJobPriority(
        'deploy-contract',
        devJob,
      );
      expect(devPriority.level).toBe(JobPriorityLevel.LOW);
    });

    it('should determine priority for TTS jobs', () => {
      const realtimeJob = { sessionId: '123', realTime: true, text: 'Hello' };
      const priority = service.determineJobPriority('process-tts', realtimeJob);
      expect(priority.level).toBe(JobPriorityLevel.HIGH);

      const shortTextJob = { text: 'Short text' };
      const shortPriority = service.determineJobPriority(
        'process-tts',
        shortTextJob,
      );
      expect(shortPriority.level).toBe(JobPriorityLevel.NORMAL);

      const batchJob = { batch: true, text: 'Long batch processing text' };
      const batchPriority = service.determineJobPriority(
        'process-tts',
        batchJob,
      );
      expect(batchPriority.level).toBe(JobPriorityLevel.LOW);
    });

    it('should determine priority for market news jobs', () => {
      const breakingNews = { breaking: true, title: 'Breaking news' };
      const priority = service.determineJobPriority(
        'index-market-news',
        breakingNews,
      );
      expect(priority.level).toBe(JobPriorityLevel.CRITICAL);

      const recentNews = {
        timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        title: 'Recent news',
      };
      const recentPriority = service.determineJobPriority(
        'index-market-news',
        recentNews,
      );
      expect(recentPriority.level).toBe(JobPriorityLevel.HIGH);

      const oldNews = {
        timestamp: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
        title: 'Old news',
      };
      const oldPriority = service.determineJobPriority(
        'index-market-news',
        oldNews,
      );
      expect(oldPriority.level).toBe(JobPriorityLevel.NORMAL);
    });

    it('should adjust priority based on tags', () => {
      const jobData = { text: 'test' };
      const metadata = { tags: ['urgent', 'production'] };
      const priority = service.determineJobPriority(
        'process-tts',
        jobData,
        metadata,
      );
      expect(priority.level).toBe(JobPriorityLevel.HIGH);

      const criticalMetadata = { tags: ['emergency'] };
      const criticalPriority = service.determineJobPriority(
        'process-tts',
        jobData,
        criticalMetadata,
      );
      expect(criticalPriority.level).toBe(JobPriorityLevel.CRITICAL);

      const lowPriorityMetadata = { tags: ['batch', 'test'] };
      const lowPriority = service.determineJobPriority(
        'process-tts',
        jobData,
        lowPriorityMetadata,
      );
      expect(lowPriority.level).toBe(JobPriorityLevel.LOW);
    });
  });

  describe('createPriorityOptions', () => {
    it('should create Bull options with correct priority', () => {
      const priority: JobPriority = {
        level: JobPriorityLevel.HIGH,
        weight: 10,
      };
      const baseOptions = { attempts: 3 };

      const options = service.createPriorityOptions(priority, baseOptions);

      expect(options.priority).toBe(10);
      expect(options.attempts).toBe(3);
    });
  });

  describe('createScheduledOptions', () => {
    it('should create options with delay and priority', () => {
      const priority: JobPriority = {
        level: JobPriorityLevel.CRITICAL,
        weight: 20,
      };
      const baseOptions = { attempts: 5 };

      const options = service.createScheduledOptions(
        5000,
        priority,
        baseOptions,
      );

      expect(options.delay).toBe(5000);
      expect(options.priority).toBe(20);
      expect(options.attempts).toBe(5);
    });

    it('should create options without delay when not provided', () => {
      const priority: JobPriority = {
        level: JobPriorityLevel.NORMAL,
        weight: 5,
      };
      const baseOptions = { attempts: 2 };

      const options = service.createScheduledOptions(
        undefined,
        priority,
        baseOptions,
      );

      expect(options.delay).toBeUndefined();
      expect(options.priority).toBe(5);
      expect(options.attempts).toBe(2);
    });
  });

  describe('sortJobsByPriority', () => {
    it('should sort jobs by priority in descending order', () => {
      const jobs = [
        { opts: { priority: 5 }, id: 1 },
        { opts: { priority: 20 }, id: 2 },
        { opts: { priority: 1 }, id: 3 },
        { opts: { priority: 10 }, id: 4 },
      ];

      const sortedJobs = service.sortJobsByPriority(jobs);

      expect(sortedJobs[0].id).toBe(2); // priority 20
      expect(sortedJobs[1].id).toBe(4); // priority 10
      expect(sortedJobs[2].id).toBe(1); // priority 5
      expect(sortedJobs[3].id).toBe(3); // priority 1
    });

    it('should handle jobs without priority', () => {
      const jobs = [
        { opts: {}, id: 1 },
        { opts: { priority: 10 }, id: 2 },
        { id: 3 }, // no opts
      ];

      const sortedJobs = service.sortJobsByPriority(jobs);

      expect(sortedJobs[0].id).toBe(2); // priority 10
      expect(sortedJobs[1].id).toBe(1); // priority 0 (default)
      expect(sortedJobs[2].id).toBe(3); // priority 0 (default)
    });
  });

  describe('getPriorityDistribution', () => {
    it('should calculate correct priority distribution', () => {
      const jobs = [
        { opts: { priority: 20 } }, // critical
        { opts: { priority: 10 } }, // high
        { opts: { priority: 5 } }, // normal
        { opts: { priority: 1 } }, // low
        { opts: { priority: 15 } }, // high
        { opts: { priority: 3 } }, // low
      ];

      const distribution = service.getPriorityDistribution(jobs);

      expect(distribution[JobPriorityLevel.CRITICAL]).toBe(1);
      expect(distribution[JobPriorityLevel.HIGH]).toBe(2);
      expect(distribution[JobPriorityLevel.NORMAL]).toBe(1);
      expect(distribution[JobPriorityLevel.LOW]).toBe(2);
    });

    it('should handle empty job array', () => {
      const distribution = service.getPriorityDistribution([]);

      expect(distribution[JobPriorityLevel.CRITICAL]).toBe(0);
      expect(distribution[JobPriorityLevel.HIGH]).toBe(0);
      expect(distribution[JobPriorityLevel.NORMAL]).toBe(0);
      expect(distribution[JobPriorityLevel.LOW]).toBe(0);
    });
  });
});
