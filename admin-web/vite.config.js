import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/order-web/',
  plugins: [vue()],
  server: {
    host: true,
    proxy: {
      '/order-api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/order-api/, '')
      }
    }
  },
  preview: {
    proxy: {
      '/order-api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/order-api/, '')
      }
    }
  }
})
