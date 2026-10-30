/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps every asset path relative, so the same build works on
// GitHub Pages under /<repo>/ and from a local preview.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  // The content check globs model files (src/content/registry.test.ts): a cached transform would
  // not see a file `npm run new` has just written, so modules are transformed fresh every run.
  test: { fsModuleCache: false },
  plugins: [
    VitePWA({
      // 'prompt': a new version waits and is applied on the start screen, never mid-game.
      registerType: 'prompt',
      includeAssets: ['icons/icon-64.png', 'icons/icon-180.png'],
      manifest: {
        name: 'Льошині казки',
        short_name: 'Казки',
        lang: 'uk',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '.',
        scope: '.',
        background_color: '#87c5f0',
        theme_color: '#4caf50',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,mp3,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
