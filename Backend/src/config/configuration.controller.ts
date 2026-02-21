import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigurationService } from './configuration.service';
import { UpdateConfigDto, BatchUpdateConfigDto } from './dto/update-config.dto';
import { ConfigResponseDto } from './dto/config-response.dto';
import { Roles } from '../auth/guards/roles.guard';
import { Role } from '../auth/roles.enum';

/**
 * Controller for managing runtime configuration
 */
@ApiTags('Configuration')
@Controller('config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConfigurationController {
  private readonly logger = new Logger(ConfigurationController.name);

  constructor(private readonly configService: ConfigurationService) {}

  /**
   * Get all configuration values
   */
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all configuration values' })
  @ApiResponse({ status: 200, description: 'Configuration retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  getAllConfig(): ConfigResponseDto {
    const config = this.configService.getAllConfig();
    const profile = this.configService.getCurrentProfile();

    return {
      success: true,
      data: {
        config,
        profile: {
          name: profile.name,
          environment: profile.environment,
          features: profile.features,
          defaults: profile.defaults,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get configuration by key
   */
  @Get(':key')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get configuration by key' })
  @ApiResponse({ status: 200, description: 'Configuration value retrieved' })
  @ApiResponse({ status: 404, description: 'Configuration key not found' })
  getConfigByKey(@Param('key') key: string): ConfigResponseDto {
    const value = this.configService.get(key);

    if (value === undefined) {
      return {
        success: false,
        error: `Configuration key '${key}' not found`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: { [key]: value },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Update configuration value
   */
  @Put(':key')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update configuration value' })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid configuration value' })
  async updateConfig(
    @Param('key') key: string,
    @Body() updateDto: UpdateConfigDto,
  ): Promise<ConfigResponseDto> {
    this.logger.log(`Configuration update requested for key: ${key}`);

    const result = await this.configService.update(key, updateDto.value, 'api');

    if (!result.valid) {
      return {
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: { [key]: result.value },
      message: `Configuration '${key}' updated successfully`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Update multiple configuration values
   */
  @Put()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update multiple configuration values' })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  async updateBatchConfig(
    @Body() batchDto: BatchUpdateConfigDto,
  ): Promise<ConfigResponseDto> {
    this.logger.log(`Batch configuration update requested`);

    const results = await this.configService.updateBatch(batchDto.updates, 'api');
    const failed = results.filter(r => !r.valid);

    if (failed.length > 0) {
      return {
        success: false,
        error: `Failed to update ${failed.length} configuration(s)`,
        data: { failed },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: batchDto.updates,
      message: `${Object.keys(batchDto.updates).length} configuration(s) updated successfully`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get configuration change history
   */
  @Get('history')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get configuration change history' })
  @ApiResponse({ status: 200, description: 'Change history retrieved' })
  getChangeHistory(@Query('limit') limit?: string): ConfigResponseDto {
    const historyLimit = limit ? parseInt(limit, 10) : 50;
    const history = this.configService.getChangeHistory(historyLimit);

    return {
      success: true,
      data: { history },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get available configuration profiles
   */
  @Get('profiles/available')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get available configuration profiles' })
  @ApiResponse({ status: 200, description: 'Profiles retrieved' })
  getAvailableProfiles(): ConfigResponseDto {
    const profiles = [
      { name: 'development', description: 'Development environment with debug features' },
      { name: 'staging', description: 'Staging environment for testing' },
      { name: 'production', description: 'Production environment' },
      { name: 'test', description: 'Test environment' },
    ];

    return {
      success: true,
      data: { profiles },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset configuration to defaults
   */
  @Post('reset')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset configuration to defaults' })
  @ApiResponse({ status: 200, description: 'Configuration reset successfully' })
  async resetConfig(@Body('key') key?: string): Promise<ConfigResponseDto> {
    this.logger.log(`Configuration reset requested${key ? ` for key: ${key}` : ' (all)'}`);

    await this.configService.reset(key);

    return {
      success: true,
      message: key 
        ? `Configuration '${key}' reset to default` 
        : 'All configuration reset to defaults',
      timestamp: new Date().toISOString(),
    };
  }
}
