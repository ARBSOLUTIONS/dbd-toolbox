import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development (npm run dev) the app runs on http://localhost:5173
// and forwards data requests to the local server on port 3001.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/icons': 'http://localhost:3001',
    },
  },
});
