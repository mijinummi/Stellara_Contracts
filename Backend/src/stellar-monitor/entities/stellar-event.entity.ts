import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { EventType, DeliveryStatus } from '../types/stellar.types';

@Entity('stellar_events')
export class StellarEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  @Index()
  eventType: EventType;

  @Column()
  @Index()
  ledgerSequence: number;

  @Column({ type: 'timestamptz' })
  @Index()
  timestamp: Date;

  @Column({ length: 64 })
  @Index()
  transactionHash: string;

  @Column({ length: 56 })
  @Index()
  sourceAccount: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 20,
    default: DeliveryStatus.PENDING,
  })
  @Index()
  deliveryStatus: DeliveryStatus;

  @Column({ default: 0 })
  deliveryAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  lastAttemptAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date;

  @Column({ type: 'simple-array', nullable: true })
  deliveredTo?: string[]; // Array of consumer IDs

  @Column({ type: 'simple-array', nullable: true })
  failedDeliveries?: string[]; // Array of consumer IDs that failed

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ default: false })
  @Index()
  isProcessed: boolean;
}
