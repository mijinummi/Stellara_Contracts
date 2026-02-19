// User types
export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  walletAddress?: string;
  isVerified: boolean;
  createdAt: Date;
}

// Auth types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

// WebSocket types
export interface WebSocketState {
  isConnected: boolean;
  connecting: boolean;
  messages: any[];
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: any) => void;
  addMessage: (message: any) => void;
}

// Trading types
export interface PortfolioItem {
  asset: string;
  amount: number;
  value: number;
  change24h: number;
}

export interface TradingState {
  portfolio: PortfolioItem[];
  totalValue: number;
  isLoading: boolean;
  updatePortfolio: (items: PortfolioItem[]) => void;
  setTotalValue: (value: number) => void;
  setLoading: (loading: boolean) => void;
}

// UI types
export interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  notifications: Notification[];
  toggleTheme: () => void;
  toggleSidebar: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

// Stellar types
export interface StellarAccount {
  publicKey: string;
  balance: string;
  sequence: string;
  subentryCount: number;
}

export interface StellarTransaction {
  id: string;
  source: string;
  destination: string;
  amount: string;
  asset: string;
  timestamp: Date;
  status: 'pending' | 'success' | 'failed';
}