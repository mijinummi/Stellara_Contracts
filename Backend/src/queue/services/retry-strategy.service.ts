import { Injectable, Logger } from '@nestjs/common';
import { RetryStrategy } from '../types/enhanced-job.types';

@Injectable()
export class RetryStrategyService {
  private readonly logger = new Logger(RetryStrategyService.name);

  // Circuit breaker state tracking
  private circuitBreakerState: Map<
    string,
    {
      state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
      lastFailure: number;
      failureCount: number;
    }
  > = new Map();

  /**
   * Calculate delay for next retry attempt based on strategy
   */
  calculateRetryDelay(strategy: RetryStrategy, attempt: number): number {
    switch (strategy.type) {
      case 'exponential':
        return this.calculateExponentialDelay(strategy, attempt);

      case 'fixed':
        return strategy.delay;

      case 'linear':
        return this.calculateLinearDelay(strategy, attempt);

      case 'fibonacci':
        return this.calculateFibonacciDelay(strategy, attempt);

      case 'jitter':
        return this.calculateJitterDelay(strategy, attempt);

      case 'custom':
        if (strategy.customDelayFn) {
          return strategy.customDelayFn(attempt);
        }
        return strategy.delay;

      default:
        return strategy.delay;
    }
  }

  /**
   * Check if job should be retried based on error type and strategy
   */
  shouldRetry(
    error: Error,
    attempt: number,
    strategy: RetryStrategy,
    queueName?: string,
  ): boolean {
    // Check circuit breaker state if queueName is provided
    if (
      queueName &&
      this.isCircuitBreakerOpen(
        queueName,
        strategy.circuitBreakerTimeout || 60000,
      )
    ) {
      this.logger.warn(
        `Circuit breaker open for queue ${queueName}, skipping retry`,
      );
      return false;
    }

    if (attempt >= strategy.maxAttempts) {
      if (queueName) {
        this.recordFailure(queueName);
      }
      return false;
    }

    // Improved error classification
    const errorType = this.classifyError(error);
    const shouldRetry = this.evaluateErrorForRetry(errorType, error);

    if (!shouldRetry) {
      if (queueName) {
        this.recordFailure(queueName);
      }
      this.logger.warn(
        `Non-retryable error ${error.name} (${errorType}), skipping retries`,
      );
      return false;
    }

    return true;
  }

  /**
   * Evaluate if an error should be retried based on its type
   */
  private evaluateErrorForRetry(errorType: string, error: Error): boolean {
    // Permanent failures - never retry
    const permanentErrors = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'InvalidInputError',
      'ResourceNotFoundError',
      'PaymentRequiredError',
      'QuotaExceededError',
    ];

    // Transient failures - always retry (if within limits)
    const transientErrors = [
      'NetworkError',
      'TimeoutError',
      'ConnectionError',
      'RateLimitError',
      'ServerError',
    ];

    // Conditional failures - retry based on specific conditions
    const conditionalErrors = ['DatabaseError', 'ExternalServiceError'];

    if (
      permanentErrors.some(
        (err) => error.name === err || error.message.includes(err),
      )
    ) {
      return false;
    }

    if (
      transientErrors.some(
        (err) => error.name === err || error.message.includes(err),
      )
    ) {
      return true;
    }

    if (
      conditionalErrors.some(
        (err) => error.name === err || error.message.includes(err),
      )
    ) {
      // For conditional errors, check if they seem transient
      const transientIndicators = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ECONNRESET',
        'timeout',
        'network',
        'connection',
      ];

