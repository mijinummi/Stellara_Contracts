import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { RedisService } from '../../redis/redis.service';
import { JobMonitoringService } from './job-monitoring.service';
import { JobPriorityService } from './job-priority.service';
import { RetryStrategyService } from './retry-strategy.service';

export interface HealthStatus {
  queueName: string;
  status: 'healthy' | 'warning' | 'critical';
  score: number; // 0-100 scale
  timestamp: Date;
  checks: HealthCheckResult[];
  recommendations: string[];
  metrics: {
    activeJobs: number;
    waitingJobs: number;
    failedJobs: number;
    completedJobs: number;
    processingTime: number;
    failureRate: number;
    throughput: number;
  };
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  value: number | string;
  threshold: number | string;
}

export interface ScalingRecommendation {
  queueName: string;
  currentWorkers: number;
  recommendedWorkers: number;
  reason: string;
  confidence: number; // 0-1
}

@Injectable()
export class QueueHealthService implements OnModuleInit {
  private readonly logger = new Logger(QueueHealthService.name);
  private readonly HEALTH_STATUS_KEY = 'queue:health-status';
  private readonly SCALING_SUGGESTIONS_KEY = 'queue:scaling-suggestions';
  private readonly HEALTH_HISTORY_KEY = 'queue:health-history';
  private readonly ALERTS_KEY = 'queue:alerts';

  constructor(
    @InjectQueue('deploy-contract') private deployContractQueue: Queue,
    @InjectQueue('process-tts') private processTtsQueue: Queue,
    @InjectQueue('index-market-news') private indexMarketNewsQueue: Queue,
    private readonly redisService: RedisService,
    private readonly jobMonitoringService: JobMonitoringService,
    private readonly jobPriorityService: JobPriorityService,
    private readonly retryStrategyService: RetryStrategyService,
  ) {}

  async onModuleInit() {
    // Run initial health checks
    await this.performHealthChecks();

    // Set up periodic health checks
    setInterval(() => {
      this.performHealthChecks();
    }, 60000); // Check every minute
  }

  /**
   * Perform comprehensive health checks for all queues
   */
  async performHealthChecks(): Promise<HealthStatus[]> {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];
    const healthResults: HealthStatus[] = [];

    for (const queueName of queueNames) {
      const health = await this.checkQueueHealth(queueName);
      healthResults.push(health);

      // Store health status
      await this.storeHealthStatus(health);

      // Generate scaling suggestions
      const scalingRec = await this.generateScalingRecommendation(queueName);
      await this.storeScalingSuggestion(scalingRec);

      // Check for alerts
      await this.checkAlerts(health);
    }

