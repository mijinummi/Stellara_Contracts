import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { QuotaService, QuotaConfig, QuotaStatus } from './quota.service';
import { LlmCacheService } from './llm-cache.service';

export interface LlmResponseOptions {
  model?: string;
  useCache?: boolean;
  recordQuota?: boolean;
  cacheTtl?: number;
}

export interface LlmResponse {
  content: string;
  cached: boolean;
  quotaStatus?: QuotaStatus;
  model: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private readonly FALLBACK_MESSAGE =
    "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.";
  private readonly DEFAULT_MODEL = 'gpt-3.5-turbo';

  constructor(
    private readonly redisService: RedisService,
    private readonly quotaService: QuotaService,
    private readonly cacheService: LlmCacheService,
  ) {}

  /**
   * Generates a response from the LLM with quota, rate limiting, and caching.
   * @param userId - User identifier for quota tracking
   * @param sessionId - Session identifier for per-session quota
   * @param prompt - The prompt to send to the LLM
   * @param options - Configuration options for the request
   */
  async generateResponse(
    userId: string,
    sessionId: string,
    prompt: string,
    options: LlmResponseOptions = {},
  ): Promise<LlmResponse> {
    const model = options.model || this.DEFAULT_MODEL;
    const useCache = options.useCache !== false; // Default true
    const recordQuota = options.recordQuota !== false; // Default true
    const cacheTtl = options.cacheTtl;

    try {
      // 1. Check quotas and rate limits
      const quotaStatus = await this.quotaService.enforceQuota(
        userId,
        sessionId,
      );

      // 2. Try cache first
      if (useCache) {
        const cachedResponse = await this.cacheService.get(prompt, model);
        if (cachedResponse) {
          this.logger.log(`Cache hit for prompt (${model})`);
          return {
            content: cachedResponse,
            cached: true,
            quotaStatus,
            model,
          };
        }
      }

      // 3. Call LLM with fallback
      const response = await this.callLlmWithFallback(prompt);

      // 4. Cache the response
      if (useCache) {
        await this.cacheService.set(prompt, response, model, cacheTtl);
      }

      // 5. Record quota usage
      if (recordQuota) {
        await this.quotaService.recordRequest(userId, sessionId);
      }

      return {
        content: response,
        cached: false,
        quotaStatus,
        model,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Unexpected error in LLM pipeline: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'LLM service error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Generates a response with fallback behavior if LLM is unavailable
   * @param userId - User identifier for quota tracking
   * @param sessionId - Session identifier for per-session quota
   * @param prompt - The prompt to send to the LLM
   * @param options - Configuration options for the request
   */
  async generateResponseWithFallback(
    userId: string,
    sessionId: string,
    prompt: string,
    options: LlmResponseOptions = {},
  ): Promise<LlmResponse> {
    try {
      return await this.generateResponse(userId, sessionId, prompt, options);
    } catch (error) {
      // Return fallback response instead of throwing
      this.logger.warn(
        `LLM request failed, returning fallback for user ${userId}: ${error.message}`,
      );

      try {
        const quotaStatus = await this.quotaService.getQuotaStatus(
          userId,
          sessionId,
        );
        return {
          content: this.FALLBACK_MESSAGE,
          cached: false,
          quotaStatus,
          model: options.model || this.DEFAULT_MODEL,
        };
      } catch {
        // If even getting quota status fails, return minimal response
        return {
          content: this.FALLBACK_MESSAGE,
          cached: false,
          model: options.model || this.DEFAULT_MODEL,
        };
      }
    }
  }

  /**
   * Gets current quota status for a user
   */
  async getQuotaStatus(
    userId: string,
    sessionId: string,
    quotaConfig?: Partial<QuotaConfig>,
  ): Promise<QuotaStatus> {
    return this.quotaService.getQuotaStatus(
      userId,
      sessionId,
      new Date(),
      quotaConfig,
    );
  }

  /**
   * Gets cache statistics
   */
  async getCacheStats() {
    return this.cacheService.getStats();
  }

  /**
   * Invalidates cache for a specific prompt
   */
  async invalidateCache(prompt: string, model?: string): Promise<number> {
    return this.cacheService.invalidate(prompt, model);
  }

  /**
   * Invalidates all LLM cache
   */
  async invalidateAllCache(): Promise<number> {
    return this.cacheService.invalidateAll();
  }

  /**
   * Resets user quota (admin function)
   */
  async resetUserQuota(userId: string): Promise<void> {
    return this.quotaService.resetUserQuota(userId);
  }

  /**
   * Warms cache with common prompts
   */
  async warmCache(
    entries: Array<{
      prompt: string;
      response: string;
      model: string;
      ttl?: number;
    }>,
  ): Promise<number> {
    return this.cacheService.warmCache(entries);
  }

  /**
   * Mocks LLM call with error handling and fallback.
   */
  private async callLlmWithFallback(prompt: string): Promise<string> {
    try {
      // Simulate potential failure
      if (prompt.toLowerCase().includes('force-fail')) {
        throw new Error('Simulated provider failure');
      }

      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Mock responses
      const responses = [
        'I understand your question about ' +
          prompt +
          '. Let me help you with that.',
        "That's an interesting point. Based on what you've said, I think the best approach would be to consider multiple factors.",
        "I can definitely help you with that. Here's what I recommend based on your situation.",
        'Thanks for sharing that with me. Let me provide you with some guidance on this topic.',
      ];

      return responses[Math.floor(Math.random() * responses.length)];
    } catch (error) {
      this.logger.error(`LLM Provider Error: ${error.message}`);
      return this.FALLBACK_MESSAGE;
    }
  }
}
