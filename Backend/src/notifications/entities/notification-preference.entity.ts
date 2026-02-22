import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
} from '../types/notification.types';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ name: 'userId' })
  userId: string;

  @Column({ type: 'json' })
  preferences: {
    [key in NotificationType]: {
      channels: NotificationChannel[];
      enabled: boolean;
      priorityThreshold: NotificationPriority;
    };
  };

  @Column({ default: true })
  globalEnabled: boolean;

  @Column({ nullable: true })
  mutedUntil?: Date;

  @Column({ type: 'json', nullable: true })
  customTemplates?: {
    [key in NotificationType]?: {
      subject: string;
      body: string;
      htmlBody?: string;
    };
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
