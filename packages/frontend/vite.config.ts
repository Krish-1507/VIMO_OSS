import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Keep in sync with the `paths` entry in tsconfig.json. Without this,
      // `tsc --noEmit` resolves `@shared/*` but the Vite build cannot.
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
      // The frontend connects to the socket same-origin; forward the upgrade.
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Shared vendor chunks: without these, heavy deps (recharts, date-fns,
        // socket.io) get duplicated into every lazy page chunk — ConnectorHub
        // alone ballooned to 849KB. Splitting vendors keeps page chunks small
        // and lets the browser cache framework code across navigations.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-net': ['axios', 'socket.io-client'],
          'vendor-utils': ['date-fns', 'clsx', 'tailwind-merge', 'zustand'],
        },
      },
    },
  },
});
