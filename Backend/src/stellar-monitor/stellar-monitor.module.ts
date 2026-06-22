import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarMonitorController } from './controllers/stellar-monitor.controller';
import { StellarEventMonitorService } from './services/stellar-event-monitor.service';
import { WebhookDeliveryService } from './services/webhook-delivery.service';
import { EventStorageService } from './services/event-storage.service';
import { ConsumerManagementService } from './services/consumer-management.service';
import { WebhookConsumer } from './entities/webhook-consumer.entity';
import { StellarEvent } from './entities/stellar-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookConsumer, StellarEvent])],
  controllers: [StellarMonitorController],
  providers: [
    StellarEventMonitorService,
    WebhookDeliveryService,
    EventStorageService,
    ConsumerManagementService,
  ],
  exports: [
    StellarEventMonitorService,
    WebhookDeliveryService,
    EventStorageService,
    ConsumerManagementService,
  ],
})
export class StellarMonitorModule {}
