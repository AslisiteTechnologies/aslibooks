import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules/')) return;
          if (id.includes('/@mui/icons-material/')) return 'mui-icons';
          if (id.includes('/@mui/material/')) return 'mui-material';
          if (id.includes('/@emotion/')) return 'emotion';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-vendor';
        },
      },
    },
  },
});
