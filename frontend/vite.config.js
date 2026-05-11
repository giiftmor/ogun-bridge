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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 400,
  },
  server: {
    port: 3331,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:3333',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_API_PROXY || 'http://localhost:3333',
        ws: true,
      },
    },
  },
})
