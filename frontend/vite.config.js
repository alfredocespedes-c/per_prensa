import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // v2: autoalojado en el propio servidor (docker-compose), detrás de un reverse
  // proxy ya existente — se sirve en la raíz. BASE_PATH sigue disponible como
  // override si algún despliegue lo necesita bajo un subpath.
  base: (() => {
    if (process.env.BASE_PATH) return process.env.BASE_PATH
    if (process.env.NODE_ENV === 'development') return '/'
    return '/'
  })(),
  server: {
    proxy: {
      // Dev: `npm run dev` habla con un backend local o el de docker-compose sin CORS.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
  },
})
