import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  // Для Chrome Extensions лучше использовать build mode вместо dev server
  // чтобы избежать проблем с WebSocket/HMR
  server: {
    port: 5173,
    strictPort: false,
    // HMR не работает для Chrome Extensions из-за изоляции контекста
    // Используйте `npm run dev` который запускает build --watch
    hmr: false,
    cors: true,
  },
  build: {
    watch: process.env.NODE_ENV === 'development' ? {} : null,
    target: 'es2022', // Support top-level await for pdfjs-dist
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
      },
      output: {
        // Copy PDF worker file to assets
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'pdf.worker.min.js') {
            return 'assets/pdf.worker.min.js';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    copyPublicDir: true,
  },
});
