import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfigDto } from './config.dto';
import { SecretsMaskingService } from './secrets-masking.service';

@Injectable()
export class ConfigValidationService {
  private readonly logger = new Logger(ConfigValidationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly maskingService: SecretsMaskingService,
  ) {}

  validate(): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    // Create a plain object with all environment variables
    const envVars = {
      JWT_SECRET: this.configService.get('JWT_SECRET'),
      JWT_ACCESS_EXPIRATION: this.configService.get('JWT_ACCESS_EXPIRATION'),
      DB_HOST: this.configService.get('DB_HOST'),
      DB_PORT: this.configService.get('DB_PORT'),
      DB_USERNAME: this.configService.get('DB_USERNAME'),
      DB_PASSWORD: this.configService.get('DB_PASSWORD'),
      DB_DATABASE: this.configService.get('DB_DATABASE'),
      NODE_ENV: this.configService.get('NODE_ENV'),
      PORT: this.configService.get('PORT'),
    };

    // Convert to ConfigDto instance for validation
    const configDto = plainToInstance(ConfigDto, envVars, {
      enableImplicitConversion: true,
    });

    const errors = validateSync(configDto);

    if (errors.length > 0) {
      const errorMessages = errors
        .map((error) => Object.values(error.constraints || {}).join(', '))
        .join('; ');

      // Mask any secret values that may have leaked into validation messages
      const safeMessages = this.maskingService.mask(errorMessages);

      this.logger.error(`Configuration validation failed: ${safeMessages}`);
      throw new Error(
        `Configuration validation failed: ${safeMessages}. Please check your environment variables.`,
      );
    }

    // Additional production-specific checks
    if (isProduction) {
      this.validateProductionSecrets(envVars);
    }

    this.logger.log('Configuration validation passed');
  }

  private validateProductionSecrets(envVars: Record<string, string | undefined>): void {
    const jwtSecret = envVars.JWT_SECRET;
    const dbPassword = envVars.DB_PASSWORD;

    // Check for default/weak secrets in production
    const weakSecrets = [
      jwtSecret === 'default-secret-change-in-production',
      jwtSecret === 'secret',
      jwtSecret === 'password',
      jwtSecret === 'changeme',
      dbPassword === 'password',
      dbPassword === 'secret',
      dbPassword === 'changeme',
    ];

    if (weakSecrets.some((isWeak) => isWeak)) {
      // Deliberately avoid echoing the weak value itself
      throw new Error(
        'Production environment detected with weak or default secrets. Please set strong, unique secrets for JWT_SECRET and DB_PASSWORD.',
      );
    }

    // Check minimum secret length — do NOT include the actual value in the error
    if (jwtSecret && jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be at least 32 characters long in production',
      );
    }

    if (dbPassword && dbPassword.length < 16) {
      throw new Error(
        'DB_PASSWORD must be at least 16 characters long in production',
      );
    }
  }
}
