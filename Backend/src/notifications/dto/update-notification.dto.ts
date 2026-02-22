import {
  IsEnum,
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsUUID,
  IsArray,
} from 'class-validator';
import {
  NotificationStatus,
  NotificationChannel,
} from '../types/notification.types';

export class UpdateNotificationDto {
  @IsEnum(NotificationStatus)
  @IsOptional()
  status?: NotificationStatus;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  channels?: NotificationChannel[];

  @IsBoolean()
  @IsOptional()
  isRead?: boolean;
}
