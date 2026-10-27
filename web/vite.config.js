import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export function resourceProxy(target = process.env.GALLERY_API_URL || 'http://127.0.0.1:8080') {
  return Object.fromEntries(['/api', '/image', '/video'].map((prefix) => [prefix, { target }]));
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: resourceProxy() },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true, proxy: resourceProxy() },
  build: { outDir: 'dist', emptyOutDir: true },
});
