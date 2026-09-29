import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/health': { target: backendTarget, changeOrigin: true },
      '/api': { target: backendTarget, changeOrigin: true },
      '/auth': { target: backendTarget, changeOrigin: true },
    },
  },
})
