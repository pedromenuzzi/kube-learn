import { gzipSync } from 'node:zlib';
import { defineConfig } from 'vite';

// O orçamento da página inicial: o chunk de entrada, comprimido com gzip, não passa deste teto. Sem medir, ela foi de
// 122 para 157 kB e ninguém viu. Para ver a falha: ORCAMENTO_KB=100 npm run build.
const ORCAMENTO_KB = Number(process.env.ORCAMENTO_KB) || 165;

const orcamento = {
  name: 'orcamento-da-entrada',
  apply: 'build',
  writeBundle(_, pacote) {
    const entrada = Object.values(pacote).find((p) => p.type === 'chunk' && p.isEntry);
    const kb = gzipSync(entrada.code).length / 1000;
    const resumo = `${entrada.fileName}: ${kb.toFixed(1)} kB com gzip, orçamento de ${ORCAMENTO_KB} kB`;
    if (kb > ORCAMENTO_KB) throw new Error(`A entrada passou do orçamento (${resumo}). Mova o que a home não usa para um import dinâmico.`);
    console.log(`orçamento da entrada: ${resumo}`);
  },
};

export default defineConfig({
  // Caminhos relativos: o site funciona em /kube-learn/ no GitHub Pages e na raiz no dev.
  base: './',
  plugins: [orcamento],
  // O aviso de pedaço grande (tamanho sem gzip) em 1 MB: o maior hoje é o da tela do exercício, com o simulador e o
  // editor (cerca de 970 kB). Com o padrão (500 kB), ele aparecia em todo build e ninguém lia mais.
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
    // No máximo 4 processos fora do CI: com um por núcleo (11 numa máquina de 12), os trilha-N, que simulam minutos de
    // cluster cada um, comiam a memória e travavam o computador de quem roda. No CI, o padrão do Vitest.
    maxWorkers: process.env.CI ? undefined : 4,
    // Com a máquina cheia, um teste de 0,5 s já levou 6 s.
    testTimeout: 30_000,
  },
});
