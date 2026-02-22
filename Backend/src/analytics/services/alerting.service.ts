import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsAlert, AlertSeverity, AlertStatus } from '../entities/analytics-alert.entity';

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(
    @InjectRepository(AnalyticsAlert)
    private readonly alertRepository: Repository<AnalyticsAlert>,
  ) {}

  /**
   * Create a new alert rule
   */
  async createAlertRule(
    name: string,
    description: string,
    severity: AlertSeverity,
    metricName: string,
    condition: {
      operator: string;
      threshold: number;
      duration?: number;
    },
    tenantId?: string,
  ): Promise<AnalyticsAlert> {
    try {
      const alert = this.alertRepository.create({
        name,
        description,
        severity,
        metricName,
        condition,
        tenantId: tenantId || null,
      });

      const savedAlert = await this.alertRepository.save(alert);
      this.logger.log(`Created alert rule: ${name}`);
      
      return savedAlert;
    } catch (error) {
      this.logger.error(`Failed to create alert rule ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get all alerts with optional filtering
   */
  async getAlerts(
    status?: AlertStatus,
    severity?: AlertSeverity,
    tenantId?: string,
  ): Promise<AnalyticsAlert[]> {
    const query = this.alertRepository.createQueryBuilder('alert');

    if (status) {
      query.andWhere('alert.status = :status', { status });
    }

    if (severity) {
      query.andWhere('alert.severity = :severity', { severity });
    }

    if (tenantId) {
      query.andWhere('alert.tenantId = :tenantId', { tenantId });
    }

    return query
      .orderBy('alert.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Get alert by ID
   */
  async getAlertById(id: string): Promise<AnalyticsAlert | null> {
    return this.alertRepository.findOne({ where: { id } });
  }

  /**
   * Get active alerts (triggered or acknowledged)
   */
  async getActiveAlerts(tenantId?: string): Promise<AnalyticsAlert[]> {
    const query = this.alertRepository.createQueryBuilder('alert')
      .where('alert.status IN (:...statuses)', { 
        statuses: [AlertStatus.TRIGGERED, AlertStatus.ACKNOWLEDGED] 
      });

    if (tenantId) {
      query.andWhere('alert.tenantId = :tenantId', { tenantId });
    }

    return query
      .orderBy('alert.severity', 'DESC')
      .addOrderBy('alert.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(id: string, userId: string): Promise<AnalyticsAlert | null> {
    const alert = await this.getAlertById(id);
    if (!alert) {
      return null;
    }

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
    alert.updatedAt = new Date();

    return this.alertRepository.save(alert);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(id: string, userId: string): Promise<AnalyticsAlert | null> {
    const alert = await this.getAlertById(id);
    if (!alert) {
      return null;
    }

    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date();
    alert.acknowledgedBy = userId;
    alert.updatedAt = new Date();

    return this.alertRepository.save(alert);
  }

  /**
   * Trigger an alert based on metric conditions
   */
  async triggerAlert(
    metricName: string,
    currentValue: number,
    tenantId?: string,
  ): Promise<AnalyticsAlert | null> {
    // Find relevant alert rules for this metric
    const query = this.alertRepository.createQueryBuilder('alert')
      .where('alert.metricName = :metricName', { metricName })
      .andWhere('alert.status = :status', { status: AlertStatus.RESOLVED });

    if (tenantId) {
      query.andWhere('alert.tenantId = :tenantId', { tenantId });
    }

    const alertRules = await query.getMany();

    for (const rule of alertRules) {
      if (this.evaluateCondition(currentValue, rule.condition)) {
        const alert = this.alertRepository.create({
          name: `Auto-triggered: ${rule.name}`,
          description: `${metricName} ${rule.condition.operator} ${rule.condition.threshold}. Current value: ${currentValue}`,
          severity: rule.severity,
          metricName,
          condition: rule.condition,
          currentValue: { value: currentValue, timestamp: new Date() },
          tenantId: rule.tenantId,
          status: AlertStatus.TRIGGERED,
        });

        const savedAlert = await this.alertRepository.save(alert);
        this.logger.warn(`Alert triggered: ${alert.name} for metric ${metricName}`);
        return savedAlert;
      }
    }

    return null;
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(value: number, condition: { operator: string; threshold: number }): boolean {
    switch (condition.operator) {
      case '>':
        return value > condition.threshold;
      case '>=':
        return value >= condition.threshold;
      case '<':
        return value < condition.threshold;
      case '<=':
        return value <= condition.threshold;
      case '==':
        return value === condition.threshold;
      case '!=':
        return value !== condition.threshold;
      default:
        return false;
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStatistics(tenantId?: string): Promise<any> {
    const query = this.alertRepository.createQueryBuilder('alert');

    if (tenantId) {
      query.andWhere('alert.tenantId = :tenantId', { tenantId });
    }

    const totalAlerts = await query.getCount();
    
    const severityStats = await query
      .select('alert.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alert.severity')
      .getRawMany();

    const statusStats = await query
      .select('alert.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alert.status')
      .getRawMany();

    const recentAlerts = await query
      .orderBy('alert.createdAt', 'DESC')
      .limit(10)
      .getMany();

    return {
      total: totalAlerts,
      bySeverity: severityStats.reduce((acc, stat) => {
        acc[stat.severity] = parseInt(stat.count);
        return acc;
      }, {} as Record<string, number>),
      byStatus: statusStats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {} as Record<string, number>),
      recent: recentAlerts,
    };
  }

  /**
   * Clean up old resolved alerts
   */
  async cleanupOldAlerts(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.alertRepository
      .createQueryBuilder()
      .delete()
      .where('status = :status', { status: AlertStatus.RESOLVED })
      .andWhere('resolvedAt < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old alerts`);
    return result.affected || 0;
  }
}