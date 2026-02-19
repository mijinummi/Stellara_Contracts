import { create } from 'zustand';
import { WebSocketState } from '@/types';

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,
  connecting: false,
  messages: [],
  
  connect: () => {
    set({ connecting: true });
    // WebSocket connection logic would go here
    // For now, simulate connection
    setTimeout(() => {
      set({ 
        isConnected: true, 
        connecting: false 
      });
    }, 1000);
  },
  
  disconnect: () => set({ 
    isConnected: false, 
    connecting: false,
    messages: [] 
  }),
  
  sendMessage: (message: any) => {
    if (get().isConnected) {
      // Send message logic would go here
      console.log('Sending message:', message);
    }
  },
  
  addMessage: (message: any) => set((state) => ({
    messages: [...state.messages, message]
  })),
}));