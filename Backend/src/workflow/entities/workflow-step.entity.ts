import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StepState } from '../types/step-state.enum';
import { Workflow } from './workflow.entity';

@Entity('workflow_steps')
@Index(['workflowId'])
@Index(['state'])
export class WorkflowStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workflowId: string;

  @Column()
  stepName: string;

  @Column()
  stepIndex: number;

  @Column({
    type: 'varchar',
    default: StepState.PENDING,
  })
  state: StepState;

  @Column('text', { nullable: true })
  input?: Record<string, any>;

  @Column('text', { nullable: true })
  output?: Record<string, any>;

  @Column('text', { nullable: true })
  config?: Record<string, any>;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 3 })
  maxRetries: number;

  // ...existing code...

  @Column({ type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  failedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  nextRetryAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  compensatedAt?: Date;

  @Column({ nullable: true })
  compensationStepName?: string;

  @Column('text', { nullable: true })
  compensationConfig?: Record<string, any>;

  @Column({ default: false })
  isIdempotent: boolean;

  @Column({ nullable: true })
  idempotencyKey?: string;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @Column({ default: false })
  requiresCompensation: boolean;

  @Column({ default: false })
  isCompensated: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Workflow, (workflow) => workflow.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;
}
