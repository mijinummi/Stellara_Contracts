import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import { RedisService } from '../../redis/redis.service';
import { JobPriorityService } from './job-priority.service';
import { EnhancedJobData, JobSchedule } from '../types/enhanced-job.types';

export interface ScheduledJob {
  id: string;
  name: string;
  queueName: string;
  data: any;
  schedule: JobSchedule;
  priority?: number;
  createdAt: Date;
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  dependsOn?: string[]; // Job IDs this job depends on
  condition?: (data: any) => boolean; // Condition to check before running
  maxRuns?: number; // Maximum number of runs (-1 for unlimited)
  runCount: number; // Number of times this job has run
}

@Injectable()
export class JobSchedulingService {
  private readonly logger = new Logger(JobSchedulingService.name);
  private readonly SCHEDULED_JOBS_KEY = 'queue:scheduled-jobs';
  private readonly JOB_DEPENDENCIES_KEY = 'queue:job-dependencies';
  private readonly CHAINED_JOBS_KEY = 'queue:chained-jobs';

  constructor(
    @InjectQueue('deploy-contract') private deployContractQueue: Queue,
    @InjectQueue('process-tts') private processTtsQueue: Queue,
    @InjectQueue('index-market-news') private indexMarketNewsQueue: Queue,
    private readonly redisService: RedisService,
    private readonly jobPriorityService: JobPriorityService,
  ) {}

  /**
   * Schedule a job with various options
   */
  async scheduleJob(
    queueName: string,
    jobName: string,
    data: EnhancedJobData,
    schedule: JobSchedule,
  ): Promise<ScheduledJob> {
    const jobId = this.generateJobId();

    // Create scheduled job object
    const scheduledJob: ScheduledJob = {
      id: jobId,
      name: jobName,
      queueName,
      data,
      schedule,
      createdAt: new Date(),
      isActive: true,
      runCount: 0,
    };

    // Calculate next run time based on schedule
    scheduledJob.nextRun = this.calculateNextRun(schedule) ?? undefined;

    // Store in Redis
    await this.redisService.client.hSet(
      this.SCHEDULED_JOBS_KEY,
      jobId,
      JSON.stringify(scheduledJob),
    );

    this.logger.log(`Scheduled job ${jobId} for queue ${queueName}`);

    return scheduledJob;
  }

  /**
   * Schedule a recurring job with cron expression
   */
  async scheduleRecurringJob(
    queueName: string,
    jobName: string,
    data: EnhancedJobData,
    cronExpression: string,
    maxRuns?: number,
  ): Promise<ScheduledJob> {
    const schedule: JobSchedule = {
      repeat: {
        cron: cronExpression,
        limit: maxRuns,
      },
    };

    return this.scheduleJob(queueName, jobName, data, schedule);
  }

  /**
   * Schedule a job with dependencies
   */
  async scheduleJobWithDependencies(
    queueName: string,
    jobName: string,
    data: EnhancedJobData,
    schedule: JobSchedule,
    dependsOn: string[],
  ): Promise<ScheduledJob> {
    const scheduledJob = await this.scheduleJob(
      queueName,
      jobName,
      data,
      schedule,
    );

    // Store dependencies
    scheduledJob.dependsOn = dependsOn;
    await this.redisService.client.hSet(
      this.SCHEDULED_JOBS_KEY,
      scheduledJob.id,
      JSON.stringify(scheduledJob),
    );

    // Add to dependencies mapping
    for (const dependencyId of dependsOn) {
      const existingDeps =
        (await this.redisService.client.sMembers(
          `${this.JOB_DEPENDENCIES_KEY}:${dependencyId}`,
        )) || [];
      existingDeps.push(scheduledJob.id);
      await this.redisService.client.sAdd(
        `${this.JOB_DEPENDENCIES_KEY}:${dependencyId}`,
        scheduledJob.id,
      );
    }

    this.logger.log(
      `Scheduled job ${scheduledJob.id} with dependencies: ${dependsOn.join(', ')}`,
    );

    return scheduledJob;
  }

