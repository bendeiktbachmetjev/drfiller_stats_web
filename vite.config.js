import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev with the mock API: `npm run dev:mock` + `VITE_API_URL= npm run dev` (empty URL = same origin → proxy).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api/admin': 'http://localhost:8323' },
  },
  build: { target: 'es2022', sourcemap: false },
});
