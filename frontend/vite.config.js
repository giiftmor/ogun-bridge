import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
  server: {
    port: 3331,
    proxy: {
      '/api': {
        target: 'http://192.168.0.200:3333',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://192.168.0.200:3333',
        ws: true,
      },
    },
  },
})
