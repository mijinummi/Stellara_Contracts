import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { AiProvider, AiProviderConfig, AiModelConfig, AiRequestOptions, AiResponse, AiProviderHealth } from '../interfaces/ai-provider.interface';

@Injectable()
export class AnthropicProvider extends AiProvider {
  private client: AxiosInstance;
  private readonly baseUrl = 'https://api.anthropic.com/v1';

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
  ) {
    const config: AiProviderConfig = {
      name: 'anthropic',
      apiKey: configService.get<string>('ANTHROPIC_API_KEY') || '',
      defaultModel: configService.get<string>('ANTHROPIC_DEFAULT_MODEL') || 'claude-3-haiku-20240307',
      models: {
        'claude-3-haiku-20240307': {
          name: 'claude-3-haiku-20240307',
          maxTokens: 4096,
          inputCostPerToken: 0.00000025,
          outputCostPerToken: 0.00000125,
          contextWindow: 200000,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'claude-3-sonnet-20240229': {
          name: 'claude-3-sonnet-20240229',
          maxTokens: 4096,
          inputCostPerToken: 0.000003,
          outputCostPerToken: 0.000015,
          contextWindow: 200000,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'claude-3-opus-20240229': {
          name: 'claude-3-opus-20240229',
          maxTokens: 4096,
          inputCostPerToken: 0.000015,
          outputCostPerToken: 0.000075,
          contextWindow: 200000,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'claude-2.1': {
          name: 'claude-2.1',
          maxTokens: 4096,
          inputCostPerToken: 0.000008,
          outputCostPerToken: 0.000024,
          contextWindow: 200000,
          supportsStreaming: true,
          supportsFunctions: false,
        },
      },
      timeoutMs: configService.get<number>('ANTHROPIC_TIMEOUT_MS') || 30000,
      maxRetries: configService.get<number>('ANTHROPIC_MAX_RETRIES') || 3,
      retryDelayMs: configService.get<number>('ANTHROPIC_RETRY_DELAY_MS') || 1000,
    };

    super(config);
  }

  async initialize(): Promise<void> {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.config.timeoutMs,
      headers: {
        'x-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
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
      throw new Error(`Model ${model} not supported by Anthropic provider`);
    }

    if (!await this.waitForCircuitBreaker()) {
      throw new Error(`Anthropic provider circuit breaker is open. Try again later.`);
    }

    const startTime = Date.now();

    try {
      const response = await this.client.post('/messages', {
        model,
        max_tokens: options?.maxTokens || modelConfig.maxTokens,
        temperature: options?.temperature || 0.7,
        top_p: options?.topP || 0.999,
        top_k: 40,
        stop_sequences: options?.stopSequences,
        system: "You are a helpful AI assistant.",
        messages: [{ role: 'user', content: prompt }],
        stream: options?.stream || false,
      });

      const completion = response.data.content[0].text;
      const inputTokens = response.data.usage.input_tokens;
      const outputTokens = response.data.usage.output_tokens;

      const inputCost = inputTokens * modelConfig.inputCostPerToken;
      const outputCost = outputTokens * modelConfig.outputCostPerToken;
      const totalCost = inputCost + outputCost;

      this.updateCircuitBreaker(true);

      return {
        content: completion,
        model,
        provider: this.config.name,
        tokensUsed: {
          prompt: inputTokens,
          completion: outputTokens,
          total: inputTokens + outputTokens,
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
          stopReason: response.data.stop_reason,
          modelConfig,
        },
      };
    } catch (error) {
      this.logger.error(`Anthropic API error for request ${requestId}: ${error.message}`, error.stack);
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
      await this.client.get('/models', { timeout: 5000 });
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