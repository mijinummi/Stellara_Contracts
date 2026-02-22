import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum ConfigType {
  GENERAL = 'general',
  AUTH = 'auth',
  BILLING = 'billing',
  FEATURES = 'features',
  INTEGRATIONS = 'integrations',
}

@Entity('tenant_configs')
export class TenantConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.configs, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column({
    type: 'enum',
    enum: ConfigType,
    default: ConfigType.GENERAL,
  })
  configType: ConfigType;

  @Column()
  key: string;

  @Column({ type: 'jsonb' })
  value: any;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
