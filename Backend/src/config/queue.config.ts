import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  // Queue configuration
  queue: {
    defaultConcurrency:
      parseInt(process.env.QUEUE_DEFAULT_CONCURRENCY ?? '', 10) || 2,
    maxConcurrency: parseInt(process.env.QUEUE_MAX_CONCURRENCY ?? '', 10) || 10,
    defaultTimeout:
      parseInt(process.env.QUEUE_DEFAULT_TIMEOUT ?? '', 10) || 60000, // 60 seconds
    retryDelay: parseInt(process.env.QUEUE_RETRY_DELAY ?? '', 10) || 2000, // 2 seconds
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES ?? '', 10) || 3,
    removeOnComplete:
      parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE ?? '', 10) || 100,
    removeOnFail: parseInt(process.env.QUEUE_REMOVE_ON_FAIL ?? '', 10) || 50,
    limiter: {
      max: parseInt(process.env.QUEUE_LIMITER_MAX ?? '', 10) || 100, // Max jobs per time window
      duration: parseInt(process.env.QUEUE_LIMITER_DURATION ?? '', 10) || 60000, // Time window in ms
    },
  },

  // Retry strategy configuration
  retry: {
    exponential: {
      baseDelay:
        parseInt(process.env.RETRY_EXPONENTIAL_BASE_DELAY ?? '', 10) || 2000, // 2 seconds
      multiplier:
        parseFloat(process.env.RETRY_EXPONENTIAL_MULTIPLIER ?? '') || 2,
      maxDelay:
        parseInt(process.env.RETRY_EXPONENTIAL_MAX_DELAY ?? '', 10) || 300000, // 5 minutes
    },
    linear: {
      baseDelay:
        parseInt(process.env.RETRY_LINEAR_BASE_DELAY ?? '', 10) || 1000, // 1 second
      increment: parseInt(process.env.RETRY_LINEAR_INCREMENT ?? '', 10) || 1000, // 1 second
      maxDelay:
        parseInt(process.env.RETRY_LINEAR_MAX_DELAY ?? '', 10) || 120000, // 2 minutes
    },
    fixed: {
      delay: parseInt(process.env.RETRY_FIXED_DELAY ?? '', 10) || 5000, // 5 seconds
    },
    fibonacci: {
      baseDelay:
        parseInt(process.env.RETRY_FIBONACCI_BASE_DELAY ?? '', 10) || 1000, // 1 second
      maxDelay:
        parseInt(process.env.RETRY_FIBONACCI_MAX_DELAY ?? '', 10) || 300000, // 5 minutes
    },
    jitter: {
      baseDelay:
        parseInt(process.env.RETRY_JITTER_BASE_DELAY ?? '', 10) || 2000, // 2 seconds
      maxDelay:
        parseInt(process.env.RETRY_JITTER_MAX_DELAY ?? '', 10) || 300000, // 5 minutes
    },
    circuitBreaker: {
      threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '', 10) || 5,
      timeout:
        parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT ?? '', 10) || 300000, // 5 minutes
    },
    callbackEnabled: process.env.RETRY_CALLBACK_ENABLED === 'true' || true,
  },

  // Priority configuration
  priority: {
    weights: {
      low: parseInt(process.env.PRIORITY_WEIGHT_LOW ?? '', 10) || 1,
      normal: parseInt(process.env.PRIORITY_WEIGHT_NORMAL ?? '', 10) || 5,
      high: parseInt(process.env.PRIORITY_WEIGHT_HIGH ?? '', 10) || 10,
      critical: parseInt(process.env.PRIORITY_WEIGHT_CRITICAL ?? '', 10) || 20,
    },
    dynamicAdjustment: {
      enabled:
        process.env.PRIORITY_DYNAMIC_ADJUSTMENT_ENABLED === 'true' || false,
      minFactor: parseFloat(process.env.PRIORITY_MIN_FACTOR ?? '') || 0.5,
      maxFactor: parseFloat(process.env.PRIORITY_MAX_FACTOR ?? '') || 2.0,
    },
    resourceAllocation: {
      enabled:
        process.env.PRIORITY_RESOURCE_ALLOCATION_ENABLED === 'true' || false,
      defaultLimit:
        parseInt(process.env.PRIORITY_RESOURCE_DEFAULT_LIMIT ?? '', 10) || 100,
    },
    escalation: {
      enabled: process.env.PRIORITY_ESCALATION_ENABLED === 'true' || false,
      staleThreshold:
        parseInt(process.env.PRIORITY_STALE_THRESHOLD ?? '', 10) || 900000, // 15 minutes
    },
  },

  // Monitoring configuration
  monitoring: {
    metricsRetentionDays:
      parseInt(process.env.MONITORING_METRICS_RETENTION_DAYS ?? '', 10) || 30,
    collectionInterval:
      parseInt(process.env.MONITORING_COLLECTION_INTERVAL ?? '', 10) || 30000, // 30 seconds
    alerting: {
      enabled: process.env.MONITORING_ALERTING_ENABLED === 'true' || true,
      failureRateThreshold:
        parseFloat(process.env.MONITORING_FAILURE_RATE_THRESHOLD ?? '') || 0.1, // 10%
      processingTimeThreshold:
        parseInt(process.env.MONITORING_PROCESSING_TIME_THRESHOLD ?? '', 10) ||
        300000, // 5 minutes
      backlogThreshold:
        parseInt(process.env.MONITORING_BACKLOG_THRESHOLD ?? '', 10) || 50,
      dlqSizeThreshold:
        parseInt(process.env.MONITORING_DLQ_SIZE_THRESHOLD ?? '', 10) || 20,
    },
    healthCheckInterval:
      parseInt(process.env.MONITORING_HEALTH_CHECK_INTERVAL ?? '', 10) || 60000, // 1 minute
    trendAnalysis: {
      enabled: process.env.MONITORING_TREND_ANALYSIS_ENABLED === 'true' || true,
      lookbackHours:
        parseInt(process.env.MONITORING_TREND_LOOKBACK_HOURS ?? '', 10) || 24,
      predictionHorizon:
        parseInt(process.env.MONITORING_PREDICTION_HORIZON ?? '', 10) || 1, // hours
    },
    performancePrediction: {
      enabled:
        process.env.MONITORING_PERFORMANCE_PREDICTION_ENABLED === 'true' ||
        true,
      confidenceThreshold:
        parseFloat(process.env.MONITORING_CONFIDENCE_THRESHOLD ?? '') || 0.7,
    },
  },

  // Dead letter queue configuration
  dlq: {
    maxSize: parseInt(process.env.DLQ_MAX_SIZE ?? '', 10) || 1000,
    retentionDays: parseInt(process.env.DLQ_RETENTION_DAYS ?? '', 10) || 30,
    autoProcess: {
      enabled: process.env.DLQ_AUTO_PROCESS_ENABLED === 'true' || false,
      batchSize:
        parseInt(process.env.DLQ_AUTO_PROCESS_BATCH_SIZE ?? '', 10) || 10,
      interval:
        parseInt(process.env.DLQ_AUTO_PROCESS_INTERVAL ?? '', 10) || 300000, // 5 minutes
    },
    resurrection: {
      maxAttempts:
        parseInt(process.env.DLQ_RESURRECTION_MAX_ATTEMPTS ?? '', 10) || 3,
      defaultDelay:
        parseInt(process.env.DLQ_RESURRECTION_DEFAULT_DELAY ?? '', 10) || 60000, // 1 minute
    },
    categorization: {
      enabled: process.env.DLQ_CATEGORIZATION_ENABLED === 'true' || true,
      autoCleanup: process.env.DLQ_AUTO_CLEANUP_ENABLED === 'true' || true,
    },
  },

  // Scheduling configuration
  scheduling: {
    enabled: process.env.SCHEDULING_ENABLED === 'true' || true,
    maxConcurrentJobs:
      parseInt(process.env.SCHEDULING_MAX_CONCURRENT_JOBS ?? '', 10) || 10,
    defaultMaxRuns:
      parseInt(process.env.SCHEDULING_DEFAULT_MAX_RUNS ?? '', 10) || -1, // Unlimited
    cleanupInterval:
      parseInt(process.env.SCHEDULING_CLEANUP_INTERVAL ?? '', 10) || 3600000, // 1 hour
    cronValidation: process.env.SCHEDULING_CRON_VALIDATION === 'true' || true,
  },

  // Health check configuration
  health: {
    checks: {
      failureRate: {
        warningThreshold:
          parseFloat(process.env.HEALTH_FAILURE_RATE_WARNING ?? '') || 0.05, // 5%
        criticalThreshold:
          parseFloat(process.env.HEALTH_FAILURE_RATE_CRITICAL ?? '') || 0.1, // 10%
      },
      processingTime: {
        warningThreshold:
          parseInt(process.env.HEALTH_PROCESSING_TIME_WARNING ?? '', 10) ||
          180000, // 3 minutes
        criticalThreshold:
          parseInt(process.env.HEALTH_PROCESSING_TIME_CRITICAL ?? '', 10) ||
          300000, // 5 minutes
      },
      backlog: {
        warningThreshold:
          parseInt(process.env.HEALTH_BACKLOG_WARNING ?? '', 10) || 25,
        criticalThreshold:
          parseInt(process.env.HEALTH_BACKLOG_CRITICAL ?? '', 10) || 50,
      },
      throughput: {
        warningThreshold:
          parseInt(process.env.HEALTH_THROUGHPUT_WARNING ?? '', 10) || 10,
        criticalThreshold:
          parseInt(process.env.HEALTH_THROUGHPUT_CRITICAL ?? '', 10) || 1,
      },
      dlqSize: {
        warningThreshold:
          parseInt(process.env.HEALTH_DLQ_SIZE_WARNING ?? '', 10) || 10,
        criticalThreshold:
          parseInt(process.env.HEALTH_DLQ_SIZE_CRITICAL ?? '', 10) || 20,
      },
    },
    scoring: {
      failureRateWeight:
        parseFloat(process.env.HEALTH_FAILURE_RATE_WEIGHT ?? '') || 0.3,
      processingTimeWeight:
        parseFloat(process.env.HEALTH_PROCESSING_TIME_WEIGHT ?? '') || 0.25,
      backlogWeight: parseFloat(process.env.HEALTH_BACKLOG_WEIGHT ?? '') || 0.2,
      throughputWeight:
        parseFloat(process.env.HEALTH_THROUGHPUT_WEIGHT ?? '') || 0.15,
      dlqSizeWeight:
        parseFloat(process.env.HEALTH_DLQ_SIZE_WEIGHT ?? '') || 0.1,
    },
  },
}));

