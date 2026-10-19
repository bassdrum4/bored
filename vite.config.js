import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const previewHost = 'pv-8f4b3344440b-673c2c53-80ac-46c9-a4dc-c07b7ecb4f05.style.dev';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [viteSingleFile()],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: [previewHost] },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: [previewHost] },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000,
    cssCodeSplit: false
  }
});
