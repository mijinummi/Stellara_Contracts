import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  // public token identifier (not secret) returned as `refreshTokenId`
  @Column({ unique: true })
  token: string;

  // hashed secret associated with this token - do NOT store plaintext
  @Column({ name: 'token_hash' })
  tokenHash: string;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
