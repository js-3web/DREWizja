/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH: na GitHub Pages aplikacja leży pod /DREWizja/, lokalnie pod /.
// Ustawiane w workflow .github/workflows/deploy.yml.
const base = process.env.BASE_PATH ?? '/'

// Numer wersji widoczny w aplikacji: data budowania + skrót commita (GITHUB_SHA ustawia GitHub Actions).
// Dzięki temu łatwo sprawdzić, czy telefon ma już najnowszą wersję.
const buildDate = new Date().toISOString().slice(0, 16).replace('T', ' ')
const appVersion = `${buildDate} UTC${process.env.GITHUB_SHA ? ' · ' + process.env.GITHUB_SHA.slice(0, 7) : ' · lokalna'}`

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    // PWA: manifest (instalacja na ekranie początkowym) + service worker (praca offline).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'DREWizja',
        short_name: 'DREWizja',
        description: 'Szkic → model 3D zabudowy meblowej',
        lang: 'pl',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#eef0f3',
        theme_color: '#2b2118',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Bundle z Three.js ma > 2 MB — podnosimy limit, żeby trafił do cache offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
