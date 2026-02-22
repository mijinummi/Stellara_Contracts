import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsMetric } from './entities/analytics-metric.entity';
import { AnalyticsAlert } from './entities/analytics-alert.entity';
import { AlertingService } from './services/alerting.service';
import { AnalyticsGateway } from './gateways/analytics.gateway';
import { DataAggregationService } from './services/data-aggregation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsMetric, AnalyticsAlert]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AlertingService,
    AnalyticsGateway,
    DataAggregationService,
  ],
  exports: [
    AnalyticsService,
    AlertingService,
    DataAggregationService,
  ],
})
export class AnalyticsModule {}