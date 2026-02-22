import { Module, Global } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { CacheWarmingService } from './cache-warming.service';
import { CacheMonitoringService } from './cache-monitoring.service';
import { CacheConfigurationService } from './cache-configuration.service';
import { CacheController } from './cache.controller';

@Global()
@Module({
  imports: [RedisModule],
  controllers: [CacheController],
  providers: [
    CacheService,
    CacheInvalidationService,
    CacheWarmingService,
    CacheMonitoringService,
    CacheConfigurationService,
  ],
  exports: [
    CacheService,
    CacheInvalidationService,
    CacheWarmingService,
    CacheMonitoringService,
    CacheConfigurationService,
  ],
})
export class CacheModule {}
