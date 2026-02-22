import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TenantConfig } from './tenant-config.entity';
import { TenantUsage } from './tenant-usage.entity';

export enum TenantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum BillingPlan {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string; // Unique identifier for URLs and API access

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.PENDING,
  })
  status: TenantStatus;

  @Column({
    type: 'enum',
    enum: BillingPlan,
    default: BillingPlan.FREE,
  })
  billingPlan: BillingPlan;

  @Column({ nullable: true })
  stripeCustomerId?: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  suspendedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  activatedAt?: Date;

  // Relationships
  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(() => TenantConfig, (config) => config.tenant)
  configs: TenantConfig[];

  @OneToMany(() => TenantUsage, (usage) => usage.tenant)
  usageRecords: TenantUsage[];

  // Computed properties
  get isActive(): boolean {
    return this.status === TenantStatus.ACTIVE;
  }

  get isSuspended(): boolean {
    return this.status === TenantStatus.SUSPENDED;
  }

  get userCount(): number {
    return this.users?.length || 0;
  }
}
