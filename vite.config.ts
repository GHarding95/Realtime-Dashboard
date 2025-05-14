import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Get the server port from environment variable or use default
const SERVER_PORT = process.env.PORT || 8000;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
}) 