import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { RedisService } from '../redis/redis.service';

export interface CachePerformanceMetrics {
  timestamp: number;
  hitRate: number;
  missRate: number;
  avgResponseTime: number;
  cacheSize: number;
  memoryUsage: number;
  evictions: number;
  invalidations: number;
}

export interface CacheAlert {
  id: string;
  type: 'HIT_RATE_LOW' | 'MEMORY_HIGH' | 'EVICT_THRESHOLD' | 'ERROR_RATE_HIGH';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  metadata?: any;
}

export interface CacheHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: CachePerformanceMetrics;
  alerts: CacheAlert[];
  recommendations: string[];
}

@Injectable()
export class CacheMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(CacheMonitoringService.name);
  private readonly METRICS_HISTORY_KEY = 'cache:metrics:history';
  private readonly ALERTS_KEY = 'cache:alerts';
  private readonly HEALTH_KEY = 'cache:health';

  private metricsBuffer: CachePerformanceMetrics[] = [];
  private alerts: CacheAlert[] = [];
  private healthStatus: CacheHealthStatus = {
    status: 'healthy',
    metrics: {} as CachePerformanceMetrics,
    alerts: [],
    recommendations: [],
  };

  constructor(
    private readonly cacheService: CacheService,
    private readonly invalidationService: CacheInvalidationService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    await this.loadAlerts();
    await this.loadMetricsHistory();
    this.logger.log('CacheMonitoringService initialized');
  }

  // ==================== REAL-TIME METRICS COLLECTION ====================

  /**
   * Collect current performance metrics
   */
  async collectMetrics(): Promise<CachePerformanceMetrics> {
    const [cacheStats, invalidationStats] = await Promise.all([
      this.cacheService.getStats(),
      this.invalidationService.getInvalidationStats(),
    ]);

    const metrics: CachePerformanceMetrics = {
      timestamp: Date.now(),
      hitRate: cacheStats.hitRate,
      missRate: 1 - cacheStats.hitRate,
      avgResponseTime: cacheStats.avgLatency,
      cacheSize: cacheStats.totalKeys,
      memoryUsage: cacheStats.memoryUsage,
      evictions: cacheStats.evictions,
      invalidations: invalidationStats.totalInvalidations,
    };

    // Store in buffer for aggregation
    this.metricsBuffer.push(metrics);

    // Keep only last 1000 metrics
    if (this.metricsBuffer.length > 1000) {
      this.metricsBuffer = this.metricsBuffer.slice(-1000);
    }

    // Save to Redis for persistence
    await this.saveMetrics(metrics);

    return metrics;
  }

  /**
   * Get metrics history
   */
  async getMetricsHistory(
    hours: number = 24,
  ): Promise<CachePerformanceMetrics[]> {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.metricsBuffer.filter((metric) => metric.timestamp >= cutoff);
  }

  // ==================== HEALTH CHECKING ====================

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<CacheHealthStatus> {
    try {
      const metrics = await this.collectMetrics();
      const alerts: CacheAlert[] = [];
      const recommendations: string[] = [];

      // Check hit rate
      if (metrics.hitRate < 0.5) {
        const alert = this.createAlertSync(
          'HIT_RATE_LOW',
          'critical',
          `Cache hit rate is low: ${(metrics.hitRate * 100).toFixed(2)}%`,
          { hitRate: metrics.hitRate },
        );
        alerts.push(alert);
        recommendations.push(
          'Consider increasing cache TTL or adding more cache warming rules',
        );
      } else if (metrics.hitRate < 0.7) {
        const alert = this.createAlertSync(
          'HIT_RATE_LOW',
          'medium',
          `Cache hit rate below optimal: ${(metrics.hitRate * 100).toFixed(2)}%`,
          { hitRate: metrics.hitRate },
        );
        alerts.push(alert);
        recommendations.push('Review cache key patterns and TTL settings');
      }

      // Check memory usage
      if (metrics.memoryUsage > 500 * 1024 * 1024) {
        // 500MB
        const alert = this.createAlertSync(
          'MEMORY_HIGH',
          'high',
          `High cache memory usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
          { memoryUsage: metrics.memoryUsage },
        );
        alerts.push(alert);
        recommendations.push('Consider cache eviction or memory optimization');
      }

      // Check invalidation rate
      if (metrics.invalidations > 1000) {
        const alert = this.createAlertSync(
          'EVICT_THRESHOLD',
          'medium',
          `High invalidation rate: ${metrics.invalidations} operations`,
          { invalidations: metrics.invalidations },
        );
        alerts.push(alert);
        recommendations.push('Review invalidation patterns and dependencies');
      }

      // Determine overall status
      const status = this.determineHealthStatus(alerts);

      const healthStatus: CacheHealthStatus = {
        status,
        metrics,
        alerts: [...this.alerts, ...alerts],
        recommendations,
      };

      this.healthStatus = healthStatus;
      await this.saveHealthStatus(healthStatus);

      return healthStatus;
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);

      const errorAlert = this.createAlertSync(
        'ERROR_RATE_HIGH',
        'critical',
        `Cache monitoring error: ${error.message}`,
        { error: error.message },
      );

      const healthStatus: CacheHealthStatus = {
        status: 'unhealthy',
        metrics: {} as CachePerformanceMetrics,
        alerts: [errorAlert],
        recommendations: [
          'Check cache service connectivity and Redis availability',
        ],
      };

      this.healthStatus = healthStatus;
      return healthStatus;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): CacheHealthStatus {
    return this.healthStatus;
  }

  // ==================== ALERTING SYSTEM ====================

  /**
   * Create and store alert
   */
  async createAlert(
    type: CacheAlert['type'],
    severity: CacheAlert['severity'],
    message: string,
    metadata?: any,
  ): Promise<CacheAlert> {
    const alert: CacheAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      timestamp: Date.now(),
      resolved: false,
      metadata,
    };

    this.alerts.push(alert);
    await this.saveAlert(alert);

    this.logger.warn(`New cache alert: ${type} - ${message}`);
    return alert;
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      await this.saveAlerts();
      this.logger.log(`Resolved alert: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): CacheAlert[] {
    return this.alerts.filter((alert) => !alert.resolved);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: CacheAlert['severity']): CacheAlert[] {
    return this.alerts.filter(
      (alert) => alert.severity === severity && !alert.resolved,
    );
  }

  // ==================== SCHEDULED MONITORING ====================

  /**
   * Run metrics collection every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async collectMetricsScheduled(): Promise<void> {
    try {
      await this.collectMetrics();
    } catch (error) {
      this.logger.error(
        `Scheduled metrics collection failed: ${error.message}`,
      );
    }
  }

  /**
   * Run health check every 5 minutes
   */
  @Cron('*/5 * * * *')
  async healthCheckScheduled(): Promise<void> {
    try {
      await this.performHealthCheck();
    } catch (error) {
      this.logger.error(`Scheduled health check failed: ${error.message}`);
    }
  }

  /**
   * Cleanup old alerts and metrics
   */
  @Cron('0 0 * * *') // Daily at midnight
  async cleanupOldData(): Promise<void> {
    try {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days

      // Cleanup old alerts
      this.alerts = this.alerts.filter((alert) => alert.timestamp > cutoff);
      await this.saveAlerts();

      // Cleanup old metrics
      this.metricsBuffer = this.metricsBuffer.filter(
        (metric) => metric.timestamp > cutoff,
      );

      this.logger.log('Cache monitoring data cleanup completed');
    } catch (error) {
      this.logger.error(`Data cleanup failed: ${error.message}`);
    }
  }

  // ==================== REPORTING ====================

  /**
   * Generate cache performance report
   */
  async generateReport(periodHours: number = 24): Promise<any> {
    const metricsHistory = await this.getMetricsHistory(periodHours);

    if (metricsHistory.length === 0) {
      return {
        period: `${periodHours} hours`,
        summary: 'No metrics data available',
        metrics: {},
      };
    }

    // Calculate aggregates
    const hitRates = metricsHistory.map((m) => m.hitRate);
    const responseTimes = metricsHistory.map((m) => m.avgResponseTime);
    const memoryUsages = metricsHistory.map((m) => m.memoryUsage);

    const report = {
      period: `${periodHours} hours`,
      summary: {
        totalSamples: metricsHistory.length,
        avgHitRate: this.average(hitRates),
        avgResponseTime: this.average(responseTimes),
        peakMemoryUsage: Math.max(...memoryUsages),
        totalInvalidations: metricsHistory.reduce(
          (sum, m) => sum + m.invalidations,
          0,
        ),
      },
      trends: {
        hitRateTrend: this.calculateTrend(hitRates),
        responseTimeTrend: this.calculateTrend(responseTimes),
        memoryUsageTrend: this.calculateTrend(memoryUsages),
      },
      recommendations: this.healthStatus.recommendations,
    };

    return report;
  }

  // ==================== PRIVATE METHODS ====================

  private createAlertSync(
    type: CacheAlert['type'],
    severity: CacheAlert['severity'],
    message: string,
    metadata?: any,
  ): CacheAlert {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      timestamp: Date.now(),
      resolved: false,
      metadata,
    };
  }

  private determineHealthStatus(
    alerts: CacheAlert[],
  ): CacheHealthStatus['status'] {
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
    const highAlerts = alerts.filter((a) => a.severity === 'high');

    if (criticalAlerts.length > 0) return 'unhealthy';
    if (highAlerts.length > 2) return 'degraded';
    return 'healthy';
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateTrend(
    values: number[],
  ): 'improving' | 'declining' | 'stable' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = this.average(firstHalf);
    const secondAvg = this.average(secondHalf);

    const diff = secondAvg - firstAvg;
    const threshold = (Math.max(...values) - Math.min(...values)) * 0.1; // 10% threshold

    if (diff > threshold) return 'improving';
    if (diff < -threshold) return 'declining';
    return 'stable';
  }

  private async saveMetrics(metrics: CachePerformanceMetrics): Promise<void> {
    try {
      await this.redisService.client.lPush(
        this.METRICS_HISTORY_KEY,
        JSON.stringify(metrics),
      );
      await this.redisService.client.lTrim(this.METRICS_HISTORY_KEY, 0, 9999); // Keep last 10k entries
    } catch (error) {
      this.logger.error(`Error saving metrics: ${error.message}`);
    }
  }

  private async saveAlert(alert: CacheAlert): Promise<void> {
    try {
      await this.redisService.client.lPush(
        this.ALERTS_KEY,
        JSON.stringify(alert),
      );
      await this.redisService.client.lTrim(this.ALERTS_KEY, 0, 999); // Keep last 1000 alerts
    } catch (error) {
      this.logger.error(`Error saving alert: ${error.message}`);
    }
  }

  private async saveAlerts(): Promise<void> {
    try {
      const pipeline = this.redisService.client.multi();
      pipeline.del(this.ALERTS_KEY);

      for (const alert of this.alerts) {
        pipeline.lPush(this.ALERTS_KEY, JSON.stringify(alert));
      }

      pipeline.lTrim(this.ALERTS_KEY, 0, 999);
      await pipeline.exec();
    } catch (error) {
      this.logger.error(`Error saving alerts: ${error.message}`);
    }
  }

  private async saveHealthStatus(status: CacheHealthStatus): Promise<void> {
    try {
      await this.redisService.client.set(
        this.HEALTH_KEY,
        JSON.stringify(status),
        { EX: 3600 },
      );
    } catch (error) {
      this.logger.error(`Error saving health status: ${error.message}`);
    }
  }

  private async loadAlerts(): Promise<void> {
    try {
      const alertStrings = await this.redisService.client.lRange(
        this.ALERTS_KEY,
        0,
        -1,
      );
      this.alerts = alertStrings.map((str) => JSON.parse(str));
      this.logger.log(`Loaded ${this.alerts.length} alerts`);
    } catch (error) {
      this.logger.error(`Error loading alerts: ${error.message}`);
    }
  }

  private async loadMetricsHistory(): Promise<void> {
    try {
      const metricStrings = await this.redisService.client.lRange(
        this.METRICS_HISTORY_KEY,
        0,
        999,
      );
      this.metricsBuffer = metricStrings.map((str) => JSON.parse(str));
      this.logger.log(`Loaded ${this.metricsBuffer.length} metrics entries`);
    } catch (error) {
      this.logger.error(`Error loading metrics history: ${error.message}`);
    }
  }

  // Mock redisService for now - will be injected properly
  // Kept for backward compatibility - now uses proper injection above
  // private get redisService(): any {
  //   return {
  //     client: {
  //       lPush: async () => {},
  //       lTrim: async () => {},
  //       lRange: async () => [],
  //       set: async () => {},
  //       del: async () => {},
  //       multi: () => ({
  //         del: () => {},
  //         lPush: () => {},
  //         lTrim: () => {},
  //         exec: async () => {},
  //       }),
  //     },
  //   };
  // }
}
