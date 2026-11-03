import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/')

          if (
            moduleId.includes('/node_modules/react/') ||
            moduleId.includes('/node_modules/react-dom/') ||
            moduleId.includes('/node_modules/react-router/') ||
            moduleId.includes('/node_modules/react-router-dom/') ||
            moduleId.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (moduleId.includes('/node_modules/@supabase/')) {
            return 'vendor-supabase'
          }

          if (
            moduleId.includes('/node_modules/i18next/') ||
            moduleId.includes('/node_modules/react-i18next/')
          ) {
            return 'vendor-i18n'
          }
        }
      }
    }
  },
  server: {
    open: true
  }
})