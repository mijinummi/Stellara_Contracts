import { create } from 'zustand';
import { TradingState, PortfolioItem } from '@/types';

export const useTradingStore = create<TradingState>((set) => ({
  portfolio: [],
  totalValue: 0,
  isLoading: false,
  
  updatePortfolio: (items: PortfolioItem[]) => set({ portfolio: items }),
  
  setTotalValue: (value: number) => set({ totalValue: value }),
  
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}));