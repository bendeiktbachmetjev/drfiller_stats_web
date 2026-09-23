import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev with the mock API: `npm run dev:mock` + `VITE_API_URL= npm run dev` (empty URL = same origin → proxy).
// Two setups side by side: `MOCK_PORT=8333 npm run dev:mock` + `MOCK_PORT=8333 VITE_API_URL= npm run dev -- --port 5183`.
const mockPort = Number(process.env.MOCK_PORT) || 8323;

// Vendor chunks keep their file names across deploys (the browser keeps them cached) and keep the app
// entry small: React in one chunk, the chart library and its helpers in another.
const REACT = /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//;
const CHARTS = /node_modules\/(recharts|d3-[a-z-]+|victory-vendor|decimal\.js-light|es-toolkit|@reduxjs|immer|reselect|redux|redux-thunk|react-redux|eventemitter3|tiny-invariant|clsx|use-sync-external-store)\//;

/** @param {string} id module path */
const vendorChunk = (id) => {
  if (REACT.test(id)) return 'react';
  if (CHARTS.test(id)) return 'charts';
  return undefined;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api/admin': `http://localhost:${mockPort}` },
  },
  build: { target: 'es2022', sourcemap: false, rollupOptions: { output: { manualChunks: vendorChunk } } },
});