// TypeScript interface for type safety
export interface QueueConfig {
  queue: {
    defaultConcurrency: number;
    maxConcurrency: number;
    defaultTimeout: number;
    retryDelay: number;
    maxRetries: number;
    removeOnComplete: number;
    removeOnFail: number;
    limiter: {
      max: number;
      duration: number;
    };
  };
  retry: {
    exponential: {
      baseDelay: number;
      multiplier: number;
      maxDelay: number;
    };
    linear: {
      baseDelay: number;
      increment: number;
      maxDelay: number;
    };
    fixed: {
      delay: number;
    };
    fibonacci: {
      baseDelay: number;
      maxDelay: number;
    };
    jitter: {
      baseDelay: number;
      maxDelay: number;
    };
    circuitBreaker: {
      threshold: number;
      timeout: number;
    };
    callbackEnabled: boolean;
  };
  priority: {
    weights: {
      low: number;
      normal: number;
      high: number;
      critical: number;
    };
    dynamicAdjustment: {
      enabled: boolean;
      minFactor: number;
      maxFactor: number;
    };
    resourceAllocation: {
      enabled: boolean;
      defaultLimit: number;
    };
    escalation: {
      enabled: boolean;
      staleThreshold: number;
    };
  };
  monitoring: {
    metricsRetentionDays: number;
    collectionInterval: number;
    alerting: {
      enabled: boolean;
      failureRateThreshold: number;
      processingTimeThreshold: number;
      backlogThreshold: number;
      dlqSizeThreshold: number;
    };
    healthCheckInterval: number;
    trendAnalysis: {
      enabled: boolean;
      lookbackHours: number;
      predictionHorizon: number;
    };
    performancePrediction: {
      enabled: boolean;
      confidenceThreshold: number;
    };
  };
  dlq: {
    maxSize: number;
    retentionDays: number;
    autoProcess: {
      enabled: boolean;
      batchSize: number;
      interval: number;
    };
    resurrection: {
      maxAttempts: number;
      defaultDelay: number;
    };
    categorization: {
      enabled: boolean;
      autoCleanup: boolean;
    };
  };
  scheduling: {
    enabled: boolean;
    maxConcurrentJobs: number;
    defaultMaxRuns: number;
    cleanupInterval: number;
    cronValidation: boolean;
  };
  health: {
    checks: {
      failureRate: {
        warningThreshold: number;
        criticalThreshold: number;
      };
      processingTime: {
        warningThreshold: number;
        criticalThreshold: number;
      };
      backlog: {
        warningThreshold: number;
        criticalThreshold: number;
      };
      throughput: {
        warningThreshold: number;
        criticalThreshold: number;
      };
      dlqSize: {
        warningThreshold: number;
        criticalThreshold: number;
      };
    };
    scoring: {
      failureRateWeight: number;
      processingTimeWeight: number;
      backlogWeight: number;
      throughputWeight: number;
      dlqSizeWeight: number;
    };
  };
}
