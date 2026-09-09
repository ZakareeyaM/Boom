import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    cors: true,
    allowedHosts: ['all', '.trycloudflare.com', 'localhost', '127.0.0.1'],
    
    // Explicitly handle hot-reloads and tunnels safely
    hmr: {
      clientPort: 443,
    },

    proxy: {
      // Map all API requests AND socket/signaling streams through Vite
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true, // 👈 Ensures WebSocket streams (like signaling) are forwarded
      },
      // If your app uses socket.io directly on a custom path (like /socket.io)
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
      }
    },
  },
});
