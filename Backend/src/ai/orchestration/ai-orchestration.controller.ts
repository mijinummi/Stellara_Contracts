import { Controller, Post, Get, Body, Query, Param, HttpException, HttpStatus } from '@nestjs/common';
import { AiOrchestrationService } from './ai-orchestration.service';
import { AiRequestDto, AiResponseDto, AiProviderHealthDto } from './dto/ai-orchestration.dto';
import { CircuitBreakerService } from './circuit-breaker.service';
import { AdvancedQuotaService } from './advanced-quota.service';
import { AdvancedRateLimitService } from './advanced-rate-limit.service';
import { MultiLevelCacheService } from './multi-level-cache.service';
import { ProviderHealthService } from './provider-health.service';
import { MonitoringService } from './monitoring.service';

@Controller('ai-orchestration')
export class AiOrchestrationController {
  constructor(
    private readonly orchestrationService: AiOrchestrationService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly quotaService: AdvancedQuotaService,
    private readonly rateLimitService: AdvancedRateLimitService,
    private readonly cacheService: MultiLevelCacheService,
    private readonly healthService: ProviderHealthService,
    private readonly monitoringService: MonitoringService,
  ) {}

  @Post('generate')
  async generateResponse(@Body() dto: AiRequestDto): Promise<AiResponseDto> {
    try {
      const result = await this.orchestrationService.generateResponse(
        dto.prompt,
        dto.options
      );
      
      return {
        content: result.response.content,
        model: result.response.model,
        provider: result.response.provider,
        tokensUsed: result.response.tokensUsed,
        cost: result.response.cost,
        cached: result.response.cached,
        requestId: result.response.requestId,
        timestamp: result.response.timestamp,
        metadata: {
          ...result.response.metadata,
          orchestration: result.orchestrationMetadata,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'AI service error',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('generate-with-fallback')
  async generateResponseWithFallback(@Body() dto: AiRequestDto): Promise<AiResponseDto> {
    try {
      const response = await this.orchestrationService.generateResponseWithFallback(
        dto.prompt,
        dto.options
      );
      
      return {
        content: response.content,
        model: response.model,
        provider: response.provider,
        tokensUsed: response.tokensUsed,
        cost: response.cost,
        cached: response.cached,
        requestId: response.requestId,
        timestamp: response.timestamp,
        metadata: response.metadata,
      };
    } catch (error) {
      throw new HttpException(
        'AI service error',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('health')
  async getProviderHealth(): Promise<Record<string, AiProviderHealthDto>> {
    const health = await this.orchestrationService.getProviderHealth();
    
    const healthDto: Record<string, AiProviderHealthDto> = {};
    for (const [provider, status] of Object.entries(health)) {
      healthDto[provider] = {
        provider: status.provider,
        status: status.status,
        latencyMs: status.latencyMs,
        errorRate: status.errorRate,
        lastChecked: status.lastChecked,
        failureReason: status.failureReason,
      };
    }
    
    return healthDto;
  }

  @Get('healthy-providers')
  async getHealthyProviders(): Promise<string[]> {
    return this.orchestrationService.getHealthyProviders();
  }

  @Get('stats')
  async getOrchestrationStats(): Promise<any> {
    return this.orchestrationService.getOrchestrationStats();
  }

  @Get('circuit-breakers')
  async getCircuitBreakerStats(): Promise<any> {
    return this.circuitBreakerService.getAllMetrics();
  }

  @Post('circuit-breakers/:circuitId/reset')
  async resetCircuitBreaker(@Param('circuitId') circuitId: string): Promise<void> {
    await this.circuitBreakerService.resetCircuit(circuitId);
  }

  @Get('quotas/:userId')
  async getUserQuota(@Param('userId') userId: string): Promise<any> {
    return this.quotaService.getUserCurrentUsage(userId);
  }

  @Post('quotas/:userId/reset')
  async resetUserQuota(@Param('userId') userId: string): Promise<void> {
    await this.quotaService.resetMonthlyQuota(userId);
  }

  @Get('rate-limits/:userId')
  async getUserRateLimit(@Param('userId') userId: string): Promise<any> {
    return this.rateLimitService.getUserCurrentRateLimit(userId);
  }

  @Post('rate-limits/:userId/reset')
  async resetUserRateLimit(@Param('userId') userId: string): Promise<void> {
    await this.rateLimitService.resetUserRateLimit(userId);
  }

  @Get('cache/stats')
  async getCacheStats(): Promise<any> {
    return this.cacheService.getStats();
  }

  @Post('cache/clear')
  async clearCache(): Promise<{ message: string }> {
    await this.cacheService.clearAll();
    return { message: 'Cache cleared successfully' };
  }

  @Post('cache/warm')
  async warmCache(@Body() entries: Array<{ prompt: string; response: string; model: string; ttl?: number }>): Promise<{ count: number }> {
    const count = await this.cacheService.warmCache(entries);
    return { count };
  }

  @Get('monitoring/stats')
  async getMonitoringStats(): Promise<any> {
    return this.monitoringService.getStats();
  }

  @Post('monitoring/reset')
  async resetMonitoringStats(): Promise<{ message: string }> {
    this.monitoringService.resetStats();
    return { message: 'Monitoring stats reset successfully' };
  }
}