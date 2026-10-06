import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any host/sub-path (Bloxity zip hosting).
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // One 4 MB file downloads on a single connection and has to be fully
        // re-downloaded after every deploy. Splitting the big libraries lets the
        // browser fetch them in parallel, and they stay cached between deploys
        // because only the (small) game chunk changes.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('rapier')) return 'physics'
          if (id.includes('colyseus') || id.includes('msgpackr')) return 'net'
          if (id.includes('troika') || id.includes('three-mesh-bvh') || id.includes('webgl-sdf')) return 'text'
          if (id.includes('/three/') || id.includes('three-stdlib') || id.includes('@react-three') || id.includes('meshline')) return 'three'
          if (id.includes('react') || id.includes('scheduler') || id.includes('zustand')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
