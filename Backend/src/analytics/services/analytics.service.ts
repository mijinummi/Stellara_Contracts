import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { AnalyticsMetric, MetricType, MetricCategory } from '../entities/analytics-metric.entity';
import { Observable, interval } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(AnalyticsMetric)
    private readonly metricRepository: Repository<AnalyticsMetric>,
  ) {}

  /**
   * Record a new metric value
   */
  async recordMetric(
    name: string,
    value: number,
    type: MetricType,
    category: MetricCategory,
    labels?: Record<string, string>,
    tenantId?: string,
    userId?: string,
  ): Promise<AnalyticsMetric> {
    try {
      const metric = this.metricRepository.create({
        name,
        value,
        type,
        category,
        labels: labels || {},
        tenantId: tenantId || null,
        userId: userId || null,
      });

      const savedMetric = await this.metricRepository.save(metric);
      this.logger.debug(`Recorded metric: ${name} = ${value}`);
      
      return savedMetric;
    } catch (error) {
      this.logger.error(`Failed to record metric ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get metrics by category and time range
   */
  async getMetricsByCategory(
    category: MetricCategory,
    startTime: Date,
    endTime: Date,
    tenantId?: string,
  ): Promise<AnalyticsMetric[]> {
    const query = this.metricRepository.createQueryBuilder('metric')
      .where('metric.category = :category', { category })
      .andWhere('metric.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime });

    if (tenantId) {
      query.andWhere('metric.tenantId = :tenantId', { tenantId });
    }

    return query.orderBy('metric.timestamp', 'ASC').getMany();
  }

  /**
   * Get latest metrics for a specific name
   */
  async getLatestMetrics(
    name: string,
    limit: number = 100,
    tenantId?: string,
  ): Promise<AnalyticsMetric[]> {
    const query = this.metricRepository.createQueryBuilder('metric')
      .where('metric.name = :name', { name })
      .orderBy('metric.timestamp', 'DESC')
      .limit(limit);

    if (tenantId) {
      query.andWhere('metric.tenantId = :tenantId', { tenantId });
    }

    return query.getMany();
  }

  /**
   * Get aggregated metrics over time periods
   */
  async getAggregatedMetrics(
    name: string,
    startTime: Date,
    endTime: Date,
    intervalMinutes: number = 60,
    tenantId?: string,
  ): Promise<Array<{timestamp: Date; count: number; sum: number; average: number; min: number; max: number}>> {
    // This would typically be done with a database aggregation query
    // For now, we'll fetch raw data and aggregate in memory
    const metrics = await this.getMetricsByTimeRange(name, startTime, endTime, tenantId);
    
    const aggregated = [];
    const intervalMs = intervalMinutes * 60 * 1000;
    
    for (let time = startTime.getTime(); time <= endTime.getTime(); time += intervalMs) {
      const intervalStart = new Date(time);
      const intervalEnd = new Date(time + intervalMs);
      
      const intervalMetrics = metrics.filter(m => 
        m.timestamp >= intervalStart && m.timestamp < intervalEnd
      );
      
      if (intervalMetrics.length > 0) {
        const sum = intervalMetrics.reduce((acc, m) => acc + m.value, 0);
        const avg = sum / intervalMetrics.length;
        const min = Math.min(...intervalMetrics.map(m => m.value));
        const max = Math.max(...intervalMetrics.map(m => m.value));
        
        aggregated.push({
          timestamp: intervalStart,
          count: intervalMetrics.length,
          sum,
          average: avg,
          min,
          max,
        });
      }
    }
    
    return aggregated;
  }

  /**
   * Get metrics by time range
   */
  private async getMetricsByTimeRange(
    name: string,
    startTime: Date,
    endTime: Date,
    tenantId?: string,
  ): Promise<AnalyticsMetric[]> {
    const query = this.metricRepository.createQueryBuilder('metric')
      .where('metric.name = :name', { name })
      .andWhere('metric.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime });

    if (tenantId) {
      query.andWhere('metric.tenantId = :tenantId', { tenantId });
    }

    return query.orderBy('metric.timestamp', 'ASC').getMany();
  }

  /**
   * Get real-time metrics stream
   */
  getRealTimeMetrics$(name: string, tenantId?: string): Observable<AnalyticsMetric> {
    return interval(5000).pipe(
      map(() => {
        // In a real implementation, this would connect to a WebSocket or SSE
        // For now, we'll simulate real-time data
        return this.metricRepository.create({
          name,
          value: Math.random() * 100,
          type: MetricType.GAUGE,
          category: MetricCategory.PERFORMANCE,
          tenantId: tenantId || null,
          timestamp: new Date(),
        });
      })
    );
  }

  /**
   * Get system health metrics
   */
  async getSystemHealthMetrics(): Promise<any> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const metrics = await this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp >= :oneHourAgo', { oneHourAgo })
      .andWhere('metric.category IN (:...categories)', { 
        categories: [MetricCategory.SYSTEM, MetricCategory.PERFORMANCE] 
      })
      .getMany();

    return {
      totalMetrics: metrics.length,
      metricsByCategory: this.groupByCategory(metrics),
      recentErrors: metrics.filter(m => m.name.includes('error')).length,
      uptime: this.calculateUptime(metrics),
    };
  }

  /**
   * Get business metrics summary
   */
  async getBusinessMetrics(tenantId?: string): Promise<any> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const query = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp >= :oneDayAgo', { oneDayAgo })
      .andWhere('metric.category = :category', { category: MetricCategory.BUSINESS });

    if (tenantId) {
      query.andWhere('metric.tenantId = :tenantId', { tenantId });
    }

    const metrics = await query.getMany();
    
    return {
      totalTransactions: metrics.filter(m => m.name === 'transactions_total').reduce((sum, m) => sum + m.value, 0),
      activeUsers: metrics.filter(m => m.name === 'active_users').pop()?.value || 0,
      revenue: metrics.filter(m => m.name === 'revenue').reduce((sum, m) => sum + m.value, 0),
      conversionRate: this.calculateConversionRate(metrics),
    };
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagementMetrics(tenantId?: string): Promise<any> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const query = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.timestamp >= :oneWeekAgo', { oneWeekAgo })
      .andWhere('metric.category = :category', { category: MetricCategory.USER });

    if (tenantId) {
      query.andWhere('metric.tenantId = :tenantId', { tenantId });
    }

    const metrics = await query.getMany();
    
    return {
      dailyActiveUsers: this.getDailyMetrics(metrics, 'active_users'),
      userRetention: this.calculateRetention(metrics),
      sessionDuration: this.getAverageMetric(metrics, 'session_duration'),
      pageViews: metrics.filter(m => m.name === 'page_views').reduce((sum, m) => sum + m.value, 0),
    };
  }

  private groupByCategory(metrics: AnalyticsMetric[]): Record<string, number> {
    return metrics.reduce((acc, metric) => {
      acc[metric.category] = (acc[metric.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateUptime(metrics: AnalyticsMetric[]): number {
    const totalMetrics = metrics.length;
    const errorMetrics = metrics.filter(m => m.name.includes('error')).length;
    return totalMetrics > 0 ? ((totalMetrics - errorMetrics) / totalMetrics) * 100 : 100;
  }

  private calculateConversionRate(metrics: AnalyticsMetric[]): number {
    const visits = metrics.filter(m => m.name === 'visits').reduce((sum, m) => sum + m.value, 0);
    const conversions = metrics.filter(m => m.name === 'conversions').reduce((sum, m) => sum + m.value, 0);
    return visits > 0 ? (conversions / visits) * 100 : 0;
  }

  private getDailyMetrics(metrics: AnalyticsMetric[], metricName: string): Array<{date: string; value: number}> {
    const dailyData = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const dayMetrics = metrics.filter(m => 
        m.name === metricName && 
        m.timestamp >= date && 
        m.timestamp < nextDay
      );
      
      const total = dayMetrics.reduce((sum, m) => sum + m.value, 0);
      dailyData.push({
        date: date.toISOString().split('T')[0],
        value: total,
      });
    }
    
    return dailyData;
  }

  private calculateRetention(metrics: AnalyticsMetric[]): number {
    // Simplified retention calculation
    const returningUsers = metrics.filter(m => m.name === 'returning_users').reduce((sum, m) => sum + m.value, 0);
    const totalUsers = metrics.filter(m => m.name === 'total_users').reduce((sum, m) => sum + m.value, 0);
    return totalUsers > 0 ? (returningUsers / totalUsers) * 100 : 0;
  }

  private getAverageMetric(metrics: AnalyticsMetric[], metricName: string): number {
    const relevantMetrics = metrics.filter(m => m.name === metricName);
    if (relevantMetrics.length === 0) return 0;
    return relevantMetrics.reduce((sum, m) => sum + m.value, 0) / relevantMetrics.length;
  }
}