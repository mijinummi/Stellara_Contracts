import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiProviderFactory } from './ai-provider.factory';
import { CircuitBreakerService } from './circuit-breaker.service';
import { AdvancedQuotaService } from './advanced-quota.service';
import { AdvancedRateLimitService } from './advanced-rate-limit.service';
import { MultiLevelCacheService } from './multi-level-cache.service';
import { 
  AiRequestOptions, 
  AiResponse, 
  AiProviderHealth 
} from './interfaces/ai-provider.interface';

export interface OrchestrationResult {
  response: AiResponse;
  orchestrationMetadata: {
    providerSelected: string;
    cacheHit: boolean;
    quotaStatus: any;
    rateLimitStatus: any;
    circuitBreakerStatus: string;
    fallbackUsed: boolean;
    processingTimeMs: number;
    requestId: string;
  };
}

export interface FallbackStrategy {
  attemptFallback(
    error: Error,
    originalRequest: { prompt: string; options?: AiRequestOptions },
    context: { userId?: string; sessionId?: string }
  ): Promise<AiResponse | null>;
}

export class SimpleFallbackStrategy implements FallbackStrategy {
  private readonly fallbackMessage = "I'm sorry, I'm experiencing technical difficulties right now. Please try again in a moment.";

  async attemptFallback(
    error: Error,
    originalRequest: { prompt: string; options?: AiRequestOptions },
    context: { userId?: string; sessionId?: string }
  ): Promise<AiResponse | null> {
    return {
      content: this.fallbackMessage,
      model: 'fallback',
      provider: 'system',
      tokensUsed: { prompt: 0, completion: 10, total: 10 },
      cost: { input: 0, output: 0, total: 0 },
      cached: false,
      requestId: uuidv4(),
      timestamp: new Date(),
      metadata: {
        fallbackReason: error.message,
        originalError: error,
      },
    };
  }
}

@Injectable()
export class AiOrchestrationService {
  private readonly logger = new Logger(AiOrchestrationService.name);
  private fallbackStrategy: FallbackStrategy;

  constructor(
    private readonly providerFactory: AiProviderFactory,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly quotaService: AdvancedQuotaService,
    private readonly rateLimitService: AdvancedRateLimitService,
    private readonly cacheService: MultiLevelCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.fallbackStrategy = new SimpleFallbackStrategy();
  }

