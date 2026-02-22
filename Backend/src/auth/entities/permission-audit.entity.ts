import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum PermissionAction {
  GRANTED = 'granted',
  REVOKED = 'revoked',
  MODIFIED = 'modified',
}

@Entity('permission_audits')
export class PermissionAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  permissionId?: string;

  @Column({ nullable: true })
  roleId?: string;

  @Column({ type: 'enum', enum: PermissionAction })
  action: PermissionAction;

  @Column({ type: 'json', nullable: true })
  details?: Record<string, any>;

  @Column()
  performedBy: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
