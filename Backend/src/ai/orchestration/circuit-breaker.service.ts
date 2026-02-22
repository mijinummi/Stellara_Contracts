import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeoutMs: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  failedRequests: number;
  successRate: number;
  failureRate: number;
  state: CircuitBreakerState;
  lastStateChange: Date;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerEvent {
  circuitId: string;
  previousState: CircuitBreakerState;
  newState: CircuitBreakerState;
  timestamp: Date;
  reason?: string;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitBreaker>();
  private readonly defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    timeoutMs: 10000,
    resetTimeoutMs: 30000,
    halfOpenMaxAttempts: 3,
  };

  constructor(private readonly eventEmitter: EventEmitter2) {}

  createCircuit(circuitId: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const circuitConfig = { ...this.defaultConfig, ...config };
    const circuit = new CircuitBreaker(circuitId, circuitConfig, this.eventEmitter, this.logger);
    this.circuits.set(circuitId, circuit);
    return circuit;
  }

  getCircuit(circuitId: string): CircuitBreaker | undefined {
    return this.circuits.get(circuitId);
  }

  getAllCircuits(): Map<string, CircuitBreaker> {
    return new Map(this.circuits);
  }

  removeCircuit(circuitId: string): boolean {
    return this.circuits.delete(circuitId);
  }

  async executeWithCircuitBreaker<T>(
    circuitId: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    let circuit = this.getCircuit(circuitId);
    if (!circuit) {
      circuit = this.createCircuit(circuitId, config);
    }

    return circuit.execute(operation, fallback);
  }

  async resetCircuit(circuitId: string): Promise<void> {
    const circuit = this.getCircuit(circuitId);
    if (circuit) {
      await circuit.reset();
    }
  }

  async forceOpen(circuitId: string, reason?: string): Promise<void> {
    const circuit = this.getCircuit(circuitId);
    if (circuit) {
      await circuit.forceOpen(reason);
    }
  }

  async forceClosed(circuitId: string): Promise<void> {
    const circuit = this.getCircuit(circuitId);
    if (circuit) {
      await circuit.forceClosed();
    }
  }

  getMetrics(circuitId: string): CircuitBreakerMetrics | null {
    const circuit = this.getCircuit(circuitId);
    return circuit ? circuit.getMetrics() : null;
  }

  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [circuitId, circuit] of this.circuits) {
      metrics[circuitId] = circuit.getMetrics();
    }
    return metrics;
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private nextAttemptTime: Date | null = null;
  private halfOpenAttempts = 0;
  private readonly logger: Logger;

  constructor(
    private readonly circuitId: string,
    private readonly config: CircuitBreakerConfig,
    private readonly eventEmitter: EventEmitter2,
    logger: Logger,
  ) {
    this.logger = logger;
  }

  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (this.canAttemptReset()) {
        await this.attemptReset();
      } else {
        this.logger.warn(`Circuit ${this.circuitId} is OPEN, rejecting request`);
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker is OPEN for ${this.circuitId}`);
      }
    }

    try {
      const result = await this.executeWithTimeout(operation);
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error);
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private async onSuccess(): Promise<void> {
    this.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      this.logger.log(`Circuit ${this.circuitId} returned to CLOSED state`);
      await this.setState('CLOSED');
      this.halfOpenAttempts = 0;
    }

    // Reset failure count on success in closed state
    if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  private async onFailure(error: Error): Promise<void> {
    this.failureCount++;
    this.lastFailureTime = new Date();

    this.logger.error(`Circuit ${this.circuitId} operation failed: ${error.message}`);

    if (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold) {
      this.logger.warn(`Circuit ${this.circuitId} failure threshold reached, opening circuit`);
      await this.setState('OPEN');
      this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeoutMs);
    } else if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.logger.warn(`Circuit ${this.circuitId} failed in HALF_OPEN state, returning to OPEN`);
        await this.setState('OPEN');
        this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeoutMs);
      }
    }
  }

  private canAttemptReset(): boolean {
    return this.nextAttemptTime !== null && new Date() >= this.nextAttemptTime;
  }

  private async attemptReset(): Promise<void> {
    this.logger.log(`Attempting to reset circuit ${this.circuitId}`);
    await this.setState('HALF_OPEN');
    this.halfOpenAttempts = 0;
  }

  private async setState(newState: CircuitBreakerState): Promise<void> {
    const previousState = this.state;
    this.state = newState;
    
    const event: CircuitBreakerEvent = {
      circuitId: this.circuitId,
      previousState,
      newState,
      timestamp: new Date(),
    };

    this.eventEmitter.emit('circuit.state.changed', event);
    this.logger.log(`Circuit ${this.circuitId} state changed from ${previousState} to ${newState}`);
  }

  async reset(): Promise<void> {
    this.logger.log(`Resetting circuit ${this.circuitId}`);
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenAttempts = 0;
  }

  async forceOpen(reason?: string): Promise<void> {
    this.logger.warn(`Forcing circuit ${this.circuitId} to OPEN state: ${reason || 'manual'}`);
    await this.setState('OPEN');
    this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeoutMs);
  }

  async forceClosed(): Promise<void> {
    this.logger.log(`Forcing circuit ${this.circuitId} to CLOSED state`);
    await this.setState('CLOSED');
    this.reset();
  }

  getMetrics(): CircuitBreakerMetrics {
    const totalRequests = this.successCount + this.failureCount;
    const successRate = totalRequests > 0 ? (this.successCount / totalRequests) * 100 : 0;
    const failureRate = totalRequests > 0 ? (this.failureCount / totalRequests) * 100 : 0;

    return {
      totalRequests,
      failedRequests: this.failureCount,
      successRate,
      failureRate,
      state: this.state,
      lastStateChange: this.lastFailureTime || new Date(),
    };
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getCircuitId(): string {
    return this.circuitId;
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}