/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/moja-cesta/',
  build: { rollupOptions: { input: { app: 'index.html', map: 'map.html' } } },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
})
