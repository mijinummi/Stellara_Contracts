import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { AiProvider, AiProviderConfig, AiModelConfig, AiRequestOptions, AiResponse, AiProviderHealth } from '../interfaces/ai-provider.interface';

@Injectable()
export class GoogleProvider extends AiProvider {
  private client: AxiosInstance;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
  ) {
    const config: AiProviderConfig = {
      name: 'google',
      apiKey: configService.get<string>('GOOGLE_API_KEY') || '',
      defaultModel: configService.get<string>('GOOGLE_DEFAULT_MODEL') || 'gemini-pro',
      models: {
        'gemini-pro': {
          name: 'gemini-pro',
          maxTokens: 8192,
          inputCostPerToken: 0.0000005,
          outputCostPerToken: 0.0000015,
          contextWindow: 32768,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'gemini-1.5-pro': {
          name: 'gemini-1.5-pro',
          maxTokens: 8192,
          inputCostPerToken: 0.0000035,
          outputCostPerToken: 0.0000105,
          contextWindow: 1048576,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'gemini-1.5-flash': {
          name: 'gemini-1.5-flash',
          maxTokens: 8192,
          inputCostPerToken: 0.00000035,
          outputCostPerToken: 0.00000105,
          contextWindow: 1048576,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'gemini-ultra': {
          name: 'gemini-ultra',
          maxTokens: 2048,
          inputCostPerToken: 0.0000065,
          outputCostPerToken: 0.0000195,
          contextWindow: 32768,
          supportsStreaming: true,
          supportsFunctions: true,
        },
      },
      timeoutMs: configService.get<number>('GOOGLE_TIMEOUT_MS') || 30000,
      maxRetries: configService.get<number>('GOOGLE_MAX_RETRIES') || 3,
      retryDelayMs: configService.get<number>('GOOGLE_RETRY_DELAY_MS') || 1000,
    };

    super(config);
  }

  async initialize(): Promise<void> {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.config.timeoutMs,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.updateCircuitBreaker(false);
        return Promise.reject(error);
      }
    );
  }

  async generate(prompt: string, options?: AiRequestOptions): Promise<AiResponse> {
    const requestId = options?.requestId || uuidv4();
    const model = options?.model || this.config.defaultModel;
    const modelConfig = this.getModelConfig(model);

    if (!modelConfig) {
      throw new Error(`Model ${model} not supported by Google provider`);
    }

    if (!await this.waitForCircuitBreaker()) {
      throw new Error(`Google provider circuit breaker is open. Try again later.`);
    }

    const startTime = Date.now();
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;

    try {
      const response = await this.client.post(url, {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: options?.temperature || 0.7,
          maxOutputTokens: options?.maxTokens || modelConfig.maxTokens,
          topP: options?.topP || 0.95,
          topK: 40,
          stopSequences: options?.stopSequences,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      });

      const completion = response.data.candidates[0].content.parts[0].text;
      const tokenCount = response.data.usageMetadata?.totalTokenCount || completion.length / 4; // Approximate
      const promptTokens = response.data.usageMetadata?.promptTokenCount || prompt.length / 4;
      const completionTokens = response.data.usageMetadata?.candidatesTokenCount || completion.length / 4;

      const inputCost = promptTokens * modelConfig.inputCostPerToken;
      const outputCost = completionTokens * modelConfig.outputCostPerToken;
      const totalCost = inputCost + outputCost;

      this.updateCircuitBreaker(true);

      return {
        content: completion,
        model,
        provider: this.config.name,
        tokensUsed: {
          prompt: promptTokens,
          completion: completionTokens,
          total: tokenCount,
        },
        cost: {
          input: inputCost,
          output: outputCost,
          total: totalCost,
        },
        cached: false,
        requestId,
        timestamp: new Date(),
        metadata: {
          finishReason: response.data.candidates[0].finishReason,
          safetyRatings: response.data.candidates[0].safetyRatings,
          modelConfig,
        },
      };
    } catch (error) {
      this.logger.error(`Google API error for request ${requestId}: ${error.message}`, error.stack);
      this.updateCircuitBreaker(false);
      throw error;
    }
  }

  async healthCheck(): Promise<AiProviderHealth> {
    const startTime = Date.now();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let errorRate = 0;
    let failureReason: string | undefined;

    try {
      // Simple health check by calling models endpoint
      const url = `${this.baseUrl}/models?key=${this.config.apiKey}`;
      await this.client.get(url, { timeout: 5000 });
      const latencyMs = Date.now() - startTime;
      
      if (latencyMs > 1000) {
        status = 'degraded';
      }
      
      return {
        provider: this.config.name,
        status,
        latencyMs,
        errorRate,
        lastChecked: new Date(),
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      errorRate = 100;
      failureReason = error.message;
      status = 'unhealthy';
      
      return {
        provider: this.config.name,
        status,
        latencyMs,
        errorRate,
        lastChecked: new Date(),
        failureReason,
      };
    }
  }

  getModelConfig(modelName: string): AiModelConfig | null {
    return this.config.models[modelName] || null;
  }
}