  async generateResponse(
    prompt: string,
    options?: AiRequestOptions
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const requestId = options?.requestId || uuidv4();
    const userId = options?.userId;
    const sessionId = options?.sessionId;

    this.logger.log(`Processing AI request ${requestId} for user ${userId || 'anonymous'}`);

    try {
      // 1. Check cache first
      const cacheResult = await this.checkCache(prompt, options);
      if (cacheResult) {
        const processingTime = Date.now() - startTime;
        const result: OrchestrationResult = {
          response: cacheResult,
          orchestrationMetadata: {
            providerSelected: 'cache',
            cacheHit: true,
            quotaStatus: null,
            rateLimitStatus: null,
            circuitBreakerStatus: 'closed',
            fallbackUsed: false,
            processingTimeMs: processingTime,
            requestId,
          },
        };
        
        this.eventEmitter.emit('ai.request.completed', result);
        return result;
      }

      // 2. Check quotas
      let quotaStatus: any = null;
      if (userId) {
        try {
          quotaStatus = await this.quotaService.enforceQuota(userId, sessionId);
        } catch (error) {
          this.logger.warn(`Quota exceeded for user ${userId}: ${error.message}`);
          throw new HttpException('Quota exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      // 3. Check rate limits
      let rateLimitStatus: any = null;
      if (userId) {
        try {
          rateLimitStatus = await this.rateLimitService.checkRateLimit(userId, 0, 0);
          if (!rateLimitStatus.canMakeRequest) {
            throw new Error('Rate limit exceeded');
          }
        } catch (error) {
          this.logger.warn(`Rate limit exceeded for user ${userId}: ${error.message}`);
          throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      // 4. Select and call provider with circuit breaker
      const providerResponse = await this.callProviderWithResilience(
        prompt,
        options,
        requestId
      );

      // 5. Record usage
      if (userId && providerResponse.tokensUsed && providerResponse.cost) {
        await this.quotaService.recordUsage(
          userId,
          sessionId,
          providerResponse.tokensUsed.total,
          providerResponse.cost.total
        );
        
        await this.rateLimitService.recordRequest(
          userId,
          providerResponse.tokensUsed.total,
          providerResponse.cost.total
        );
      }

      // 6. Cache the response
      if (options?.useCache !== false) {
        await this.cacheService.set(
          prompt,
          providerResponse.content,
          providerResponse.model,
          { ttlSeconds: options?.cacheTtl }
        );
      }

      const processingTime = Date.now() - startTime;
      const result: OrchestrationResult = {
        response: providerResponse,
        orchestrationMetadata: {
          providerSelected: providerResponse.provider,
          cacheHit: false,
          quotaStatus,
          rateLimitStatus,
          circuitBreakerStatus: 'closed',
          fallbackUsed: false,
          processingTimeMs: processingTime,
          requestId,
        },
      };
      
      this.eventEmitter.emit('ai.request.completed', result);
      return result;

    } catch (error) {
      this.logger.error(`AI request ${requestId} failed: ${error.message}`, error.stack);
      
      // Try fallback
      const fallbackResponse = await this.attemptFallback(
        error,
        { prompt, options },
        { userId, sessionId }
      );

      if (fallbackResponse) {
        const processingTime = Date.now() - startTime;
        const result: OrchestrationResult = {
          response: fallbackResponse,
          orchestrationMetadata: {
            providerSelected: fallbackResponse.provider,
            cacheHit: false,
            quotaStatus: null,
            rateLimitStatus: null,
            circuitBreakerStatus: 'open',
            fallbackUsed: true,
            processingTimeMs: processingTime,
            requestId,
          },
        };
        
        this.eventEmitter.emit('ai.request.fallback', result);
        return result;
      }

      // No fallback available, rethrow
      this.eventEmitter.emit('ai.request.failed', { 
        requestId, 
        error: error.message,
        timestamp: new Date()
      });
      
      throw error;
    }
  }

  async generateResponseWithFallback(
    prompt: string,
    options?: AiRequestOptions
  ): Promise<AiResponse> {
    try {
      const result = await this.generateResponse(prompt, options);
      return result.response;
    } catch (error) {
      this.logger.error(`AI request with fallback failed: ${error.message}`);
      
      const fallbackResponse = await this.fallbackStrategy.attemptFallback(
        error,
        { prompt, options },
        { userId: options?.userId, sessionId: options?.sessionId }
      );

      if (fallbackResponse) {
        return fallbackResponse;
      }

      // If no fallback, return a basic error response
      return {
        content: "I'm currently unable to process your request. Please try again later.",
        model: 'error',
        provider: 'system',
        tokensUsed: { prompt: 0, completion: 15, total: 15 },
        cost: { input: 0, output: 0, total: 0 },
        cached: false,
        requestId: options?.requestId || uuidv4(),
        timestamp: new Date(),
        metadata: { error: error.message },
      };
    }
  }

  async getProviderHealth(): Promise<Record<string, AiProviderHealth>> {
    return this.providerFactory.getAllProviderHealth();
  }

  async getHealthyProviders(): Promise<string[]> {
    return this.providerFactory.getHealthyProviders();
  }

  async getOrchestrationStats(): Promise<any> {
    const cacheStats = this.cacheService.getStats();
    const quotaStats = await this.getQuotaStats();
    const rateLimitStats = await this.getRateLimitStats();

    return {
      cache: cacheStats,
      quotas: quotaStats,
      rateLimits: rateLimitStats,
      message: 'Monitoring service not implemented',
    };
  }

  setFallbackStrategy(strategy: FallbackStrategy): void {
    this.fallbackStrategy = strategy;
    this.logger.log('Fallback strategy updated');
  }

  private async checkCache(prompt: string, options?: AiRequestOptions): Promise<AiResponse | null> {
    if (options?.useCache === false) {
      return null;
    }

    const model = options?.model || 'default';
    const cachedContent = await this.cacheService.get(prompt, model);
    
    if (cachedContent) {
      return {
        content: cachedContent,
        model,
        provider: 'cache',
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        cost: { input: 0, output: 0, total: 0 },
        cached: true,
        requestId: options?.requestId || uuidv4(),
        timestamp: new Date(),
      };
    }

    return null;
  }

  private async callProviderWithResilience(
    prompt: string,
    options: AiRequestOptions | undefined,
    requestId: string
  ): Promise<AiResponse> {
    const circuitId = `provider:${options?.model || 'default'}`;
    
    return this.circuitBreakerService.executeWithCircuitBreaker(
      circuitId,
      async () => {
        return this.providerFactory.generateResponse(prompt, options);
      },
      undefined, // No fallback at this level, handled at orchestration level
      {
        failureThreshold: 3,
        timeoutMs: 30000,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 2,
      }
    );
  }

  private async attemptFallback(
    error: Error,
    originalRequest: { prompt: string; options?: AiRequestOptions },
    context: { userId?: string; sessionId?: string }
  ): Promise<AiResponse | null> {
    try {
      return await this.fallbackStrategy.attemptFallback(error, originalRequest, context);
    } catch (fallbackError) {
      this.logger.error(`Fallback attempt failed: ${fallbackError.message}`);
      return null;
    }
  }

  private async getQuotaStats(): Promise<any> {
    // This would aggregate quota usage statistics
    // Implementation would depend on specific metrics needed
    return { message: 'Quota stats collection not implemented' };
  }

  private async getRateLimitStats(): Promise<any> {
    // This would aggregate rate limit statistics
    // Implementation would depend on specific metrics needed
    return { message: 'Rate limit stats collection not implemented' };
  }
}