import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  TRIGGERED = 'triggered',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  SILENCED = 'silenced',
}

@Entity('analytics_alerts')
@Index(['status', 'createdAt'])
@Index(['severity', 'createdAt'])
export class AnalyticsAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: AlertSeverity })
  severity: AlertSeverity;

  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.TRIGGERED })
  status: AlertStatus;

  @Column({ type: 'varchar', length: 100 })
  metricName: string;

  @Column({ type: 'json' })
  condition: {
    operator: string; // '>', '<', '>=', '<=', '==', '!='
    threshold: number;
    duration?: number; // in seconds
  };

  @Column({ type: 'json', nullable: true })
  currentValue: any;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index()
  tenantId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index()
  userId: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  acknowledgedBy: string | null;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}