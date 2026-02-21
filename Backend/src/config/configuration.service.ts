import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigurationValidator, ValidationResult } from './configuration.validator';
import { ConfigurationProfile, EnvironmentType } from './configuration.types';
import { AppConfig, DatabaseConfig, RedisConfig, AiConfig, SecurityConfig } from './config.schemas';

/**
 * Event emitted when configuration changes
 */
export interface ConfigurationChangeEvent {
  key: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
  source: string;
}

/**
 * Centralized configuration service with runtime update capabilities
 */
@Injectable()
export class ConfigurationService implements OnModuleInit {
  private readonly logger = new Logger(ConfigurationService.name);
  private readonly configStore: Map<string, any> = new Map();
  private readonly validator: ConfigurationValidator;
  private currentProfile: ConfigurationProfile;
  private readonly changeHistory: ConfigurationChangeEvent[] = [];
  private readonly maxHistorySize = 100;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.validator = new ConfigurationValidator();
    this.currentProfile = this.detectEnvironment();
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(`Configuration service initialized with profile: ${this.currentProfile.name}`);
    this.loadInitialConfiguration();
  }

  /**
   * Detect current environment and return appropriate profile
   */
  private detectEnvironment(): ConfigurationProfile {
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    switch (nodeEnv) {
      case 'production':
        return this.createProductionProfile();
      case 'staging':
        return this.createStagingProfile();
      case 'test':
        return this.createTestProfile();
      default:
        return this.createDevelopmentProfile();
    }
  }

  /**
   * Load initial configuration from environment variables
   */
  private loadInitialConfiguration(): void {
    // Application config
    this.configStore.set('app', {
      name: process.env.APP_NAME || 'Stellara Backend',
      version: process.env.APP_VERSION || '1.0.0',
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      env: process.env.NODE_ENV || 'development',
    } as AppConfig);

    // Database config
    this.configStore.set('database', {
      type: process.env.DB_TYPE || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'stellara',
      ssl: process.env.DB_SSL === 'true',
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    } as DatabaseConfig);

    // Redis config
    this.configStore.set('redis', {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      tls: process.env.REDIS_TLS === 'true',
    } as RedisConfig);

    // AI config
    this.configStore.set('ai', {
      provider: process.env.AI_PROVIDER || 'openai',
      apiKey: process.env.AI_API_KEY || '',
      model: process.env.AI_MODEL || 'gpt-4',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000', 10),
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
      timeout: parseInt(process.env.AI_TIMEOUT || '30000', 10),
    } as AiConfig);

    // Security config
    this.configStore.set('security', {
      jwtSecret: process.env.JWT_SECRET || '',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    } as SecurityConfig);

    this.logger.log('Initial configuration loaded from environment variables');
  }

  /**
   * Get configuration value by key
   */
  get<T>(key: string): T | undefined {
    return this.configStore.get(key) as T;
  }

  /**
   * Get configuration value by key with default
   */
  getOrDefault<T>(key: string, defaultValue: T): T {
    const value = this.configStore.get(key);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Update configuration at runtime
   */
  async update<T>(key: string, value: T, source: string = 'api'): Promise<ValidationResult<T>> {
    // Validate the new value
    const validation = this.validator.validate(key, value);
    
    if (!validation.valid) {
      this.logger.warn(`Configuration update failed for key '${key}': ${validation.error}`);
      return validation;
    }

    const oldValue = this.configStore.get(key);
    
    // Update the configuration
    this.configStore.set(key, value);

    // Record the change
    const changeEvent: ConfigurationChangeEvent = {
      key,
      oldValue,
      newValue: value,
      timestamp: new Date(),
      source,
    };

    this.recordChange(changeEvent);

    // Emit change event
    this.eventEmitter.emit('config.changed', changeEvent);

    this.logger.log(`Configuration updated: ${key} (source: ${source})`);
    
    return { valid: true, value };
  }

  /**
   * Update multiple configuration values at once
   */
  async updateBatch(updates: Record<string, any>, source: string = 'api'): Promise<ValidationResult<any>[]> {
    const results: ValidationResult<any>[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const result = await this.update(key, value, source);
      results.push(result);
    }

    return results;
  }

  /**
   * Get current configuration profile
   */
  getCurrentProfile(): ConfigurationProfile {
    return this.currentProfile;
  }

  /**
   * Switch to a different configuration profile
   */
  async switchProfile(profile: ConfigurationProfile): Promise<void> {
    this.currentProfile = profile;
    this.logger.log(`Switched to configuration profile: ${profile.name}`);
    this.eventEmitter.emit('config.profile.changed', profile);
  }

  /**
   * Get configuration change history
   */
  getChangeHistory(limit: number = 50): ConfigurationChangeEvent[] {
    return this.changeHistory.slice(-limit);
  }

  /**
   * Get all configuration keys
   */
  getAllKeys(): string[] {
    return Array.from(this.configStore.keys());
  }

  /**
   * Get all configuration values (sensitive data masked)
   */
  getAllConfig(): Record<string, any> {
    const config: Record<string, any> = {};
    
    for (const [key, value] of this.configStore.entries()) {
      config[key] = this.maskSensitiveData(key, value);
    }

    return config;
  }

  /**
   * Reset configuration to default values
   */
  async reset(key?: string): Promise<void> {
    if (key) {
      this.configStore.delete(key);
      this.logger.log(`Configuration reset: ${key}`);
    } else {
      this.configStore.clear();
      this.loadInitialConfiguration();
      this.logger.log('All configuration reset to defaults');
    }
  }

  /**
   * Record configuration change in history
   */
  private recordChange(event: ConfigurationChangeEvent): void {
    this.changeHistory.push(event);
    
    // Keep history size limited
    if (this.changeHistory.length > this.maxHistorySize) {
      this.changeHistory.shift();
    }
  }

  /**
   * Mask sensitive data in configuration
   */
  private maskSensitiveData(key: string, value: any): any {
    const sensitiveKeys = ['password', 'secret', 'apiKey', 'token', 'key'];
    
    if (typeof value === 'object' && value !== null) {
      const masked: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
          masked[k] = '***MASKED***';
        } else {
          masked[k] = v;
        }
      }
      return masked;
    }

    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      return '***MASKED***';
    }

    return value;
  }

  /**
   * Create development profile
   */
  private createDevelopmentProfile(): ConfigurationProfile {
    return {
      name: 'development',
      environment: EnvironmentType.DEVELOPMENT,
      features: {
        debugMode: true,
        detailedErrors: true,
        logRequests: true,
        hotReload: true,
      },
      defaults: {
        logLevel: 'debug',
        cacheEnabled: false,
        rateLimiting: false,
      },
    };
  }

  /**
   * Create production profile
   */
  private createProductionProfile(): ConfigurationProfile {
    return {
      name: 'production',
      environment: EnvironmentType.PRODUCTION,
      features: {
        debugMode: false,
        detailedErrors: false,
        logRequests: true,
        hotReload: false,
      },
      defaults: {
        logLevel: 'info',
        cacheEnabled: true,
        rateLimiting: true,
      },
    };
  }

  /**
   * Create staging profile
   */
  private createStagingProfile(): ConfigurationProfile {
    return {
      name: 'staging',
      environment: EnvironmentType.STAGING,
      features: {
        debugMode: true,
        detailedErrors: true,
        logRequests: true,
        hotReload: false,
      },
      defaults: {
        logLevel: 'debug',
        cacheEnabled: true,
        rateLimiting: true,
      },
    };
  }

  /**
   * Create test profile
   */
  private createTestProfile(): ConfigurationProfile {
    return {
      name: 'test',
      environment: EnvironmentType.TEST,
      features: {
        debugMode: true,
        detailedErrors: true,
        logRequests: false,
        hotReload: false,
      },
      defaults: {
        logLevel: 'error',
        cacheEnabled: false,
        rateLimiting: false,
      },
    };
  }
}
