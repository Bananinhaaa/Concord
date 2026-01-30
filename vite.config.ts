
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Garante que variáveis de ambiente não quebrem o build
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ''),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  },
  build: {
    // Alterado para 'concord' para satisfazer o erro do Render
    outDir: 'concord', 
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
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
