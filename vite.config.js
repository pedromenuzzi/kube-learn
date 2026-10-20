import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o site funciona em /kube-learn/ no GitHub Pages e na raiz no dev.
  base: './',
  build: { target: 'es2022' },
  test: { environment: 'happy-dom', include: ['tests/**/*.test.js'] },
});
