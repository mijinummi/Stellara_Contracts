import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard configuration response DTO
 */
export class ConfigResponseDto {
  @ApiProperty({
    description: 'Whether the operation was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response data',
    required: false,
  })
  data?: any;

  @ApiProperty({
    description: 'Response message',
    required: false,
    example: 'Configuration updated successfully',
  })
  message?: string;

  @ApiProperty({
    description: 'Error message if operation failed',
    required: false,
    example: 'Invalid configuration value',
  })
  error?: string;

  @ApiProperty({
    description: 'Response timestamp',
    example: '2026-02-21T12:00:00.000Z',
  })
  timestamp: string;
}

/**
 * Configuration change event DTO
 */
export class ConfigChangeEventDto {
  @ApiProperty({
    description: 'Configuration key that changed',
    example: 'app.port',
  })
  key: string;

  @ApiProperty({
    description: 'Previous value',
    required: false,
  })
  oldValue?: any;

  @ApiProperty({
    description: 'New value',
  })
  newValue: any;

  @ApiProperty({
    description: 'Change timestamp',
    example: '2026-02-21T12:00:00.000Z',
  })
  timestamp: Date;

  @ApiProperty({
    description: 'Source of the change',
    example: 'api',
  })
  source: string;
}

/**
 * Configuration profile DTO
 */
export class ConfigProfileDto {
  @ApiProperty({
    description: 'Profile name',
    example: 'production',
  })
  name: string;

  @ApiProperty({
    description: 'Environment type',
    example: 'production',
  })
  environment: string;

  @ApiProperty({
    description: 'Profile features',
  })
  features: {
    debugMode: boolean;
    detailedErrors: boolean;
    logRequests: boolean;
    hotReload: boolean;
  };

  @ApiProperty({
    description: 'Default configuration values',
  })
  defaults: {
    logLevel: string;
    cacheEnabled: boolean;
    rateLimiting: boolean;
  };
}
