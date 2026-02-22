import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum UsageMetric {
  API_CALLS = 'api_calls',
  STORAGE_BYTES = 'storage_bytes',
  USERS_COUNT = 'users_count',
  TRANSACTIONS = 'transactions',
  WORKFLOW_EXECUTIONS = 'workflow_executions',
}

@Entity('tenant_usage')
export class TenantUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.usageRecords, {
    onDelete: 'CASCADE',
  })
  tenant: Tenant;

  @Column({
    type: 'enum',
    enum: UsageMetric,
  })
  metric: UsageMetric;

  @Column({ type: 'bigint' })
  value: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
