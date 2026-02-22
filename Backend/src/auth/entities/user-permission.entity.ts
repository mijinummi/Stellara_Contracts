import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Permission } from './permission.entity';

@Entity('user_permissions')
export class UserPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.userPermissions, {
    onDelete: 'CASCADE',
  })
  user: User;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  permission: Permission;

  @Column({ nullable: true })
  grantedBy?: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;
}
