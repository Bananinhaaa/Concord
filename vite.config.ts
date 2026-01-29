
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000, // Aumenta o limite para 1000kb para silenciar o aviso
    rollupOptions: {
      input: './index.html',
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'peerjs', '@google/genai']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
