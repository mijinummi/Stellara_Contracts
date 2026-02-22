import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  DeadLetterQueueItem,
  RetryStrategy,
} from '../types/enhanced-job.types';

export interface DlqResurrectionOptions {
  maxResurrectionAttempts?: number;
  resurrectionDelay?: number;
  modifiedParameters?: Record<string, any>;
}

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);
  private readonly DLQ_PREFIX = 'queue:dlq:enhanced:';
  private readonly DLQ_META_PREFIX = 'queue:dlq:meta:';
  private readonly DLQ_RETRY_SCHEDULE_PREFIX = 'queue:dlq:retry:';
  private readonly DLQ_RETRIED_ITEMS_PREFIX = 'queue:dlq:retried:';
  private readonly DLQ_CATEGORY_PREFIX = 'queue:dlq:category:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Add failed job to enhanced dead letter queue
   */
  async addToDLQ(
    queueName: string,
    jobData: any,
    error: Error,
    attempts: number,
    retryStrategy: RetryStrategy,
    category?: string,
  ): Promise<void> {
    const dlqItem: DeadLetterQueueItem = {
      id: this.generateDLQId(),
      name: queueName,
      data: jobData,
      error: error.message,
      attempts,
      maxAttempts: retryStrategy.maxAttempts,
      failedAt: new Date().toISOString(),
      queueName,
      retryStrategy,
      canRetry: this.canRetryJob(error, attempts, retryStrategy),
      nextRetryAt: this.calculateNextRetry(retryStrategy, attempts),
      category: category || this.categorizeError(error),
      metadata: {
        originalAttempts: attempts,
        addedToDLQAt: new Date().toISOString(),
        resurrectionAttempts: 0,
        resurrectionHistory: [],
      },
    };

    const dlqKey = `${this.DLQ_PREFIX}${queueName}`;
    const dlqItemJson = JSON.stringify(dlqItem);

    try {
      await this.redisService.client.lPush(dlqKey, dlqItemJson);
      await this.updateDLQMetadata(queueName, dlqItem);

      // Add to category-specific list for easier filtering
      if (dlqItem.category) {
        const categoryKey = `${this.DLQ_CATEGORY_PREFIX}${queueName}:${dlqItem.category}`;
        await this.redisService.client.lPush(categoryKey, dlqItemJson);
        await this.redisService.client.expire(categoryKey, 86400 * 30); // 30 days expiry
      }

      if (dlqItem.canRetry && dlqItem.nextRetryAt) {
        await this.scheduleRetry(queueName, dlqItem.id, dlqItem.nextRetryAt);
      }

      this.logger.warn(
        `Job added to DLQ: ${queueName} (ID: ${dlqItem.id}, attempts: ${attempts}/${retryStrategy.maxAttempts}, category: ${dlqItem.category})`,
      );
    } catch (redisError) {
      this.logger.error(`Failed to add job to DLQ: ${redisError.message}`);
      throw redisError;
    }
  }

  /**
   * Get items from dead letter queue
   */
  async getDLQItems(
    queueName: string,
    limit: number = 50,
    offset: number = 0,
    category?: string,
  ): Promise<DeadLetterQueueItem[]> {
    const dlqKey = category
      ? `${this.DLQ_CATEGORY_PREFIX}${queueName}:${category}`
      : `${this.DLQ_PREFIX}${queueName}`;

    try {
      const dlqData = await this.redisService.client.lRange(
        dlqKey,
        offset,
        offset + limit - 1,
      );
      return dlqData
        .map((item) => {
          try {
            return JSON.parse(item) as DeadLetterQueueItem;
          } catch {
            this.logger.warn(
              `Invalid DLQ item format: ${item.substring(0, 100)}...`,
            );
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      this.logger.error(`Failed to get DLQ items: ${error.message}`);
      return [];
    }
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats(queueName: string): Promise<{
    totalItems: number;
    retryableItems: number;
    nonRetryableItems: number;
    scheduledRetries: number;
    categories: Record<string, number>;
    resurrectionStats: {
      totalResurrections: number;
      successRate: number;
    };
  }> {
    const dlqKey = `${this.DLQ_PREFIX}${queueName}`;
    const metaKey = `${this.DLQ_META_PREFIX}${queueName}`;
    const retryScheduleKey = `${this.DLQ_RETRY_SCHEDULE_PREFIX}${queueName}`;
    const retriedKey = `${this.DLQ_RETRIED_ITEMS_PREFIX}${queueName}`;

    try {
      const [totalItems, meta, scheduledRetries, retriedCount, categoryCounts] =
        await Promise.all([
          this.redisService.client.lLen(dlqKey),
          this.redisService.client.hGetAll(metaKey),
          this.redisService.client.zCard(retryScheduleKey),
          this.redisService.client.hLen(retriedKey),
          this.getCategoryCounts(queueName),
        ]);

      // Calculate resurrection success rate
      const resurrectionStats = await this.getResurrectionStats(queueName);

      return {
        totalItems,
        retryableItems: parseInt(meta.retryable || '0'),
        nonRetryableItems: parseInt(meta.nonRetryable || '0'),
        scheduledRetries,
        categories: categoryCounts,
        resurrectionStats,
      };
    } catch (error) {
      this.logger.error(`Failed to get DLQ stats: ${error.message}`);
      return {
        totalItems: 0,
        retryableItems: 0,
        nonRetryableItems: 0,
        scheduledRetries: 0,
        categories: {},
        resurrectionStats: {
          totalResurrections: 0,
          successRate: 0,
        },
      };
    }
  }

  /**
   * Get category counts for DLQ items
   */
  private async getCategoryCounts(
    queueName: string,
  ): Promise<Record<string, number>> {
    const categories = [
      'network-error',
      'timeout-error',
      'validation-error',
      'resource-error',
      'permission-error',
      'unknown-error',
    ];

    const counts: Record<string, number> = {};

    for (const category of categories) {
      const categoryKey = `${this.DLQ_CATEGORY_PREFIX}${queueName}:${category}`;
      try {
        counts[category] = await this.redisService.client.lLen(categoryKey);
      } catch {
        counts[category] = 0;
      }
    }

    return counts;
  }

  /**
   * Get resurrection statistics
   */
  private async getResurrectionStats(queueName: string): Promise<{
    totalResurrections: number;
    successRate: number;
  }> {
    const retriedKey = `${this.DLQ_RETRIED_ITEMS_PREFIX}${queueName}`;

    try {
      const allRetriedItems =
        await this.redisService.client.hGetAll(retriedKey);
      const totalRetried = Object.keys(allRetriedItems).length;

      if (totalRetried === 0) {
        return { totalResurrections: 0, successRate: 0 };
      }

      const successfulRetries = Object.values(allRetriedItems).filter(
        (value) => {
          try {
            const parsed = JSON.parse(value);
            return parsed.success === true;
          } catch {
            return false;
          }
        },
      ).length;

      return {
        totalResurrections: totalRetried,
        successRate: successfulRetries / totalRetried,
      };
    } catch (error) {
      this.logger.error(`Failed to get resurrection stats: ${error.message}`);
      return { totalResurrections: 0, successRate: 0 };
    }
  }

  /**
   * Manually retry a job from DLQ
   */
  async retryFromDLQ(queueName: string, dlqItemId: string): Promise<boolean> {
    return this.resurrectJob(queueName, dlqItemId);
  }

  /**
   * Resurrect a job from DLQ with optional modifications
   */
  async resurrectJob(
    queueName: string,
    dlqItemId: string,
    options?: DlqResurrectionOptions,
  ): Promise<boolean> {
    const dlqKey = `${this.DLQ_PREFIX}${queueName}`;
    const dlqItems = await this.getDLQItems(queueName, 1000); // Get more items to find the target

    const targetItem = dlqItems.find((item) => item.id === dlqItemId);
    if (!targetItem) {
      this.logger.warn(`DLQ item ${dlqItemId} not found in queue ${queueName}`);
      return false;
    }

    // Check resurrection limits
    const maxResurrectionAttempts = options?.maxResurrectionAttempts || 3;
    if (
      (targetItem.metadata?.resurrectionAttempts ?? 0) >=
      maxResurrectionAttempts
    ) {
      this.logger.warn(
        `Max resurrection attempts reached for DLQ item ${dlqItemId}`,
      );
      return false;
    }

    try {
      // Modify job data if needed
      let modifiedData = { ...targetItem.data };
      if (options?.modifiedParameters) {
        modifiedData = { ...modifiedData, ...options.modifiedParameters };
      }

      // Update resurrection metadata
      const updatedMetadata = {
        originalAttempts: targetItem.metadata?.originalAttempts ?? 0,
        addedToDLQAt:
          targetItem.metadata?.addedToDLQAt ?? new Date().toISOString(),
        resurrectionAttempts:
          (targetItem.metadata?.resurrectionAttempts || 0) + 1,
        resurrectionHistory: [
          ...(targetItem.metadata?.resurrectionHistory || []),
          {
            attemptedAt: new Date().toISOString(),
            reason: 'manual_resurrection',
            parametersModified: !!options?.modifiedParameters,
          },
        ],
      };

      // Create updated DLQ item
      const updatedItem: DeadLetterQueueItem = {
        ...targetItem,
        data: modifiedData,
        metadata: updatedMetadata,
      };

      // Remove from main DLQ
      await this.redisService.client.lRem(
        dlqKey,
        1,
        JSON.stringify(targetItem),
      );

      // Remove from category-specific list
      if (targetItem.category) {
        const categoryKey = `${this.DLQ_CATEGORY_PREFIX}${queueName}:${targetItem.category}`;
        await this.redisService.client.lRem(
          categoryKey,
          1,
          JSON.stringify(targetItem),
        );
      }

      // Remove from retry schedule if exists
      const retryScheduleKey = `${this.DLQ_RETRY_SCHEDULE_PREFIX}${queueName}`;
      await this.redisService.client.zRem(retryScheduleKey, dlqItemId);

      // Update metadata
      await this.decrementDLQCount(queueName, targetItem.canRetry);

      this.logger.log(
        `DLQ item ${dlqItemId} resurrected from queue ${queueName}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to resurrect DLQ item ${dlqItemId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Process scheduled retries
   */
  async processScheduledRetries(queueName: string): Promise<string[]> {
    const retryScheduleKey = `${this.DLQ_RETRY_SCHEDULE_PREFIX}${queueName}`;
    const now = Date.now();

    try {
      // Get items scheduled for retry now or in the past
      const itemsToRetry = await this.redisService.client.zRangeByScore(
        retryScheduleKey,
        0,
        now,
        { LIMIT: { offset: 0, count: 100 } },
      );

      const retriedIds: string[] = [];

      for (const dlqItemId of itemsToRetry) {
        const success = await this.retryFromDLQ(queueName, dlqItemId);
        if (success) {
          retriedIds.push(dlqItemId);

          // Track retry result
          await this.trackRetryResult(queueName, dlqItemId, success);
        }
      }

      if (retriedIds.length > 0) {
        this.logger.log(
          `Processed ${retriedIds.length} scheduled retries for queue ${queueName}`,
        );
      }

      return retriedIds;
    } catch (error) {
      this.logger.error(
        `Failed to process scheduled retries: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Process automated retries based on error category
   */
  async processAutomatedRetries(
    queueName: string,
    category: string,
    limit: number = 10,
  ): Promise<string[]> {
    const dlqItems = await this.getDLQItems(queueName, limit, 0, category);
    const processedIds: string[] = [];

    for (const item of dlqItems) {
      // Only retry items that are eligible for retry and haven't been recently processed
      if (item.canRetry && !this.hasBeenRecentlyProcessed(item.id)) {
        const success = await this.resurrectJob(queueName, item.id);
        if (success) {
          processedIds.push(item.id);
          await this.trackRetryResult(queueName, item.id, success);
        }
      }
    }

    this.logger.log(
      `Processed ${processedIds.length} automated retries for category ${category} in queue ${queueName}`,
    );
    return processedIds;
  }

  /**
   * Track retry result for analytics
   */
  private async trackRetryResult(
    queueName: string,
    itemId: string,
    success: boolean,
  ): Promise<void> {
    const retriedKey = `${this.DLQ_RETRIED_ITEMS_PREFIX}${queueName}`;
    const resultData = {
      success,
      retriedAt: new Date().toISOString(),
      itemId,
    };

    await this.redisService.client.hSet(
      retriedKey,
      itemId,
      JSON.stringify(resultData),
    );
    await this.redisService.client.expire(retriedKey, 86400 * 7); // Expire after 7 days
  }

  /**
   * Check if item has been recently processed to avoid duplicate processing
   */
  private async hasBeenRecentlyProcessed(itemId: string): Promise<boolean> {
    // Implementation would check if item was recently processed
    // For now, return false to allow processing
    return false;
  }

  /**
   * Categorize error for better DLQ organization
   */
  private categorizeError(error: Error): string {
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
   * Purge old DLQ items
   */
  async purgeDLQ(
    queueName: string,
    olderThanDays: number = 30,
    category?: string,
  ): Promise<number> {
    const dlqKey = category
      ? `${this.DLQ_CATEGORY_PREFIX}${queueName}:${category}`
      : `${this.DLQ_PREFIX}${queueName}`;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    try {
      const dlqItems = await this.getDLQItems(queueName, 1000, 0, category); // Get a large batch
      const itemsToDelete = dlqItems.filter(
        (item) => new Date(item.failedAt) < cutoffDate,
      );

      let deletedCount = 0;
      for (const item of itemsToDelete) {
        await this.redisService.client.lRem(dlqKey, 1, JSON.stringify(item));
        deletedCount++;

        // Also remove from main DLQ if purging by category
        if (category) {
          const mainDlqKey = `${this.DLQ_PREFIX}${queueName}`;
          await this.redisService.client.lRem(
            mainDlqKey,
            1,
            JSON.stringify(item),
          );
        }
      }

      this.logger.log(
        `Purged ${deletedCount} old items from DLQ ${queueName}${category ? ` (category: ${category})` : ''}`,
      );
      return deletedCount;
    } catch (error) {
      this.logger.error(`Failed to purge DLQ: ${error.message}`);
      return 0;
    }
  }

  /**
   * Bulk requeue items from DLQ by category
   */
  async bulkRequeueByCategory(
    queueName: string,
    category: string,
    limit: number = 10,
  ): Promise<number> {
    const dlqItems = await this.getDLQItems(queueName, limit, 0, category);
    let requeuedCount = 0;

    for (const item of dlqItems) {
      const success = await this.resurrectJob(queueName, item.id);
      if (success) {
        requeuedCount++;
      }
    }

    this.logger.log(
      `Bulk requeued ${requeuedCount} items from category ${category} in queue ${queueName}`,
    );
    return requeuedCount;
  }

  /**
   * Get DLQ items by error category
   */
  async getItemsByCategory(
    queueName: string,
    category: string,
    limit: number = 50,
  ): Promise<DeadLetterQueueItem[]> {
    return this.getDLQItems(queueName, limit, 0, category);
  }

  private generateDLQId(): string {
    return `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private canRetryJob(
    error: Error,
    attempts: number,
    strategy: RetryStrategy,
  ): boolean {
    if (attempts >= strategy.maxAttempts) {
      return false;
    }

    const nonRetryableErrors = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'InvalidInputError',
    ];

    return !nonRetryableErrors.some((errorType) => error.name === errorType);
  }

  private calculateNextRetry(
    strategy: RetryStrategy,
    attempts: number,
  ): string | undefined {
    if (attempts >= strategy.maxAttempts) {
      return undefined;
    }

    const delay = this.calculateDelay(strategy, attempts);
    const nextRetryAt = new Date(Date.now() + delay);
    return nextRetryAt.toISOString();
  }

  private calculateDelay(strategy: RetryStrategy, attempt: number): number {
    switch (strategy.type) {
      case 'exponential':
        const baseDelay = strategy.delay;
        const multiplier = strategy.backoffMultiplier || 2;
        const delay = baseDelay * Math.pow(multiplier, attempt);
        const maxDelay = strategy.maxDelay || 300000;
        return Math.min(delay, maxDelay);

      case 'fixed':
        return strategy.delay;

      case 'linear':
        return Math.min(strategy.delay * attempt, strategy.maxDelay || 120000);

      default:
        return strategy.delay;
    }
  }

  private async updateDLQMetadata(
    queueName: string,
    dlqItem: DeadLetterQueueItem,
  ): Promise<void> {
    const metaKey = `${this.DLQ_META_PREFIX}${queueName}`;

    if (dlqItem.canRetry) {
      await this.redisService.client.hIncrBy(metaKey, 'retryable', 1);
    } else {
      await this.redisService.client.hIncrBy(metaKey, 'nonRetryable', 1);
    }

    await this.redisService.client.hIncrBy(metaKey, 'total', 1);
  }

  private async decrementDLQCount(
    queueName: string,
    wasRetryable: boolean,
  ): Promise<void> {
    const metaKey = `${this.DLQ_META_PREFIX}${queueName}`;

    if (wasRetryable) {
      await this.redisService.client.hIncrBy(metaKey, 'retryable', -1);
    } else {
      await this.redisService.client.hIncrBy(metaKey, 'nonRetryable', -1);
    }

    await this.redisService.client.hIncrBy(metaKey, 'total', -1);
  }

  private async scheduleRetry(
    queueName: string,
    dlqItemId: string,
    nextRetryAt: string,
  ): Promise<void> {
    const retryScheduleKey = `${this.DLQ_RETRY_SCHEDULE_PREFIX}${queueName}`;
    const retryTimestamp = new Date(nextRetryAt).getTime();

    await this.redisService.client.zAdd(retryScheduleKey, {
      score: retryTimestamp,
      value: dlqItemId,
    });
  }
}
