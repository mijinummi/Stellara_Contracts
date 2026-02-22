import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import { JobData, JobResult, JobStatus, JobInfo } from '../types/job.types';
import {
  EnhancedJobData,
  JobPriority,
  RetryStrategy,
  JobSchedule,
} from '../types/enhanced-job.types';
import { RedisService } from '../../redis/redis.service';
import { RetryStrategyService } from './retry-strategy.service';
import {
  DeadLetterQueueService,
  DlqResurrectionOptions,
} from './dead-letter-queue.service';
import { JobPriorityService } from './job-priority.service';
import { JobMonitoringService } from './job-monitoring.service';
import { JobSchedulingService } from './job-scheduling.service';
import { QueueHealthService } from './queue-health.service';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  // DLQ key prefix in Redis
  private readonly DLQ_PREFIX = 'queue:dlq:';

  constructor(
    @InjectQueue('deploy-contract') private deployContractQueue: Queue,
    @InjectQueue('process-tts') private processTtsQueue: Queue,
    @InjectQueue('index-market-news') private indexMarketNewsQueue: Queue,
    private readonly redisService: RedisService,
    private readonly retryStrategyService: RetryStrategyService,
    private readonly deadLetterQueueService: DeadLetterQueueService,
    private readonly jobPriorityService: JobPriorityService,
    private readonly jobMonitoringService: JobMonitoringService,
    private readonly jobSchedulingService: JobSchedulingService,
    private readonly queueHealthService: QueueHealthService,
  ) {
    this.initializeQueues();
  }

  private initializeQueues() {
    // Setup event listeners for all queues
    [
      this.deployContractQueue,
      this.processTtsQueue,
      this.indexMarketNewsQueue,
    ].forEach((queue) => {
      queue.on('failed', async (job: Job, error: Error) => {
        await this.handleJobFailure(job, error);
      });

      queue.on('completed', async (job: Job) => {
        this.logger.log(`Job ${job.id} completed: ${job.name}`);
      });

      queue.on('error', (error: Error) => {
        this.logger.error(`Queue error: ${error.message}`, error.stack);
      });
    });
  }

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
   * Add a job to the queue with enhanced features
   */
  async addJob<T extends JobData>(
    queueName: string,
    jobName: string,
    data: T,
    options: any = {},
  ): Promise<Job<T>> {
    const queue = this.getQueueByName(queueName);

    // Determine job priority
    const priority = this.jobPriorityService.determineJobPriority(
      jobName,
      data,
      data.metadata,
    );

    // Get retry strategy
    const retryStrategy =
      options.retryStrategy ||
      this.retryStrategyService.getDefaultStrategy(jobName);

    // Create enhanced options
    const enhancedOptions = this.createEnhancedOptions(
      priority,
      retryStrategy,
      options,
    );

    const job = await queue.add(jobName, data, enhancedOptions);

    this.logger.log(
      `Job added: ${jobName} with ID: ${job.id} (priority: ${priority.level})`,
    );
    return job;
  }

  /**
   * Add enhanced job with full configuration
   */
  async addEnhancedJob<T extends EnhancedJobData>(
    queueName: string,
    jobName: string,
    data: T,
    schedule?: JobSchedule,
  ): Promise<Job<T>> {
    const queue = this.getQueueByName(queueName);

    // Determine job priority
    const priority = this.jobPriorityService.determineJobPriority(
      jobName,
      data,
      data.metadata,
    );

    // Get retry strategy
    const retryStrategy =
      data.retryStrategy ||
      this.retryStrategyService.getDefaultStrategy(jobName);

    // Create enhanced options with scheduling
    const enhancedOptions = this.createEnhancedOptions(
      priority,
      retryStrategy,
      {},
      schedule,
    );

    const job = await queue.add(jobName, data, enhancedOptions);

    this.logger.log(
      `Enhanced job added: ${jobName} with ID: ${job.id} (priority: ${priority.level})`,
    );
    return job;
  }

  /**
   * Get job status and info
   */
  async getJobInfo(
    queueName: string,
    jobId: string | number,
  ): Promise<JobInfo | null> {
    const queue = this.getQueueByName(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id.toString(),
      name: job.name,
      status: this.mapJobState(state),
      progress: typeof progress === 'number' ? progress : 0,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts || 1,
      data: job.data,
      result: job.returnvalue
        ? { success: true, data: job.returnvalue }
        : undefined,
      error: job.failedReason || undefined,
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }

  /**
   * Get all jobs with optional filtering by status
   */
  async getQueueJobs(
    queueName: string,
    statuses: string[] = ['active', 'completed', 'failed', 'delayed'],
  ): Promise<JobInfo[]> {
    const queue = this.getQueueByName(queueName);
    const jobs: Job[] = [];

    for (const status of statuses) {
      const statusJobs = await queue.getJobs(status as any);
      jobs.push(...statusJobs);
    }

    return Promise.all(
      jobs.map(async (job) => {
        const state = await job.getState();
        const progress = job.progress();

        return {
          id: job.id.toString(),
          name: job.name,
          status: this.mapJobState(state),
          progress: typeof progress === 'number' ? progress : 0,
          attempts: job.attemptsMade,
          maxAttempts: job.opts.attempts || 1,
          data: job.data,
          result: job.returnvalue
            ? { success: true, data: job.returnvalue }
            : undefined,
          error: job.failedReason || undefined,
          createdAt: new Date(job.timestamp),
          processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
          completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
        };
      }),
    );
  }

  /**
   * Get dead-letter queue (permanently failed jobs)
   */
  async getDeadLetterQueue(
    queueName: string,
    limit: number = 50,
  ): Promise<any[]> {
    const dlqKey = `${this.DLQ_PREFIX}${queueName}`;
    const dlqData = await this.redisService.client.lRange(dlqKey, 0, limit - 1);
    return dlqData.map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    });
  }

  /**
   * Requeue a job that previously failed
   */
  async requeueJob(
    queueName: string,
    jobId: string | number,
  ): Promise<Job | null> {
    const queue = this.getQueueByName(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found in queue ${queueName}`);
    }

    // Create a new job with same data
    const newJob = await queue.add(job.name, job.data, {
      removeOnComplete: false,
      removeOnFail: false,
      attempts: job.opts.attempts || 3,
      backoff: job.opts.backoff,
    });

    this.logger.log(
      `Job requeued: ${job.name} (original ID: ${jobId}, new ID: ${newJob.id})`,
    );
    return newJob;
  }

  /**
   * Requeue multiple failed jobs from DLQ
   */
  async requeueFromDLQ(queueName: string, limit: number = 10): Promise<Job[]> {
    const dlqKey = `${this.DLQ_PREFIX}${queueName}`;
    const dlqData = await this.redisService.client.lRange(dlqKey, 0, limit - 1);
    const requeuedJobs: Job[] = [];

    for (const item of dlqData) {
      try {
        const jobData = JSON.parse(item);
        const queue = this.getQueueByName(queueName);
        const newJob = await queue.add(jobData.name, jobData.data, {
          removeOnComplete: false,
          removeOnFail: false,
          attempts: jobData.maxAttempts || 3,
        });
        requeuedJobs.push(newJob);
      } catch (error) {
        this.logger.error(`Failed to requeue DLQ item: ${error.message}`);
      }
    }

    // Remove requeued items from DLQ
    if (requeuedJobs.length > 0) {
      await this.redisService.client.lTrim(dlqKey, requeuedJobs.length, -1);
    }

    return requeuedJobs;
  }

  /**
   * Purge jobs from a queue
   */
  async purgeQueue(queueName: string): Promise<number> {
    const queue = this.getQueueByName(queueName);
    const jobs = await queue.clean(0, 'failed');
    const count = jobs.length;
    this.logger.log(`Purged ${count} jobs from queue ${queueName}`);
    return count;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<{
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    waiting: number;
  }> {
    const queue = this.getQueueByName(queueName);
    const counts = await queue.getJobCounts();

    return {
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      waiting: counts.waiting || 0,
    };
  }

  /**
   * Update job progress
   */
  async updateJobProgress(
    queueName: string,
    jobId: string | number,
    progress: number,
  ): Promise<void> {
    const queue = this.getQueueByName(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.progress(progress);
  }

  /**
   * Handle job failure with enhanced retry logic and DLQ
   */
  private async handleJobFailure(job: Job, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts || 1;
    const attempts = job.attemptsMade;
    const retryStrategy = this.retryStrategyService.getDefaultStrategy(
      job.name,
    );

    this.logger.error(
      `Job ${job.id} (${job.name}) failed: ${error.message} (attempt ${attempts}/${maxAttempts})`,
    );

    // Check if job should be retried
    const shouldRetry = this.retryStrategyService.shouldRetry(
      error,
      attempts,
      retryStrategy,
      job.queue.name,
    );

    // If max retries exceeded or not retryable, move to enhanced DLQ
    if (attempts >= maxAttempts || !shouldRetry) {
      // Determine category based on error
      const errorCategory = this.categorizeErrorForDLQ(error);

      await this.deadLetterQueueService.addToDLQ(
        job.queue.name,
        job.data,
        error,
        attempts,
        retryStrategy,
        errorCategory,
      );

      this.logger.warn(
        `Job ${job.id} (${job.name}) moved to enhanced DLQ after ${attempts} attempts (category: ${errorCategory})`,
      );
    }
  }

  /**
   * Categorize error for DLQ purposes
   */
  private categorizeErrorForDLQ(error: Error): string {
    const message = error.message.toLowerCase();

    if (
      message.includes('network') ||
      message.includes('connect') ||
      message.includes('econn')
    ) {
      return 'network-error';
    } else if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout-error';
    } else if (message.includes('validate') || message.includes('invalid')) {
      return 'validation-error';
    } else if (message.includes('not found') || message.includes('missing')) {
      return 'resource-error';
    } else if (
      message.includes('permission') ||
      message.includes('unauthorized')
    ) {
      return 'permission-error';
    } else {
      return 'unknown-error';
    }
  }

  /**
   * Create enhanced Bull queue options
   */
  private createEnhancedOptions(
    priority: JobPriority,
    retryStrategy: RetryStrategy,
    baseOptions: any = {},
    schedule?: JobSchedule,
  ): any {
    const retryOptions =
      this.retryStrategyService.createBullRetryOptions(retryStrategy);
    const priorityOptions =
      this.jobPriorityService.createPriorityOptions(priority);
    const scheduleOptions = schedule
      ? this.jobPriorityService.createScheduledOptions(schedule.delay, priority)
      : {};

    return {
      removeOnComplete: 100, // Keep more jobs for metrics
      removeOnFail: 50, // Keep failed jobs for analysis
      ...retryOptions,
      ...priorityOptions,
      ...scheduleOptions,
      ...baseOptions,
    };
  }

  /**
   * Get enhanced dead-letter queue items
   */
  async getEnhancedDLQ(queueName: string, limit: number = 50): Promise<any[]> {
    return this.deadLetterQueueService.getDLQItems(queueName, limit);
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStatistics(queueName: string): Promise<any> {
    return this.deadLetterQueueService.getDLQStats(queueName);
  }

  /**
   * Retry job from enhanced DLQ
   */
  async retryFromEnhancedDLQ(
    queueName: string,
    dlqItemId: string,
  ): Promise<boolean> {
    return this.deadLetterQueueService.retryFromDLQ(queueName, dlqItemId);
  }

  /**
   * Process scheduled retries from DLQ
   */
  async processScheduledRetries(queueName: string): Promise<string[]> {
    return this.deadLetterQueueService.processScheduledRetries(queueName);
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(queueName: string): Promise<any> {
    return this.jobMonitoringService.getQueueMetrics(queueName);
  }

  /**
   * Get all queue metrics
   */
  async getAllQueueMetrics(): Promise<any[]> {
    return this.jobMonitoringService.getAllQueueMetrics();
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(queueName: string): Promise<any> {
    return this.jobMonitoringService.getQueueHealth(queueName);
  }

  /**
   * Get performance analytics
   */
  async getPerformanceAnalytics(queueName: string): Promise<any> {
    return this.jobMonitoringService.getPerformanceAnalytics(queueName);
  }

  /**
   * Purge old DLQ items
   */
  async purgeDLQ(
    queueName: string,
    olderThanDays: number = 30,
  ): Promise<number> {
    return this.deadLetterQueueService.purgeDLQ(queueName, olderThanDays);
  }

  /**
   * Map Bull job state to JobStatus enum
   */
  private mapJobState(state: string): JobStatus {
    switch (state) {
      case 'pending':
        return JobStatus.PENDING;
      case 'active':
        return JobStatus.ACTIVE;
      case 'completed':
        return JobStatus.COMPLETED;
      case 'failed':
        return JobStatus.FAILED;
      case 'delayed':
        return JobStatus.DELAYED;
      default:
        return JobStatus.PENDING;
    }
  }

  /**
   * Schedule a job with advanced scheduling options
   */
  async scheduleJob(
    queueName: string,
    jobName: string,
    data: EnhancedJobData,
    schedule: JobSchedule,
  ): Promise<any> {
    return this.jobSchedulingService.scheduleJob(
      queueName,
      jobName,
      data,
      schedule,
    );
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
  ): Promise<any> {
    return this.jobSchedulingService.scheduleRecurringJob(
      queueName,
      jobName,
      data,
      cronExpression,
      maxRuns,
    );
  }

  /**
   * Chain jobs together
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
  ): Promise<any> {
    return this.jobSchedulingService.chainJobs(firstJob, secondJob);
  }

  /**
   * Bulk add jobs to a queue
   */
  async bulkAddJobs<T extends JobData>(
    queueName: string,
    jobs: Array<{ jobName: string; data: T; options?: any }>,
  ): Promise<BulkJobOperationResult> {
    const results: BulkJobOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const jobSpec of jobs) {
      try {
        await this.addJob(
          queueName,
          jobSpec.jobName,
          jobSpec.data,
          jobSpec.options,
        );
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          jobId: 'unknown',
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Bulk process jobs from DLQ by category
   */
  async bulkProcessDLQByCategory(
    queueName: string,
    category: string,
    limit: number = 10,
  ): Promise<number> {
    return this.deadLetterQueueService.bulkRequeueByCategory(
      queueName,
      category,
      limit,
    );
  }

  /**
   * Resurrect a job from DLQ with optional modifications
   */
  async resurrectJobFromDLQ(
    queueName: string,
    dlqItemId: string,
    options?: DlqResurrectionOptions,
  ): Promise<boolean> {
    return this.deadLetterQueueService.resurrectJob(
      queueName,
      dlqItemId,
      options,
    );
  }

  /**
   * Get enhanced dead-letter queue items by category
   */
  async getEnhancedDLQByCategory(
    queueName: string,
    category: string,
    limit: number = 50,
  ): Promise<any[]> {
    return this.deadLetterQueueService.getItemsByCategory(
      queueName,
      category,
      limit,
    );
  }

  /**
   * Get health status for all queues
   */
  async getAllQueueHealth(): Promise<any[]> {
    return this.queueHealthService.getAllQueueHealth();
  }

  /**
   * Get system health summary
   */
  async getSystemHealthSummary(): Promise<any> {
    return this.queueHealthService.getSystemHealthSummary();
  }

  /**
   * Get trend analysis for a queue
   */
  async getTrendAnalysis(queueName: string): Promise<any> {
    return this.jobMonitoringService.getTrendAnalysis(queueName);
  }

  /**
   * Get performance predictions for a queue
   */
  async getPredictions(queueName: string): Promise<any> {
    return this.jobMonitoringService.getPredictions(queueName);
  }

  /**
   * Get scaling suggestions for a queue
   */
  async getScalingSuggestion(queueName: string): Promise<any> {
    return this.queueHealthService.getScalingSuggestion(queueName);
  }

  /**
   * Purge old DLQ items by category
   */
  async purgeDLQByCategory(
    queueName: string,
    category: string,
    olderThanDays: number = 30,
  ): Promise<number> {
    return this.deadLetterQueueService.purgeDLQ(
      queueName,
      olderThanDays,
      category,
    );
  }

  /**
   * Get resource utilization for a queue
   */
  async getResourceUtilization(queueName: string): Promise<any> {
    return this.jobPriorityService.getResourceUtilization(queueName);
  }

  /**
   * Set system load factor for dynamic priority adjustment
   */
  async setSystemLoadFactor(factor: number): Promise<void> {
    this.jobPriorityService.setSystemLoadFactor(factor);
  }

  /**
   * Get active alerts for a queue
   */
  async getActiveAlerts(queueName: string): Promise<any> {
    return this.jobMonitoringService.getActiveAlerts(queueName);
  }

  /**
   * Get all scheduled jobs
   */
  async getAllScheduledJobs(): Promise<any[]> {
    return this.jobSchedulingService.getScheduledJobs();
  }

  /**
   * Get scheduled jobs for a specific queue
   */
  async getScheduledJobsByQueue(queueName: string): Promise<any[]> {
    return this.jobSchedulingService.getScheduledJobsByQueue(queueName);
  }

  /**
   * Get a specific scheduled job
   */
  async getScheduledJob(jobId: string): Promise<any> {
    return this.jobSchedulingService.getScheduledJob(jobId);
  }

  /**
   * Cancel a scheduled job
   */
  async cancelScheduledJob(jobId: string): Promise<boolean> {
    return this.jobSchedulingService.cancelScheduledJob(jobId);
  }

  /**
   * Trigger a scheduled job manually
   */
  async triggerScheduledJob(jobId: string): Promise<boolean> {
    return this.jobSchedulingService.triggerScheduledJob(jobId);
  }

  /**
   * Update a scheduled job
   */
  async updateScheduledJob(jobId: string, updates: any): Promise<boolean> {
    return this.jobSchedulingService.updateScheduledJob(jobId, updates);
  }
}

export interface BulkJobOperationResult {
  success: number;
  failed: number;
  errors: Array<{ jobId: string; error: string }>;
}
