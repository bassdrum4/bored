import { defineConfig } from 'vite';

// src/ is the site root here for the same reason it is the site root on GitHub
// Pages: the deployed tree and the addressed tree are the same one. The dev
// server only serves that folder; nothing is bundled or published.
const previewHost = 'pv-8f4b3344440b-673c2c53-80ac-46c9-a4dc-c07b7ecb4f05.style.dev';

export default defineConfig({
  root: 'src',
  base: './',
  server: { host: '0.0.0.0', port: 3000, allowedHosts: [previewHost] }
});
