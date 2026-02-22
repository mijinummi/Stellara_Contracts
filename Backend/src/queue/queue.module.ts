import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueService } from './services/queue.service';
import { RetryStrategyService } from './services/retry-strategy.service';
import { DeadLetterQueueService } from './services/dead-letter-queue.service';
import { JobPriorityService } from './services/job-priority.service';
import { JobMonitoringService } from './services/job-monitoring.service';
import { JobSchedulingService } from './services/job-scheduling.service';
import { QueueHealthService } from './services/queue-health.service';
import { DeployContractProcessor } from './processors/deploy-contract.processor';
import { ProcessTtsProcessor } from './processors/process-tts.processor';
import { IndexMarketNewsProcessor } from './processors/index-market-news.processor';
import { DLQSchedulerService } from './services/dlq-scheduler.service';
import { QueueAdminController } from './controllers/queue-admin.controller';
import { EnhancedQueueController } from './controllers/enhanced-queue.controller';
import { QueueSchedulingController } from './controllers/queue-scheduling.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable scheduling features
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
          db: configService.get('REDIS_QUEUE_DB') || 1,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'deploy-contract' },
      { name: 'process-tts' },
      { name: 'index-market-news' },
    ),
    RedisModule,
  ],
  controllers: [
    QueueAdminController,
    EnhancedQueueController,
    QueueSchedulingController,
  ],
  providers: [
    QueueService,
    RetryStrategyService,
    DeadLetterQueueService,
    JobPriorityService,
    JobMonitoringService,
    JobSchedulingService,
    QueueHealthService,
    DLQSchedulerService,
    DeployContractProcessor,
    ProcessTtsProcessor,
    IndexMarketNewsProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}
