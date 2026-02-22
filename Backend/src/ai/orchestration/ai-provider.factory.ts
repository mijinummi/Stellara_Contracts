import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import { AzureProvider } from './providers/azure.provider';
import { AiProvider, AiProviderConfig, AiRequestOptions, AiResponse, AiProviderHealth } from './interfaces/ai-provider.interface';

export interface ProviderSelectionStrategy {
  selectProvider(
    prompt: string,
    options?: AiRequestOptions,
    providerHealth?: Record<string, AiProviderHealth>
  ): string;
}

export class CostOptimizationStrategy implements ProviderSelectionStrategy {
  selectProvider(
    prompt: string,
    options?: AiRequestOptions,
    providerHealth?: Record<string, AiProviderHealth>
  ): string {
    const availableProviders = Object.entries(providerHealth || {})
      .filter(([, health]) => health.status === 'healthy')
      .map(([name]) => name);

    if (availableProviders.length === 0) {
      throw new Error('No healthy providers available');
    }

    // For cost optimization, select the cheapest provider for the requested model
    return availableProviders[0]; // Simplified - would need cost comparison logic
  }
}

export class PerformanceStrategy implements ProviderSelectionStrategy {
  selectProvider(
    prompt: string,
    options?: AiRequestOptions,
    providerHealth?: Record<string, AiProviderHealth>
  ): string {
    const healthyProviders = Object.entries(providerHealth || {})
      .filter(([, health]) => health.status === 'healthy')
      .map(([name, health]) => ({ name, latency: health.latencyMs }));

    if (healthyProviders.length === 0) {
      throw new Error('No healthy providers available');
    }

    // Select provider with lowest latency
    return healthyProviders
      .sort((a, b) => a.latency - b.latency)[0]
      .name;
  }
}

export class RoundRobinStrategy implements ProviderSelectionStrategy {
  private currentIndex = 0;

  selectProvider(
    prompt: string,
    options?: AiRequestOptions,
    providerHealth?: Record<string, AiProviderHealth>
  ): string {
    const availableProviders = Object.entries(providerHealth || {})
      .filter(([, health]) => health.status === 'healthy')
      .map(([name]) => name);

    if (availableProviders.length === 0) {
      throw new Error('No healthy providers available');
    }

    const provider = availableProviders[this.currentIndex % availableProviders.length];
    this.currentIndex = (this.currentIndex + 1) % availableProviders.length;
    return provider;
  }
}

@Injectable()
export class AiProviderFactory implements OnModuleInit {
  private readonly logger = new Logger(AiProviderFactory.name);
  private providers: Map<string, AiProvider> = new Map();
  private providerHealth: Record<string, AiProviderHealth> = {};
  private selectionStrategy: ProviderSelectionStrategy;

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    private readonly openAiProvider: OpenAiProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly googleProvider: GoogleProvider,
    private readonly azureProvider: AzureProvider,
  ) {
    // Initialize with default strategy
    this.selectionStrategy = new PerformanceStrategy();
  }

  async onModuleInit() {
    await this.initializeProviders();
    await this.initializeHealthChecks();
  }

  private async initializeProviders(): Promise<void> {
    const providers = [
      this.openAiProvider,
      this.anthropicProvider,
      this.googleProvider,
      this.azureProvider,
    ];

    for (const provider of providers) {
      try {
        await provider.initialize();
        this.providers.set(provider.getName(), provider);
        this.logger.log(`Initialized ${provider.getName()} provider`);
      } catch (error) {
        this.logger.error(`Failed to initialize ${provider.getName()} provider: ${error.message}`);
      }
    }
  }

  private async initializeHealthChecks(): Promise<void> {
    // Run initial health checks
    await this.updateProviderHealth();
    
    // Schedule periodic health checks
    setInterval(() => {
      this.updateProviderHealth().catch(error => {
        this.logger.error('Error updating provider health:', error);
      });
    }, 30000); // Every 30 seconds
  }

  private async updateProviderHealth(): Promise<void> {
    const healthChecks = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          const health = await provider.healthCheck();
          this.providerHealth[name] = health;
          return { name, health };
        } catch (error) {
          const health: AiProviderHealth = {
            provider: name,
            status: 'unhealthy',
            latencyMs: 0,
            errorRate: 100,
            lastChecked: new Date(),
            failureReason: error.message,
          };
          this.providerHealth[name] = health;
          return { name, health };
        }
      }
    );

    await Promise.all(healthChecks);
    this.logger.debug('Provider health updated:', this.providerHealth);
  }

  setSelectionStrategy(strategy: ProviderSelectionStrategy): void {
    this.selectionStrategy = strategy;
    this.logger.log(`Provider selection strategy updated to ${strategy.constructor.name}`);
  }

  async getProvider(providerName?: string): Promise<AiProvider> {
    // If specific provider requested
    if (providerName) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
      }
      if (this.providerHealth[providerName]?.status !== 'healthy') {
        throw new Error(`Provider ${providerName} is not healthy`);
      }
      return provider;
    }

    // Auto-select provider based on strategy
    const selectedProviderName = this.selectionStrategy.selectProvider(
      '', // prompt not needed for selection
      undefined,
      this.providerHealth
    );

    const provider = this.providers.get(selectedProviderName);
    if (!provider) {
      throw new Error(`Selected provider ${selectedProviderName} not found`);
    }

    return provider;
  }

  async generateResponse(
    prompt: string,
    options?: AiRequestOptions
  ): Promise<AiResponse> {
    const providerName = options?.model ? this.getProviderForModel(options.model) : undefined;
    const provider = await this.getProvider(providerName);
    
    return provider.generate(prompt, options);
  }

  private getProviderForModel(model: string): string | undefined {
    // Map model names to providers
    const modelToProvider: Record<string, string> = {
      // OpenAI models
      'gpt-3.5-turbo': 'openai',
      'gpt-3.5-turbo-16k': 'openai',
      'gpt-4': 'openai',
      'gpt-4-turbo': 'openai',
      'gpt-4o': 'openai',
      
      // Anthropic models
      'claude-3-haiku-20240307': 'anthropic',
      'claude-3-sonnet-20240229': 'anthropic',
      'claude-3-opus-20240229': 'anthropic',
      'claude-2.1': 'anthropic',
      
      // Google models
      'gemini-pro': 'google',
      'gemini-1.5-pro': 'google',
      'gemini-1.5-flash': 'google',
      'gemini-ultra': 'google',
    };

    return modelToProvider[model];
  }

  async getAllProviderHealth(): Promise<Record<string, AiProviderHealth>> {
    return { ...this.providerHealth };
  }

  async getHealthyProviders(): Promise<string[]> {
    return Object.entries(this.providerHealth)
      .filter(([, health]) => health.status === 'healthy')
      .map(([name]) => name);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getProviderConfig(providerName: string): AiProviderConfig | null {
    const provider = this.providers.get(providerName);
    return provider ? provider.getConfig() : null;
  }
}