import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnalyticsService } from './analytics.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsMetric, MetricCategory, MetricType } from '../entities/analytics-metric.entity';

@Injectable()
export class DataAggregationService {
  private readonly logger = new Logger(DataAggregationService.name);
  private lastAggregationTime: Date | null = null;

  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectRepository(AnalyticsMetric)
    private readonly metricRepository: Repository<AnalyticsMetric>,
  ) {}

  /**
   * Get current aggregation status
   */
  async getAggregationStatus(): Promise<any> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentMetrics = await this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp >= :oneHourAgo', { oneHourAgo })
      .getCount();

    return {
      lastAggregation: this.lastAggregationTime,
      metricsInLastHour: recentMetrics,
      isRunning: false, // In a real implementation, track actual running state
      nextScheduledRun: this.getNextScheduledRun(),
    };
  }

  /**
   * Trigger manual aggregation
   */
  async triggerManualAggregation(): Promise<any> {
    this.logger.log('Manual data aggregation triggered');
    const result = await this.performAggregation();
    this.lastAggregationTime = new Date();
    return result;
  }

  /**
   * Hourly aggregation cron job
   */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlyAggregation() {
    this.logger.log('Running hourly data aggregation');
    await this.performAggregation();
    this.lastAggregationTime = new Date();
  }

  /**
   * Daily aggregation cron job
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyAggregation() {
    this.logger.log('Running daily data aggregation');
    await this.performDailyAggregation();
    this.lastAggregationTime = new Date();
  }

  /**
   * Perform main aggregation logic
   */
  private async performAggregation(): Promise<any> {
    try {
      const startTime = new Date(Date.now() - 60 * 60 * 1000); // Last hour
      const endTime = new Date();
      
      // Aggregate system metrics
      const systemMetrics = await this.aggregateSystemMetrics(startTime, endTime);
      
      // Aggregate business metrics
      const businessMetrics = await this.aggregateBusinessMetrics(startTime, endTime);
      
      // Aggregate user metrics
      const userMetrics = await this.aggregateUserMetrics(startTime, endTime);
      
      // Record aggregated metrics
      const aggregatedMetrics = [
        ...systemMetrics,
        ...businessMetrics,
        ...userMetrics,
      ];

      // Save aggregated metrics
      await this.metricRepository.save(aggregatedMetrics);
      
      this.logger.log(`Aggregated ${aggregatedMetrics.length} metrics`);
      
      return {
        success: true,
        metricsAggregated: aggregatedMetrics.length,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Aggregation failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Perform daily aggregation (more comprehensive)
   */
  private async performDailyAggregation(): Promise<any> {
    try {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const endTime = new Date();
      
      // More detailed aggregation for daily reports
      const dailyMetrics = await this.createDailySummaryMetrics(startTime, endTime);
      
      await this.metricRepository.save(dailyMetrics);
      
      this.logger.log(`Daily aggregation completed with ${dailyMetrics.length} metrics`);
      
      return {
        success: true,
        metricsCreated: dailyMetrics.length,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Daily aggregation failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Aggregate system metrics
   */
  private async aggregateSystemMetrics(startTime: Date, endTime: Date): Promise<AnalyticsMetric[]> {
    const metrics = await this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime })
      .andWhere('metric.category = :category', { category: MetricCategory.SYSTEM })
      .getMany();

    if (metrics.length === 0) return [];

    const aggregated: AnalyticsMetric[] = [];

    // Group by metric name
    const grouped = metrics.reduce((acc, metric) => {
      if (!acc[metric.name]) {
        acc[metric.name] = [];
      }
      acc[metric.name].push(metric);
      return acc;
    }, {} as Record<string, AnalyticsMetric[]>);

    // Create aggregated metrics
    Object.entries(grouped).forEach(([name, metricGroup]) => {
      const values = metricGroup.map(m => m.value);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      aggregated.push(
        this.createAggregatedMetric(`${name}_hourly_sum`, sum, MetricCategory.SYSTEM, 'hourly_sum'),
        this.createAggregatedMetric(`${name}_hourly_avg`, avg, MetricCategory.SYSTEM, 'hourly_avg'),
        this.createAggregatedMetric(`${name}_hourly_min`, min, MetricCategory.SYSTEM, 'hourly_min'),
        this.createAggregatedMetric(`${name}_hourly_max`, max, MetricCategory.SYSTEM, 'hourly_max'),
      );
    });

    return aggregated;
  }

  /**
   * Aggregate business metrics
   */
  private async aggregateBusinessMetrics(startTime: Date, endTime: Date): Promise<AnalyticsMetric[]> {
    const metrics = await this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime })
      .andWhere('metric.category = :category', { category: MetricCategory.BUSINESS })
      .getMany();

    if (metrics.length === 0) return [];

    const aggregated: AnalyticsMetric[] = [];
    const revenueMetrics = metrics.filter(m => m.name === 'revenue');
    const transactionMetrics = metrics.filter(m => m.name === 'transactions_total');

    if (revenueMetrics.length > 0) {
      const revenueSum = revenueMetrics.reduce((sum, m) => sum + m.value, 0);
      const revenueAvg = revenueSum / revenueMetrics.length;
      
      aggregated.push(
        this.createAggregatedMetric('revenue_hourly_total', revenueSum, MetricCategory.BUSINESS, 'hourly_total'),
        this.createAggregatedMetric('revenue_hourly_average', revenueAvg, MetricCategory.BUSINESS, 'hourly_avg'),
      );
    }

    if (transactionMetrics.length > 0) {
      const transactionSum = transactionMetrics.reduce((sum, m) => sum + m.value, 0);
      aggregated.push(
        this.createAggregatedMetric('transactions_hourly_total', transactionSum, MetricCategory.BUSINESS, 'hourly_total'),
      );
    }

    return aggregated;
  }

  /**
   * Aggregate user metrics
   */
  private async aggregateUserMetrics(startTime: Date, endTime: Date): Promise<AnalyticsMetric[]> {
    const metrics = await this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime })
      .andWhere('metric.category = :category', { category: MetricCategory.USER })
      .getMany();

    if (metrics.length === 0) return [];

    const aggregated: AnalyticsMetric[] = [];
    const activeUserMetrics = metrics.filter(m => m.name === 'active_users');

    if (activeUserMetrics.length > 0) {
      const userSum = activeUserMetrics.reduce((sum, m) => sum + m.value, 0);
      const userAvg = userSum / activeUserMetrics.length;
      const userMax = Math.max(...activeUserMetrics.map(m => m.value));
      
      aggregated.push(
        this.createAggregatedMetric('active_users_hourly_total', userSum, MetricCategory.USER, 'hourly_total'),
        this.createAggregatedMetric('active_users_hourly_average', userAvg, MetricCategory.USER, 'hourly_avg'),
        this.createAggregatedMetric('active_users_hourly_peak', userMax, MetricCategory.USER, 'hourly_peak'),
      );
    }

    return aggregated;
  }

  /**
   * Create daily summary metrics
   */
  private async createDailySummaryMetrics(startTime: Date, endTime: Date): Promise<AnalyticsMetric[]> {
    const metrics = await this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime })
      .getMany();

    const aggregated: AnalyticsMetric[] = [];

    // Daily totals by category
    const byCategory = metrics.reduce((acc, metric) => {
      if (!acc[metric.category]) {
        acc[metric.category] = 0;
      }
      acc[metric.category] += metric.value;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(byCategory).forEach(([category, total]) => {
      aggregated.push(
        this.createAggregatedMetric(
          `daily_${category}_total`,
          total,
          category as MetricCategory,
          'daily_total'
        ),
      );
    });

    // Unique users count
    const uniqueUsers = new Set(metrics.filter(m => m.userId).map(m => m.userId)).size;
    if (uniqueUsers > 0) {
      aggregated.push(
        this.createAggregatedMetric('daily_unique_users', uniqueUsers, MetricCategory.USER, 'daily_unique'),
      );
    }

    return aggregated;
  }

  /**
   * Create an aggregated metric
   */
  private createAggregatedMetric(
    name: string,
    value: number,
    category: MetricCategory,
    aggregationType: string,
  ): AnalyticsMetric {
    return this.metricRepository.create({
      name,
      value,
      type: MetricType.GAUGE, // Assuming aggregated metrics are gauges
      category,
      labels: { aggregation_type: aggregationType },
      timestamp: new Date(),
    });
  }

  /**
   * Get next scheduled run time
   */
  private getNextScheduledRun(): string {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    
    return nextHour.toISOString();
  }
}