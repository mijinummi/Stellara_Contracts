/**
 * Environment types supported by the configuration system
 */
export enum EnvironmentType {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test',
}

/**
 * Feature flags for environment-specific features
 */
export interface ProfileFeatures {
  debugMode: boolean;
  detailedErrors: boolean;
  logRequests: boolean;
  hotReload: boolean;
}

/**
 * Default configuration values for a profile
 */
export interface ProfileDefaults {
  logLevel: string;
  cacheEnabled: boolean;
  rateLimiting: boolean;
}

/**
 * Configuration profile definition
 */
export interface ConfigurationProfile {
  name: string;
  environment: EnvironmentType;
  features: ProfileFeatures;
  defaults: ProfileDefaults;
}

/**
 * Configuration change listener callback
 */
export type ConfigChangeListener = (
  key: string,
  oldValue: any,
  newValue: any,
) => void;

/**
 * Configuration metadata for a key
 */
export interface ConfigMetadata {
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required: boolean;
  sensitive: boolean;
  defaultValue?: any;
  validator?: (value: any) => boolean;
}
