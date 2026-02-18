
import { create } from 'zustand';

interface AppState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  activeThemeColor: string;
  setActiveThemeColor: (color: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  activeThemeColor: 'blue',
  setActiveThemeColor: (color) => set({ activeThemeColor: color }),
}));
