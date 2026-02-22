import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';
import { NotificationDeliveryService } from './notification-delivery.service';
import {
  NotificationType,
  NotificationStatus,
  NotificationChannel,
  NotificationPriority,
} from '../types/notification.types';
import { User } from '../../auth/entities/user.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly deliveryService: NotificationDeliveryService,
  ) {}

  async createNotification(
    createDto: CreateNotificationDto,
  ): Promise<Notification> {
    // If userId is not provided, create notification for all users or based on criteria
    if (!createDto.userId) {
      // This would be for system-wide notifications
      // For now, we'll just throw an error
      throw new Error('userId is required for individual notifications');
    }

    const notification = this.notificationRepository.create({
      ...createDto,
      status: NotificationStatus.PENDING,
      channels: createDto.channels || [NotificationChannel.IN_APP],
      userId: createDto.userId,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    // Deliver immediately if requested
    if (createDto.sendImmediately) {
      await this.deliverNotification(savedNotification.id);
    }

    return savedNotification;
  }

  async createBulkNotifications(
    createDto: Omit<CreateNotificationDto, 'userId'>,
    userIds: string[],
  ): Promise<Notification[]> {
    const notifications = userIds.map((userId) =>
      this.notificationRepository.create({
        ...createDto,
        status: NotificationStatus.PENDING,
        channels: createDto.channels || [NotificationChannel.IN_APP],
        userId,
      }),
    );

    const savedNotifications =
      await this.notificationRepository.save(notifications);

    // Deliver immediately if requested
    if (createDto.sendImmediately) {
      for (const notification of savedNotifications) {
        await this.deliverNotification(notification.id);
      }
    }

    return savedNotifications;
  }

  async getNotificationById(id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return notification;
  }

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: NotificationStatus,
    type?: NotificationType,
    unreadOnly: boolean = false,
  ): Promise<{ notifications: Notification[]; total: number }> {
    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.user', 'user')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('notification.status = :status', { status });
    }

    if (type) {
      queryBuilder.andWhere('notification.type = :type', { type });
    }

    if (unreadOnly) {
      queryBuilder.andWhere('notification.isRead = false');
    }

    const [notifications, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { notifications, total };
  }

  async updateNotification(
    id: string,
    updateDto: UpdateNotificationDto,
  ): Promise<Notification> {
    const notification = await this.getNotificationById(id);

    // Update notification
    Object.assign(notification, updateDto);

    if (updateDto.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      notification.status = NotificationStatus.READ;
    }

    return this.notificationRepository.save(notification);
  }

  async markAsRead(id: string): Promise<Notification> {
    return this.updateNotification(id, { isRead: true });
  }

  async markMultipleAsRead(ids: string[]): Promise<void> {
    await this.notificationRepository.update(
      { id: In(ids) },
      {
        isRead: true,
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      {
        isRead: true,
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    );
  }

  async deleteNotification(id: string): Promise<void> {
    const notification = await this.getNotificationById(id);
    await this.notificationRepository.remove(notification);
  }

  async getUserUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  async deliverNotification(id: string): Promise<boolean> {
    const notification = await this.getNotificationById(id);
    return this.deliveryService.deliverNotification(notification);
  }

  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreference> {
    let preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await this.createDefaultPreferences(userId);
    }

    return preferences;
  }

  async updateNotificationPreferences(
    userId: string,
    updateDto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    let preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = await this.createDefaultPreferences(userId);
    }

    // Update preferences
    if (updateDto.globalEnabled !== undefined) {
      preferences.globalEnabled = updateDto.globalEnabled;
    }

    if (updateDto.preferences) {
      preferences.preferences = {
        ...preferences.preferences,
        ...updateDto.preferences,
      };
    }

    if (updateDto.mutedUntil) {
      preferences.mutedUntil = new Date(updateDto.mutedUntil);
    }

    if (updateDto.customTemplates) {
      preferences.customTemplates = {
        ...preferences.customTemplates,
        ...updateDto.customTemplates,
      };
    }

    return this.preferenceRepository.save(preferences);
  }

  async toggleNotificationType(
    userId: string,
    notificationType: NotificationType,
    enabled: boolean,
  ): Promise<NotificationPreference> {
    const preferences = await this.getNotificationPreferences(userId);

    if (!preferences.preferences[notificationType]) {
      // Initialize if not exists
      preferences.preferences[notificationType] = {
        channels: [NotificationChannel.IN_APP],
        enabled: true,
        priorityThreshold: NotificationPriority.NORMAL,
      };
    }

    preferences.preferences[notificationType].enabled = enabled;
    return this.preferenceRepository.save(preferences);
  }

  async searchNotifications(
    userId: string,
    searchTerm: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ notifications: Notification[]; total: number }> {
    const [notifications, total] =
      await this.notificationRepository.findAndCount({
        where: [
          { userId, title: Like(`%${searchTerm}%`) },
          { userId, content: Like(`%${searchTerm}%`) },
        ],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

    return { notifications, total };
  }

  async archiveNotification(id: string): Promise<Notification> {
    const notification = await this.getNotificationById(id);
    notification.status = NotificationStatus.ARCHIVED;
    return this.notificationRepository.save(notification);
  }

  async bulkArchiveNotifications(ids: string[]): Promise<void> {
    await this.notificationRepository.update(
      { id: In(ids) },
      { status: NotificationStatus.ARCHIVED },
    );
  }

  async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    read: number;
    archived: number;
    byType: { [type: string]: number };
  }> {
    const [total, unread, read, archived] = await Promise.all([
      this.notificationRepository.count({ where: { userId } }),
      this.notificationRepository.count({ where: { userId, isRead: false } }),
      this.notificationRepository.count({ where: { userId, isRead: true } }),
      this.notificationRepository.count({
        where: { userId, status: NotificationStatus.ARCHIVED },
      }),
    ]);

    // Get counts by type
    const typeCounts = await this.notificationRepository
      .createQueryBuilder('notification')
      .select(['notification.type as type', 'COUNT(*) as count'])
      .where('notification.userId = :userId', { userId })
      .groupBy('notification.type')
      .getRawMany();

    const byType: { [type: string]: number } = {};
    typeCounts.forEach((row) => {
      byType[row.type] = parseInt(row.count);
    });

    return {
      total,
      unread,
      read,
      archived,
      byType,
    };
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
}
