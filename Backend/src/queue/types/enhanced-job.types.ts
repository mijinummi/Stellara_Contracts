export interface JobPriority {
  level: 'low' | 'normal' | 'high' | 'critical';
  weight: number;
}

export interface RetryStrategy {
  type: 'exponential' | 'fixed' | 'linear' | 'custom' | 'fibonacci' | 'jitter';
  delay: number;
  maxAttempts: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  customDelayFn?: (attempt: number) => number;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  retryCallback?: (attempt: number, error: Error) => Promise<void>;
}

export interface JobSchedule {
  delay?: number;
  repeat?: {
    cron?: string;
    every?: number;
    limit?: number;
  };
  priority?: JobPriority;
}

export interface DeadLetterQueueItem {
  id: string;
  name: string;
  data: any;
  error: string;
  attempts: number;
  maxAttempts: number;
  failedAt: string;
  queueName: string;
  retryStrategy: RetryStrategy;
  canRetry: boolean;
  nextRetryAt?: string;
  category?: string;
  metadata?: {
    originalAttempts: number;
    addedToDLQAt: string;
    resurrectionAttempts: number;
    resurrectionHistory: Array<{
      attemptedAt: string;
      reason: string;
      parametersModified: boolean;
    }>;
  };
}

export interface JobMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  delayedJobs: number;
  waitingJobs: number;
  averageProcessingTime: number;
  successRate: number;
  failureRate: number;
  throughput: number;
  dlqSize: number;
}

export interface QueueMetrics {
  queueName: string;
  metrics: JobMetrics;
  timestamp: Date;
}

export interface EnhancedJobData {
  [key: string]: any;
  priority?: JobPriority;
  retryStrategy?: RetryStrategy;
  schedule?: JobSchedule;
  metadata?: {
    createdBy?: string;
    correlationId?: string;
    tags?: string[];
  };
}

export interface JobProcessingResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime: number;
  retryAttempt: number;
}

export enum JobPriorityLevel {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export const PRIORITY_WEIGHTS = {
  [JobPriorityLevel.LOW]: 1,
  [JobPriorityLevel.NORMAL]: 5,
  [JobPriorityLevel.HIGH]: 10,
  [JobPriorityLevel.CRITICAL]: 20,
};
