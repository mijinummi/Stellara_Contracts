import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MarketDataController } from './controllers/market-data.controller';
import { MarketCacheService } from './services/market-cache.service';
import { MarketDataService } from './services/market-data.service';
import { NewsService } from './services/news.service';
import { CacheMetricsService } from './services/cache-metrics.service';
import { CacheInvalidationService } from './services/cache-invalidation.service';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
  ],
  controllers: [MarketDataController],
  providers: [
    MarketCacheService,
    MarketDataService,
    NewsService,
    CacheMetricsService,
    CacheInvalidationService,
  ],
  exports: [
    MarketCacheService,
    MarketDataService,
    NewsService,
    CacheMetricsService,
    CacheInvalidationService,
  ],
})
export class MarketDataModule {}
