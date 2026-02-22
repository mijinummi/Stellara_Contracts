import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Logger,
  BadRequestException,
  Body,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { QueueService } from '../services/queue.service';
import { JobInfo, JobStatus } from '../types/job.types';
import { EnhancedJobData, JobSchedule } from '../types/enhanced-job.types';

@ApiTags('Queue Admin')
@Controller('admin/queue')
export class QueueAdminController {
  private readonly logger = new Logger(QueueAdminController.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Get all queues
   */
  @Get('/')
  @ApiOperation({ summary: 'Get all queue statistics' })
  @ApiResponse({ status: 200, description: 'Queue statistics' })
  async getAllQueueStats() {
    const queues = ['deploy-contract', 'process-tts', 'index-market-news'];
    const stats = await Promise.all(
      queues.map(async (queue) => ({
        queue,
        stats: await this.queueService.getQueueStats(queue),
      })),
    );

    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get statistics for a specific queue
   */
  @Get('/stats/:queueName')
  @ApiOperation({ summary: 'Get specific queue statistics' })
  @ApiResponse({ status: 200, description: 'Queue statistics' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getQueueStats(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const stats = await this.queueService.getQueueStats(queueName);
    return {
      success: true,
      queue: queueName,
      data: stats,
    };
  }

  /**
   * Get all jobs in a queue with optional status filtering
   */
  @Get('/:queueName/jobs')
  @ApiOperation({ summary: 'Get jobs from queue' })
  @ApiResponse({ status: 200, description: 'List of jobs' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getQueueJobs(
    @Param('queueName') queueName: string,
    @Query('status') statusQuery?: string,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const statuses = statusQuery ? statusQuery.split(',') : undefined;
    const jobs = await this.queueService.getQueueJobs(queueName, statuses);

    return {
      success: true,
      queue: queueName,
      count: jobs.length,
      data: jobs,
    };
  }

  /**
   * Get a specific job by ID
   */
  @Get('/:queueName/jobs/:jobId')
  @ApiOperation({ summary: 'Get job details' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const job = await this.queueService.getJobInfo(queueName, jobId);

    if (!job) {
      throw new BadRequestException(
        `Job ${jobId} not found in queue ${queueName}`,
      );
    }

    return {
      success: true,
      data: job,
    };
  }

  /**
   * Get dead-letter queue (failed jobs)
   */
  @Get('/:queueName/dlq')
  @ApiOperation({ summary: 'Get dead-letter queue' })
  @ApiResponse({ status: 200, description: 'Dead-letter queue items' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getDeadLetterQueue(
    @Param('queueName') queueName: string,
    @Query('limit') limit: number = 50,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const dlqItems = await this.queueService.getDeadLetterQueue(
      queueName,
      limit,
    );

    return {
      success: true,
      queue: queueName,
      count: dlqItems.length,
      data: dlqItems,
    };
  }

  /**
   * Get enhanced dead-letter queue items by category
   */
  @Get('/:queueName/dlq/category/:category')
  @ApiOperation({ summary: 'Get dead-letter queue items by category' })
  @ApiParam({ name: 'category', description: 'Error category to filter by' })
  @ApiResponse({
    status: 200,
    description: 'Categorized dead-letter queue items',
  })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getDLQByCategory(
    @Param('queueName') queueName: string,
    @Param('category') category: string,
    @Query('limit') limit: number = 50,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const dlqItems = await this.queueService.getEnhancedDLQByCategory(
      queueName,
      category,
      limit,
    );

    return {
      success: true,
      queue: queueName,
      category,
      count: dlqItems.length,
      data: dlqItems,
    };
  }

  /**
   * Requeue a failed job
   */
  @Post('/:queueName/jobs/:jobId/requeue')
  @ApiOperation({ summary: 'Requeue a failed job' })
  @ApiResponse({ status: 200, description: 'Job requeued successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async requeueJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    try {
      const requeuedJob = await this.queueService.requeueJob(queueName, jobId);

      if (!requeuedJob) {
        throw new BadRequestException(`Failed to requeue job ${jobId}`);
      }

      return {
        success: true,
        message: `Job requeued successfully`,
        data: {
          originalJobId: jobId,
          newJobId: requeuedJob.id,
          queue: queueName,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Requeue jobs from dead-letter queue
   */
  @Post('/:queueName/dlq/requeue')
  @ApiOperation({ summary: 'Requeue jobs from dead-letter queue' })
  @ApiResponse({ status: 200, description: 'Jobs requeued successfully' })
  @ApiResponse({ status: 400, description: 'Invalid queue name or error' })
  async requeueFromDLQ(
    @Param('queueName') queueName: string,
    @Query('limit') limit: number = 10,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const requeuedJobs = await this.queueService.requeueFromDLQ(
      queueName,
      limit,
    );

    return {
      success: true,
      message: `${requeuedJobs.length} jobs requeued from DLQ`,
      queue: queueName,
      data: {
        requeuedCount: requeuedJobs.length,
        jobIds: requeuedJobs.map((job) => job.id),
      },
    };
  }

  /**
   * Bulk requeue jobs from dead-letter queue by category
   */
  @Post('/:queueName/dlq/category/:category/requeue')
  @ApiOperation({
    summary: 'Bulk requeue jobs from dead-letter queue by category',
  })
  @ApiParam({ name: 'category', description: 'Error category to filter by' })
  @ApiResponse({ status: 200, description: 'Jobs requeued successfully' })
  @ApiResponse({ status: 400, description: 'Invalid queue name or error' })
  async bulkRequeueFromDLQByCategory(
    @Param('queueName') queueName: string,
    @Param('category') category: string,
    @Query('limit') limit: number = 10,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const requeuedCount = await this.queueService.bulkProcessDLQByCategory(
      queueName,
      category,
      limit,
    );

    return {
      success: true,
      message: `${requeuedCount} jobs requeued from DLQ category ${category}`,
      queue: queueName,
      category,
      data: {
        requeuedCount,
      },
    };
  }

  /**
   * Resurrect a job from DLQ with options
   */
  @Post('/:queueName/dlq/resurrect/:dlqItemId')
  @ApiOperation({ summary: 'Resurrect a job from DLQ with options' })
  @ApiParam({
    name: 'dlqItemId',
    description: 'ID of the DLQ item to resurrect',
  })
  @ApiBody({ description: 'Resurrection options', required: false })
  @ApiResponse({ status: 200, description: 'Job resurrected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid queue name or error' })
  async resurrectFromDLQ(
    @Param('queueName') queueName: string,
    @Param('dlqItemId') dlqItemId: string,
    @Body() options?: any,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const success = await this.queueService.resurrectJobFromDLQ(
      queueName,
      dlqItemId,
      options,
    );

    return {
      success,
      message: success
        ? `Job ${dlqItemId} resurrected successfully`
        : `Failed to resurrect job ${dlqItemId}`,
    };
  }

  /**
   * Purge queue (remove all jobs)
   */
  @Post('/:queueName/purge')
  @ApiOperation({ summary: 'Purge queue (remove failed jobs)' })
  @ApiResponse({ status: 200, description: 'Queue purged successfully' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async purgeQueue(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const count = await this.queueService.purgeQueue(queueName);

    return {
      success: true,
      message: `Queue ${queueName} purged`,
      data: {
        purgeCounts: count,
      },
    };
  }

  /**
   * Purge DLQ by category
   */
  @Delete('/:queueName/dlq/category/:category/purge')
  @ApiOperation({ summary: 'Purge dead-letter queue items by category' })
  @ApiParam({ name: 'category', description: 'Error category to purge' })
  @ApiResponse({ status: 200, description: 'DLQ items purged successfully' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async purgeDLQByCategory(
    @Param('queueName') queueName: string,
    @Param('category') category: string,
    @Query('olderThanDays') olderThanDays: number = 30,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const deletedCount = await this.queueService.purgeDLQByCategory(
      queueName,
      category,
      olderThanDays,
    );

    return {
      success: true,
      message: `Purged ${deletedCount} items from DLQ category ${category}`,
      queue: queueName,
      category,
      data: {
        deletedCount,
      },
    };
  }

  /**
   * Get queue health status
   */
  @Get('/:queueName/health')
  @ApiOperation({ summary: 'Get queue health status' })
  @ApiResponse({ status: 200, description: 'Queue health status' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getQueueHealth(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const health = await this.queueService.getQueueHealth(queueName);

    return {
      success: true,
      queue: queueName,
      data: health,
    };
  }

  /**
   * Get all queues health status
   */
  @Get('/health/all')
  @ApiOperation({ summary: 'Get health status for all queues' })
  @ApiResponse({ status: 200, description: 'All queues health status' })
  async getAllQueuesHealth() {
    const health = await this.queueService.getAllQueueHealth();

    return {
      success: true,
      data: health,
    };
  }

  /**
   * Get system health summary
   */
  @Get('/health/summary')
  @ApiOperation({ summary: 'Get system health summary' })
  @ApiResponse({ status: 200, description: 'System health summary' })
  async getSystemHealthSummary() {
    const summary = await this.queueService.getSystemHealthSummary();

    return {
      success: true,
      data: summary,
    };
  }

  /**
   * Get queue performance analytics
   */
  @Get('/:queueName/analytics')
  @ApiOperation({ summary: 'Get queue performance analytics' })
  @ApiResponse({ status: 200, description: 'Queue performance analytics' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getPerformanceAnalytics(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const analytics =
      await this.queueService.getPerformanceAnalytics(queueName);

    return {
      success: true,
      queue: queueName,
      data: analytics,
    };
  }

  /**
   * Get queue trend analysis
   */
  @Get('/:queueName/trends')
  @ApiOperation({ summary: 'Get queue trend analysis' })
  @ApiResponse({ status: 200, description: 'Queue trend analysis' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getTrendAnalysis(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const trends = await this.queueService.getTrendAnalysis(queueName);

    return {
      success: true,
      queue: queueName,
      data: trends,
    };
  }

  /**
   * Get queue performance predictions
   */
  @Get('/:queueName/predictions')
  @ApiOperation({ summary: 'Get queue performance predictions' })
  @ApiResponse({ status: 200, description: 'Queue performance predictions' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getPredictions(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const predictions = await this.queueService.getPredictions(queueName);

    return {
      success: true,
      queue: queueName,
      data: predictions,
    };
  }

  /**
   * Get scaling suggestions for a queue
   */
  @Get('/:queueName/scaling-suggestions')
  @ApiOperation({ summary: 'Get scaling suggestions for a queue' })
  @ApiResponse({ status: 200, description: 'Scaling suggestions' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getScalingSuggestions(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const suggestions = await this.queueService.getScalingSuggestion(queueName);

    return {
      success: true,
      queue: queueName,
      data: suggestions,
    };
  }

  /**
   * Get resource utilization for a queue
   */
  @Get('/:queueName/resources')
  @ApiOperation({ summary: 'Get resource utilization for a queue' })
  @ApiResponse({ status: 200, description: 'Resource utilization data' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getResourceUtilization(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const resources = await this.queueService.getResourceUtilization(queueName);

    return {
      success: true,
      queue: queueName,
      data: resources,
    };
  }

  /**
   * Set system load factor for dynamic priority adjustment
   */
  @Put('/load-factor')
  @ApiOperation({
    summary: 'Set system load factor for dynamic priority adjustment',
  })
  @ApiBody({
    description: 'Load factor (0.5-2.0)',
    schema: { type: 'object', properties: { factor: { type: 'number' } } },
  })
  @ApiResponse({ status: 200, description: 'Load factor set successfully' })
  async setSystemLoadFactor(@Body() body: { factor: number }) {
    if (
      typeof body.factor !== 'number' ||
      body.factor < 0.5 ||
      body.factor > 2.0
    ) {
      throw new BadRequestException(
        'Load factor must be a number between 0.5 and 2.0',
      );
    }

    await this.queueService.setSystemLoadFactor(body.factor);

    return {
      success: true,
      message: `System load factor set to ${body.factor}`,
      data: { factor: body.factor },
    };
  }

  /**
   * Get active alerts for a queue
   */
  @Get('/:queueName/alerts')
  @ApiOperation({ summary: 'Get active alerts for a queue' })
  @ApiResponse({ status: 200, description: 'Active alerts' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getActiveAlerts(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const alerts = await this.queueService.getActiveAlerts(queueName);

    return {
      success: true,
      queue: queueName,
      data: alerts,
    };
  }

  /**
   * Bulk add jobs to a queue
   */
  @Post('/:queueName/bulk-add')
  @ApiOperation({ summary: 'Bulk add jobs to a queue' })
  @ApiBody({
    description: 'Array of job specifications',
    schema: { type: 'array', items: { type: 'object' } },
  })
  @ApiResponse({ status: 200, description: 'Bulk job addition result' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async bulkAddJobs(
    @Param('queueName') queueName: string,
    @Body() jobs: Array<{ jobName: string; data: any; options?: any }>,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const result = await this.queueService.bulkAddJobs(queueName, jobs);

    return {
      success: true,
      queue: queueName,
      data: result,
    };
  }
}
