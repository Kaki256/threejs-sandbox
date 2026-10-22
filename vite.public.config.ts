import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: resolve('playground'),
  base: process.env.PAGES_BASE || '/threejs-sandbox/',
  publicDir: resolve('public'),
  plugins: [vue()],
  define: { 'import.meta.env.VITE_PUBLIC_SANDBOX': 'true' },
  resolve: { alias: [{ find: /^(?:.*\/)?content\/reference-definitions(?:\.ts)?$/, replacement: resolve('src/public/reference-definitions.ts') }] },
  assetsInclude: ['**/*.stl'],
  worker: { format: 'es' },
  build: { outDir: resolve('dist-public'), emptyOutDir: true },
});
