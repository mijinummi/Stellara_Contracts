import { Logger } from '@nestjs/common';

export interface AiModelConfig {
  name: string;
  maxTokens: number;
  inputCostPerToken: number;
  outputCostPerToken: number;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsFunctions: boolean;
}

export interface AiProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  models: Record<string, AiModelConfig>;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface AiRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  userId?: string;
  sessionId?: string;
  requestId?: string;
  useCache?: boolean;
  recordQuota?: boolean;
  cacheTtl?: number;
  stream?: boolean;
}

export interface AiResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: {
    input: number;
    output: number;
    total: number;
  };
  cached: boolean;
  requestId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AiProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  errorRate: number;
  lastChecked: Date;
  failureReason?: string;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  nextAttempt: Date | null;
  status: 'closed' | 'open' | 'half-open';
}

export abstract class AiProvider {
  protected readonly logger: Logger;
  protected config: AiProviderConfig;
  protected circuitBreakerState: CircuitBreakerState;

  constructor(config: AiProviderConfig) {
    this.logger = new Logger(this.constructor.name);
    this.config = config;
    this.circuitBreakerState = {
      failures: 0,
      lastFailure: null,
      nextAttempt: null,
      status: 'closed',
    };
  }

  abstract initialize(): Promise<void>;
  abstract generate(prompt: string, options?: AiRequestOptions): Promise<AiResponse>;
  abstract healthCheck(): Promise<AiProviderHealth>;
  abstract getModelConfig(modelName: string): AiModelConfig | null;

  getConfig(): AiProviderConfig {
    return this.config;
  }

  getName(): string {
    return this.config.name;
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  isCircuitBreakerOpen(): boolean {
    return this.circuitBreakerState.status === 'open';
  }

  protected updateCircuitBreaker(success: boolean): void {
    if (success) {
      // Reset on success
      this.circuitBreakerState.failures = 0;
      this.circuitBreakerState.status = 'closed';
      this.circuitBreakerState.nextAttempt = null;
    } else {
      // Increment failures
      this.circuitBreakerState.failures++;
      this.circuitBreakerState.lastFailure = new Date();
      
      if (this.circuitBreakerState.failures >= 5) { // Threshold
        this.circuitBreakerState.status = 'open';
        // Open for 30 seconds
        this.circuitBreakerState.nextAttempt = new Date(Date.now() + 30000);
      }
    }
  }

  protected async waitForCircuitBreaker(): Promise<boolean> {
    if (this.circuitBreakerState.status === 'open') {
      const now = new Date();
      if (this.circuitBreakerState.nextAttempt && now >= this.circuitBreakerState.nextAttempt) {
        this.circuitBreakerState.status = 'half-open';
        return true;
      }
      return false;
    }
    return true;
  }
}