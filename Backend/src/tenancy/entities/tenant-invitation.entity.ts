import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Entity('tenant_invitations')
export class TenantInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.id, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  email: string;

  @Column()
  role: string; // Role to assign when accepted

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @Column()
  token: string; // Unique token for invitation acceptance

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt?: Date;

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get isValid(): boolean {
    return this.status === InvitationStatus.PENDING && !this.isExpired;
  }
}
