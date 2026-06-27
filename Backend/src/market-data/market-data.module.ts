import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { MarketDataController } from './controllers/market-data.controller';
import { MarketCacheService } from './services/market-cache.service';
import { MarketDataService } from './services/market-data.service';
import { NewsService } from './services/news.service';
import { CacheMetricsService } from './services/cache-metrics.service';
import { CacheInvalidationService } from './services/cache-invalidation.service';
import { HorizonMarketDataProvider } from './services/horizon-market-data-provider.service';
import { MarketCacheWarmingService } from './services/market-cache-warming.service';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
    // ScheduleModule is registered globally in AppModule, but importing here
    // ensures this module works standalone (e.g. in tests)
    ScheduleModule.forRoot(),
  ],
  controllers: [MarketDataController],
  providers: [
    // Cache infrastructure
    MarketCacheService,

    // Real Horizon data provider
    HorizonMarketDataProvider,

    // Core data service (now backed by HorizonMarketDataProvider)
    MarketDataService,

    // News service (still uses cache layer)
    NewsService,

    // Cache utilities
    CacheMetricsService,
    CacheInvalidationService,

    // Periodic cache warming (30-second cron)
    MarketCacheWarmingService,
  ],
  exports: [
    MarketCacheService,
    MarketDataService,
    NewsService,
    CacheMetricsService,
    CacheInvalidationService,
    HorizonMarketDataProvider,
    MarketCacheWarmingService,
  ],
})
export class MarketDataModule {}
