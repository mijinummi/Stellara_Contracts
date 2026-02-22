import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
} from '../types/notification.types';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  @Index()
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
  })
  priority: NotificationPriority;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  @Index()
  status: NotificationStatus;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'json', nullable: true })
  data?: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'simple-array', default: () => [] })
  channels: NotificationChannel[];

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ name: 'userId' })
  @Index()
  userId: string;

  @Column({ nullable: true })
  @Index()
  relatedEntityId?: string;

  @Column({ length: 50, nullable: true })
  relatedEntityType?: string;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ nullable: true })
  sentAt?: Date;

  @Column({ nullable: true })
  deliveredAt?: Date;

  @Column({ nullable: true })
  readAt?: Date;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
