import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary',
}

export enum MetricCategory {
  SYSTEM = 'system',
  BUSINESS = 'business',
  USER = 'user',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
}

@Entity('analytics_metrics')
@Index(['category', 'name', 'timestamp'])
@Index(['tenantId', 'timestamp'])
export class AnalyticsMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: MetricType })
  type: MetricType;

  @Column({ type: 'enum', enum: MetricCategory })
  category: MetricCategory;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  value: number;

  @Column({ type: 'json', nullable: true })
  labels: Record<string, string>;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index()
  tenantId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index()
  userId: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  timestamp: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}