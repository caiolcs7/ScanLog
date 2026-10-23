import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

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
/** O Painel de Materiais não é o app instalável: sem link para o manifesto. */
function painelSemManifesto(): Plugin {
  return {
    name: 'scanlog-painel-sem-manifesto',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) =>
        ctx.path.includes('/painel/')
          ? html.replace(/\s*<link rel="manifest"[^>]*>/, '')
          : html,
    },
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
        // O Painel de Materiais é uma página à parte, sempre da rede: fica
        // fora do cache do app e da página de reserva offline.
        globIgnores: ['painel/**', 'assets/painel*', 'assets/big-shoulders*'],
        navigateFallbackDenylist: [/\/painel(\/|$)/],
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
    painelSemManifesto(),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        painel: fileURLToPath(new URL('painel/index.html', import.meta.url)),
      },
      output: {
        manualChunks: (id: string) =>
          id.includes('/exceljs/')
            ? 'excel'
            : id.includes('/node_modules/three/')
              ? 'painel-3d'
              : id.includes('/src/painel/ruas.json')
                ? 'painel-ruas'
                : undefined,
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
