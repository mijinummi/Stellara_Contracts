// Main exports
export { ConfigurationModule } from './configuration.module';
export { ConfigurationService } from './configuration.service';
export type { ConfigurationChangeEvent } from './configuration.service';
export { ConfigurationController } from './configuration.controller';

// Types and schemas
export { EnvironmentType } from './configuration.types';
export type {
  ConfigurationProfile,
  ProfileFeatures,
  ProfileDefaults,
  ConfigChangeListener,
  ConfigMetadata,
} from './configuration.types';

export type {
  AppConfig,
  DatabaseConfig,
  RedisConfig,
  AiConfig,
  SecurityConfig,
  QueueConfigSchema,
  LoggingConfig,
  FeatureFlagsConfig,
  ApplicationConfig,
} from './config.schemas';

// Validator
export { ConfigurationValidator } from './configuration.validator';
export type { ValidationResult } from './configuration.validator';

// DTOs
export {
  UpdateConfigDto,
  BatchUpdateConfigDto,
  ValidateConfigDto,
  SwitchProfileDto,
} from './dto/update-config.dto';

export {
  ConfigResponseDto,
  ConfigChangeEventDto,
  ConfigProfileDto,
} from './dto/config-response.dto';
