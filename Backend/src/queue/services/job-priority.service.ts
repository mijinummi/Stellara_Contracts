import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  JobPriority,
  JobPriorityLevel,
  PRIORITY_WEIGHTS,
} from '../types/enhanced-job.types';

export interface JobDependency {
  jobId: string;
  queueName: string;
  dependentJobId: string;
  dependentQueueName: string;
  condition?: () => boolean;
}

@Injectable()
export class JobPriorityService {
  private readonly logger = new Logger(JobPriorityService.name);

  // Dynamic priority adjustment based on system load
  private systemLoadFactor = 1.0;

  // Job dependency tracking
  private jobDependencies: Map<string, JobDependency[]> = new Map();

  // Stale job tracking for escalation
  private staleJobs: Map<string, { addedAt: Date; priority: JobPriority }> =
    new Map();

  // Resource allocation tracking
  private resourceAllocation: Map<string, { allocated: number; used: number }> =
    new Map();

  /**
   * Get priority weight for a job priority level
   */
  getPriorityWeight(priority: JobPriority): number {
    return (
      PRIORITY_WEIGHTS[priority.level] ||
      PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL]
    );
  }

  /**
   * Determine job priority based on job data and metadata
   */
  determineJobPriority(
    jobName: string,
    jobData: any,
    metadata?: {
      tags?: string[];
      priority?: JobPriority;
      parentId?: string;
      correlationId?: string;
    },
  ): JobPriority {
    // If priority is explicitly set in metadata, use it
    if (metadata?.priority) {
      return metadata.priority;
    }

    // Determine base priority based on job type and data
    let priority = this.getPriorityByJobType(jobName, jobData);

    // Adjust priority based on tags
    if (metadata?.tags) {
      priority = this.adjustPriorityByTags(priority, metadata.tags);
    }

    // Apply dynamic priority adjustment based on system load
    priority = this.applyDynamicAdjustment(priority);

    // Apply priority inheritance from parent job if specified
    if (metadata?.parentId) {
      priority = this.inheritPriorityFromParent(priority, metadata.parentId);
    }

    // Check for stale job escalation
    priority = this.checkStaleJobEscalation(jobName, priority);

    return priority;
  }

  /**
   * Apply dynamic priority adjustment based on system load
   */
  applyDynamicAdjustment(basePriority: JobPriority): JobPriority {
    // Adjust priority based on current system load
    // If system is overloaded, boost high-priority jobs
    const adjustedWeight = Math.round(
      basePriority.weight * this.systemLoadFactor,
    );

    // Find the closest priority level based on the adjusted weight
    let closestLevel = basePriority.level;
    let minDiff = Math.abs(adjustedWeight - basePriority.weight);

    for (const level of Object.values(JobPriorityLevel)) {
      const weight = PRIORITY_WEIGHTS[level];
      const diff = Math.abs(adjustedWeight - weight);
      if (diff < minDiff) {
        minDiff = diff;
        closestLevel = level;
      }
    }

    return {
      level: closestLevel,
      weight: PRIORITY_WEIGHTS[closestLevel],
    };
  }

  /**
   * Inherit priority from parent job
   */
  inheritPriorityFromParent(
    childPriority: JobPriority,
    parentId: string,
  ): JobPriority {
    // In a real implementation, we would look up the parent job's priority
    // For now, we'll simulate this by checking if the parent ID suggests high priority
    if (parentId.includes('high') || parentId.includes('critical')) {
      return {
        level: JobPriorityLevel.HIGH,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.HIGH],
      };
    }

    return childPriority;
  }

  /**
   * Check for stale job escalation
   */
  checkStaleJobEscalation(
    jobName: string,
    basePriority: JobPriority,
  ): JobPriority {
    // Define thresholds for different job types
    const staleThresholds: Record<string, number> = {
      'deploy-contract': 30 * 60 * 1000, // 30 minutes
      'process-tts': 5 * 60 * 1000, // 5 minutes
      'index-market-news': 10 * 60 * 1000, // 10 minutes
    };

    const threshold = staleThresholds[jobName] || 15 * 60 * 1000; // Default 15 minutes

    // In a real implementation, we would track actual job start times
    // For simulation, we'll escalate if base priority is low and job type is important
    if (
      basePriority.level === JobPriorityLevel.LOW &&
      ['deploy-contract', 'process-tts'].includes(jobName)
    ) {
      // Escalate low priority important jobs after a period
      return {
        level: JobPriorityLevel.NORMAL,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL],
      };
    }

    return basePriority;
  }

  /**
   * Set system load factor for dynamic priority adjustment
   */
  setSystemLoadFactor(factor: number): void {
    this.systemLoadFactor = Math.max(0.5, Math.min(2.0, factor)); // Clamp between 0.5 and 2.0
    this.logger.log(`System load factor set to ${this.systemLoadFactor}`);
  }

  /**
   * Register job dependency
   */
  registerDependency(dependency: JobDependency): void {
    const queueDeps =
      this.jobDependencies.get(dependency.dependentQueueName) || [];
    queueDeps.push(dependency);
    this.jobDependencies.set(dependency.dependentQueueName, queueDeps);

    this.logger.log(
      `Registered dependency: ${dependency.jobId} -> ${dependency.dependentJobId}`,
    );
  }

  /**
   * Get dependencies for a queue
   */
  getQueueDependencies(queueName: string): JobDependency[] {
    return this.jobDependencies.get(queueName) || [];
  }

  /**
   * Track a job as potentially stale
   */
  trackStaleJob(jobId: string, priority: JobPriority): void {
    this.staleJobs.set(jobId, {
      addedAt: new Date(),
      priority,
    });
  }

  /**
   * Release stale job tracking
   */
  releaseStaleJob(jobId: string): void {
    this.staleJobs.delete(jobId);
  }

  /**
   * Allocate resources for a job
   */
  allocateResources(jobId: string, queueName: string, amount: number): boolean {
    const key = `${queueName}_resources`;
    const allocation = this.resourceAllocation.get(key) || {
      allocated: 0,
      used: 0,
    };

    // Check if we have enough available resources
    const available = allocation.allocated - allocation.used;
    if (available < amount) {
      this.logger.warn(
        `Insufficient resources for job ${jobId}. Requested: ${amount}, Available: ${available}`,
      );
      return false;
    }

    // Allocate resources
    allocation.used += amount;
    this.resourceAllocation.set(key, allocation);

    this.logger.log(
      `Allocated ${amount} resources for job ${jobId} in queue ${queueName}`,
    );
    return true;
  }

  /**
   * Release allocated resources
   */
  releaseResources(jobId: string, queueName: string, amount: number): void {
    const key = `${queueName}_resources`;
    const allocation = this.resourceAllocation.get(key);

    if (allocation) {
      allocation.used = Math.max(0, allocation.used - amount);
      this.logger.log(
        `Released ${amount} resources for job ${jobId} in queue ${queueName}`,
      );
    }
  }

  /**
   * Set resource allocation for a queue
   */
  setResourceAllocation(queueName: string, totalAmount: number): void {
    const key = `${queueName}_resources`;
    const current = this.resourceAllocation.get(key) || {
      allocated: 0,
      used: 0,
    };
    current.allocated = totalAmount;
    this.resourceAllocation.set(key, current);

    this.logger.log(
      `Set resource allocation for queue ${queueName} to ${totalAmount}`,
    );
  }

  /**
   * Get resource utilization for a queue
   */
  getResourceUtilization(queueName: string): {
    used: number;
    allocated: number;
    utilization: number;
  } {
    const key = `${queueName}_resources`;
    const allocation = this.resourceAllocation.get(key) || {
      allocated: 0,
      used: 0,
    };

    const utilization =
      allocation.allocated > 0 ? allocation.used / allocation.allocated : 0;
    return {
      used: allocation.used,
      allocated: allocation.allocated,
      utilization,
    };
  }

  /**
   * Create Bull queue options with priority
   */
  createPriorityOptions(priority: JobPriority, baseOptions: any = {}): any {
    const priorityWeight = this.getPriorityWeight(priority);

    return {
      ...baseOptions,
      priority: priorityWeight,
      // Higher priority jobs should be processed first
      // Bull processes jobs with higher priority numbers first
    };
  }

  /**
   * Schedule job with delay and priority
   */
  createScheduledOptions(
    delay?: number,
    priority?: JobPriority,
    baseOptions: any = {},
  ): any {
    const options = { ...baseOptions };

    if (delay && delay > 0) {
      options.delay = delay;
    }

    if (priority) {
      const priorityWeight = this.getPriorityWeight(priority);
      options.priority = priorityWeight;
    }

    return options;
  }

  /**
   * Get priority by job type and data analysis
   */
  private getPriorityByJobType(jobName: string, jobData: any): JobPriority {
    switch (jobName) {
      case 'deploy-contract':
        return this.getContractDeploymentPriority(jobData);

      case 'process-tts':
        return this.getTTSPriority(jobData);

      case 'index-market-news':
        return this.getMarketNewsPriority(jobData);

      default:
        return {
          level: JobPriorityLevel.NORMAL,
          weight: PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL],
        };
    }
  }

  /**
   * Determine priority for contract deployment jobs
   */
  private getContractDeploymentPriority(jobData: any): JobPriority {
    // High priority for production deployments
    if (jobData.environment === 'production') {
      return {
        level: JobPriorityLevel.CRITICAL,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.CRITICAL],
      };
    }

    // High priority for urgent deployments
    if (jobData.urgent || jobData.priority === 'high') {
      return {
        level: JobPriorityLevel.HIGH,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.HIGH],
      };
    }

    // Normal priority for staging
    if (jobData.environment === 'staging') {
      return {
        level: JobPriorityLevel.NORMAL,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL],
      };
    }

    // Low priority for development/test deployments
    return {
      level: JobPriorityLevel.LOW,
      weight: PRIORITY_WEIGHTS[JobPriorityLevel.LOW],
    };
  }

  /**
   * Determine priority for TTS processing jobs
   */
  private getTTSPriority(jobData: any): JobPriority {
    // High priority for real-time voice responses
    if (jobData.sessionId && jobData.realTime) {
      return {
        level: JobPriorityLevel.HIGH,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.HIGH],
      };
    }

    // High priority for short text (likely interactive)
    if (jobData.text && jobData.text.length < 100) {
      return {
        level: JobPriorityLevel.NORMAL,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL],
      };
    }

    // Low priority for batch processing
    if (jobData.batch || (jobData.text && jobData.text.length > 1000)) {
      return {
        level: JobPriorityLevel.LOW,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.LOW],
      };
    }

    return {
      level: JobPriorityLevel.NORMAL,
      weight: PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL],
    };
  }

  /**
   * Determine priority for market news indexing jobs
   */
  private getMarketNewsPriority(jobData: any): JobPriority {
    // Critical priority for breaking news
    if (jobData.breaking || jobData.urgent) {
      return {
        level: JobPriorityLevel.CRITICAL,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.CRITICAL],
      };
    }

    // High priority for recent news
    if (jobData.timestamp) {
      const newsAge = Date.now() - new Date(jobData.timestamp).getTime();
      if (newsAge < 300000) {
        // Less than 5 minutes
        return {
          level: JobPriorityLevel.HIGH,
          weight: PRIORITY_WEIGHTS[JobPriorityLevel.HIGH],
        };
      }
    }

    // Normal priority for regular news
    return {
      level: JobPriorityLevel.NORMAL,
      weight: PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL],
    };
  }

  /**
   * Adjust priority based on job tags
   */
  private adjustPriorityByTags(
    priority: JobPriority,
    tags: string[],
  ): JobPriority {
    let adjustedPriority = { ...priority };

    // Tags that increase priority
    const highPriorityTags = [
      'urgent',
      'critical',
      'real-time',
      'production',
      'breaking',
    ];
    const criticalTags = ['emergency', 'security', 'compliance'];

    // Tags that decrease priority
    const lowPriorityTags = [
      'batch',
      'bulk',
      'test',
      'development',
      'low-priority',
    ];

    // Check for critical tags first
    if (criticalTags.some((tag) => tags.includes(tag))) {
      adjustedPriority = {
        level: JobPriorityLevel.CRITICAL,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.CRITICAL],
      };
    }
    // Then check for high priority tags
    else if (highPriorityTags.some((tag) => tags.includes(tag))) {
      adjustedPriority = {
        level: JobPriorityLevel.HIGH,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.HIGH],
      };
    }
    // Then check for low priority tags
    else if (lowPriorityTags.some((tag) => tags.includes(tag))) {
      adjustedPriority = {
        level: JobPriorityLevel.LOW,
        weight: PRIORITY_WEIGHTS[JobPriorityLevel.LOW],
      };
    }

    return adjustedPriority;
  }

  /**
   * Sort jobs by priority (for manual processing)
   */
  sortJobsByPriority(jobs: any[]): any[] {
    return jobs.sort((a, b) => {
      const priorityA = a.opts?.priority || 0;
      const priorityB = b.opts?.priority || 0;
      return priorityB - priorityA; // Higher priority first
    });
  }

  /**
   * Get priority distribution statistics
   */
  getPriorityDistribution(jobs: any[]): Record<JobPriorityLevel, number> {
    const distribution = {
      [JobPriorityLevel.LOW]: 0,
      [JobPriorityLevel.NORMAL]: 0,
      [JobPriorityLevel.HIGH]: 0,
      [JobPriorityLevel.CRITICAL]: 0,
    };

    jobs.forEach((job) => {
      const priority =
        job.opts?.priority || PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL];

      if (priority >= PRIORITY_WEIGHTS[JobPriorityLevel.CRITICAL]) {
        distribution[JobPriorityLevel.CRITICAL]++;
      } else if (priority >= PRIORITY_WEIGHTS[JobPriorityLevel.HIGH]) {
        distribution[JobPriorityLevel.HIGH]++;
      } else if (priority >= PRIORITY_WEIGHTS[JobPriorityLevel.NORMAL]) {
        distribution[JobPriorityLevel.NORMAL]++;
      } else {
        distribution[JobPriorityLevel.LOW]++;
      }
    });

    return distribution;
  }
}
