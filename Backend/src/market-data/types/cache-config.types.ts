export interface CacheConfig {
  ttl: number; // Time to live in seconds
  key: string;
  namespace: string;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  namespace: string;
}

export interface CacheInvalidationEvent {
  type: 'asset_update' | 'manual' | 'ttl_expired';
  keys?: string[];
  pattern?: string;
  timestamp: Date;
}

export enum CacheNamespace {
  MARKET_SNAPSHOT = 'market:snapshot',
  NEWS = 'news',
  ASSET_DATA = 'asset:data',
  PRICE_DATA = 'price:data',
}

export const CACHE_TTL_CONFIG = {
  MARKET_SNAPSHOT: 300, // 5 minutes
  NEWS: 900, // 15 minutes
  ASSET_DATA: 600, // 10 minutes
  PRICE_DATA: 60, // 1 minute
};
