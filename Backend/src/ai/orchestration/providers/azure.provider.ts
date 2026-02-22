import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { AiProvider, AiProviderConfig, AiModelConfig, AiRequestOptions, AiResponse, AiProviderHealth } from '../interfaces/ai-provider.interface';

@Injectable()
export class AzureProvider extends AiProvider {
  private client: AxiosInstance;
  private readonly deploymentUrl: string;

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
  ) {
    const azureEndpoint = configService.get<string>('AZURE_OPENAI_ENDPOINT') || '';
    const deploymentName = configService.get<string>('AZURE_OPENAI_DEPLOYMENT') || '';
    
    const config: AiProviderConfig = {
      name: 'azure',
      apiKey: configService.get<string>('AZURE_OPENAI_API_KEY') || '',
      baseUrl: azureEndpoint,
      defaultModel: deploymentName,
      models: {
        [deploymentName]: {
          name: deploymentName,
          maxTokens: 4096,
          inputCostPerToken: 0.0000015,
          outputCostPerToken: 0.000002,
          contextWindow: 16385,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'gpt-4': {
          name: 'gpt-4',
          maxTokens: 8192,
          inputCostPerToken: 0.00003,
          outputCostPerToken: 0.00006,
          contextWindow: 8192,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        'gpt-4-32k': {
          name: 'gpt-4-32k',
          maxTokens: 32768,
          inputCostPerToken: 0.00006,
          outputCostPerToken: 0.00012,
          contextWindow: 32768,
          supportsStreaming: true,
          supportsFunctions: true,
        },
      },
      timeoutMs: configService.get<number>('AZURE_OPENAI_TIMEOUT_MS') || 30000,
      maxRetries: configService.get<number>('AZURE_OPENAI_MAX_RETRIES') || 3,
      retryDelayMs: configService.get<number>('AZURE_OPENAI_RETRY_DELAY_MS') || 1000,
    };

    super(config);
    this.deploymentUrl = `${azureEndpoint}/openai/deployments/${deploymentName}`;
  }

  async initialize(): Promise<void> {
    this.client = axios.create({
      baseURL: this.deploymentUrl,
      timeout: this.config.timeoutMs,
      headers: {
        'api-key': this.config.apiKey,
        'Content-Type': 'application/json',
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
      throw new Error(`Model ${model} not supported by Azure provider`);
    }

    if (!await this.waitForCircuitBreaker()) {
      throw new Error(`Azure provider circuit breaker is open. Try again later.`);
    }

    const startTime = Date.now();
    const apiVersion = '2024-02-15-preview';

    try {
      const response = await this.client.post(
        `/chat/completions?api-version=${apiVersion}`,
        {
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature || 0.7,
          max_tokens: options?.maxTokens || modelConfig.maxTokens,
          top_p: options?.topP || 1,
          frequency_penalty: options?.frequencyPenalty || 0,
          presence_penalty: options?.presencePenalty || 0,
          stop: options?.stopSequences,
          stream: options?.stream || false,
        }
      );

      const completion = response.data.choices[0].message.content;
      const promptTokens = response.data.usage.prompt_tokens;
      const completionTokens = response.data.usage.completion_tokens;
      const totalTokens = response.data.usage.total_tokens;

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
          total: totalTokens,
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
          finishReason: response.data.choices[0].finish_reason,
          modelConfig,
          deployment: this.config.defaultModel,
        },
      };
    } catch (error) {
      this.logger.error(`Azure OpenAI API error for request ${requestId}: ${error.message}`, error.stack);
      this.updateCircuitBreaker(false);
      throw error;
    }
  }

  async healthCheck(): Promise<AiProviderHealth> {
    const startTime = Date.now();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let errorRate = 0;
    let failureReason: string | undefined;
    const apiVersion = '2024-02-15-preview';

    try {
      await this.client.get(`/models?api-version=${apiVersion}`, { timeout: 5000 });
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