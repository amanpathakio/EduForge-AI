import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/health': 'http://127.0.0.1:8010',
      '/documents': 'http://127.0.0.1:8010',
      '/chat': 'http://127.0.0.1:8010',
      '/courses': 'http://127.0.0.1:8010',
      '/lectures': 'http://127.0.0.1:8010',
    },
  },
})
