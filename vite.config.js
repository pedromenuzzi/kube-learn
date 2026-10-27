import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { defineConfig } from 'vite';

// O orçamento da página inicial: o JavaScript que ela baixa antes de desenhar (o chunk de entrada e os que ele importa sem
// import()), comprimido com gzip, não passa deste teto. Sem medir, ela foi de 122 para 164 kB e ninguém viu; com o índice
// leve e as páginas por import() (sprint 2), caiu para 34,2 kB. O teto é o medido + 5 kB: o que crescer além disso tem
// de ir para um import(). Para ver a falha: ORCAMENTO_KB=30 npm run build.
const ORCAMENTO_KB = Number(process.env.ORCAMENTO_KB) || 39.2;

const orcamento = {
  name: 'orcamento-da-entrada',
  apply: 'build',
  writeBundle(_, pacote) {
    const entrada = Object.values(pacote).find((p) => p.type === 'chunk' && p.isEntry);
    const estaticos = new Set([entrada.fileName]);
    for (const nome of estaticos) for (const i of pacote[nome].imports) estaticos.add(i);
    const kb = [...estaticos].reduce((soma, nome) => soma + gzipSync(pacote[nome].code).length, 0) / 1000;
    const resumo = `${[...estaticos].join(' + ')}: ${kb.toFixed(1)} kB com gzip, orçamento de ${ORCAMENTO_KB} kB`;
    if (kb > ORCAMENTO_KB) throw new Error(`A entrada passou do orçamento (${resumo}). Mova o que a home não usa para um import dinâmico.`);
    console.log(`orçamento da entrada: ${resumo}`);
  },
};

// O índice leve do conteúdo (src/conteudo/indice.js), tirado do próprio conteúdo por src/conteudo/resumo.js: ninguém o
// escreve à mão. No build, o conteúdo roda aqui no Node e só o resumo (um JSON) vai para a página inicial; no dev e nos
// testes, o resumo é feito na hora, no navegador (e acompanha cada arquivo editado).
const INDICE = 'virtual:indice-do-conteudo';
let raiz = process.cwd();
let noBuild = false;
const indice = {
  name: 'indice-do-conteudo',
  configResolved(c) {
    raiz = c.root;
    noBuild = c.command === 'build';
  },
  resolveId: (id) => (id === INDICE ? `\0${INDICE}` : null),
  async load(id) {
    if (id !== `\0${INDICE}`) return null;
    const src = (f) => join(raiz, 'src/conteudo', f);
    if (!noBuild) {
      return `import * as conteudo from ${JSON.stringify(src('index.js'))};
import { resumoDoConteudo } from ${JSON.stringify(src('resumo.js'))};
export default resumoDoConteudo(conteudo);`;
    }
    const importar = (f) => import(pathToFileURL(src(f)).href);
    const [conteudo, { resumoDoConteudo }] = await Promise.all([importar('index.js'), importar('resumo.js')]);
    return `export default ${JSON.stringify(resumoDoConteudo(conteudo))};`;
  },
};

export default defineConfig({
  // Caminhos relativos: o site funciona em /kube-learn/ no GitHub Pages e na raiz no dev.
  base: './',
  plugins: [indice, orcamento],
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
