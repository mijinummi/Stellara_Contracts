import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { WebhookConsumer } from '../entities/webhook-consumer.entity';
import { StellarEvent } from '../entities/stellar-event.entity';
import { ConsumerManagementService } from './consumer-management.service';
import { EventStorageService } from './event-storage.service';
import { DeliveryStatus, EventType } from '../types/stellar.types';

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  responseTime?: number;
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private readonly httpClient: AxiosInstance;
  private readonly deliveryQueue: Array<{
    event: StellarEvent;
    consumer: WebhookConsumer;
  }> = [];
  private isProcessingQueue = false;

  constructor(
    private readonly consumerManagementService: ConsumerManagementService,
    private readonly eventStorageService: EventStorageService,
  ) {
    this.httpClient = axios.create({
      timeout: 10000, // 10 second default timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Stellar-Monitor/1.0',
      },
    });

    // Setup automatic queue processing
    setInterval(() => this.processQueue(), 1000); // Process queue every second
  }

  async queueEventForDelivery(event: StellarEvent): Promise<void> {
    const activeConsumers =
      await this.consumerManagementService.getActiveConsumers();

    if (activeConsumers.length === 0) {
      this.logger.debug('No active consumers, marking event as processed');
      await this.eventStorageService.markEventAsProcessed(event.id);
      return;
    }

    // Add event to queue for each active consumer
    for (const consumer of activeConsumers) {
      this.deliveryQueue.push({ event, consumer });
      this.logger.debug(`Queued event ${event.id} for consumer ${consumer.id}`);
    }

    // Start processing if not already running
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.deliveryQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.logger.debug(
      `Processing delivery queue with ${this.deliveryQueue.length} items`,
    );

    try {
      // Process items in batches to avoid overwhelming the system
      const batchSize = 10;
      const batch = this.deliveryQueue.splice(0, batchSize);

      await Promise.all(
        batch.map(async ({ event, consumer }) => {
          await this.deliverEventToConsumer(event, consumer);
        }),
      );
    } catch (error) {
      this.logger.error(
        `Error processing delivery queue: ${error.message}`,
        error.stack,
      );
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async deliverEventToConsumer(
    event: StellarEvent,
    consumer: WebhookConsumer,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Check if consumer is still active (might have been deactivated during queue processing)
      const freshConsumer =
        await this.consumerManagementService.getConsumerById(consumer.id);
      if (!freshConsumer.isActive) {
        this.logger.debug(
          `Skipping delivery to inactive consumer ${consumer.id}`,
        );
        return;
      }

      const result = await this.attemptDelivery(event, freshConsumer);

      const responseTime = Date.now() - startTime;

      if (result.success) {
        this.logger.log(
          `Successfully delivered event ${event.id} to consumer ${consumer.id}`,
        );
        await this.handleSuccessfulDelivery(event, consumer, responseTime);
      } else {
        this.logger.warn(
          `Failed to deliver event ${event.id} to consumer ${consumer.id}: ${result.errorMessage}`,
        );
        await this.handleFailedDelivery(event, consumer, result, responseTime);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(
        `Exception during delivery to consumer ${consumer.id}: ${error.message}`,
        error.stack,
      );
      await this.handleFailedDelivery(
        event,
        consumer,
        {
          success: false,
          errorMessage: error.message,
        },
        responseTime,
      );
    }
  }

  private async attemptDelivery(
    event: StellarEvent,
    consumer: WebhookConsumer,
  ): Promise<DeliveryResult> {
    const payload = {
      id: event.id,
      eventType: event.eventType,
      ledgerSequence: event.ledgerSequence,
      timestamp: event.timestamp.toISOString(),
      transactionHash: event.transactionHash,
      sourceAccount: event.sourceAccount,
      payload: event.payload,
      deliveredAt: new Date().toISOString(),
    };

    const config: AxiosRequestConfig = {
      timeout: consumer.timeoutMs,
      headers: {
        'X-Stellar-Event-ID': event.id,
        'X-Stellar-Event-Type': event.eventType,
        'X-Delivery-Attempt': (event.deliveryAttempts + 1).toString(),
      },
    };

    // Add signature if consumer has a secret
    if (consumer.secret) {
      const signature = this.generateSignature(
        JSON.stringify(payload),
        consumer.secret,
      );
      config.headers = {
        ...config.headers,
        'X-Signature': signature,
      };
    }

    try {
      const response = await this.httpClient.post(
        consumer.url,
        payload,
        config,
      );

      return {
        success: true,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.response?.status,
        errorMessage: error.message,
      };
    }
  }

  private async handleSuccessfulDelivery(
    event: StellarEvent,
    consumer: WebhookConsumer,
    responseTime: number,
  ): Promise<void> {
    // Update event status
    await this.eventStorageService.updateEventStatus(
      event.id,
      DeliveryStatus.DELIVERED,
      consumer.id,
    );

    // Update consumer stats
    await this.consumerManagementService.updateDeliveryStats(consumer.id, true);

    // Mark event as processed if delivered to all consumers
    const activeConsumers =
      await this.consumerManagementService.getActiveConsumers();
    const deliveredCount = (event.deliveredTo?.length || 0) + 1; // +1 for current delivery

    if (deliveredCount >= activeConsumers.length) {
      await this.eventStorageService.markEventAsProcessed(event.id);
    }
  }

  private async handleFailedDelivery(
    event: StellarEvent,
    consumer: WebhookConsumer,
    result: DeliveryResult,
    responseTime: number,
  ): Promise<void> {
    // Update consumer stats
    await this.consumerManagementService.updateDeliveryStats(
      consumer.id,
      false,
    );

    const attemptNumber = event.deliveryAttempts + 1;

    if (attemptNumber >= consumer.maxRetries) {
      // Max retries reached - mark as failed
      await this.eventStorageService.updateEventStatus(
        event.id,
        DeliveryStatus.FAILED,
        consumer.id,
        result.errorMessage,
      );

      this.logger.warn(
        `Max retries reached for event ${event.id} to consumer ${consumer.id}`,
      );
    } else {
      // Schedule retry with exponential backoff
      const delay = this.calculateBackoffDelay(attemptNumber);
      this.logger.debug(
        `Scheduling retry ${attemptNumber}/${consumer.maxRetries} for event ${event.id} in ${delay}ms`,
      );

      setTimeout(() => {
        this.deliveryQueue.push({ event, consumer });
        if (!this.isProcessingQueue) {
          this.processQueue();
        }
      }, delay);
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, etc.
    const baseDelay = 1000; // 1 second
    const maxDelay = 300000; // 5 minutes max
    return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  }

  private generateSignature(payload: string, secret: string): string {
    // In production, use proper HMAC signing
    // This is a simplified example
    return require('crypto')
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  async deliverTestEvent(consumerId: string): Promise<DeliveryResult> {
    const consumer =
      await this.consumerManagementService.getConsumerById(consumerId);

    if (!consumer.isActive) {
      return {
        success: false,
        errorMessage: 'Consumer is not active',
      };
    }

    const testEvent: Partial<StellarEvent> = {
      id: 'test-' + Date.now(),
      eventType: EventType.PAYMENT,
      ledgerSequence: 123456,
      timestamp: new Date(),
      transactionHash: 'test-transaction-hash',
      sourceAccount: 'test-source-account',
      payload: {
        test: true,
        message: 'This is a test event',
      },
    };

    return this.attemptDelivery(testEvent as StellarEvent, consumer);
  }

  getQueueSize(): number {
    return this.deliveryQueue.length;
  }

  async getDeliveryStats(): Promise<{
    queueSize: number;
    activeConsumers: number;
    pendingEvents: number;
  }> {
    const activeConsumers =
      await this.consumerManagementService.getActiveConsumers();
    const pendingEvents = await this.eventStorageService.getPendingEvents();

    return {
      queueSize: this.deliveryQueue.length,
      activeConsumers: activeConsumers.length,
      pendingEvents: pendingEvents.length,
    };
  }
}
