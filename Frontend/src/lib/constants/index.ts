// Stellar Network Configuration
export const STELLAR_NETWORK = {
  public: 'public',
  testnet: 'testnet',
  futurenet: 'futurenet',
} as const;

export const STELLAR_HORIZON_URLS = {
  [STELLAR_NETWORK.public]: 'https://horizon.stellar.org',
  [STELLAR_NETWORK.testnet]: 'https://horizon-testnet.stellar.org',
  [STELLAR_NETWORK.futurenet]: 'https://horizon-futurenet.stellar.org',
} as const;

// Default network (can be changed based on environment)
export const DEFAULT_STELLAR_NETWORK = STELLAR_NETWORK.testnet;

// WebSocket Configuration
export const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3001';

// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Application Constants
export const APP_NAME = 'Stellara AI';
export const APP_DESCRIPTION = 'The Intelligent Web3 Crypto Academy';

// Supported Assets
export const SUPPORTED_ASSETS = [
  { code: 'XLM', issuer: null, name: 'Stellar Lumens' },
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', name: 'USD Coin' },
  { code: 'BTC', issuer: 'GAUTUYY2THLF7SGITDFMXJVYH3LHDSMGEAKSBU267M2K7A3W543CKUEF', name: 'Bitcoin' },
  { code: 'ETH', issuer: 'GBVOL67TMUQBGL4TZYNMY3ZQ5WGQYFPFD5VJRWXR72VA33VFNL225PL5', name: 'Ethereum' },
] as const;

// Trading Constants
export const MIN_TRADE_AMOUNT = 0.0000001;
export const MAX_TRADE_AMOUNT = 1000000;

// Time Constants
export const REFRESH_INTERVALS = {
  PORTFOLIO: 30000, // 30 seconds
  MARKET_DATA: 10000, // 10 seconds
  NOTIFICATIONS: 60000, // 1 minute
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Cache Keys
export const CACHE_KEYS = {
  USER_PROFILE: 'user_profile',
  PORTFOLIO: 'portfolio',
  MARKET_DATA: 'market_data',
  NOTIFICATIONS: 'notifications',
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'stellara_auth_token',
  USER_PREFERENCES: 'stellara_user_preferences',
  THEME: 'stellara_theme',
} as const;