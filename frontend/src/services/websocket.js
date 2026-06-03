import { io } from 'socket.io-client'

// Connect to the same host as the frontend (nginx will proxy to backend)
// Don't use /socket.io as namespace - that's the path, not namespace
const WS_TARGET = import.meta.env.VITE_WS_URL || window.location.origin
const WS_URL = WS_TARGET.startsWith('/') ? window.location.origin : WS_TARGET
const WS_PATH = WS_TARGET.startsWith('/') ? WS_TARGET : '/socket.io'

class WebSocketService {
  constructor() {
    this.socket = null
    this.connected = false
  }

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      // Don't try to connect to non-existent namespaces
      autoConnect: false,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      // Handle "Invalid namespace" gracefully
      if (error.message?.includes('Invalid namespace')) {
        console.warn('WebSocket namespace not found, disconnecting...');
        this.disconnect();
        return;
      }
      console.error('WebSocket connection error:', error);
    });

    // Only connect explicitly when needed
    this.socket.connect();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.connected = false
    }
  }

  subscribe(channel, callback) {
    if (!this.socket) this.connect()

    const onConnect = () => {
      this.socket.emit('subscribe', { channel })
      this.socket.on('log', callback)  // Listen for 'log' event (not channel name)
      this.socket.off('connect', onConnect)
    }

    if (this.socket.connected) {
      this.socket.emit('subscribe', { channel })
      this.socket.on('log', callback)
    } else {
      this.socket.on('connect', onConnect)
    }
  }

  unsubscribe(channel, callback) {
    if (!this.socket) return

    const onConnect = () => {
      this.socket.emit('unsubscribe', { channel })
      if (callback) this.socket.off('log', callback)
      this.socket.off('connect', onConnect)
    }

    if (this.socket.connected) {
      this.socket.emit('unsubscribe', { channel })
      if (callback) this.socket.off('log', callback)
    } else {
      this.socket.on('connect', onConnect)
    }
  }

  // Specific subscriptions
  subscribeLogs(callback, filters = {}) {
    this.subscribe('logs', callback)
    if (Object.keys(filters).length > 0) {
      if (this.socket?.connected) {
        this.socket.emit('filter-logs', filters)
      } else {
        this.socket?.on('connect', () => {
          this.socket.emit('filter-logs', filters)
        })
      }
    }
  }

  subscribeChanges(callback) {
    this.subscribe('changes', callback)
  }

  subscribeSyncStatus(callback) {
    this.subscribe('sync-status', callback)
  }
}

export const wsService = new WebSocketService()
