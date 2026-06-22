import { Injectable, Logger } from '@nestjs/common';
import { MarketCacheService } from './market-cache.service';
import { CacheNamespace } from '../types/cache-config.types';
import { MarketSnapshotDto, AssetPriceDto } from '../dto/market-snapshot.dto';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(private readonly cacheService: MarketCacheService) {}

  /**
   * Get market snapshot with cache-first strategy
   */
  async getMarketSnapshot(
    assetFilter?: string[],
    bypassCache: boolean = false,
  ): Promise<MarketSnapshotDto> {
    const cacheKey = this.generateMarketSnapshotKey(assetFilter);

    // Try cache first (unless bypassed)
    if (!bypassCache) {
      const cached = await this.cacheService.get<MarketSnapshotDto>(
        cacheKey,
        CacheNamespace.MARKET_SNAPSHOT,
      );

      if (cached) {
        this.logger.debug('Serving market snapshot from cache');
        return { ...cached, cached: true };
      }
    }

    // Cache miss or bypass - fetch fresh data
    this.logger.debug('Fetching fresh market snapshot from API');
    const snapshot = await this.fetchMarketSnapshot(assetFilter);

    // Cache the result
    await this.cacheService.set(
      cacheKey,
      snapshot,
      CacheNamespace.MARKET_SNAPSHOT,
    );

    return { ...snapshot, cached: false };
  }

  /**
   * Get asset price data with cache
   */
  async getAssetPrice(
    assetCode: string,
    issuer: string,
  ): Promise<AssetPriceDto | null> {
    const cacheKey = `${assetCode}:${issuer}`;

    // Try cache first
    const cached = await this.cacheService.get<AssetPriceDto>(
      cacheKey,
      CacheNamespace.PRICE_DATA,
    );

    if (cached) {
      this.logger.debug(`Serving ${assetCode} price from cache`);
      return cached;
    }

    // Fetch from API
    const priceData = await this.fetchAssetPrice(assetCode, issuer);

    if (priceData) {
      // Cache the result
      await this.cacheService.set(
        cacheKey,
        priceData,
        CacheNamespace.PRICE_DATA,
      );
    }

    return priceData;
  }

  /**
   * Invalidate market data cache (e.g., on asset update)
   */
  async invalidateMarketCache(assetCode?: string): Promise<number> {
    if (assetCode) {
      // Invalidate specific asset
      return await this.cacheService.invalidateByPattern(
        assetCode,
        CacheNamespace.PRICE_DATA,
      );
    } else {
      // Invalidate all market snapshots
      return await this.cacheService.invalidateNamespace(
        CacheNamespace.MARKET_SNAPSHOT,
      );
    }
  }

  // ========== PRIVATE HELPERS ==========

  /**
   * Fetch market snapshot from external API
   * This is a mock implementation - replace with actual API calls
   */
  private async fetchMarketSnapshot(
    assetFilter?: string[],
  ): Promise<MarketSnapshotDto> {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock data - replace with actual API integration
    const mockAssets: AssetPriceDto[] = [
      {
        code: 'XLM',
        issuer: 'native',
        priceUSD: 0.125,
        change24h: 2.5,
        volume24h: 125000000,
        marketCap: 3500000000,
      },
      {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        priceUSD: 1.0,
        change24h: 0.01,
        volume24h: 50000000,
        marketCap: 45000000000,
      },
      {
        code: 'AQUA',
        issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
        priceUSD: 0.045,
        change24h: -1.2,
        volume24h: 8000000,
        marketCap: 180000000,
      },
      {
        code: 'yXLM',
        issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55',
        priceUSD: 0.13,
        change24h: 2.8,
        volume24h: 12000000,
        marketCap: 26000000,
      },
    ];

    // Filter assets if specified
    let filteredAssets = mockAssets;
    if (assetFilter && assetFilter.length > 0) {
      filteredAssets = mockAssets.filter((asset) =>
        assetFilter.includes(asset.code.toUpperCase()),
      );
    }

    return {
      assets: filteredAssets,
      timestamp: new Date(),
      source: 'Stellar DEX / CoinGecko',
      cached: false,
    };
  }

  /**
   * Fetch single asset price from external API
   * This is a mock implementation - replace with actual API calls
   */
  private async fetchAssetPrice(
    assetCode: string,
    issuer: string,
  ): Promise<AssetPriceDto | null> {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mock data - replace with actual API integration
    // In production, this would call Horizon API, Stellar Expert, or CoinGecko
    const mockPrices: { [key: string]: AssetPriceDto } = {
      'XLM:native': {
        code: 'XLM',
        issuer: 'native',
        priceUSD: 0.125,
        change24h: 2.5,
        volume24h: 125000000,
        marketCap: 3500000000,
      },
      'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN': {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        priceUSD: 1.0,
        change24h: 0.01,
        volume24h: 50000000,
        marketCap: 45000000000,
      },
    };

    const key = `${assetCode}:${issuer}`;
    return mockPrices[key] || null;
  }

  /**
   * Generate cache key for market snapshot
   */
  private generateMarketSnapshotKey(assetFilter?: string[]): string {
    if (!assetFilter || assetFilter.length === 0) {
      return 'all-assets';
    }
    return `assets:${assetFilter.sort().join(',')}`;
  }
}
