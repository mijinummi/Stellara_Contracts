import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { QueueService } from '../services/queue.service';
import {
  JobPriorityLevel,
  JobSchedule,
  PRIORITY_WEIGHTS,
} from '../types/enhanced-job.types';

@ApiTags('Enhanced Queue Management')
@Controller('api/v1/queue/enhanced')
export class EnhancedQueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get(':queueName/metrics')
  @ApiOperation({ summary: 'Get comprehensive queue metrics' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({
    status: 200,
    description: 'Queue metrics retrieved successfully',
  })
  async getQueueMetrics(@Param('queueName') queueName: string) {
    return this.queueService.getQueueMetrics(queueName);
  }

  @Get('metrics/all')
  @ApiOperation({ summary: 'Get metrics for all queues' })
  @ApiResponse({
    status: 200,
    description: 'All queue metrics retrieved successfully',
  })
  async getAllQueueMetrics() {
    return this.queueService.getAllQueueMetrics();
  }

  @Get(':queueName/health')
  @ApiOperation({ summary: 'Get queue health status' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({
    status: 200,
    description: 'Queue health status retrieved successfully',
  })
  async getQueueHealth(@Param('queueName') queueName: string) {
    return this.queueService.getQueueHealth(queueName);
  }

  @Get(':queueName/performance')
  @ApiOperation({ summary: 'Get queue performance analytics' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({
    status: 200,
    description: 'Performance analytics retrieved successfully',
  })
  async getPerformanceAnalytics(@Param('queueName') queueName: string) {
    return this.queueService.getPerformanceAnalytics(queueName);
  }

  @Get(':queueName/dlq')
  @ApiOperation({ summary: 'Get enhanced dead letter queue items' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of items to return',
    type: Number,
  })
  @ApiResponse({ status: 200, description: 'DLQ items retrieved successfully' })
  async getDLQItems(
    @Param('queueName') queueName: string,
    @Query('limit') limit?: number,
  ) {
    return this.queueService.getEnhancedDLQ(queueName, limit || 50);
  }

  @Get(':queueName/dlq/stats')
  @ApiOperation({ summary: 'Get DLQ statistics' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({
    status: 200,
    description: 'DLQ statistics retrieved successfully',
  })
  async getDLQStats(@Param('queueName') queueName: string) {
    return this.queueService.getDLQStatistics(queueName);
  }

  @Post(':queueName/dlq/:dlqItemId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a specific job from DLQ' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiParam({ name: 'dlqItemId', description: 'ID of the DLQ item to retry' })
  @ApiResponse({ status: 200, description: 'Job retry initiated successfully' })
  async retryFromDLQ(
    @Param('queueName') queueName: string,
    @Param('dlqItemId') dlqItemId: string,
  ) {
    const success = await this.queueService.retryFromEnhancedDLQ(
      queueName,
      dlqItemId,
    );
    return {
      success,
      message: success ? 'Job retry initiated' : 'Failed to retry job',
    };
  }

  @Post(':queueName/dlq/process-retries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process all scheduled retries from DLQ' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({
    status: 200,
    description: 'Scheduled retries processed successfully',
  })
  async processScheduledRetries(@Param('queueName') queueName: string) {
    const retriedIds =
      await this.queueService.processScheduledRetries(queueName);
    return {
      retriedCount: retriedIds.length,
      retriedIds,
      message: `Processed ${retriedIds.length} scheduled retries`,
    };
  }

  @Delete(':queueName/dlq/purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purge old DLQ items' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiQuery({
    name: 'olderThanDays',
    required: false,
    description: 'Age in days for items to purge',
    type: Number,
  })
  @ApiResponse({ status: 200, description: 'DLQ items purged successfully' })
  async purgeDLQ(
    @Param('queueName') queueName: string,
    @Query('olderThanDays') olderThanDays?: number,
  ) {
    const deletedCount = await this.queueService.purgeDLQ(
      queueName,
      olderThanDays || 30,
    );
    return {
      deletedCount,
      message: `Purged ${deletedCount} old items from DLQ`,
    };
  }

  @Post(':queueName/jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add enhanced job with priority and scheduling' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({ status: 201, description: 'Enhanced job added successfully' })
  async addEnhancedJob(
    @Param('queueName') queueName: string,
    @Body()
    jobData: {
      jobName: string;
      data: any;
      schedule?: {
        delay?: number;
        priority?: {
          level: JobPriorityLevel;
        };
      };
    },
  ) {
    // map the simple schedule object from the HTTP payload to the
    // `JobSchedule` type expected by the service.  If the caller only
    // provided a priority level we inject the corresponding weight so the
    // downstream types remain consistent.
    let schedule: JobSchedule | undefined;
    if (jobData.schedule) {
      schedule = { delay: jobData.schedule.delay };
      if (jobData.schedule.priority) {
        schedule.priority = {
          level: jobData.schedule.priority.level,
          weight: PRIORITY_WEIGHTS[jobData.schedule.priority.level],
        };
      }
    }

    const job = await this.queueService.addEnhancedJob(
      queueName,
      jobData.jobName,
      jobData.data,
      schedule,
    );

    return {
      jobId: job.id,
      queueName,
      jobName: jobData.jobName,
      message: 'Enhanced job added successfully',
    };
  }

  @Get(':queueName/priority-distribution')
  @ApiOperation({ summary: 'Get priority distribution for queue jobs' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({
    status: 200,
    description: 'Priority distribution retrieved successfully',
  })
  async getPriorityDistribution(@Param('queueName') queueName: string) {
    const jobs = await this.queueService.getQueueJobs(queueName);
    // This would need to be implemented in the service
    return {
      message: 'Priority distribution feature',
      totalJobs: jobs.length,
    };
  }
}
