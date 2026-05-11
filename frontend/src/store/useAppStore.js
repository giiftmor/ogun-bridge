import { create } from 'zustand'

const getInitialTheme = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme')
    if (stored) return stored
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  }
  return 'light'
}

const getInitialSidebarOpen = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('sidebar_open')
    if (stored !== null) return stored === 'true'
    return window.innerWidth >= 1024
  }
  return true
}

export const useAppStore = create((set, get) => ({
  // UI State
  sidebarOpen: getInitialSidebarOpen(),
  toggleSidebar: () => set((state) => {
    const next = !state.sidebarOpen
    localStorage.setItem('sidebar_open', next)
    return { sidebarOpen: next }
  }),

  // Theme
  theme: getInitialTheme(),
  toggleTheme: () => {
    const newTheme = get().theme === 'light' ? 'dark' : 'light'
    set({ theme: newTheme })
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  },

  // Auth State (token managed via HTTP-only cookie)
  token: null,
  setToken: () => {
    // Token is handled via HTTP-only cookie set by backend
    set({ token: 'authenticated' })
  },

  // User State
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  logout: () => {
    set({ token: null, currentUser: null })
  },

  // Dashboard Stats
  dashboardStats: null,
  setDashboardStats: (stats) => set({ dashboardStats: stats }),

  // Logs
  logs: [],
  addLog: (log) => set((state) => {
    // Check for duplicate using timestamp + message as key
    const logKey = `${log.timestamp}-${log.message}`
    const exists = state.logs.some(l => `${l.timestamp}-${l.message}` === logKey)
    if (exists) return state
    
    return { 
      logs: [log, ...state.logs].slice(0, 1000) // Keep last 1000 logs
    }
  }),
  clearLogs: () => set({ logs: [] }),

  // Filters
  logFilters: {
    level: 'all',
    search: '',
    user: 'all',
  },
  setLogFilters: (filters) => set((state) => ({
    logFilters: { ...state.logFilters, ...filters }
  })),

  // Sync Status
  syncStatus: {
    status: 'idle',
    lastSync: null,
    progress: 0,
    message: '',
  },
  setSyncStatus: (status) => set((state) => ({
    syncStatus: { ...state.syncStatus, ...status }
  })),

  // Notifications
  notifications: [],
  addNotification: (notification) => set((state) => ({
    notifications: [...state.notifications, {
      id: Date.now(),
      ...notification,
    }]
  })),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),
}))
