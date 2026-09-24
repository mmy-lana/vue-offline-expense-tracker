import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    VitePWA({
      // `prompt` hands update control to `usePwaManager` so a reload is never
      // forced while the user is entering a transaction.
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
        start_url: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // Filename emitted by the `minimal-2023` pwaAssets preset.
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true
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
