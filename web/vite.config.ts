import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${raiz}package.json`, 'utf8')) as { version: string };

// Em desenvolvimento (npm run dev) os serviços Java locais podem estar nas portas abaixo.
const rr = process.env.RR_DEV_URL ?? 'http://127.0.0.1:18080';
const sn = process.env.SN_DEV_URL ?? 'http://127.0.0.1:18082';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: {
    proxy: {
      '/api/rr': { target: rr, rewrite: (p) => p.replace(/^\/api\/rr\//, '/api/calculadora/') },
      '/api/sn': {
        target: sn,
        rewrite: (p) => (p.startsWith('/api/sn/versao') ? p.replace('/api/sn/', '/api/') : p.replace('/api/sn/', '/api/calculadora/')),
      },
    },
  },
});
