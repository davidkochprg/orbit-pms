import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The API reads PORT from the root .env; follow it, so changing the port there is enough.
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '../..'), '');
  const apiTarget = process.env.API_URL ?? `http://localhost:${env.PORT || '3001'}`;
  return {
    // `pnpm dev:lan` (mode `lan`) serves HTTPS with a self-signed certificate: a page opened at the
    // computer's network address is a secure context only over HTTPS, and without one the
    // browser withholds the microphone, the camera and the clipboard.
    plugins: [react(), tailwindcss(), ...(mode === 'lan' ? [basicSsl()] : [])],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      // `pnpm dev:lan` adds --host, opening the dev server to the local network for phone scans.
      proxy: {
        '/api': apiTarget,
        '/health': apiTarget,
      },
    },
  };
});
