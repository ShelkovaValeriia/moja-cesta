/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === 'github-pages' ? '/moja-cesta/' : '/',
  build: { rollupOptions: { input: { app: 'index.html', map: 'map.html' } } },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
}))
