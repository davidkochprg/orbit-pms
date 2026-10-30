import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The API reads PORT from the root .env; follow it, so changing the port there is enough.
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '../..'), '');
  const apiTarget = process.env.API_URL ?? `http://localhost:${env.PORT || '3001'}`;
  return {
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
  };
});
