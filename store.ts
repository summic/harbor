
import { create } from 'zustand';

interface AppState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  activeThemeColor: string;
  setActiveThemeColor: (color: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSidebarOpen:
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 768px)').matches
      : true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  activeThemeColor: 'blue',
  setActiveThemeColor: (color) => set({ activeThemeColor: color }),
}));
