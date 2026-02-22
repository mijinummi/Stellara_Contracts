import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TenantUsage, UsageMetric } from './entities/tenant-usage.entity';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantUsageService {
  constructor(
    @InjectRepository(TenantUsage)
    private readonly usageRepository: Repository<TenantUsage>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async recordUsage(
    tenantId: string,
    metric: UsageMetric,
    value: number,
    metadata?: Record<string, any>,
  ): Promise<TenantUsage> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const usage = this.usageRepository.create({
      tenant: { id: tenantId } as Tenant,
      metric,
      value,
      date: new Date(),
      metadata: metadata || {},
    });

    return this.usageRepository.save(usage);
  }

  async getTenantUsage(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
    metric?: string,
  ): Promise<TenantUsage[]> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const query: any = { tenant: { id: tenantId } };

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      query.date = dateFilter;
    }

    if (metric) {
      query.metric = metric;
    }

    return this.usageRepository.find({
      where: query,
      order: { createdAt: 'DESC' },
      take: 1000, // Limit to prevent performance issues
    });
  }

  async getUsageStats(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
    metric?: string,
  ): Promise<
    Record<string, { total: number; average: number; count: number }>
  > {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const where: any = { tenant: { id: tenantId } };

    if (startDate && endDate) {
      where.date = Between(startDate, endDate);
    }

    const metrics = metric ? [metric] : Object.values(UsageMetric);
    const stats: Record<
      string,
      { total: number; average: number; count: number }
    > = {};

    for (const metric of metrics) {
      const records = await this.usageRepository.find({
        where: { ...where, metric: metric as UsageMetric },
      });

      if (records.length > 0) {
        const total = records.reduce(
          (sum, record) => sum + Number(record.value),
          0,
        );
        const average = total / records.length;

        stats[metric] = {
          total,
          average,
          count: records.length,
        };
      }
    }

    return stats;
  }

  async getDailyUsage(
    tenantId: string,
    days: number = 30,
  ): Promise<Record<string, Record<string, number>>> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const records = await this.usageRepository.find({
      where: {
        tenant: { id: tenantId },
        date: Between(startDate, endDate),
      },
      order: { date: 'ASC' },
    });

    // Group by date and metric
    const dailyUsage: Record<string, Record<string, number>> = {};

    records.forEach((record) => {
      const dateStr = record.date.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!dailyUsage[dateStr]) {
        dailyUsage[dateStr] = {};
      }

      const metric = record.metric;
      dailyUsage[dateStr][metric] =
        (dailyUsage[dateStr][metric] || 0) + Number(record.value);
    });

    return dailyUsage;
  }

  async getUsageTrends(
    tenantId: string,
    days: number = 30,
  ): Promise<
    Record<string, { current: number; previous: number; change: number }>
  > {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const now = new Date();
    const currentPeriodStart = new Date(
      now.getTime() - (days / 2) * 24 * 60 * 60 * 1000,
    );
    const previousPeriodStart = new Date(
      currentPeriodStart.getTime() - (days / 2) * 24 * 60 * 60 * 1000,
    );

    const currentPeriodRecords = await this.usageRepository.find({
      where: {
        tenant: { id: tenantId },
        date: Between(currentPeriodStart, now),
      },
    });

    const previousPeriodRecords = await this.usageRepository.find({
      where: {
        tenant: { id: tenantId },
        date: Between(previousPeriodStart, currentPeriodStart),
      },
    });

    const trends: Record<
      string,
      { current: number; previous: number; change: number }
    > = {};

    // Calculate current period totals
    const currentTotals: Record<string, number> = {};
    currentPeriodRecords.forEach((record) => {
      currentTotals[record.metric] =
        (currentTotals[record.metric] || 0) + Number(record.value);
    });

    // Calculate previous period totals
    const previousTotals: Record<string, number> = {};
    previousPeriodRecords.forEach((record) => {
      previousTotals[record.metric] =
        (previousTotals[record.metric] || 0) + Number(record.value);
    });

    // Calculate trends
    Object.keys(currentTotals).forEach((metric) => {
      const current = currentTotals[metric];
      const previous = previousTotals[metric] || 0;
      const change =
        previous === 0
          ? current > 0
            ? 100
            : 0
          : ((current - previous) / previous) * 100;

      trends[metric] = {
        current,
        previous,
        change: Math.round(change * 100) / 100, // Round to 2 decimal places
      };
    });

    return trends;
  }

  async getTopUsageMetrics(
    tenantId: string,
    limit: number = 5,
  ): Promise<Record<string, number>> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const records = await this.usageRepository.find({
      where: { tenant: { id: tenantId } },
      order: { value: 'DESC' },
      take: limit,
    });

    const topMetrics: Record<string, number> = {};
    records.forEach((record) => {
      topMetrics[record.metric] = Number(record.value);
    });

    return topMetrics;
  }
}
