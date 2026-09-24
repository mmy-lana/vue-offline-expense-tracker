import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: {
        image: 'public/icon.svg',
        preset: 'minimal-2023'
      },
      manifest: {
        name: 'Vue Offline Expense Tracker',
        short_name: 'Expenses',
        description: 'Offline-First Personal Finance Tracker and Budget Engine',
        theme_color: '#0F172A',
        background_color: '#090D16',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