      return transientIndicators.some((indicator) =>
        error.message.toLowerCase().includes(indicator),
      );
    }

    // Default to retrying unknown errors
    return true;
  }

  /**
   * Classify error based on its characteristics
   */
  private classifyError(error: Error): string {
    if (error.message.includes('ECONN') || error.message.includes('network')) {
      return 'NetworkError';
    }

    if (
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return 'TimeoutError';
    }

    if (error.message.includes('rate') || error.message.includes('limit')) {
      return 'RateLimitError';
    }

    if (error.message.includes('database') || error.message.includes('DB')) {
      return 'DatabaseError';
    }

    if (
      error.message.includes('validation') ||
      error.message.includes('invalid')
    ) {
      return 'ValidationError';
    }

    if (
      error.message.includes('auth') ||
      error.message.includes('unauthorized')
    ) {
      return 'AuthenticationError';
    }

    if (
      error.message.includes('5xx') ||
      error.message.includes('server error')
    ) {
      return 'ServerError';
    }

    return error.name || 'UnknownError';
  }

  /**
   * Execute retry callback if defined
   */
  async executeRetryCallback(
    strategy: RetryStrategy,
    attempt: number,
    error: Error,
  ): Promise<void> {
    if (strategy.retryCallback) {
      try {
        await strategy.retryCallback(attempt, error);
        this.logger.log(`Retry callback executed for attempt ${attempt}`);
      } catch (callbackError) {
        this.logger.error(`Retry callback failed: ${callbackError.message}`);
      }
    }
  }

  /**
   * Get default retry strategy for job type
   */
  getDefaultStrategy(jobType: string): RetryStrategy {
    const defaultStrategies: Record<string, RetryStrategy> = {
      'deploy-contract': {
        type: 'exponential',
        delay: 5000,
        maxAttempts: 5,
        backoffMultiplier: 2,
        maxDelay: 300000, // 5 minutes
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 300000, // 5 minutes
        retryCallback: async (attempt, error) => {
          console.log(
            `Deploy contract retry attempt ${attempt} due to: ${error.message}`,
          );
        },
      },
      'process-tts': {
        type: 'exponential',
        delay: 2000,
        maxAttempts: 3,
        backoffMultiplier: 2,
        maxDelay: 60000, // 1 minute
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 120000, // 2 minutes
        retryCallback: async (attempt, error) => {
          console.log(
            `TTS process retry attempt ${attempt} due to: ${error.message}`,
          );
        },
      },
      'index-market-news': {
        type: 'linear',
        delay: 10000,
        maxAttempts: 7,
        maxDelay: 120000, // 2 minutes
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 300000, // 5 minutes
        retryCallback: async (attempt, error) => {
          console.log(
            `Market news index retry attempt ${attempt} due to: ${error.message}`,
          );
        },
      },
    };

    return (
      defaultStrategies[jobType] || {
        type: 'exponential',
        delay: 3000,
        maxAttempts: 3,
        backoffMultiplier: 2,
        maxDelay: 60000,
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 120000,
      }
    );
  }

  /**
   * Check if circuit breaker is open for a queue
   */
  private isCircuitBreakerOpen(queueName: string, timeoutMs: number): boolean {
    const state = this.circuitBreakerState.get(queueName);

    if (!state) return false;

    if (state.state === 'CLOSED') return false;

    if (state.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      if (timeSinceLastFailure > timeoutMs) {
        // Transition to HALF_OPEN to test if issue is resolved
        state.state = 'HALF_OPEN';
        this.logger.log(
          `Circuit breaker for ${queueName} transitioning to HALF_OPEN`,
        );
        return false; // Allow one attempt to test recovery
      }
      return true; // Still in OPEN state
    }

    // HALF_OPEN state - allow one test request
    return false;
  }

  /**
   * Record a failure and update circuit breaker state
   */
  private recordFailure(queueName: string): void {
    let state = this.circuitBreakerState.get(queueName);

    if (!state) {
      state = { state: 'CLOSED', lastFailure: 0, failureCount: 0 };
      this.circuitBreakerState.set(queueName, state);
    }

    state.failureCount++;
    state.lastFailure = Date.now();

    // Check if we should trip the circuit breaker
    if (state.failureCount >= 5 && state.state !== 'OPEN') {
      // Default threshold
      state.state = 'OPEN';
      this.logger.warn(`Circuit breaker tripped for queue ${queueName}`);
    }
  }

  /**
   * Record a success and reset circuit breaker state
   */
  recordSuccess(queueName: string): void {
    const state = this.circuitBreakerState.get(queueName);

    if (state) {
      if (state.state === 'HALF_OPEN') {
        this.logger.log(
          `Circuit breaker for ${queueName} closed after successful retry`,
        );
      }
      // Reset state on success
      state.state = 'CLOSED';
      state.failureCount = 0;
    }
  }

  private calculateExponentialDelay(
    strategy: RetryStrategy,
    attempt: number,
  ): number {
    const baseDelay = strategy.delay;
    const multiplier = strategy.backoffMultiplier || 2;
    const delay = baseDelay * Math.pow(multiplier, attempt - 1);
    const maxDelay = strategy.maxDelay || 300000;

    return Math.min(delay, maxDelay);
  }

  private calculateLinearDelay(
    strategy: RetryStrategy,
    attempt: number,
  ): number {
    const baseDelay = strategy.delay;
    const maxDelay = strategy.maxDelay || 120000;
    const delay = baseDelay * attempt;

    return Math.min(delay, maxDelay);
  }

  private calculateFibonacciDelay(
    strategy: RetryStrategy,
    attempt: number,
  ): number {
    // Fibonacci sequence: 1, 1, 2, 3, 5, 8, 13...
    let a = 1,
      b = 1;
    for (let i = 3; i <= attempt; i++) {
      const temp = a + b;
      a = b;
      b = temp;
    }
    return Math.min(a * strategy.delay, strategy.maxDelay || 300000);
  }

  private calculateJitterDelay(
    strategy: RetryStrategy,
    attempt: number,
  ): number {
    // Add random jitter to prevent thundering herd
    const baseDelay = this.calculateExponentialDelay(strategy, attempt);
    const jitter = Math.random(); // Random value between 0 and 1
    return Math.round(baseDelay * (1 + jitter * 0.1)); // Add up to 10% jitter
  }

  /**
   * Create retry options for Bull queue
   */
  createBullRetryOptions(strategy: RetryStrategy): any {
    const options: any = {
      attempts: strategy.maxAttempts,
      removeOnComplete: 100,
      removeOnFail: 50,
    };

    switch (strategy.type) {
      case 'exponential':
        options.backoff = {
          type: 'exponential',
          delay: strategy.delay,
        };
        break;

      case 'fixed':
        options.backoff = {
          type: 'fixed',
          delay: strategy.delay,
        };
        break;

      case 'linear':
        options.backoff = {
          type: 'exponential', // Bull doesn't support linear, use exponential approximation
          delay: strategy.delay,
        };
        break;

      case 'fibonacci':
        // Use custom backoff since Bull doesn't support fibonacci natively
        options.backoff = {
          type: 'exponential', // Fallback to exponential
          delay: strategy.delay,
        };
        break;

      case 'jitter':
        options.backoff = {
          type: 'exponential',
          delay: strategy.delay,
        };
        break;

      case 'custom':
        options.backoff = {
          type: 'exponential',
          delay: strategy.delay,
        };
        break;
    }

    return options;
  }
}
