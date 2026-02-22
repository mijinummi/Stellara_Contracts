import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationService } from './services/notification.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationController } from './controllers/notification.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference]),
    WebsocketModule,
    RedisModule,
    AuthModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationDeliveryService],
  exports: [NotificationService, NotificationDeliveryService],
})
export class NotificationModule {}
