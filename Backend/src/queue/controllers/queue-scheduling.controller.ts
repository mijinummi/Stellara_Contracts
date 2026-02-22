import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Logger,
  BadRequestException,
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
import { EnhancedJobData, JobSchedule } from '../types/enhanced-job.types';

@ApiTags('Queue Scheduling')
@Controller('api/v1/queue/scheduling')
export class QueueSchedulingController {
  private readonly logger = new Logger(QueueSchedulingController.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Schedule a job with advanced scheduling options
   */
  @Post('/:queueName/schedule/:jobName')
  @ApiOperation({ summary: 'Schedule a job with advanced scheduling options' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiParam({ name: 'jobName', description: 'Name of the job' })
  @ApiBody({
    description: 'Job scheduling data and options',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'object' },
        schedule: {
          type: 'object',
          properties: {
            delay: { type: 'number' },
            repeat: {
              type: 'object',
              properties: {
                cron: { type: 'string' },
                every: { type: 'number' },
                limit: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Job scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async scheduleJob(
    @Param('queueName') queueName: string,
    @Param('jobName') jobName: string,
    @Body() body: { data: EnhancedJobData; schedule: JobSchedule },
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const scheduledJob = await this.queueService.scheduleJob(
      queueName,
      jobName,
      body.data,
      body.schedule,
    );

    return {
      success: true,
      message: `Job ${jobName} scheduled successfully in queue ${queueName}`,
      data: scheduledJob,
    };
  }

  /**
   * Schedule a recurring job with cron expression
   */
  @Post('/:queueName/recurring/:jobName')
  @ApiOperation({ summary: 'Schedule a recurring job with cron expression' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiParam({ name: 'jobName', description: 'Name of the job' })
  @ApiBody({
    description: 'Recurring job data and cron expression',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'object' },
        cronExpression: { type: 'string' },
        maxRuns: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Recurring job scheduled successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async scheduleRecurringJob(
    @Param('queueName') queueName: string,
    @Param('jobName') jobName: string,
    @Body()
    body: { data: EnhancedJobData; cronExpression: string; maxRuns?: number },
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const scheduledJob = await this.queueService.scheduleRecurringJob(
      queueName,
      jobName,
      body.data,
      body.cronExpression,
      body.maxRuns,
    );

    return {
      success: true,
      message: `Recurring job ${jobName} scheduled successfully in queue ${queueName}`,
      data: scheduledJob,
    };
  }

  /**
   * Chain two jobs together
   */
  @Post('/chain')
  @ApiOperation({
    summary:
      'Chain two jobs together (first job triggers second upon completion)',
  })
  @ApiBody({
    description: 'Configuration for chaining two jobs',
    schema: {
      type: 'object',
      properties: {
        firstJob: {
          type: 'object',
          properties: {
            queueName: { type: 'string' },
            jobName: { type: 'string' },
            data: { type: 'object' },
            schedule: { type: 'object' },
          },
        },
        secondJob: {
          type: 'object',
          properties: {
            queueName: { type: 'string' },
            jobName: { type: 'string' },
            data: { type: 'object' },
            schedule: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Jobs chained successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid queue name or bad request',
  })
  async chainJobs(
    @Body()
    body: {
      firstJob: {
        queueName: string;
        jobName: string;
        data: EnhancedJobData;
        schedule?: JobSchedule;
      };
      secondJob: {
        queueName: string;
        jobName: string;
        data: EnhancedJobData;
        schedule?: JobSchedule;
      };
    },
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (
      !validQueues.includes(body.firstJob.queueName) ||
      !validQueues.includes(body.secondJob.queueName)
    ) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    const chainedJobs = await this.queueService.chainJobs(
      body.firstJob,
      body.secondJob,
    );

    return {
      success: true,
      message: `Jobs chained successfully: ${body.firstJob.jobName} -> ${body.secondJob.jobName}`,
      data: chainedJobs,
    };
  }

  /**
   * Get all scheduled jobs
   */
  @Get('/scheduled')
  @ApiOperation({ summary: 'Get all scheduled jobs' })
  @ApiResponse({ status: 200, description: 'List of scheduled jobs' })
  async getAllScheduledJobs() {
    // We'll implement a service method to get all scheduled jobs
    // For now, we'll return an empty array as placeholder
    return {
      success: true,
      data: [],
      message:
        'Scheduled jobs retrieval is not yet implemented in the service layer',
    };
  }

  /**
   * Get scheduled jobs for a specific queue
   */
  @Get('/:queueName/scheduled')
  @ApiOperation({ summary: 'Get scheduled jobs for a specific queue' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiResponse({
    status: 200,
    description: 'List of scheduled jobs for the queue',
  })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getScheduledJobsByQueue(@Param('queueName') queueName: string) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    return {
      success: true,
      queue: queueName,
      data: [],
      message:
        'Scheduled jobs retrieval by queue is not yet implemented in the service layer',
    };
  }

  /**
   * Get a specific scheduled job
   */
  @Get('/scheduled/:jobId')
  @ApiOperation({ summary: 'Get a specific scheduled job' })
  @ApiParam({ name: 'jobId', description: 'ID of the scheduled job' })
  @ApiResponse({ status: 200, description: 'Scheduled job details' })
  @ApiResponse({ status: 404, description: 'Scheduled job not found' })
  async getScheduledJob(@Param('jobId') jobId: string) {
    return {
      success: true,
      jobId,
      data: null,
      message:
        'Scheduled job retrieval by ID is not yet implemented in the service layer',
    };
  }

  /**
   * Cancel a scheduled job
   */
  @Delete('/scheduled/:jobId')
  @ApiOperation({ summary: 'Cancel a scheduled job' })
  @ApiParam({ name: 'jobId', description: 'ID of the scheduled job to cancel' })
  @ApiResponse({
    status: 200,
    description: 'Scheduled job cancelled successfully',
  })
  @ApiResponse({ status: 404, description: 'Scheduled job not found' })
  async cancelScheduledJob(@Param('jobId') jobId: string) {
    return {
      success: true,
      jobId,
      message:
        'Scheduled job cancellation is not yet implemented in the service layer',
    };
  }

  /**
   * Trigger a scheduled job manually
   */
  @Post('/scheduled/:jobId/trigger')
  @ApiOperation({ summary: 'Manually trigger a scheduled job' })
  @ApiParam({
    name: 'jobId',
    description: 'ID of the scheduled job to trigger',
  })
  @ApiResponse({
    status: 200,
    description: 'Scheduled job triggered successfully',
  })
  @ApiResponse({ status: 404, description: 'Scheduled job not found' })
  async triggerScheduledJob(@Param('jobId') jobId: string) {
    return {
      success: true,
      jobId,
      message:
        'Manual triggering of scheduled jobs is not yet implemented in the service layer',
    };
  }

  /**
   * Get job dependencies
   */
  @Get('/:queueName/jobs/:jobId/dependencies')
  @ApiOperation({ summary: 'Get dependencies for a specific job' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiParam({ name: 'jobId', description: 'ID of the job' })
  @ApiResponse({ status: 200, description: 'Job dependencies' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getJobDependencies(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    return {
      success: true,
      queue: queueName,
      jobId,
      data: [],
      message:
        'Job dependencies retrieval is not yet implemented in the service layer',
    };
  }

  /**
   * Get chained jobs
   */
  @Get('/:queueName/jobs/:jobId/chained')
  @ApiOperation({ summary: 'Get chained jobs for a specific job' })
  @ApiParam({ name: 'queueName', description: 'Name of the queue' })
  @ApiParam({ name: 'jobId', description: 'ID of the job' })
  @ApiResponse({ status: 200, description: 'Chained jobs' })
  @ApiResponse({ status: 400, description: 'Invalid queue name' })
  async getChainedJobs(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const validQueues = ['deploy-contract', 'process-tts', 'index-market-news'];

    if (!validQueues.includes(queueName)) {
      throw new BadRequestException(
        `Invalid queue name. Valid options: ${validQueues.join(', ')}`,
      );
    }

    return {
      success: true,
      queue: queueName,
      jobId,
      data: [],
      message:
        'Chained jobs retrieval is not yet implemented in the service layer',
    };
  }
}
