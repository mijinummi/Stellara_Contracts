import { create } from 'zustand';
import { AuthState, User } from '@/types';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  
  login: (userData: User) => set({ 
    user: userData, 
    isAuthenticated: true,
    isLoading: false 
  }),
  
  logout: () => set({ 
    user: null, 
    isAuthenticated: false 
  }),
  
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}));