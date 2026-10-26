import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173
  },
  test: {
    globals: true,
    include: ['src/**/*.test.js', '../cloudfunctions/**/*.test.js'],
    environmentMatchGlobs: [
      ['../cloudfunctions/**', 'node'],
      ['src/**', 'jsdom']
    ]
  }
})
