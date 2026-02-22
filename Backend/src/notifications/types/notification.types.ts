export enum NotificationType {
  SYSTEM = 'system',
  ALERT = 'alert',
  PROMOTION = 'promotion',
  UPDATE = 'update',
  MESSAGE = 'message',
  TRANSACTION = 'transaction',
  SECURITY = 'security',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  READ = 'read',
  ARCHIVED = 'archived',
}

export interface NotificationTemplate {
  subject: string;
  body: string;
  htmlBody?: string;
  placeholders: string[];
}

export interface NotificationPreferences {
  channels: NotificationChannel[];
  enabled: boolean;
  priorityThreshold: NotificationPriority;
  mutedUntil?: Date;
}
