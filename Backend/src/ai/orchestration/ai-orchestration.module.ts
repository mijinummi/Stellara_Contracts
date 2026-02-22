import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../../redis/redis.module';
import { AiOrchestrationService } from './ai-orchestration.service';
import { AiProviderFactory } from './ai-provider.factory';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleProvider } from './providers/google.provider';
import { AzureProvider } from './providers/azure.provider';
import { CircuitBreakerService } from './circuit-breaker.service';
import { AdvancedQuotaService } from './advanced-quota.service';
import { AdvancedRateLimitService } from './advanced-rate-limit.service';
import { MultiLevelCacheService } from './multi-level-cache.service';
import { ProviderHealthService } from './provider-health.service';
import { MonitoringService } from './monitoring.service';
import { AiOrchestrationController } from './ai-orchestration.controller';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [AiOrchestrationController],
  providers: [
    AiOrchestrationService,
    AiProviderFactory,
    OpenAiProvider,
    AnthropicProvider,
    GoogleProvider,
    AzureProvider,
    CircuitBreakerService,
    AdvancedQuotaService,
    AdvancedRateLimitService,
    MultiLevelCacheService,
    ProviderHealthService,
    MonitoringService,
  ],
  exports: [
    AiOrchestrationService,
    AdvancedQuotaService,
    AdvancedRateLimitService,
    MultiLevelCacheService,
    ProviderHealthService,
  ],
})
export class AiOrchestrationModule {}