import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `npm run dev:mock`  -> in-memory fake API (token: demo), no Google/AI needed.
// `npm run dev`       -> proxies /api to `vercel dev` (default http://localhost:3000).
export default defineConfig(({ mode }) => {
  const plugins = [react(), tailwindcss()];
  if (mode === 'mock') {
    plugins.push({
      name: 'lakh-mock-api',
      async configureServer(server) {
        const { mockMiddleware } = await import('./dev/mock-api.js');
        server.middlewares.use(mockMiddleware);
      }
    });
  }
  return {
    plugins,
    server: mode === 'mock' ? {} : { proxy: { '/api': process.env.API_PROXY || 'http://localhost:3000' } }
  };
});