    return healthResults;
  }

  /**
   * Check health of a specific queue
   */
  async checkQueueHealth(queueName: string): Promise<HealthStatus> {
    const [metrics, performance] = await Promise.all([
      this.jobMonitoringService.getQueueMetrics(queueName),
      this.jobMonitoringService.getPerformanceAnalytics(queueName),
    ]);

    const checks: HealthCheckResult[] = [];

    // Check 1: Failure rate
    const failureRateCheck: HealthCheckResult = {
      name: 'failure_rate',
      status: 'pass',
      message: `Failure rate is ${metrics.metrics.failureRate.toFixed(4)}`,
      value: metrics.metrics.failureRate,
      threshold: 0.1, // 10% threshold
    };

    if (metrics.metrics.failureRate > 0.1) {
      failureRateCheck.status = 'fail';
      failureRateCheck.message = `FAILURE RATE HIGH: ${metrics.metrics.failureRate.toFixed(4)} > 0.1`;
    } else if (metrics.metrics.failureRate > 0.05) {
      failureRateCheck.status = 'warn';
      failureRateCheck.message = `FAILURE RATE ELEVATED: ${metrics.metrics.failureRate.toFixed(4)} > 0.05`;
    }

    checks.push(failureRateCheck);

    // Check 2: Average processing time
    const processingTimeCheck: HealthCheckResult = {
      name: 'avg_processing_time',
      status: 'pass',
      message: `Average processing time is ${performance.averageProcessingTime}ms`,
      value: performance.averageProcessingTime,
      threshold: 300000, // 5 minutes threshold
    };

    if (performance.averageProcessingTime > 600000) {
      // 10 minutes
      processingTimeCheck.status = 'fail';
      processingTimeCheck.message = `PROCESSING TIME CRITICAL: ${performance.averageProcessingTime}ms > 600000ms`;
    } else if (performance.averageProcessingTime > 300000) {
      // 5 minutes
      processingTimeCheck.status = 'warn';
      processingTimeCheck.message = `PROCESSING TIME ELEVATED: ${performance.averageProcessingTime}ms > 300000ms`;
    }

    checks.push(processingTimeCheck);

    // Check 3: Queue backlog
    const backlogCheck: HealthCheckResult = {
      name: 'queue_backlog',
      status: 'pass',
      message: `Queue has ${metrics.metrics.waitingJobs} waiting jobs`,
      value: metrics.metrics.waitingJobs,
      threshold: 50, // 50 jobs threshold
    };

    if (metrics.metrics.waitingJobs > 100) {
      backlogCheck.status = 'fail';
      backlogCheck.message = `QUEUE BACKLOG CRITICAL: ${metrics.metrics.waitingJobs} > 100 jobs`;
    } else if (metrics.metrics.waitingJobs > 50) {
      backlogCheck.status = 'warn';
      backlogCheck.message = `QUEUE BACKLOG ELEVATED: ${metrics.metrics.waitingJobs} > 50 jobs`;
    }

    checks.push(backlogCheck);

    // Check 4: Throughput
    const throughputCheck: HealthCheckResult = {
      name: 'throughput',
      status: 'pass',
      message: `Throughput is ${metrics.metrics.throughput} jobs/hour`,
      value: metrics.metrics.throughput,
      threshold: 10, // 10 jobs/hour minimum
    };

    if (metrics.metrics.throughput < 1) {
      throughputCheck.status = 'fail';
      throughputCheck.message = `THROUGHPUT CRITICAL: ${metrics.metrics.throughput} < 1 job/hour`;
    } else if (metrics.metrics.throughput < 10) {
      throughputCheck.status = 'warn';
      throughputCheck.message = `THROUGHPUT LOW: ${metrics.metrics.throughput} < 10 jobs/hour`;
    }

    checks.push(throughputCheck);

    // Check 5: DLQ size
    const dlqCheck: HealthCheckResult = {
      name: 'dlq_size',
      status: 'pass',
      message: `DLQ has ${metrics.metrics.dlqSize} items`,
      value: metrics.metrics.dlqSize,
      threshold: 20, // 20 items threshold
    };

    if (metrics.metrics.dlqSize > 100) {
      dlqCheck.status = 'fail';
      dlqCheck.message = `DLQ SIZE CRITICAL: ${metrics.metrics.dlqSize} > 100 items`;
    } else if (metrics.metrics.dlqSize > 20) {
      dlqCheck.status = 'warn';
      dlqCheck.message = `DLQ SIZE ELEVATED: ${metrics.metrics.dlqSize} > 20 items`;
    }

    checks.push(dlqCheck);

    // Calculate overall health score
    let score = 100;
    const failingChecks = checks.filter(
      (check) => check.status === 'fail',
    ).length;
    const warningChecks = checks.filter(
      (check) => check.status === 'warn',
    ).length;

    score -= failingChecks * 30; // 30 points per failing check
    score -= warningChecks * 10; // 10 points per warning check
    score = Math.max(0, Math.min(100, score)); // Clamp between 0 and 100

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (score < 30) {
      status = 'critical';
    } else if (score < 70) {
      status = 'warning';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (status !== 'healthy') {
      if (failingChecks > 0) {
        recommendations.push(
          'Immediate attention required - multiple critical issues detected',
        );
      }
      if (warningChecks > 0) {
        recommendations.push('Monitor closely - several issues need attention');
      }
    }

    if (metrics.metrics.failureRate > 0.1) {
      recommendations.push('Investigate root cause of high failure rate');
      recommendations.push('Review and adjust retry strategies');
    }

    if (performance.averageProcessingTime > 300000) {
      recommendations.push('Optimize job processing performance');
      recommendations.push('Consider increasing worker resources');
    }

    if (metrics.metrics.waitingJobs > 50) {
      recommendations.push('Scale up worker processes to handle backlog');
    }

    if (metrics.metrics.dlqSize > 20) {
      recommendations.push('Process dead letter queue items');
      recommendations.push('Review jobs causing failures');
    }

    return {
      queueName,
      status,
      score,
      timestamp: new Date(),
      checks,
      recommendations,
      metrics: {
        activeJobs: metrics.metrics.activeJobs,
        waitingJobs: metrics.metrics.waitingJobs,
        failedJobs: metrics.metrics.failedJobs,
        completedJobs: metrics.metrics.completedJobs,
        processingTime: performance.averageProcessingTime,
        failureRate: metrics.metrics.failureRate,
        throughput: metrics.metrics.throughput,
      },
    };
  }

  /**
   * Get health status for a specific queue
   */
  async getQueueHealth(queueName: string): Promise<HealthStatus> {
    const healthData = await this.redisService.client.hGet(
      this.HEALTH_STATUS_KEY,
      queueName,
    );

    if (healthData) {
      return JSON.parse(healthData) as HealthStatus;
    }

    // If not cached, perform fresh check
    return this.checkQueueHealth(queueName);
  }

  /**
   * Get health status for all queues
   */
  async getAllQueueHealth(): Promise<HealthStatus[]> {
    const queueNames = ['deploy-contract', 'process-tts', 'index-market-news'];
    return Promise.all(queueNames.map((name) => this.getQueueHealth(name)));
  }

  /**
   * Generate scaling recommendation for a queue
   */
  async generateScalingRecommendation(
    queueName: string,
  ): Promise<ScalingRecommendation> {
    const health = await this.getQueueHealth(queueName);
    const currentWorkers = await this.getCurrentWorkerCount(queueName);

    let recommendedWorkers = currentWorkers;
    let reason = 'No scaling needed';
    let confidence = 0.5; // Default confidence

    // Base recommendation on current metrics
    if (health.metrics.waitingJobs > 50) {
      // Scale up due to backlog
      recommendedWorkers = Math.min(currentWorkers + 2, currentWorkers * 2); // Cap growth
      reason = `Queue backlog of ${health.metrics.waitingJobs} jobs detected`;
      confidence = 0.8;
    } else if (health.metrics.waitingJobs < 5 && currentWorkers > 1) {
      // Scale down if queue is underutilized
      recommendedWorkers = Math.max(1, currentWorkers - 1);
      reason = 'Queue underutilized with few waiting jobs';
      confidence = 0.7;
    } else if (health.metrics.failureRate > 0.1) {
      // Scale up to handle potential load issues causing failures
      recommendedWorkers = Math.min(currentWorkers + 1, currentWorkers * 1.5);
      reason = `High failure rate (${(health.metrics.failureRate * 100).toFixed(2)}%) may indicate resource constraints`;
      confidence = 0.6;
    } else if (health.metrics.processingTime > 300000) {
      // Scale up due to slow processing
      recommendedWorkers = Math.min(currentWorkers + 1, currentWorkers * 1.5);
      reason = `High average processing time (${health.metrics.processingTime}ms) indicates resource constraints`;
      confidence = 0.75;
    }

    return {
      queueName,
      currentWorkers,
      recommendedWorkers,
      reason,
      confidence,
    };
  }

  /**
   * Get scaling suggestion for a queue
   */
  async getScalingSuggestion(
    queueName: string,
  ): Promise<ScalingRecommendation | null> {
    const suggestionData = await this.redisService.client.hGet(
      this.SCALING_SUGGESTIONS_KEY,
      queueName,
    );

    if (suggestionData) {
      return JSON.parse(suggestionData) as ScalingRecommendation;
    }

    return null;
  }

  /**
   * Get current worker count for a queue (simulated)
   */
  private async getCurrentWorkerCount(queueName: string): Promise<number> {
    // In a real implementation, this would connect to the actual worker manager
    // For now, we'll return a simulated value based on queue type
    switch (queueName) {
      case 'deploy-contract':
        return 2; // Heavy operation, fewer workers
      case 'process-tts':
        return 4; // Moderate operation, more workers
      case 'index-market-news':
        return 3; // Moderate operation, balanced workers
      default:
        return 2;
    }
  }

  /**
   * Predictive health analysis
   */
  async predictHealth(
    queueName: string,
    timeframeHours: number = 1,
  ): Promise<HealthStatus> {
    const health = await this.getQueueHealth(queueName);
    const trends = await this.jobMonitoringService.getTrendAnalysis(queueName);

    // Simulate future health based on trends
    const predictedMetrics = { ...health.metrics };

    // Apply trend adjustments
    for (const trend of trends) {
      switch (trend.metric) {
        case 'failureRate':
          if (trend.trend === 'increasing') {
            predictedMetrics.failureRate *= 1.2;
          } else if (trend.trend === 'decreasing') {
            predictedMetrics.failureRate *= 0.8;
          }
          break;
        case 'throughput':
          if (trend.trend === 'increasing') {
            predictedMetrics.throughput *= 1.1;
          } else if (trend.trend === 'decreasing') {
            predictedMetrics.throughput *= 0.9;
          }
          break;
        case 'averageProcessingTime':
          if (trend.trend === 'increasing') {
            predictedMetrics.processingTime *= 1.15;
          } else if (trend.trend === 'decreasing') {
            predictedMetrics.processingTime *= 0.85;
          }
          break;
      }
    }

    // Create a predicted health status
    const predictedHealth: HealthStatus = {
      ...health,
      timestamp: new Date(Date.now() + timeframeHours * 60 * 60 * 1000),
      metrics: predictedMetrics,
      recommendations: [
        `Predicted health for next ${timeframeHours} hour(s)`,
      ].concat(health.recommendations),
    };

    // Recalculate status based on predicted metrics
    let score = 100;
    if (predictedMetrics.failureRate > 0.1) score -= 40;
    else if (predictedMetrics.failureRate > 0.05) score -= 20;

    if (predictedMetrics.processingTime > 600000) score -= 40;
    else if (predictedMetrics.processingTime > 300000) score -= 20;

    if (predictedMetrics.waitingJobs > 100) score -= 40;
    else if (predictedMetrics.waitingJobs > 50) score -= 20;

    if (predictedMetrics.throughput < 1) score -= 40;
    else if (predictedMetrics.throughput < 10) score -= 10;

    predictedHealth.score = Math.max(0, Math.min(100, score));

    if (predictedHealth.score < 30) predictedHealth.status = 'critical';
    else if (predictedHealth.score < 70) predictedHealth.status = 'warning';

    return predictedHealth;
  }

  /**
   * Check for alerts based on health status
   */
  private async checkAlerts(health: HealthStatus): Promise<void> {
    if (health.status === 'critical') {
      const alertMessage = `CRITICAL ALERT: Queue ${health.queueName} health is critical (score: ${health.score})`;
      this.logger.error(alertMessage);

      // Store alert
      await this.redisService.client.lPush(
        this.ALERTS_KEY,
        JSON.stringify({
          queueName: health.queueName,
          level: 'critical',
          message: alertMessage,
          timestamp: new Date().toISOString(),
        }),
      );
    } else if (health.status === 'warning') {
      const alertMessage = `WARNING: Queue ${health.queueName} health is degraded (score: ${health.score})`;
      this.logger.warn(alertMessage);

      // Store alert
      await this.redisService.client.lPush(
        this.ALERTS_KEY,
        JSON.stringify({
          queueName: health.queueName,
          level: 'warning',
          message: alertMessage,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(limit: number = 10): Promise<any[]> {
    const alerts = await this.redisService.client.lRange(
      this.ALERTS_KEY,
      0,
      limit - 1,
    );
    return alerts.map((alert) => JSON.parse(alert));
  }

  /**
   * Clear alerts
   */
  async clearAlerts(): Promise<void> {
    await this.redisService.client.del(this.ALERTS_KEY);
  }

  /**
   * Store health status in Redis
   */
  private async storeHealthStatus(health: HealthStatus): Promise<void> {
    try {
      await this.redisService.client.hSet(
        this.HEALTH_STATUS_KEY,
        health.queueName,
        JSON.stringify(health),
      );

      // Also store in history for trend analysis
      const historyKey = `${this.HEALTH_HISTORY_KEY}:${health.queueName}`;
      const timestamp = Date.now();

      await Promise.all([
        this.redisService.client.zAdd(historyKey, {
          score: timestamp,
          value: JSON.stringify(health),
        }),
        this.redisService.client.expire(historyKey, 86400 * 7), // Expire after 7 days
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to store health status for ${health.queueName}: ${error.message}`,
      );
    }
  }

  /**
   * Store scaling suggestion in Redis
   */
  private async storeScalingSuggestion(
    suggestion: ScalingRecommendation,
  ): Promise<void> {
    try {
      await this.redisService.client.hSet(
        this.SCALING_SUGGESTIONS_KEY,
        suggestion.queueName,
        JSON.stringify(suggestion),
      );
    } catch (error) {
      this.logger.error(
        `Failed to store scaling suggestion for ${suggestion.queueName}: ${error.message}`,
      );
    }
  }

  /**
   * Get health history for a queue
   */
  async getHealthHistory(
    queueName: string,
    hoursBack: number = 24,
  ): Promise<HealthStatus[]> {
    const historyKey = `${this.HEALTH_HISTORY_KEY}:${queueName}`;
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    try {
      const entries = await this.redisService.client.zRangeByScore(
        historyKey,
        cutoffTime,
        Date.now(),
      );

      return entries.map((entry) => JSON.parse(entry) as HealthStatus);
    } catch (error) {
      this.logger.error(
        `Failed to get health history for ${queueName}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get overall system health summary
   */
  async getSystemHealthSummary(): Promise<{
    overallStatus: 'healthy' | 'warning' | 'critical';
    averageScore: number;
    queues: { name: string; status: string; score: number }[];
    criticalIssues: string[];
  }> {
    const allHealth = await this.getAllQueueHealth();

    const averageScore =
      allHealth.reduce((sum, h) => sum + h.score, 0) / allHealth.length;

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (averageScore < 30) overallStatus = 'critical';
    else if (averageScore < 70) overallStatus = 'warning';

    const queues = allHealth.map((h) => ({
      name: h.queueName,
      status: h.status,
      score: h.score,
    }));

    const criticalIssues = allHealth.flatMap((h) =>
      h.status === 'critical'
        ? [
            `${h.queueName}: ${h.checks
              .filter((c) => c.status === 'fail')
              .map((c) => c.message)
              .join(', ')}`,
          ]
        : [],
    );

    return {
      overallStatus,
      averageScore: parseFloat(averageScore.toFixed(2)),
      queues,
      criticalIssues,
    };
  }

  /**
   * Force a health check for all queues
   */
  async forceHealthCheck(): Promise<HealthStatus[]> {
    return this.performHealthChecks();
  }
}
