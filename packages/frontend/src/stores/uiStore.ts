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
  /** Docked assistant panel width in px (desktop). */
  assistantWidth: number;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  setAssistantOpen: (open: boolean) => void;
  setAssistantWidth: (width: number) => void;
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
  } catch (err) {
    // ignore
    console.warn('[vimo] best-effort operation failed:', err);
  }
  return defaultValue;
}

export const useUIStore = create<UIState>((set) => ({
  isDarkMode: true, // Dark mode always enabled
  isSidebarCollapsed: loadFromStorage('isSidebarCollapsed', false),
  isMobileSidebarOpen: false,
  isAssistantOpen: false,
  hasUnreadAssistant: false,
  assistantWidth: loadFromStorage('assistantWidth', 420),
  notifications: [],
  toggleSidebar: () =>
    set((state) => {
      const newValue = !state.isSidebarCollapsed;
      try {
        localStorage.setItem('isSidebarCollapsed', JSON.stringify(newValue));
      } catch (err) {
        // ignore
        console.warn('[vimo] best-effort operation failed:', err);
      }
      return { isSidebarCollapsed: newValue };
    }),
  setMobileSidebarOpen: (open: boolean) => set({ isMobileSidebarOpen: open }),
  toggleAssistant: () => set((state) => ({ isAssistantOpen: !state.isAssistantOpen, hasUnreadAssistant: false })),
  setAssistantOpen: (open: boolean) => set({ isAssistantOpen: open, hasUnreadAssistant: open ? false : false }),
  setAssistantWidth: (width: number) => {
    const clamped = Math.min(720, Math.max(340, Math.round(width)));
    try {
      localStorage.setItem('assistantWidth', JSON.stringify(clamped));
    } catch (err) {
      console.warn('[vimo] best-effort operation failed:', err);
    }
    set({ assistantWidth: clamped });
  },
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
