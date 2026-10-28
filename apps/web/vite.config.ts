import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.API_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // `pnpm dev:lan` opens the dev server to the local network, so a phone can open ID scan links.
    host: process.env.ORBIT_LAN === '1' ? true : undefined,
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
});