  /**
   * Chain jobs together (one job triggers another upon completion)
   */
  async chainJobs(
    firstJob: {
      queueName: string;
      jobName: string;
      data: EnhancedJobData;
      schedule?: JobSchedule;
    },
    secondJob: {
      queueName: string;
      jobName: string;
      data: EnhancedJobData;
      schedule?: JobSchedule;
    },
  ): Promise<{ firstJob: ScheduledJob; secondJob: ScheduledJob }> {
    // Schedule the first job
    const firstScheduledJob = firstJob.schedule
      ? await this.scheduleJob(
          firstJob.queueName,
          firstJob.jobName,
          firstJob.data,
          firstJob.schedule,
        )
      : await this.scheduleJob(
          firstJob.queueName,
          firstJob.jobName,
          firstJob.data,
          {},
        );

    // Schedule the second job to depend on the first
    const secondScheduledJob = await this.scheduleJobWithDependencies(
      secondJob.queueName,
      secondJob.jobName,
      secondJob.data,
      secondJob.schedule || {},
      [firstScheduledJob.id],
    );

    // Store the chain relationship
    await this.redisService.client.sAdd(
      `${this.CHAINED_JOBS_KEY}:${firstScheduledJob.id}`,
      secondScheduledJob.id,
    );

    this.logger.log(
      `Chained jobs: ${firstScheduledJob.id} -> ${secondScheduledJob.id}`,
    );

    return {
      firstJob: firstScheduledJob,
      secondJob: secondScheduledJob,
    };
  }

  /**
   * Schedule a conditional job that only runs when conditions are met
   */
  async scheduleConditionalJob(
    queueName: string,
    jobName: string,
    data: EnhancedJobData,
    schedule: JobSchedule,
    condition: (data: any) => boolean,
  ): Promise<ScheduledJob> {
    const scheduledJob = await this.scheduleJob(
      queueName,
      jobName,
      data,
      schedule,
    );

    // Store condition as a serialized function or logic
    scheduledJob.condition = condition;

    await this.redisService.client.hSet(
      this.SCHEDULED_JOBS_KEY,
      scheduledJob.id,
      JSON.stringify(scheduledJob),
    );

    this.logger.log(`Scheduled conditional job ${scheduledJob.id}`);

    return scheduledJob;
  }

  /**
   * Get all scheduled jobs
   */
  async getScheduledJobs(): Promise<ScheduledJob[]> {
    const jobEntries = await this.redisService.client.hGetAll(
      this.SCHEDULED_JOBS_KEY,
    );
    return Object.values(jobEntries).map(
      (entry) => JSON.parse(entry) as ScheduledJob,
    );
  }

  /**
   * Get scheduled jobs for a specific queue
   */
  async getScheduledJobsByQueue(queueName: string): Promise<ScheduledJob[]> {
    const allJobs = await this.getScheduledJobs();
    return allJobs.filter((job) => job.queueName === queueName);
  }

  /**
   * Get a specific scheduled job
   */
  async getScheduledJob(jobId: string): Promise<ScheduledJob | null> {
    const jobData = await this.redisService.client.hGet(
      this.SCHEDULED_JOBS_KEY,
      jobId,
    );
    return jobData ? (JSON.parse(jobData) as ScheduledJob) : null;
  }

  /**
   * Cancel a scheduled job
   */
  async cancelScheduledJob(jobId: string): Promise<boolean> {
    const job = await this.getScheduledJob(jobId);
    if (!job) {
      return false;
    }

    job.isActive = false;
    await this.redisService.client.hSet(
      this.SCHEDULED_JOBS_KEY,
      jobId,
      JSON.stringify(job),
    );

    this.logger.log(`Cancelled scheduled job ${jobId}`);

    return true;
  }

  /**
   * Process scheduled jobs - run this periodically
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledJobs(): Promise<void> {
    this.logger.log('Processing scheduled jobs...');
    await this.processJobsInternal();
  }

  /**
   * Internal method to process scheduled jobs
   */
  private async processJobsInternal(): Promise<void> {
    const scheduledJobs = await this.getScheduledJobs();
    const now = new Date();

    for (const job of scheduledJobs) {
      if (!job.isActive) {
        continue;
      }

      // Check if job should run based on schedule
      if (job.nextRun && now >= job.nextRun) {
        // Check dependencies
        if (await this.checkDependencies(job)) {
          // Check condition if exists
          if (!job.condition || job.condition(job.data)) {
            // Check max runs limit
            if (job.maxRuns === undefined || job.runCount < job.maxRuns) {
              await this.executeScheduledJob(job);
            } else {
              // Max runs reached, cancel the job
              await this.cancelScheduledJob(job.id);
            }
          }
        }

        // Update next run time
        const nextRun = this.calculateNextRun(job.schedule);
        if (nextRun) {
          job.nextRun = nextRun;
          await this.redisService.client.hSet(
            this.SCHEDULED_JOBS_KEY,
            job.id,
            JSON.stringify(job),
          );
        } else {
          // No more runs scheduled, cancel the job
          await this.cancelScheduledJob(job.id);
        }
      }
    }
  }

