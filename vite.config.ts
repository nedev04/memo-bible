import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' — чтобы сборка работала на любом статическом хостинге (GitHub Pages и т.п.)
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // новая версия подхватывается сама при следующем открытии
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Наизусть',
        short_name: 'Наизусть',
        description: 'Заучивание текстов наизусть с интервальными повторениями',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        theme_color: '#14323a',
        background_color: '#f1f4ef',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})
