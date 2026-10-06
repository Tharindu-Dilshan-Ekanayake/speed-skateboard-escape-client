import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any host/sub-path (Bloxity zip hosting).
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 4000,
  },
})
