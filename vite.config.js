// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
  '/chat': { target: 'http://localhost:4000', changeOrigin: true, secure: false },
  '/sessions': { target: 'http://localhost:4000', changeOrigin: true, secure: false },
  '/messages': { target: 'http://localhost:4000', changeOrigin: true, secure: false },
  '/api': { target: 'http://localhost:4000', changeOrigin: true, secure: false },
}
  },
});
