import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev with the mock API: `npm run dev:mock` + `VITE_API_URL= npm run dev` (empty URL = same origin → proxy).
// Two setups side by side: `MOCK_PORT=8333 npm run dev:mock` + `MOCK_PORT=8333 VITE_API_URL= npm run dev -- --port 5183`.
const mockPort = Number(process.env.MOCK_PORT) || 8323;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api/admin': `http://localhost:${mockPort}` },
  },
  build: { target: 'es2022', sourcemap: false },
});
