import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueueService } from '../services/queue.service';

@Injectable()
export class DLQSchedulerService {
  private readonly logger = new Logger(DLQSchedulerService.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Process scheduled retries every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledRetries() {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];

    try {
      for (const queueName of queueNames) {
        const retriedIds =
          await this.queueService.processScheduledRetries(queueName);

        if (retriedIds.length > 0) {
          this.logger.log(
            `Processed ${retriedIds.length} scheduled retries for queue ${queueName}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to process scheduled retries: ${error.message}`,
      );
    }
  }

  /**
   * Cleanup old metrics every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldMetrics() {
    try {
      await this.queueService['jobMonitoringService'].cleanupOldMetrics();
      this.logger.log('Old metrics cleanup completed');
    } catch (error) {
      this.logger.error(`Failed to cleanup old metrics: ${error.message}`);
    }
  }

  /**
   * Purge old DLQ items daily at 2 AM
   */
  @Cron('0 2 * * *') // Daily at 2 AM
  async purgeOldDLQItems() {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];

    try {
      for (const queueName of queueNames) {
        const deletedCount = await this.queueService.purgeDLQ(queueName, 30); // 30 days

        if (deletedCount > 0) {
          this.logger.log(
            `Purged ${deletedCount} old DLQ items from queue ${queueName}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to purge old DLQ items: ${error.message}`);
    }
  }

  /**
   * Generate queue health report every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async generateHealthReport() {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];

    try {
      for (const queueName of queueNames) {
        const health = await this.queueService.getQueueHealth(queueName);

        if (health.status !== 'healthy') {
          this.logger.warn(
            `Queue ${queueName} health status: ${health.status}. Issues: ${health.issues.join(', ')}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to generate health report: ${error.message}`);
    }
  }
}
