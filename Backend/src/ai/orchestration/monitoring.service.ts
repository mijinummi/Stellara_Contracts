import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface MonitoringMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  fallbacks: number;
  averageResponseTime: number;
  providerStats: Record<string, {
    requests: number;
    successes: number;
    failures: number;
    averageLatency: number;
  }>;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly metrics: MonitoringMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    fallbacks: 0,
    averageResponseTime: 0,
    providerStats: {},
  };
  private responseTimes: number[] = [];

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.setupEventListeners();
  }

  recordCacheHit(requestId: string, responseTime: number): void {
    this.metrics.cacheHits++;
    this.recordResponseTime(responseTime);
    this.logger.debug(`Cache hit recorded for request ${requestId}`);
  }

  recordCacheMiss(requestId: string): void {
    this.metrics.cacheMisses++;
    this.logger.debug(`Cache miss recorded for request ${requestId}`);
  }

  recordProviderSuccess(
    requestId: string,
    provider: string,
    responseTime: number,
    tokensUsed: number
  ): void {
    this.metrics.successfulRequests++;
    this.recordResponseTime(responseTime);
    this.updateProviderStats(provider, true, responseTime);
    this.logger.debug(`Provider success recorded for ${provider} on request ${requestId}`);
  }

  recordProviderFailure(
    requestId: string,
    provider: string,
    error: Error,
    responseTime: number
  ): void {
    this.metrics.failedRequests++;
    this.recordResponseTime(responseTime);
    this.updateProviderStats(provider, false, responseTime);
    this.logger.warn(`Provider failure for ${provider} on request ${requestId}: ${error.message}`);
  }

  recordFallback(requestId: string, responseTime: number): void {
    this.metrics.fallbacks++;
    this.recordResponseTime(responseTime);
    this.logger.debug(`Fallback recorded for request ${requestId}`);
  }

  recordError(requestId: string, error: Error): void {
    this.metrics.failedRequests++;
    this.logger.error(`Error recorded for request ${requestId}: ${error.message}`);
  }

  getStats(): MonitoringMetrics {
    return {
      ...this.metrics,
      averageResponseTime: this.calculateAverageResponseTime(),
    };
  }

  resetStats(): void {
    this.metrics.totalRequests = 0;
    this.metrics.successfulRequests = 0;
    this.metrics.failedRequests = 0;
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
    this.metrics.fallbacks = 0;
    this.metrics.providerStats = {};
    this.responseTimes = [];
    this.logger.log('Monitoring stats reset');
  }

  private setupEventListeners(): void {
    this.eventEmitter.on('ai.request.completed', (data: any) => {
      this.metrics.totalRequests++;
    });

    this.eventEmitter.on('ai.request.failed', (data: any) => {
      this.metrics.totalRequests++;
    });

    this.eventEmitter.on('ai.request.fallback', (data: any) => {
      this.metrics.totalRequests++;
    });
  }

  private recordResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    // Keep only last 1000 response times to prevent memory issues
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
  }

  private updateProviderStats(
    provider: string,
    success: boolean,
    responseTime: number
  ): void {
    if (!this.metrics.providerStats[provider]) {
      this.metrics.providerStats[provider] = {
        requests: 0,
        successes: 0,
        failures: 0,
        averageLatency: 0,
      };
    }

    const stats = this.metrics.providerStats[provider];
    stats.requests++;
    
    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    // Simple moving average for latency
    stats.averageLatency = (stats.averageLatency * (stats.requests - 1) + responseTime) / stats.requests;
  }

  private calculateAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }
}