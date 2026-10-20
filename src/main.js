import { resolverRota } from './rotas.js';
import { ITENS, acharItem, PLAYGROUND } from './conteudo/index.js';
import { XP } from './conteudo/util.js';
import { ler, CHAVES } from './armazenamento.js';
import { escapar } from './ui/util.js';

// Cada página devolve HTML (texto) ou uma função que monta a página e devolve { destruir }.
const PAGINAS = {
  '/': () => `
    <h1>Aprenda Kubernetes andar por andar</h1>
    <p>Um cluster simulado no navegador, <code>kubectl</code> de verdade e comparações com a vida real.
       Cada nível concluído ergue mais um andar do seu prédio, até virar arranha-céu.</p>
    <p class="obra">🚧 Em obra. A trilha completa abre na versão 0.1; já dá para experimentar as missões de exemplo.</p>
    <p><a class="botao" href="#/trilha">Ver as missões</a> <a href="#/livre">ou abrir o playground</a></p>`,
  '/trilha': () => {
    const progresso = ler(CHAVES.progresso, {});
    const marca = { resolvido: '✅', tentado: '🟡' };
    return `
      <h1>Missões de exemplo</h1>
      <p class="obra">🚧 O prédio da trilha chega na Fase 3. Por enquanto, as missões de exemplo:</p>
      <ul class="lista-missoes">${ITENS.map((i) => `
        <li><a href="#/ex/${i.id}">${marca[progresso[i.id]?.status] ?? '⬜'} ${escapar(i.titulo)}</a>
          <span class="selo">${XP[i.dificuldade] ?? XP[i.tipo]} XP</span></li>`).join('')}
      </ul>
      <p><a href="#/livre">🧪 Playground livre</a>: um cluster só seu, sem testes.</p>`;
  },
  '/ex': (id) => {
    const item = acharItem(id);
    if (!item) return '<h1>Missão não encontrada</h1><p><a href="#/trilha">Ver as missões</a></p>';
    return (main) => montarTela(main, item);
  },
  '/livre': () => (main) => montarTela(main, PLAYGROUND),
  '/glossario': () => emObra('O glossário', 'Fase 3'),
  '/revisao': () => emObra('A revisão do dia', 'Fase 5'),
};

function emObra(oque, fase) {
  return `<h1>🚧 Em obra</h1><p>${oque} chega na ${fase}.</p><p><a href="#/">Voltar ao início</a></p>`;
}

// A tela do exercício (com o editor e o simulador) só é baixada quando alguém abre uma missão.
const montarTela = (main, item) => import('./ui/exercicio.js').then((m) => m.montarExercicio(main, item));

let paginaAtual = null;

function desenhar() {
  const main = document.getElementById('conteudo');
  Promise.resolve(paginaAtual).then((p) => p?.destruir?.());
  paginaAtual = null;
  const rota = resolverRota(location.hash);
  const conteudo = rota ? PAGINAS[rota.caminho](rota.parametro) : '<h1>Página não encontrada</h1><p><a href="#/">Voltar ao início</a></p>';
  main.classList.toggle('largo', typeof conteudo === 'function');
  if (typeof conteudo === 'function') {
    main.replaceChildren();
    paginaAtual = conteudo(main);
  } else {
    main.innerHTML = conteudo;
  }
  document.title = `${rota ? (rota.caminho === '/ex' ? acharItem(rota.parametro)?.titulo ?? rota.titulo : rota.titulo) : 'Página não encontrada'} · kube-learn`;
  // Ao trocar de página, o foco vai para o conteúdo (o leitor de tela anuncia o novo título).
  if (document.activeElement !== document.body) main.focus();
}

window.addEventListener('hashchange', desenhar);
desenhar();
