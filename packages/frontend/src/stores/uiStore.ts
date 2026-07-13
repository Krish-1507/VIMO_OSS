import { create } from 'zustand';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
  duration: number;
}

interface UIState {
  isDarkMode: true; // Dark mode is always enabled
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen: boolean;
  notifications: Notification[];
  isAssistantOpen: boolean;
  hasUnreadAssistant: boolean;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  setAssistantOpen: (open: boolean) => void;
  setHasUnreadAssistant: (unread: boolean) => void;
  addNotification: (type: Notification['type'], title: string, message: string) => void;
  removeNotification: (id: string) => void;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      return JSON.parse(stored) as T;
    }
  } catch {
    // ignore
  }
  return defaultValue;
}

export const useUIStore = create<UIState>((set) => ({
  isDarkMode: true, // Dark mode always enabled
  isSidebarCollapsed: loadFromStorage('isSidebarCollapsed', false),
  isMobileSidebarOpen: false,
  isAssistantOpen: false,
  hasUnreadAssistant: false,
  notifications: [],
  toggleSidebar: () =>
    set((state) => {
      const newValue = !state.isSidebarCollapsed;
      try {
        localStorage.setItem('isSidebarCollapsed', JSON.stringify(newValue));
      } catch {
        // ignore
      }
      return { isSidebarCollapsed: newValue };
    }),
  setMobileSidebarOpen: (open: boolean) => set({ isMobileSidebarOpen: open }),
  toggleAssistant: () => set((state) => ({ isAssistantOpen: !state.isAssistantOpen, hasUnreadAssistant: false })),
  setAssistantOpen: (open: boolean) => set({ isAssistantOpen: open, hasUnreadAssistant: open ? false : false }),
  setHasUnreadAssistant: (unread: boolean) => set({ hasUnreadAssistant: unread }),
  addNotification: (type, title, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const duration = 4000;
    set((state) => ({
      notifications: [...state.notifications, { id, type, title, message, duration }],
    }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, duration);
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
