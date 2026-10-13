import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

const base = process.env.BASE_PATH || './';
const supabase = new URL(
  process.env.VITE_SUPABASE_URL || 'https://pygedyytlcplfweibenv.supabase.co',
);
const ocrCdn = 'https://cdn.jsdelivr.net';
/**
 * O GitHub Pages não permite cabeçalhos HTTP, então a política de segurança
 * vai na própria página: só carrega código do app, fala só com o Supabase do
 * projeto e com a CDN do OCR, e não pode ser embutida em outros sites.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' blob: ${ocrCdn}`,
  `worker-src 'self' blob: ${ocrCdn}`,
  `connect-src 'self' data: blob: ${supabase.origin} wss://${supabase.host} ${ocrCdn}`,
  `img-src 'self' data: blob: ${supabase.origin}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
function securityPolicy(): Plugin {
  return {
    name: 'scanlog-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
      ),
  };
}
export default defineConfig({
  base,
  plugins: [
    react(),
    securityPolicy(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'logo.svg', 'wordmark.svg', 'icons/*.png'],
      manifest: {
        name: 'ScanLog',
        short_name: 'ScanLog',
        description: 'Levantamento local de produtos e endereços.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1f0036',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // OCR engine and Portuguese model, fetched only when description
        // reading is enabled, stay available offline after the first use.
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract|@tesseract)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('/exceljs/') ? 'excel' : undefined,
      },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
