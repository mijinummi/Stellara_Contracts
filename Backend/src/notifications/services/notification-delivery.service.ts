import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationPriority,
} from '../types/notification.types';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { User } from '../../auth/entities/user.entity';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { RedisService } from '../../redis/redis.service';
import axios from 'axios';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    @Inject(WebsocketGateway)
    private readonly websocketGateway: WebsocketGateway,
    private readonly redisService: RedisService,
  ) {}

  async deliverNotification(notification: Notification): Promise<boolean> {
    const userId = notification.userId;
    let success = true;

    // Get user preferences to determine delivery channels
    const preferences = await this.getUserPreferences(userId);

    if (!preferences.globalEnabled) {
      this.logger.log(
        `Notification delivery skipped for user ${userId} - global disabled`,
      );
      return false;
    }

    // Check if user is muted
    if (
      preferences.mutedUntil &&
      new Date() < new Date(preferences.mutedUntil)
    ) {
      this.logger.log(
        `Notification delivery skipped for user ${userId} - user muted until ${preferences.mutedUntil}`,
      );
      return false;
    }

    // Get channel-specific preferences for this notification type
    const typePreferences = preferences.preferences[notification.type];
    if (!typePreferences?.enabled) {
      this.logger.log(
        `Notification delivery skipped for user ${userId} - ${notification.type} type disabled`,
      );
      return false;
    }

    // Check priority threshold
    const priorityValues = {
      low: 1,
      normal: 2,
      high: 3,
      urgent: 4,
    };

    const notificationPriorityValue = priorityValues[notification.priority];
    const thresholdValue = priorityValues[typePreferences.priorityThreshold];

    if (notificationPriorityValue < thresholdValue) {
      this.logger.log(
        `Notification delivery skipped for user ${userId} - priority threshold not met`,
      );
      return false;
    }

    // Determine which channels to use based on preferences and notification channels
    const eligibleChannels = notification.channels.filter((channel) =>
      typePreferences.channels.includes(channel),
    );

    // Deliver to each eligible channel
    for (const channel of eligibleChannels) {
      try {
        switch (channel) {
          case NotificationChannel.IN_APP:
            await this.deliverInApp(notification);
            break;
          case NotificationChannel.PUSH:
            await this.deliverPush(notification);
            break;
          case NotificationChannel.EMAIL:
            await this.deliverEmail(notification);
            break;
          case NotificationChannel.SMS:
            await this.deliverSMS(notification);
            break;
          default:
            this.logger.warn(`Unsupported notification channel: ${channel}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to deliver notification via ${channel}: ${error.message}`,
        );
        success = false;
      }
    }

    return success;
  }

  private async deliverInApp(notification: Notification): Promise<void> {
    try {
      // Update notification status
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      // Send via WebSocket to user
      this.websocketGateway.server
        .to(`user_${notification.userId}`)
        .emit('notification:new', {
          id: notification.id,
          type: notification.type,
          priority: notification.priority,
          title: notification.title,
          content: notification.content,
          data: notification.data,
          createdAt: notification.createdAt,
        });

      // Update status to delivered for in-app
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.DELIVERED,
        deliveredAt: new Date(),
      });

      this.logger.log(
        `In-app notification delivered to user ${notification.userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to deliver in-app notification: ${error.message}`,
      );
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.FAILED,
      });
      throw error;
    }
  }

  private async deliverPush(notification: Notification): Promise<void> {
    // In a real implementation, this would integrate with a push notification service
    // like Firebase Cloud Messaging (FCM) or Apple Push Notification Service (APNs)
    this.logger.log(
      `Push notification delivery attempted for user ${notification.userId}`,
    );

    // For now, just log that we would send a push notification
    // In a real implementation, we'd need device tokens stored in a separate table
    await this.notificationRepository.update(notification.id, {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    });

    // Simulate successful delivery
    await this.notificationRepository.update(notification.id, {
      status: NotificationStatus.DELIVERED,
      deliveredAt: new Date(),
    });
  }

  private async deliverEmail(notification: Notification): Promise<void> {
    // In a real implementation, this would integrate with an email service
    // like SendGrid, AWS SES, or Nodemailer
    this.logger.log(
      `Email notification delivery attempted for user ${notification.userId}`,
    );

    // Get user's email from the user entity
    const user = await this.notificationRepository.manager.findOne(User, {
      where: { id: notification.userId },
      select: ['email'],
    });

    if (!user?.email) {
      this.logger.warn(
        `Cannot send email notification - no email address for user ${notification.userId}`,
      );
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.FAILED,
      });
      return;
    }

    try {
      // In a real implementation, we would send the email here
      // For now, we'll just log it and simulate success

      // Update status to sent
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      // Simulate successful delivery
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.DELIVERED,
        deliveredAt: new Date(),
      });

      this.logger.log(
        `Email notification delivered to user ${notification.userId} at ${user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to deliver email notification: ${error.message}`,
      );
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.FAILED,
      });
      throw error;
    }
  }

  private async deliverSMS(notification: Notification): Promise<void> {
    // In a real implementation, this would integrate with an SMS service
    // like Twilio, AWS SNS, or Plivo
    this.logger.log(
      `SMS notification delivery attempted for user ${notification.userId}`,
    );

    // In a real implementation, we'd need phone numbers stored in the user profile
    // For now, we'll just simulate the process
    await this.notificationRepository.update(notification.id, {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    });

    // Simulate successful delivery
    await this.notificationRepository.update(notification.id, {
      status: NotificationStatus.DELIVERED,
      deliveredAt: new Date(),
    });
  }

  private async getUserPreferences(
    userId: string,
  ): Promise<NotificationPreference> {
    let preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences if none exist
      preferences = await this.createDefaultPreferences(userId);
    }

    return preferences;
  }

  private async createDefaultPreferences(
    userId: string,
  ): Promise<NotificationPreference> {
    const defaultPreferences: Partial<NotificationPreference> = {
      userId,
      globalEnabled: true,
      preferences: {
        system: {
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          enabled: true,
          priorityThreshold: NotificationPriority.NORMAL,
        },
        alert: {
          channels: [
            NotificationChannel.IN_APP,
            NotificationChannel.PUSH,
            NotificationChannel.EMAIL,
          ],
          enabled: true,
          priorityThreshold: NotificationPriority.NORMAL,
        },
        promotion: {
          channels: [NotificationChannel.EMAIL],
          enabled: true,
          priorityThreshold: NotificationPriority.NORMAL,
        },
        update: {
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          enabled: true,
          priorityThreshold: NotificationPriority.NORMAL,
        },
        message: {
          channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
          enabled: true,
          priorityThreshold: NotificationPriority.NORMAL,
        },
        transaction: {
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          enabled: true,
          priorityThreshold: NotificationPriority.HIGH,
        },
        security: {
          channels: [
            NotificationChannel.IN_APP,
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH,
          ],
          enabled: true,
          priorityThreshold: NotificationPriority.HIGH,
        },
      },
    };

    return this.preferenceRepository.save(
      defaultPreferences as NotificationPreference,
    );
  }

  async trackDelivery(
    notificationId: string,
    status: NotificationStatus,
    deliveryDetails?: any,
  ): Promise<void> {
    const updateData: any = { status };

    if (status === NotificationStatus.DELIVERED) {
      updateData.deliveredAt = new Date();
    } else if (status === NotificationStatus.SENT) {
      updateData.sentAt = new Date();
    }

    await this.notificationRepository.update(notificationId, updateData);
  }
}
