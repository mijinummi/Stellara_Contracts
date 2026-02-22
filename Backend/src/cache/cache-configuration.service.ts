import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CacheConfig {
  // Core settings
  enabled: boolean;
  defaultTTL: number;
  maxMemory: string;

  // Strategy settings
  strategy: 'cache-aside' | 'write-through' | 'write-behind';
  compressionEnabled: boolean;
  compressionThreshold: number;

  // Advanced features
  writeThroughEnabled: boolean;
  writeBehindEnabled: boolean;
  warmupOnStartup: boolean;
  scheduledWarmupEnabled: boolean;

  // Performance settings
  maxBatchSize: number;
  pipelineEnabled: boolean;
  connectionPoolSize: number;

  // Monitoring
  metricsEnabled: boolean;
  alertingEnabled: boolean;
  healthCheckInterval: number;
}

export interface CacheStrategy {
  name: string;
  pattern: string;
  ttl: number;
  priority: 'high' | 'medium' | 'low';
  compression: boolean;
  tags: string[];
}

@Injectable()
export class CacheConfigurationService {
  private readonly logger = new Logger(CacheConfigurationService.name);
  private config: CacheConfig;
  private strategies: Map<string, CacheStrategy> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.loadConfiguration();
    this.loadStrategies();
  }

  /**
   * Get current cache configuration
   */
  getCacheConfig(): CacheConfig {
    return this.config;
  }

  /**
   * Update cache configuration
   */
  async updateConfig(newConfig: Partial<CacheConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.logger.log('Cache configuration updated');

    // Broadcast config change if needed
    await this.broadcastConfigChange();
  }

  /**
   * Get cache strategy by name
   */
  getStrategy(name: string): CacheStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get strategy for a key pattern
   */
  getStrategyForKey(key: string): CacheStrategy | undefined {
    for (const strategy of Array.from(this.strategies.values())) {
      const pattern = new RegExp(strategy.pattern.replace(/\*/g, '.*'));
      if (pattern.test(key)) {
        return strategy;
      }
    }
    return undefined;
  }

  /**
   * Register new cache strategy
   */
  async registerStrategy(strategy: CacheStrategy): Promise<void> {
    this.strategies.set(strategy.name, strategy);
    await this.saveStrategy(strategy);
    this.logger.log(`Registered cache strategy: ${strategy.name}`);
  }

  /**
   * Update existing strategy
   */
  async updateStrategy(
    name: string,
    updates: Partial<CacheStrategy>,
  ): Promise<void> {
    const strategy = this.strategies.get(name);
    if (strategy) {
      const updated = { ...strategy, ...updates };
      this.strategies.set(name, updated);
      await this.saveStrategy(updated);
      this.logger.log(`Updated cache strategy: ${name}`);
    }
  }

  /**
   * Remove strategy
   */
  async removeStrategy(name: string): Promise<void> {
    this.strategies.delete(name);
    await this.deleteStrategy(name);
    this.logger.log(`Removed cache strategy: ${name}`);
  }

  /**
   * Get all registered strategies
   */
  getAllStrategies(): CacheStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Validate configuration
   */
  validateConfig(config: CacheConfig): string[] {
    const errors: string[] = [];

    if (config.defaultTTL <= 0) {
      errors.push('defaultTTL must be greater than 0');
    }

    if (config.maxBatchSize <= 0) {
      errors.push('maxBatchSize must be greater than 0');
    }

    if (config.connectionPoolSize <= 0) {
      errors.push('connectionPoolSize must be greater than 0');
    }

    if (
      !['cache-aside', 'write-through', 'write-behind'].includes(
        config.strategy,
      )
    ) {
      errors.push('Invalid cache strategy');
    }

    return errors;
  }

  /**
   * Reset to default configuration
   */
  async resetToDefault(): Promise<void> {
    this.config = this.getDefaultConfig();
    this.strategies.clear();
    await this.saveConfiguration();
    this.logger.log('Cache configuration reset to defaults');
  }

  /**
   * Export configuration
   */
  exportConfig(): any {
    return {
      config: this.config,
      strategies: this.getAllStrategies(),
    };
  }

  /**
   * Import configuration
   */
  async importConfig(configData: any): Promise<void> {
    if (configData.config) {
      this.config = configData.config;
    }

    if (configData.strategies) {
      this.strategies.clear();
      for (const strategy of configData.strategies) {
        this.strategies.set(strategy.name, strategy);
      }
    }

    await this.saveConfiguration();
    this.logger.log('Cache configuration imported');
  }

  // ==================== PRIVATE METHODS ====================

  private loadConfiguration(): void {
    this.config = {
      enabled: this.configService.get<boolean>('CACHE_ENABLED', true),
      defaultTTL: this.configService.get<number>('CACHE_DEFAULT_TTL', 3600),
      maxMemory: this.configService.get<string>('CACHE_MAX_MEMORY', '512mb'),
      strategy: this.configService.get<
        'cache-aside' | 'write-through' | 'write-behind'
      >('CACHE_STRATEGY', 'cache-aside'),
      compressionEnabled: this.configService.get<boolean>(
        'CACHE_COMPRESSION_ENABLED',
        false,
      ),
      compressionThreshold: this.configService.get<number>(
        'CACHE_COMPRESSION_THRESHOLD',
        1024,
      ),
      writeThroughEnabled: this.configService.get<boolean>(
        'CACHE_WRITE_THROUGH_ENABLED',
        false,
      ),
      writeBehindEnabled: this.configService.get<boolean>(
        'CACHE_WRITE_BEHIND_ENABLED',
        false,
      ),
      warmupOnStartup: this.configService.get<boolean>(
        'CACHE_WARMUP_ON_STARTUP',
        false,
      ),
      scheduledWarmupEnabled: this.configService.get<boolean>(
        'CACHE_SCHEDULED_WARMUP_ENABLED',
        true,
      ),
      maxBatchSize: this.configService.get<number>('CACHE_MAX_BATCH_SIZE', 100),
      pipelineEnabled: this.configService.get<boolean>(
        'CACHE_PIPELINE_ENABLED',
        true,
      ),
      connectionPoolSize: this.configService.get<number>(
        'CACHE_CONNECTION_POOL_SIZE',
        10,
      ),
      metricsEnabled: this.configService.get<boolean>(
        'CACHE_METRICS_ENABLED',
        true,
      ),
      alertingEnabled: this.configService.get<boolean>(
        'CACHE_ALERTING_ENABLED',
        true,
      ),
      healthCheckInterval: this.configService.get<number>(
        'CACHE_HEALTH_CHECK_INTERVAL',
        300,
      ),
    };

    const validationErrors = this.validateConfig(this.config);
    if (validationErrors.length > 0) {
      this.logger.warn(
        `Cache configuration validation errors: ${validationErrors.join(', ')}`,
      );
    }

    this.logger.log('Cache configuration loaded');
  }

  private loadStrategies(): void {
    // Load default strategies
    const defaultStrategies: CacheStrategy[] = [
      {
        name: 'user-profile',
        pattern: 'user:*:profile',
        ttl: 1800, // 30 minutes
        priority: 'high',
        compression: false,
        tags: ['user', 'profile'],
      },
      {
        name: 'system-config',
        pattern: 'config:*',
        ttl: 3600, // 1 hour
        priority: 'medium',
        compression: true,
        tags: ['system', 'config'],
      },
      {
        name: 'session-data',
        pattern: 'session:*',
        ttl: 1800, // 30 minutes
        priority: 'high',
        compression: false,
        tags: ['session'],
      },
    ];

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.name, strategy);
    }

    this.logger.log(`Loaded ${this.strategies.size} cache strategies`);
  }

  private getDefaultConfig(): CacheConfig {
    return {
      enabled: true,
      defaultTTL: 3600,
      maxMemory: '512mb',
      strategy: 'cache-aside',
      compressionEnabled: false,
      compressionThreshold: 1024,
      writeThroughEnabled: false,
      writeBehindEnabled: false,
      warmupOnStartup: false,
      scheduledWarmupEnabled: true,
      maxBatchSize: 100,
      pipelineEnabled: true,
      connectionPoolSize: 10,
      metricsEnabled: true,
      alertingEnabled: true,
      healthCheckInterval: 300,
    };
  }

  private async saveConfiguration(): Promise<void> {
    // In a real implementation, this would persist to database or config service
    try {
      // Mock implementation
      this.logger.debug('Configuration saved');
    } catch (error) {
      this.logger.error(`Error saving configuration: ${error.message}`);
    }
  }

  private async saveStrategy(strategy: CacheStrategy): Promise<void> {
    try {
      // Mock implementation
      this.logger.debug(`Strategy saved: ${strategy.name}`);
    } catch (error) {
      this.logger.error(
        `Error saving strategy ${strategy.name}: ${error.message}`,
      );
    }
  }

  private async deleteStrategy(name: string): Promise<void> {
    try {
      // Mock implementation
      this.logger.debug(`Strategy deleted: ${name}`);
    } catch (error) {
      this.logger.error(`Error deleting strategy ${name}: ${error.message}`);
    }
  }

  private async broadcastConfigChange(): Promise<void> {
    // In a distributed system, this would notify other instances
    this.logger.debug('Configuration change broadcast');
  }
}
