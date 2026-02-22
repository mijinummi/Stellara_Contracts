import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';
import { AlertingService } from '../services/alerting.service';
import { DataAggregationService } from '../services/data-aggregation.service';
import { MetricType, MetricCategory } from '../entities/analytics-metric.entity';
import { AnalyticsAlert, AlertSeverity, AlertStatus } from '../entities/analytics-alert.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/roles.enum';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly alertingService: AlertingService,
    private readonly dataAggregationService: DataAggregationService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get system health metrics' })
  @ApiResponse({ status: 200, description: 'System health metrics retrieved successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getSystemHealth() {
    return await this.analyticsService.getSystemHealthMetrics();
  }

  @Get('business')
  @ApiOperation({ summary: 'Get business metrics' })
  @ApiResponse({ status: 200, description: 'Business metrics retrieved successfully' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for multi-tenancy' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getBusinessMetrics(@Query('tenantId') tenantId?: string) {
    return await this.analyticsService.getBusinessMetrics(tenantId);
  }

  @Get('engagement')
  @ApiOperation({ summary: 'Get user engagement metrics' })
  @ApiResponse({ status: 200, description: 'User engagement metrics retrieved successfully' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for multi-tenancy' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getUserEngagement(@Query('tenantId') tenantId?: string) {
    return await this.analyticsService.getUserEngagementMetrics(tenantId);
  }

  @Get('metrics/:category')
  @ApiOperation({ summary: 'Get metrics by category' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  @ApiQuery({ name: 'startTime', required: false, description: 'Start time (ISO format)' })
  @ApiQuery({ name: 'endTime', required: false, description: 'End time (ISO format)' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for multi-tenancy' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getMetricsByCategory(
    @Param('category') category: MetricCategory,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endTime ? new Date(endTime) : new Date();
    
    return await this.analyticsService.getMetricsByCategory(category, start, end, tenantId);
  }

  @Get('metrics/latest/:name')
  @ApiOperation({ summary: 'Get latest metrics for a specific name' })
  @ApiResponse({ status: 200, description: 'Latest metrics retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of metrics to return' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for multi-tenancy' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getLatestMetrics(
    @Param('name') name: string,
    @Query('limit') limit: string = '100',
    @Query('tenantId') tenantId?: string,
  ) {
    return await this.analyticsService.getLatestMetrics(name, parseInt(limit), tenantId);
  }

  @Get('metrics/aggregated/:name')
  @ApiOperation({ summary: 'Get aggregated metrics over time periods' })
  @ApiResponse({ status: 200, description: 'Aggregated metrics retrieved successfully' })
  @ApiQuery({ name: 'startTime', required: false, description: 'Start time (ISO format)' })
  @ApiQuery({ name: 'endTime', required: false, description: 'End time (ISO format)' })
  @ApiQuery({ name: 'interval', required: false, description: 'Aggregation interval in minutes' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for multi-tenancy' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getAggregatedMetrics(
    @Param('name') name: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('interval') interval: string = '60',
    @Query('tenantId') tenantId?: string,
  ) {
    const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endTime ? new Date(endTime) : new Date();
    
    return await this.analyticsService.getAggregatedMetrics(
      name,
      start,
      end,
      parseInt(interval),
      tenantId,
    );
  }

  @Post('metrics')
  @ApiOperation({ summary: 'Record a new metric' })
  @ApiResponse({ status: 201, description: 'Metric recorded successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async recordMetric(
    @Body() body: {
      name: string;
      value: number;
      type: MetricType;
      category: MetricCategory;
      labels?: Record<string, string>;
      tenantId?: string;
      userId?: string;
    },
  ) {
    return await this.analyticsService.recordMetric(
      body.name,
      body.value,
      body.type,
      body.category,
      body.labels,
      body.tenantId,
      body.userId,
    );
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get all alerts' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by alert status' })
  @ApiQuery({ name: 'severity', required: false, description: 'Filter by alert severity' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for multi-tenancy' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getAlerts(
    @Query('status') status?: AlertStatus,
    @Query('severity') severity?: AlertSeverity,
    @Query('tenantId') tenantId?: string,
  ) {
    return await this.alertingService.getAlerts(status, severity, tenantId);
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Get alert by ID' })
  @ApiResponse({ status: 200, description: 'Alert retrieved successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getAlert(@Param('id') id: string) {
    return await this.alertingService.getAlertById(id);
  }

  @Post('alerts')
  @ApiOperation({ summary: 'Create a new alert rule' })
  @ApiResponse({ status: 201, description: 'Alert rule created successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async createAlert(
    @Body() body: {
      name: string;
      description: string;
      severity: AlertSeverity;
      metricName: string;
      condition: {
        operator: string;
        threshold: number;
        duration?: number;
      };
      tenantId?: string;
    },
  ) {
    return await this.alertingService.createAlertRule(
      body.name,
      body.description,
      body.severity,
      body.metricName,
      body.condition,
      body.tenantId,
    );
  }

  @Post('alerts/:id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiResponse({ status: 200, description: 'Alert acknowledged successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async acknowledgeAlert(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ) {
    return await this.alertingService.acknowledgeAlert(id, body.userId);
  }

  @Post('alerts/:id/resolve')
  @ApiOperation({ summary: 'Resolve an alert' })
  @ApiResponse({ status: 200, description: 'Alert resolved successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async resolveAlert(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ) {
    return await this.alertingService.resolveAlert(id, body.userId);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get comprehensive dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID for multi-tenancy' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getDashboardData(@Query('tenantId') tenantId?: string) {
    const [systemHealth, businessMetrics, userEngagement, alerts] = await Promise.all([
      this.analyticsService.getSystemHealthMetrics(),
      this.analyticsService.getBusinessMetrics(tenantId),
      this.analyticsService.getUserEngagementMetrics(tenantId),
      this.alertingService.getActiveAlerts(tenantId),
    ]);

    return {
      systemHealth,
      businessMetrics,
      userEngagement,
      alerts: alerts.slice(0, 10), // Top 10 active alerts
      timestamp: new Date(),
    };
  }

  @Get('aggregation/status')
  @ApiOperation({ summary: 'Get data aggregation status' })
  @ApiResponse({ status: 200, description: 'Aggregation status retrieved successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getAggregationStatus() {
    return await this.dataAggregationService.getAggregationStatus();
  }

  @Post('aggregation/trigger')
  @ApiOperation({ summary: 'Trigger manual data aggregation' })
  @ApiResponse({ status: 200, description: 'Aggregation triggered successfully' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async triggerAggregation() {
    return await this.dataAggregationService.triggerManualAggregation();
  }
}