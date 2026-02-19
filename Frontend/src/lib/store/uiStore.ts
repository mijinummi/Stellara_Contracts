import { create } from 'zustand';
import { UIState, Notification } from '@/types';

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'light',
  sidebarOpen: false,
  notifications: [],
  
  toggleTheme: () => set((state) => ({ 
    theme: state.theme === 'light' ? 'dark' : 'light' 
  })),
  
  toggleSidebar: () => set((state) => ({ 
    sidebarOpen: !state.sidebarOpen 
  })),
  
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => set((state) => ({
    notifications: [
      ...state.notifications,
      {
        ...notification,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        read: false
      }
    ]
  })),
  
  removeNotification: (id: string) => set((state) => ({
    notifications: state.notifications.filter(notification => notification.id !== id)
  })),
}));