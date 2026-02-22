import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiProviderFactory } from './ai-provider.factory';
import { AiProviderHealth } from './interfaces/ai-provider.interface';

@Injectable()
export class ProviderHealthService {
  private readonly logger = new Logger(ProviderHealthService.name);
  private healthCheckInterval: NodeJS.Timeout;

  constructor(
    private readonly providerFactory: AiProviderFactory,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.startHealthChecks();
  }

  async getProviderHealth(): Promise<Record<string, AiProviderHealth>> {
    return this.providerFactory.getAllProviderHealth();
  }

  async getHealthyProviders(): Promise<string[]> {
    return this.providerFactory.getHealthyProviders();
  }

  async forceHealthCheck(): Promise<void> {
    this.logger.log('Forcing health check for all providers');
    // This would trigger immediate health checks
    // Implementation depends on how providerFactory handles health checks
  }

  private startHealthChecks(): void {
    // Run health checks every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getProviderHealth();
        this.eventEmitter.emit('provider.health.updated', health);
      } catch (error) {
        this.logger.error('Error during periodic health check:', error);
      }
    }, 30000);
  }

  async onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}