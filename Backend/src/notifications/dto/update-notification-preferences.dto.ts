import {
  IsObject,
  IsBoolean,
  IsEnum,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
} from '../types/notification.types';

export class UpdateNotificationPreferencesDto {
  @IsObject()
  @IsOptional()
  preferences?: {
    [key in NotificationType]?: {
      channels: NotificationChannel[];
      enabled: boolean;
      priorityThreshold: NotificationPriority;
    };
  };

  @IsBoolean()
  @IsOptional()
  globalEnabled?: boolean;

  @IsString()
  @IsOptional()
  mutedUntil?: string; // ISO date string

  @IsObject()
  @IsOptional()
  customTemplates?: {
    [key in NotificationType]?: {
      subject: string;
      body: string;
      htmlBody?: string;
    };
  };
}
