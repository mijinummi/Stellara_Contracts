import { Test, TestingModule } from '@nestjs/testing';
import { RetryStrategyService } from '../services/retry-strategy.service';
import { RetryStrategy } from '../types/enhanced-job.types';

describe('RetryStrategyService', () => {
  let service: RetryStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetryStrategyService],
    }).compile();

    service = module.get<RetryStrategyService>(RetryStrategyService);
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential delay correctly', () => {
      const strategy: RetryStrategy = {
        type: 'exponential',
        delay: 1000,
        maxAttempts: 5,
        backoffMultiplier: 2,
        maxDelay: 10000,
      };

      expect(service.calculateRetryDelay(strategy, 1)).toBe(1000);
      expect(service.calculateRetryDelay(strategy, 2)).toBe(2000);
      expect(service.calculateRetryDelay(strategy, 3)).toBe(4000);
      expect(service.calculateRetryDelay(strategy, 4)).toBe(8000);
      expect(service.calculateRetryDelay(strategy, 5)).toBe(10000); // Capped at maxDelay
    });

    it('should calculate fixed delay correctly', () => {
      const strategy: RetryStrategy = {
        type: 'fixed',
        delay: 5000,
        maxAttempts: 3,
      };

      expect(service.calculateRetryDelay(strategy, 1)).toBe(5000);
      expect(service.calculateRetryDelay(strategy, 2)).toBe(5000);
      expect(service.calculateRetryDelay(strategy, 3)).toBe(5000);
    });

    it('should calculate linear delay correctly', () => {
      const strategy: RetryStrategy = {
        type: 'linear',
        delay: 1000,
        maxAttempts: 5,
        maxDelay: 4000,
      };

      expect(service.calculateRetryDelay(strategy, 1)).toBe(1000);
      expect(service.calculateRetryDelay(strategy, 2)).toBe(2000);
      expect(service.calculateRetryDelay(strategy, 3)).toBe(3000);
      expect(service.calculateRetryDelay(strategy, 4)).toBe(4000);
      expect(service.calculateRetryDelay(strategy, 5)).toBe(4000); // Capped at maxDelay
    });

    it('should handle custom delay function', () => {
      const customDelayFn = jest.fn((attempt) => attempt * 3000);
      const strategy: RetryStrategy = {
        type: 'custom',
        delay: 1000,
        maxAttempts: 3,
        customDelayFn,
      };

      expect(service.calculateRetryDelay(strategy, 1)).toBe(3000);
      expect(service.calculateRetryDelay(strategy, 2)).toBe(6000);
      expect(customDelayFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('shouldRetry', () => {
    it('should return false when max attempts exceeded', () => {
      const strategy: RetryStrategy = {
        type: 'exponential',
        delay: 1000,
        maxAttempts: 3,
      };

      const error = new Error('Test error');
      expect(service.shouldRetry(error, 3, strategy)).toBe(false);
      expect(service.shouldRetry(error, 4, strategy)).toBe(false);
    });

    it('should return false for non-retryable errors', () => {
      const strategy: RetryStrategy = {
        type: 'exponential',
        delay: 1000,
        maxAttempts: 5,
      };

      const validationError = new Error('Invalid data');
      validationError.name = 'ValidationError';

      expect(service.shouldRetry(validationError, 1, strategy)).toBe(false);

      const authError = new Error('Authentication failed');
      authError.name = 'AuthenticationError';

      expect(service.shouldRetry(authError, 1, strategy)).toBe(false);
    });

    it('should return true for retryable errors within limits', () => {
      const strategy: RetryStrategy = {
        type: 'exponential',
        delay: 1000,
        maxAttempts: 5,
      };

      const networkError = new Error('Network timeout');
      networkError.name = 'NetworkError';

      expect(service.shouldRetry(networkError, 1, strategy)).toBe(true);
      expect(service.shouldRetry(networkError, 4, strategy)).toBe(true);
    });
  });

  describe('getDefaultStrategy', () => {
    it('should return correct strategy for deploy-contract', () => {
      const strategy = service.getDefaultStrategy('deploy-contract');

      expect(strategy.type).toBe('exponential');
      expect(strategy.delay).toBe(5000);
      expect(strategy.maxAttempts).toBe(5);
      expect(strategy.backoffMultiplier).toBe(2);
      expect(strategy.maxDelay).toBe(300000);
    });

    it('should return correct strategy for process-tts', () => {
      const strategy = service.getDefaultStrategy('process-tts');

      expect(strategy.type).toBe('exponential');
      expect(strategy.delay).toBe(2000);
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.backoffMultiplier).toBe(2);
      expect(strategy.maxDelay).toBe(60000);
    });

    it('should return default strategy for unknown job type', () => {
      const strategy = service.getDefaultStrategy('unknown-job');

      expect(strategy.type).toBe('exponential');
      expect(strategy.delay).toBe(3000);
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.backoffMultiplier).toBe(2);
    });
  });

  describe('createBullRetryOptions', () => {
    it('should create correct Bull options for exponential strategy', () => {
      const strategy: RetryStrategy = {
        type: 'exponential',
        delay: 2000,
        maxAttempts: 4,
      };

      const options = service.createBullRetryOptions(strategy);

      expect(options.attempts).toBe(4);
      expect(options.backoff.type).toBe('exponential');
      expect(options.backoff.delay).toBe(2000);
      expect(options.removeOnComplete).toBe(100);
      expect(options.removeOnFail).toBe(50);
    });

    it('should create correct Bull options for fixed strategy', () => {
      const strategy: RetryStrategy = {
        type: 'fixed',
        delay: 5000,
        maxAttempts: 2,
      };

      const options = service.createBullRetryOptions(strategy);

      expect(options.attempts).toBe(2);
      expect(options.backoff.type).toBe('fixed');
      expect(options.backoff.delay).toBe(5000);
    });
  });
});