  /**
   * Check if all dependencies for a job are satisfied
   */
  private async checkDependencies(job: ScheduledJob): Promise<boolean> {
    if (!job.dependsOn || job.dependsOn.length === 0) {
      return true;
    }

    // In a real implementation, we would check if dependent jobs have completed successfully
    // For now, we'll just return true to allow the job to run
    return true;
  }

  /**
   * Execute a scheduled job
   */
  private async executeScheduledJob(job: ScheduledJob): Promise<void> {
    try {
      const queue = this.getQueueByName(job.queueName);

      // Determine priority
      const priority = this.jobPriorityService.determineJobPriority(
        job.name,
        job.data,
        job.data.metadata,
      );

      // merge schedule without carrying over its own `priority` property
      const { priority: _unused, ...scheduleWithoutPri } = job.schedule;

      // Add job to the queue
      // the spread of `scheduleWithoutPri` has some optional properties
      // which don't align exactly with Bull's `JobOptions` definitions, so
      // we cast to `any` here.  At runtime the values are valid (they come
      // directly from the scheduled job object) and this avoids the compile
      // time complaint about `every` possibly being undefined.
      const bullJob = await queue.add(job.name, job.data, {
        priority: priority.weight,
        ...(scheduleWithoutPri as any),
      });

      job.lastRun = new Date();
      job.runCount++;

      await this.redisService.client.hSet(
        this.SCHEDULED_JOBS_KEY,
        job.id,
        JSON.stringify(job),
      );

      this.logger.log(
        `Executed scheduled job ${job.id} (run #${job.runCount})`,
      );

      // Process chained jobs
      await this.processChainedJobs(job.id);
    } catch (error) {
      this.logger.error(
        `Failed to execute scheduled job ${job.id}: ${error.message}`,
      );
    }
  }

  /**
   * Process chained jobs after a job completes
   */
  private async processChainedJobs(parentJobId: string): Promise<void> {
    const chainedJobIds = await this.redisService.client.sMembers(
      `${this.CHAINED_JOBS_KEY}:${parentJobId}`,
    );

    for (const chainedJobId of chainedJobIds) {
      const chainedJob = await this.getScheduledJob(chainedJobId);
      if (chainedJob) {
        // Trigger the chained job immediately or according to its schedule
        await this.executeScheduledJob(chainedJob);
      }
    }
  }

  /**
   * Calculate next run time based on schedule
   */
  private calculateNextRun(schedule: JobSchedule): Date | undefined {
    if (schedule.repeat?.cron) {
      // For simplicity, we'll return the current time plus 1 minute
      // In a real implementation, we would parse the cron expression
      return new Date(Date.now() + 60000); // 1 minute from now
    }

    if (schedule.delay) {
      return new Date(Date.now() + schedule.delay);
    }

    if (schedule.repeat?.every) {
      return new Date(Date.now() + schedule.repeat.every);
    }

    // if we fall through there is no next run defined
    return undefined;
  }

  /**
   * Get queue by name
   */
  private getQueueByName(queueName: string): Queue {
    switch (queueName) {
      case 'deploy-contract':
        return this.deployContractQueue;
      case 'process-tts':
        return this.processTtsQueue;
      case 'index-market-news':
        return this.indexMarketNewsQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  /**
   * Generate a unique job ID
   */
  private generateJobId(): string {
    return `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Manually trigger a scheduled job
   */
  async triggerScheduledJob(jobId: string): Promise<boolean> {
    const job = await this.getScheduledJob(jobId);
    if (!job || !job.isActive) {
      return false;
    }

    await this.executeScheduledJob(job);
    return true;
  }

  /**
   * Update a scheduled job
   */
  async updateScheduledJob(
    jobId: string,
    updates: Partial<ScheduledJob>,
  ): Promise<boolean> {
    const job = await this.getScheduledJob(jobId);
    if (!job) {
      return false;
    }

    // Update job properties
    Object.assign(job, updates);

    await this.redisService.client.hSet(
      this.SCHEDULED_JOBS_KEY,
      jobId,
      JSON.stringify(job),
    );

    this.logger.log(`Updated scheduled job ${jobId}`);

    return true;
  }
}
