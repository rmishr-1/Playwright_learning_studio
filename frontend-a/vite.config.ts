import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks only to the studio backend. Vite proxies /api to it in dev, so there is
// no CORS and the backend stays the single surface. ws:true carries the live-view socket.
export default defineConfig({
  plugins: [react()],
  // CodeMirror breaks with "Unrecognized extension value" if two copies of @codemirror/state
  // end up loaded - its instanceof checks then fail. Forcing a single copy of each package
  // keeps that from coming back the next time a codemirror dep is added.
  resolve: {
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language', 'codemirror'],
  },
  server: {
    port: 5183,
    // Fail rather than drift to another port: the port is how v1, v2, A, B and C are told apart.
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.STUDIO_BACKEND_URL ?? 'http://127.0.0.1:3010',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
