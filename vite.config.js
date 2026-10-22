import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o site funciona em /kube-learn/ no GitHub Pages e na raiz no dev.
  base: './',
  build: { target: 'es2022' },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
    // Os arquivos rodam em paralelo (um worker por núcleo, menos um): com a máquina cheia, um teste de 0,5 s já levou
    // 6 s. E as missões da trilha simulam minutos de cluster (com carga).
    testTimeout: 30_000,
  },
});
