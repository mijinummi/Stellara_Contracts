import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { ConfigurationController } from './configuration.controller';

/**
 * Global configuration module providing centralized configuration management
 * with runtime updates, validation, and environment-specific settings.
 */
@Global()
@Module({})
export class ConfigurationModule {
  static forRoot(): DynamicModule {
    return {
      module: ConfigurationModule,
      controllers: [ConfigurationController],
      providers: [ConfigurationService],
      exports: [ConfigurationService],
    };
  }
}
