import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import { RedisService } from '../../redis/redis.service';
import {
  JobMetrics,
  QueueMetrics,
  EnhancedJobData,
} from '../types/enhanced-job.types';

export interface AlertConfig {
  threshold: number;
  comparison: 'gt' | 'lt' | 'eq'; // greater than, less than, equal
  metric: keyof JobMetrics;
  duration: number; // in milliseconds
  alertType: 'warning' | 'critical';
}

export interface TrendAnalysis {
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number; // 0-1
  projectedValue: number;
  timeframe: string; // e.g. 'next_hour', 'next_day'
}

export interface PerformancePrediction {
  predictedThroughput: number;
  predictedFailureRate: number;
  confidence: number;
  recommendations: string[];
}

@Injectable()
export class JobMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(JobMonitoringService.name);
  private readonly METRICS_KEY_PREFIX = 'queue:metrics:';
  private readonly ALERTS_KEY_PREFIX = 'queue:alerts:';
  private readonly TRENDS_KEY_PREFIX = 'queue:trends:';
  private readonly PREDICTIONS_KEY_PREFIX = 'queue:predictions:';
  private readonly METRICS_RETENTION_DAYS = 30;

  // Alert configurations
  private alertConfigs: Map<string, AlertConfig[]> = new Map();

  // Active alerts
  private activeAlerts: Map<
    string,
    { timestamp: Date; message: string; severity: string }
  > = new Map();

  constructor(
    @InjectQueue('deploy-contract') private deployContractQueue: Queue,
    @InjectQueue('process-tts') private processTtsQueue: Queue,
    @InjectQueue('index-market-news') private indexMarketNewsQueue: Queue,
    private readonly redisService: RedisService,
  ) {
    this.initializeAlertConfigs();
  }

  async onModuleInit() {
    // Start metrics collection interval
    setInterval(() => {
      this.collectRealTimeMetrics();
    }, 30000); // Collect metrics every 30 seconds
  }

  /**
   * Initialize alert configurations for different queues
   */
  private initializeAlertConfigs(): void {
    // Deploy contract queue alerts
    this.alertConfigs.set('deploy-contract', [
      {
        threshold: 0.1, // 10% failure rate
        comparison: 'gt',
        metric: 'failureRate',
        duration: 300000, // 5 minutes
        alertType: 'critical',
      },
      {
        threshold: 300000, // 5 minutes avg processing time
        comparison: 'gt',
        metric: 'averageProcessingTime',
        duration: 600000, // 10 minutes
        alertType: 'warning',
      },
    ]);

    // TTS queue alerts
    this.alertConfigs.set('process-tts', [
      {
        threshold: 0.05, // 5% failure rate
        comparison: 'gt',
        metric: 'failureRate',
        duration: 120000, // 2 minutes
        alertType: 'warning',
      },
      {
        threshold: 30, // 30 jobs/hour
        comparison: 'lt',
        metric: 'throughput',
        duration: 300000, // 5 minutes
        alertType: 'warning',
      },
    ]);

    // Market news queue alerts
    this.alertConfigs.set('index-market-news', [
      {
        threshold: 0.15, // 15% failure rate
        comparison: 'gt',
        metric: 'failureRate',
        duration: 600000, // 10 minutes
        alertType: 'critical',
      },
      {
        threshold: 100, // 100 items in DLQ
        comparison: 'gt',
        metric: 'dlqSize',
        duration: 300000, // 5 minutes
        alertType: 'warning',
      },
    ]);
  }

  /**
   * Collect real-time metrics for all queues
   */
  async collectRealTimeMetrics(): Promise<void> {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];

    for (const queueName of queueNames) {
      try {
        await this.getQueueMetrics(queueName);
        await this.checkAlerts(queueName);
        await this.analyzeTrends(queueName);
        await this.generatePredictions(queueName);
      } catch (error) {
        this.logger.error(
          `Failed to collect metrics for queue ${queueName}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Get comprehensive metrics for a specific queue
   */
  async getQueueMetrics(queueName: string): Promise<QueueMetrics> {
    const queue = this.getQueueByName(queueName);
    const timestamp = new Date();

    try {
      // Get basic queue counts
      const counts = await queue.getJobCounts();
      const jobs = await this.getAllJobs(queue);

      // Calculate processing times and success rates
      const processingTimes = this.calculateProcessingTimes(jobs);
      const completedJobs = jobs.filter((job) => job.finishedOn);
      const failedJobs = jobs.filter((job) => job.failedReason);

      const metrics: JobMetrics = {
        totalJobs: jobs.length,
        completedJobs: completedJobs.length,
        failedJobs: failedJobs.length,
        activeJobs: counts.active || 0,
        delayedJobs: counts.delayed || 0,
        waitingJobs: counts.waiting || 0,
        averageProcessingTime: processingTimes.average,
        successRate:
          completedJobs.length > 0 ? completedJobs.length / jobs.length : 0,
        failureRate:
          failedJobs.length > 0 ? failedJobs.length / jobs.length : 0,
        throughput: await this.calculateThroughput(queueName),
        dlqSize: await this.getDLQSize(queueName),
      };

      // Store metrics for historical tracking
      await this.storeMetrics(queueName, metrics);

      return {
        queueName,
        metrics,
        timestamp,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get metrics for queue ${queueName}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get metrics for all queues
   */
  async getAllQueueMetrics(): Promise<QueueMetrics[]> {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];

    const metrics = await Promise.all(
      queueNames.map((queueName) => this.getQueueMetrics(queueName)),
    );

    return metrics;
  }

  /**
   * Get historical metrics for a time range
   */
  async getHistoricalMetrics(
    queueName: string,
    startDate: Date,
    endDate: Date,
  ): Promise<QueueMetrics[]> {
    const metricsKey = `${this.METRICS_KEY_PREFIX}${queueName}`;

    try {
      const timestamps = await this.redisService.client.zRangeByScore(
        metricsKey,
        startDate.getTime(),
        endDate.getTime(),
      );

      const metrics: QueueMetrics[] = [];

      for (const timestamp of timestamps) {
        const metricData = await this.redisService.client.hGet(
          `${metricsKey}:data`,
          timestamp,
        );

        if (metricData) {
          metrics.push(JSON.parse(metricData) as QueueMetrics);
        }
      }

      return metrics.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
    } catch (error) {
      this.logger.error(`Failed to get historical metrics: ${error.message}`);
      return [];
    }
  }

  /**
   * Get real-time job status summary
   */
  async getJobStatusSummary(queueName: string): Promise<{
    active: number;
    waiting: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
  }> {
    const queue = this.getQueueByName(queueName);
    const counts = await queue.getJobCounts();

    return {
      active: counts.active || 0,
      waiting: counts.waiting || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    };
  }

  /**
   * Get job performance analytics
   */
  async getPerformanceAnalytics(queueName: string): Promise<{
    averageProcessingTime: number;
    medianProcessingTime: number;
    p95ProcessingTime: number;
    p99ProcessingTime: number;
    jobsPerHour: number;
    errorRate: number;
    retryRate: number;
  }> {
    const queue = this.getQueueByName(queueName);
    const jobs = await this.getAllJobs(queue);
    const completedJobs = jobs.filter(
      (job) => job.finishedOn && !job.failedReason,
    );
    const failedJobs = jobs.filter((job) => job.failedReason);

    const processingTimes = completedJobs
      .map((job) => job.finishedOn - job.processedOn)
      .sort((a, b) => a - b);

    const averageProcessingTime =
      processingTimes.length > 0
        ? processingTimes.reduce((sum, time) => sum + time, 0) /
          processingTimes.length
        : 0;

    const medianProcessingTime =
      processingTimes.length > 0
        ? processingTimes[Math.floor(processingTimes.length / 2)]
        : 0;

    const p95ProcessingTime =
      processingTimes.length > 0
        ? processingTimes[Math.floor(processingTimes.length * 0.95)]
        : 0;

    const p99ProcessingTime =
      processingTimes.length > 0
        ? processingTimes[Math.floor(processingTimes.length * 0.99)]
        : 0;

    const jobsPerHour = await this.calculateThroughput(queueName);
    const errorRate = jobs.length > 0 ? failedJobs.length / jobs.length : 0;
    const retryRate =
      jobs.length > 0
        ? jobs.filter((job) => job.attemptsMade > 1).length / jobs.length
        : 0;

    return {
      averageProcessingTime,
      medianProcessingTime,
      p95ProcessingTime,
      p99ProcessingTime,
      jobsPerHour,
      errorRate,
      retryRate,
    };
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(queueName: string): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
    alerts: Array<{ type: string; message: string; timestamp: Date }>;
  }> {
    const [metrics, alerts] = await Promise.all([
      this.getQueueMetrics(queueName),
      this.getActiveAlerts(queueName),
    ]);

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for high failure rate
    if (metrics.metrics.failureRate > 0.1) {
      // 10% failure rate
      issues.push(
        `High failure rate: ${(metrics.metrics.failureRate * 100).toFixed(2)}%`,
      );
      recommendations.push('Review failed jobs and adjust retry strategies');
    }

    // Check for large DLQ
    if (metrics.metrics.dlqSize > 100) {
      issues.push(`Large dead letter queue: ${metrics.metrics.dlqSize} items`);
      recommendations.push('Process or purge old DLQ items');
    }

    // Check for low throughput
    if (metrics.metrics.throughput < 1) {
      // Less than 1 job per hour
      issues.push('Low job throughput');
      recommendations.push('Check if workers are processing jobs correctly');
    }

    // Check for high average processing time
    if (metrics.metrics.averageProcessingTime > 300000) {
      // More than 5 minutes
      issues.push('High average processing time');
      recommendations.push('Optimize job processing or increase timeouts');
    }

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (alerts.length >= 2 || metrics.metrics.failureRate > 0.3) {
      status = 'critical';
    } else if (alerts.length > 0 || issues.length > 0) {
      status = 'warning';
    }

    return {
      status,
      issues,
      recommendations,
      alerts: alerts.map((alert) => ({
        type: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp,
      })),
    };
  }

  /**
   * Check for alerts based on current metrics
   */
  private async checkAlerts(queueName: string): Promise<void> {
    const metrics = await this.getQueueMetrics(queueName);
    const configs = this.alertConfigs.get(queueName) || [];

    for (const config of configs) {
      const currentValue = metrics.metrics[config.metric];
      let shouldTrigger = false;

      switch (config.comparison) {
        case 'gt':
          shouldTrigger = currentValue > config.threshold;
          break;
        case 'lt':
          shouldTrigger = currentValue < config.threshold;
          break;
        case 'eq':
          shouldTrigger = currentValue === config.threshold;
          break;
      }

      if (shouldTrigger) {
        const alertId = `${queueName}:${config.metric}:${Date.now()}`;
        const alertMessage = `ALERT: ${queueName} ${config.metric} is ${currentValue} which exceeds threshold of ${config.threshold}`;

        this.activeAlerts.set(alertId, {
          timestamp: new Date(),
          message: alertMessage,
          severity: config.alertType,
        });

        this.logger.warn(alertMessage);
      }
    }
  }

  /**
   * Get active alerts for a queue
   */
  async getActiveAlerts(
    queueName: string,
  ): Promise<Array<{ timestamp: Date; message: string; severity: string }>> {
    const alerts = Array.from(this.activeAlerts.entries())
      .filter(([id, alert]) => id.startsWith(queueName + ':'))
      .map(([id, alert]) => alert);

    // Filter to last hour only
    const oneHourAgo = new Date(Date.now() - 3600000);
    return alerts.filter((alert) => alert.timestamp > oneHourAgo);
  }

  /**
   * Clear an alert
   */
  clearAlert(alertId: string): void {
    this.activeAlerts.delete(alertId);
  }

  /**
   * Analyze trends for a queue
   */
  async analyzeTrends(queueName: string): Promise<TrendAnalysis[]> {
    const metrics = await this.getHistoricalMetrics(
      queueName,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last week
      new Date(),
    );

    if (metrics.length < 2) {
      return [];
    }

    const trendAnalyses: TrendAnalysis[] = [];

    // Analyze failure rate trend
    const failureRates = metrics.map((m) => m.metrics.failureRate);
    const failureRateTrend = this.calculateTrend(failureRates);
    trendAnalyses.push({
      metric: 'failureRate',
      trend: failureRateTrend.direction,
      confidence: failureRateTrend.confidence,
      projectedValue: failureRateTrend.projectedValue,
      timeframe: 'next_hour',
    });

    // Analyze throughput trend
    const throughputs = metrics.map((m) => m.metrics.throughput);
    const throughputTrend = this.calculateTrend(throughputs);
    trendAnalyses.push({
      metric: 'throughput',
      trend: throughputTrend.direction,
      confidence: throughputTrend.confidence,
      projectedValue: throughputTrend.projectedValue,
      timeframe: 'next_hour',
    });

    // Analyze average processing time trend
    const processingTimes = metrics.map((m) => m.metrics.averageProcessingTime);
    const processingTimeTrend = this.calculateTrend(processingTimes);
    trendAnalyses.push({
      metric: 'averageProcessingTime',
      trend: processingTimeTrend.direction,
      confidence: processingTimeTrend.confidence,
      projectedValue: processingTimeTrend.projectedValue,
      timeframe: 'next_hour',
    });

    // Store trends in Redis
    await this.storeTrends(queueName, trendAnalyses);

    return trendAnalyses;
  }

  /**
   * Calculate trend direction and projection
   */
  private calculateTrend(values: number[]): {
    direction: 'increasing' | 'decreasing' | 'stable';
    confidence: number;
    projectedValue: number;
  } {
    if (values.length < 2) {
      return {
        direction: 'stable',
        confidence: 0,
        projectedValue: values[0] || 0,
      };
    }

    // Simple linear regression to determine trend
    const n = values.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avg = sumY / n;

    // Determine direction based on slope
    let direction: 'increasing' | 'decreasing' | 'stable';
    if (slope > 0.1) {
      direction = 'increasing';
    } else if (slope < -0.1) {
      direction = 'decreasing';
    } else {
      direction = 'stable';
    }

    // Confidence based on how consistent the trend is
    const variance =
      values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / n;
    const confidence = Math.max(0, Math.min(1, 1 - variance / (avg || 1)));

    // Project next value (simple extrapolation)
    const projectedValue = values[values.length - 1] + slope;

    return { direction, confidence, projectedValue };
  }

  /**
   * Generate performance predictions for a queue
   */
  async generatePredictions(queueName: string): Promise<PerformancePrediction> {
    const [historicalMetrics, trendAnalyses] = await Promise.all([
      this.getHistoricalMetrics(
        queueName,
        new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        new Date(),
      ),
      this.analyzeTrends(queueName),
    ]);

    if (historicalMetrics.length === 0) {
      return {
        predictedThroughput: 0,
        predictedFailureRate: 0,
        confidence: 0,
        recommendations: ['Insufficient data for predictions'],
      };
    }

    // Calculate current averages
    const avgThroughput =
      historicalMetrics.reduce((sum, m) => sum + m.metrics.throughput, 0) /
      historicalMetrics.length;
    const avgFailureRate =
      historicalMetrics.reduce((sum, m) => sum + m.metrics.failureRate, 0) /
      historicalMetrics.length;

    // Apply trend adjustments
    const throughputTrend = trendAnalyses.find(
      (t) => t.metric === 'throughput',
    );
    const failureRateTrend = trendAnalyses.find(
      (t) => t.metric === 'failureRate',
    );

    let predictedThroughput = avgThroughput;
    let predictedFailureRate = avgFailureRate;

    if (throughputTrend) {
      if (throughputTrend.trend === 'increasing') {
        predictedThroughput *= 1.1; // 10% increase
      } else if (throughputTrend.trend === 'decreasing') {
        predictedThroughput *= 0.9; // 10% decrease
      }
    }

    if (failureRateTrend) {
      if (failureRateTrend.trend === 'increasing') {
        predictedFailureRate *= 1.2; // 20% increase
      } else if (failureRateTrend.trend === 'decreasing') {
        predictedFailureRate *= 0.8; // 20% decrease
      }
    }

    // Calculate confidence based on trend confidence
    const throughputConfidence = throughputTrend?.confidence || 0.5;
    const failureRateConfidence = failureRateTrend?.confidence || 0.5;
    const overallConfidence =
      (throughputConfidence + failureRateConfidence) / 2;

    // Generate recommendations based on predictions
    const recommendations: string[] = [];

    if (predictedFailureRate > 0.1) {
      recommendations.push(
        'Expected high failure rate - review retry strategies',
      );
    }

    if (predictedThroughput < 5) {
      recommendations.push(
        'Expected low throughput - consider scaling workers',
      );
    }

    if (predictedFailureRate > 0.2) {
      recommendations.push(
        'Critical failure rate predicted - immediate action required',
      );
    }

    const prediction: PerformancePrediction = {
      predictedThroughput: Math.round(predictedThroughput),
      predictedFailureRate: parseFloat(predictedFailureRate.toFixed(4)),
      confidence: parseFloat(overallConfidence.toFixed(2)),
      recommendations,
    };

    // Store predictions in Redis
    await this.storePredictions(queueName, prediction);

    return prediction;
  }

  /**
   * Get trend analysis for a queue
   */
  async getTrendAnalysis(queueName: string): Promise<TrendAnalysis[]> {
    const trendsKey = `${this.TRENDS_KEY_PREFIX}${queueName}`;

    try {
      const trendData = await this.redisService.client.get(trendsKey);
      if (trendData) {
        return JSON.parse(trendData) as TrendAnalysis[];
      }
      return [];
    } catch (error) {
      this.logger.error(
        `Failed to get trend analysis for ${queueName}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get performance predictions for a queue
   */
  async getPredictions(queueName: string): Promise<PerformancePrediction> {
    const predictionsKey = `${this.PREDICTIONS_KEY_PREFIX}${queueName}`;

    try {
      const predictionData = await this.redisService.client.get(predictionsKey);
      if (predictionData) {
        return JSON.parse(predictionData) as PerformancePrediction;
      }
      return {
        predictedThroughput: 0,
        predictedFailureRate: 0,
        confidence: 0,
        recommendations: [],
      };
    } catch (error) {
      this.logger.error(
        `Failed to get predictions for ${queueName}: ${error.message}`,
      );
      return {
        predictedThroughput: 0,
        predictedFailureRate: 0,
        confidence: 0,
        recommendations: [],
      };
    }
  }

  /**
   * Store trend analysis in Redis
   */
  private async storeTrends(
    queueName: string,
    trends: TrendAnalysis[],
  ): Promise<void> {
    const trendsKey = `${this.TRENDS_KEY_PREFIX}${queueName}`;

    try {
      await this.redisService.client.setEx(
        trendsKey,
        3600, // 1 hour expiry
        JSON.stringify(trends),
      );
    } catch (error) {
      this.logger.error(
        `Failed to store trends for ${queueName}: ${error.message}`,
      );
    }
  }

  /**
   * Store performance predictions in Redis
   */
  private async storePredictions(
    queueName: string,
    prediction: PerformancePrediction,
  ): Promise<void> {
    const predictionsKey = `${this.PREDICTIONS_KEY_PREFIX}${queueName}`;

    try {
      await this.redisService.client.setEx(
        predictionsKey,
        1800, // 30 minutes expiry
        JSON.stringify(prediction),
      );
    } catch (error) {
      this.logger.error(
        `Failed to store predictions for ${queueName}: ${error.message}`,
      );
    }
  }

  /**
   * Clean up old metrics data
   */
  async cleanupOldMetrics(): Promise<void> {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.METRICS_RETENTION_DAYS);

    for (const queueName of queueNames) {
      const metricsKey = `${this.METRICS_KEY_PREFIX}${queueName}`;

      try {
        await this.redisService.client.zRemRangeByScore(
          metricsKey,
          0,
          cutoffDate.getTime(),
        );
      } catch (error) {
        this.logger.error(
          `Failed to cleanup old metrics for ${queueName}: ${error.message}`,
        );
      }
    }
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

  private async getAllJobs(queue: Queue): Promise<Job[]> {
    const statuses = ['active', 'completed', 'failed', 'delayed', 'waiting'];
    const jobs: Job[] = [];

    for (const status of statuses) {
      const statusJobs = await queue.getJobs(status as any);
      jobs.push(...statusJobs);
    }

    return jobs;
  }

  private calculateProcessingTimes(jobs: Job[]): {
    average: number;
    min: number;
    max: number;
  } {
    const completedJobs = jobs.filter(
      (job) => job.finishedOn && job.processedOn,
    );

    if (completedJobs.length === 0) {
      return { average: 0, min: 0, max: 0 };
    }

    const processingTimes = completedJobs.map(
      (job) => job.finishedOn - job.processedOn,
    );
    const average =
      processingTimes.reduce((sum, time) => sum + time, 0) /
      processingTimes.length;
    const min = Math.min(...processingTimes);
    const max = Math.max(...processingTimes);

    return { average, min, max };
  }

  private async calculateThroughput(queueName: string): Promise<number> {
    const oneHourAgo = Date.now() - 3600000; // 1 hour in milliseconds
    const queue = this.getQueueByName(queueName);

    try {
      const jobs = await queue.getJobs(['completed'], 0, -1, true);
      const recentJobs = jobs.filter(
        (job) => job.finishedOn && job.finishedOn > oneHourAgo,
      );

      return recentJobs.length;
    } catch (error) {
      this.logger.error(
        `Failed to calculate throughput for ${queueName}: ${error.message}`,
      );
      return 0;
    }
  }

  private async getDLQSize(queueName: string): Promise<number> {
    const dlqKey = `queue:dlq:${queueName}`;

    try {
      return await this.redisService.client.lLen(dlqKey);
    } catch (error) {
      this.logger.error(
        `Failed to get DLQ size for ${queueName}: ${error.message}`,
      );
      return 0;
    }
  }

  private async storeMetrics(
    queueName: string,
    metrics: JobMetrics,
  ): Promise<void> {
    const metricsKey = `${this.METRICS_KEY_PREFIX}${queueName}`;
    const dataKey = `${metricsKey}:data`;
    const timestamp = Date.now();

    const queueMetrics: QueueMetrics = {
      queueName,
      metrics,
      timestamp: new Date(timestamp),
    };

    try {
      await Promise.all([
        this.redisService.client.zAdd(metricsKey, {
          score: timestamp,
          value: timestamp.toString(),
        }),
        this.redisService.client.hSet(
          dataKey,
          timestamp.toString(),
          JSON.stringify(queueMetrics),
        ),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to store metrics for ${queueName}: ${error.message}`,
      );
    }
  }
}
