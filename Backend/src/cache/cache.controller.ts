import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { CacheWarmingService } from './cache-warming.service';
import { CacheMonitoringService } from './cache-monitoring.service';
import { CacheConfigurationService } from './cache-configuration.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

interface CacheEntryDto {
  key: string;
  value: any;
  ttl?: number;
  tags?: string[];
}

interface WarmupGroupDto {
  name: string;
  entries: Array<{
    key: string;
    loader: string; // Serialized function
    ttl?: number;
    priority: 'high' | 'medium' | 'low';
    schedule?: 'startup' | 'hourly' | 'daily' | 'weekly';
    tags?: string[];
  }>;
  enabled: boolean;
}

@Controller('cache')
@ApiTags('Cache Management')
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly invalidationService: CacheInvalidationService,
    private readonly warmingService: CacheWarmingService,
    private readonly monitoringService: CacheMonitoringService,
    private readonly configService: CacheConfigurationService,
  ) {}

  // ==================== CACHE OPERATIONS ====================

  @Get('entry/:key')
  @ApiOperation({ summary: 'Get cache entry' })
  @ApiResponse({
    status: 200,
    description: 'Cache entry retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Cache entry not found' })
  async getEntry(@Param('key') key: string) {
    try {
      const result = await this.cacheService.get(key, async () => null);
      if (result === null) {
        return {
          success: false,
          message: 'Cache entry not found',
          key,
        };
      }

      return {
        success: true,
        data: result,
        key,
      };
    } catch (error) {
      this.logger.error(`Error getting cache entry ${key}: ${error.message}`);
      throw error;
    }
  }

  @Post('entry')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Set cache entry' })
  @ApiResponse({ status: 201, description: 'Cache entry created successfully' })
  async setEntry(@Body() entry: CacheEntryDto) {
    try {
      await this.cacheService.set(entry.key, entry.value, {
        ttl: entry.ttl,
        tags: entry.tags,
      });

      return {
        success: true,
        message: 'Cache entry created',
        key: entry.key,
      };
    } catch (error) {
      this.logger.error(
        `Error setting cache entry ${entry.key}: ${error.message}`,
      );
      throw error;
    }
  }

  @Delete('entry/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete cache entry' })
  @ApiResponse({ status: 204, description: 'Cache entry deleted successfully' })
  async deleteEntry(@Param('key') key: string) {
    try {
      const result = await this.cacheService.delete(key);
      if (!result) {
        return {
          success: false,
          message: 'Cache entry not found or already deleted',
          key,
        };
      }

      return {
        success: true,
        message: 'Cache entry deleted',
        key,
      };
    } catch (error) {
      this.logger.error(`Error deleting cache entry ${key}: ${error.message}`);
      throw error;
    }
  }

  @Delete('tag/:tag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete cache entries by tag' })
  @ApiResponse({ status: 200, description: 'Cache entries deleted by tag' })
  async deleteByTag(@Param('tag') tag: string) {
    try {
      const count = await this.cacheService.deleteByTag(tag);
      return {
        success: true,
        message: `Deleted ${count} cache entries with tag: ${tag}`,
        deletedCount: count,
        tag,
      };
    } catch (error) {
      this.logger.error(`Error deleting by tag ${tag}: ${error.message}`);
      throw error;
    }
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all cache entries' })
  @ApiResponse({ status: 200, description: 'Cache cleared successfully' })
  async clearCache(@Query('reason') reason?: string) {
    try {
      const count = await this.cacheService.clear();
      await this.invalidationService.clearAll(reason);

      return {
        success: true,
        message: `Cache cleared (${count} entries)`,
        clearedCount: count,
        reason,
      };
    } catch (error) {
      this.logger.error(`Error clearing cache: ${error.message}`);
      throw error;
    }
  }

  // ==================== BATCH OPERATIONS ====================

  @Post('batch/get')
  @ApiOperation({ summary: 'Get multiple cache entries' })
  @ApiResponse({ status: 200, description: 'Batch cache entries retrieved' })
  async batchGet(@Body() keys: string[]) {
    try {
      const results = await this.cacheService.mget(keys);
      const entries = keys.map((key, index) => ({
        key,
        value: results[index],
        found: results[index] !== null,
      }));

      return {
        success: true,
        entries,
        foundCount: entries.filter((e) => e.found).length,
      };
    } catch (error) {
      this.logger.error(`Error in batch get: ${error.message}`);
      throw error;
    }
  }

  @Post('batch/set')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Set multiple cache entries' })
  @ApiResponse({ status: 201, description: 'Batch cache entries created' })
  async batchSet(@Body() entries: CacheEntryDto[]) {
    try {
      await this.cacheService.mset(
        entries.map((entry) => ({
          key: entry.key,
          value: entry.value,
          options: {
            ttl: entry.ttl,
            tags: entry.tags,
          },
        })),
      );

      return {
        success: true,
        message: `Set ${entries.length} cache entries`,
        count: entries.length,
      };
    } catch (error) {
      this.logger.error(`Error in batch set: ${error.message}`);
      throw error;
    }
  }

  // ==================== INVALIDATION ====================

  @Post('invalidate/key/:key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate specific cache key' })
  @ApiResponse({ status: 200, description: 'Cache key invalidated' })
  async invalidateKey(
    @Param('key') key: string,
    @Query('reason') reason?: string,
  ) {
    try {
      await this.invalidationService.invalidateKey(key, reason);
      return {
        success: true,
        message: `Invalidated cache key: ${key}`,
        key,
        reason,
      };
    } catch (error) {
      this.logger.error(`Error invalidating key ${key}: ${error.message}`);
      throw error;
    }
  }

  @Post('invalidate/tag/:tag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate cache entries by tag' })
  @ApiResponse({ status: 200, description: 'Cache entries invalidated by tag' })
  async invalidateByTag(
    @Param('tag') tag: string,
    @Query('reason') reason?: string,
  ) {
    try {
      await this.invalidationService.invalidateByTag(tag, reason);
      return {
        success: true,
        message: `Invalidated cache entries by tag: ${tag}`,
        tag,
        reason,
      };
    } catch (error) {
      this.logger.error(`Error invalidating by tag ${tag}: ${error.message}`);
      throw error;
    }
  }

  @Post('invalidate/pattern/:pattern')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate cache entries by pattern' })
  @ApiResponse({
    status: 200,
    description: 'Cache entries invalidated by pattern',
  })
  async invalidateByPattern(
    @Param('pattern') pattern: string,
    @Query('reason') reason?: string,
  ) {
    try {
      const count = await this.invalidationService.invalidateByPattern(
        pattern,
        reason,
      );
      return {
        success: true,
        message: `Invalidated ${count} cache entries matching pattern: ${pattern}`,
        pattern,
        deletedCount: count,
        reason,
      };
    } catch (error) {
      this.logger.error(
        `Error invalidating by pattern ${pattern}: ${error.message}`,
      );
      throw error;
    }
  }

  // ==================== WARMUP ====================

  @Post('warmup/group')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register warmup group' })
  @ApiResponse({ status: 201, description: 'Warmup group registered' })
  async registerWarmupGroup(@Body() group: WarmupGroupDto) {
    try {
      await this.warmingService.registerWarmupGroup({
        name: group.name,
        entries: group.entries.map((entry) => ({
          key: entry.key,
          // In a real implementation, you'd need to deserialize the loader function
          loader: async () => ({ message: 'Mock data' }),
          ttl: entry.ttl,
          priority: entry.priority,
          schedule: entry.schedule,
          tags: entry.tags,
        })),
        enabled: group.enabled,
      });

      return {
        success: true,
        message: `Registered warmup group: ${group.name}`,
        groupName: group.name,
      };
    } catch (error) {
      this.logger.error(
        `Error registering warmup group ${group.name}: ${error.message}`,
      );
      throw error;
    }
  }

  @Post('warmup/group/:name/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute warmup group' })
  @ApiResponse({ status: 200, description: 'Warmup group executed' })
  async executeWarmupGroup(@Param('name') name: string) {
    try {
      const result = await this.warmingService.warmupGroup(name);
      return {
        success: true,
        message: `Warmup completed for group: ${name}`,
        groupName: name,
        ...result,
      };
    } catch (error) {
      this.logger.error(
        `Error executing warmup group ${name}: ${error.message}`,
      );
      throw error;
    }
  }

  @Get('warmup/groups')
  @ApiOperation({ summary: 'Get all warmup groups' })
  @ApiResponse({ status: 200, description: 'Warmup groups retrieved' })
  async getWarmupGroups() {
    try {
      const groups = this.warmingService.getAllWarmupGroups();
      return {
        success: true,
        groups,
      };
    } catch (error) {
      this.logger.error(`Error getting warmup groups: ${error.message}`);
      throw error;
    }
  }

  @Get('warmup/group/:name')
  @ApiOperation({ summary: 'Get warmup group details' })
  @ApiResponse({ status: 200, description: 'Warmup group details retrieved' })
  async getWarmupGroup(@Param('name') name: string) {
    try {
      const details = await this.warmingService.getWarmupGroupDetails(name);
      if (!details) {
        return {
          success: false,
          message: 'Warmup group not found',
          groupName: name,
        };
      }

      return {
        success: true,
        group: details,
      };
    } catch (error) {
      this.logger.error(`Error getting warmup group ${name}: ${error.message}`);
      throw error;
    }
  }

  // ==================== MONITORING ====================

  @Get('stats')
  @ApiOperation({ summary: 'Get cache statistics' })
  @ApiResponse({ status: 200, description: 'Cache statistics retrieved' })
  async getStats() {
    try {
      const stats = await this.cacheService.getStats();
      return {
        success: true,
        stats,
      };
    } catch (error) {
      this.logger.error(`Error getting cache stats: ${error.message}`);
      throw error;
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Get cache health status' })
  @ApiResponse({ status: 200, description: 'Cache health status retrieved' })
  async getHealth() {
    try {
      const health = await this.monitoringService.performHealthCheck();
      return {
        success: true,
        health,
      };
    } catch (error) {
      this.logger.error(`Error getting cache health: ${error.message}`);
      throw error;
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get cache metrics history' })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Hours of history to retrieve',
  })
  @ApiResponse({ status: 200, description: 'Cache metrics retrieved' })
  async getMetrics(@Query('hours') hours?: number) {
    try {
      const metrics = await this.monitoringService.getMetricsHistory(
        hours || 24,
      );
      return {
        success: true,
        metrics,
        periodHours: hours || 24,
      };
    } catch (error) {
      this.logger.error(`Error getting cache metrics: ${error.message}`);
      throw error;
    }
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get cache alerts' })
  @ApiQuery({
    name: 'severity',
    required: false,
    description: 'Filter by severity',
  })
  @ApiResponse({ status: 200, description: 'Cache alerts retrieved' })
  async getAlerts(@Query('severity') severity?: string) {
    try {
      let alerts;
      if (severity) {
        alerts = this.monitoringService.getAlertsBySeverity(severity as any);
      } else {
        alerts = this.monitoringService.getActiveAlerts();
      }

      return {
        success: true,
        alerts,
        count: alerts.length,
      };
    } catch (error) {
      this.logger.error(`Error getting cache alerts: ${error.message}`);
      throw error;
    }
  }

  @Post('alerts/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve cache alert' })
  @ApiResponse({ status: 200, description: 'Cache alert resolved' })
  async resolveAlert(@Param('id') id: string) {
    try {
      const result = await this.monitoringService.resolveAlert(id);
      return {
        success: result,
        message: result
          ? 'Alert resolved'
          : 'Alert not found or already resolved',
        alertId: id,
      };
    } catch (error) {
      this.logger.error(`Error resolving alert ${id}: ${error.message}`);
      throw error;
    }
  }

  @Get('report')
  @ApiOperation({ summary: 'Generate cache performance report' })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Report period in hours',
  })
  @ApiResponse({ status: 200, description: 'Cache report generated' })
  async getReport(@Query('period') period?: number) {
    try {
      const report = await this.monitoringService.generateReport(period || 24);
      return {
        success: true,
        report,
        periodHours: period || 24,
      };
    } catch (error) {
      this.logger.error(`Error generating cache report: ${error.message}`);
      throw error;
    }
  }

  // ==================== CONFIGURATION ====================

  @Get('config')
  @ApiOperation({ summary: 'Get cache configuration' })
  @ApiResponse({ status: 200, description: 'Cache configuration retrieved' })
  async getConfig() {
    try {
      const config = this.configService.getCacheConfig();
      const strategies = this.configService.getAllStrategies();

      return {
        success: true,
        config,
        strategies,
      };
    } catch (error) {
      this.logger.error(`Error getting cache config: ${error.message}`);
      throw error;
    }
  }

  @Put('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update cache configuration' })
  @ApiResponse({ status: 200, description: 'Cache configuration updated' })
  async updateConfig(@Body() config: any) {
    try {
      await this.configService.updateConfig(config);
      return {
        success: true,
        message: 'Cache configuration updated',
      };
    } catch (error) {
      this.logger.error(`Error updating cache config: ${error.message}`);
      throw error;
    }
  }

  @Post('config/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset cache configuration to defaults' })
  @ApiResponse({ status: 200, description: 'Cache configuration reset' })
  async resetConfig() {
    try {
      await this.configService.resetToDefault();
      return {
        success: true,
        message: 'Cache configuration reset to defaults',
      };
    } catch (error) {
      this.logger.error(`Error resetting cache config: ${error.message}`);
      throw error;
    }
  }
}
