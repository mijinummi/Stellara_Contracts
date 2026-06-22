export interface JobData {
  [key: string]: any;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface JobConfig {
  attempts: number;
  backoff: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  timeout: number;
  concurrency: number;
  removeOnComplete: boolean;
  removeOnFail: boolean;
}

export enum JobStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
}

export interface JobInfo {
  id: string;
  name: string;
  status: JobStatus;
  progress: number;
  attempts: number;
  maxAttempts: number;
  data: JobData;
  result?: JobResult;
  error?: string;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}
