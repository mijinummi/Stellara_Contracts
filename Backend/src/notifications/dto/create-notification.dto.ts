import {
  IsEnum,
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
  IsUUID,
  IsArray,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
} from '../types/notification.types';

export class CreateNotificationDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority = NotificationPriority.NORMAL;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  channels?: NotificationChannel[] = [NotificationChannel.IN_APP];

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  relatedEntityId?: string;

  @IsString()
  @IsOptional()
  relatedEntityType?: string;

  @IsBoolean()
  @IsOptional()
  sendImmediately?: boolean = true;
}
