import { IsNotEmpty, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating a single configuration value
 */
export class UpdateConfigDto {
  @ApiProperty({
    description: 'Configuration value',
    example: { port: 3000 },
  })
  @IsNotEmpty()
  value: any;
}

/**
 * DTO for batch updating multiple configuration values
 */
export class BatchUpdateConfigDto {
  @ApiProperty({
    description: 'Configuration updates',
    example: {
      app: { port: 3000 },
      database: { poolSize: 20 },
    },
  })
  @IsObject()
  @IsNotEmpty()
  updates: Record<string, any>;
}

/**
 * DTO for configuration validation request
 */
export class ValidateConfigDto {
  @ApiProperty({
    description: 'Configuration key to validate',
    example: 'app.port',
  })
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Configuration value to validate',
    example: 3000,
  })
  @IsNotEmpty()
  value: any;
}

/**
 * DTO for switching configuration profile
 */
export class SwitchProfileDto {
  @ApiProperty({
    description: 'Profile name to switch to',
    example: 'production',
    enum: ['development', 'staging', 'production', 'test'],
  })
  @IsNotEmpty()
  profile: string;
}
