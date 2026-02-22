import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { WalletBinding } from './wallet-binding.entity';
import { RefreshToken } from './refresh-token.entity';
import { ApiToken } from './api-token.entity';
import { Consent } from '../../gdpr/entities/consent.entity';
import { Tenant } from '../../tenancy/entities/tenant.entity';
import { UserPermission } from './user-permission.entity';
import { Role } from '../roles.enum';
import { UserRank } from '../../reputation/types/reputation.types';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column({ nullable: true })
  username?: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => WalletBinding, (binding) => binding.user)
  wallets: WalletBinding[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => ApiToken, (token) => token.user)
  apiTokens: ApiToken[];

  @OneToMany(() => Consent, (consent) => consent.user)
  consents: Consent[];

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { nullable: true })
  tenant: Tenant | null;

  @Column({ nullable: true })
  tenantId: string | null;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @OneToMany(() => UserPermission, (userPermission) => userPermission.user)
  userPermissions: UserPermission[];

  @Column({ type: 'int', default: 0 })
  reputation: number;

  @Column({ type: 'int', default: 0 })
  totalXp: number;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'enum', enum: UserRank, default: UserRank.NEWCOMER })
  rank: UserRank;

  @Column({ type: 'int', default: 0 })
  streak: number;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;
}
