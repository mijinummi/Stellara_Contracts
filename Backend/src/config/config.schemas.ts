/**
 * Application configuration schema
 */
export interface AppConfig {
  name: string;
  version: string;
  port: number;
  host: string;
  env: string;
}

/**
 * Database configuration schema
 */
export interface DatabaseConfig {
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  poolSize: number;
}

/**
 * Redis configuration schema
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls: boolean;
}

/**
 * AI service configuration schema
 */
export interface AiConfig {
  provider: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

/**
 * Security configuration schema
 */
export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  rateLimitWindow: number;
  rateLimitMax: number;
}

/**
 * Queue configuration schema
 */
export interface QueueConfigSchema {
  concurrency: number;
  timeout: number;
  retries: number;
  retryDelay: number;
}

/**
 * Logging configuration schema
 */
export interface LoggingConfig {
  level: string;
  format: string;
  destination: string;
}

/**
 * Feature flags configuration schema
 */
export interface FeatureFlagsConfig {
  enableAi: boolean;
  enableVoice: boolean;
  enableNotifications: boolean;
  enableMarketData: boolean;
  enableWorkflows: boolean;
}

/**
 * Complete application configuration type
 */
export interface ApplicationConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  ai: AiConfig;
  security: SecurityConfig;
  queue: QueueConfigSchema;
  logging: LoggingConfig;
  features: FeatureFlagsConfig;
}
