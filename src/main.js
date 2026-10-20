import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/press-start-2p/400.css';
import { resolverRota } from './rotas.js';
import { acharItem, PLAYGROUND } from './conteudo/index.js';
import { paginaInicio, paginaTrilha, paginaGlossario } from './ui/paginas.js';
import { aplicarPreferencias, montarPreferencias } from './ui/preferencias.js';

aplicarPreferencias();

// Cada página devolve HTML (texto) ou uma função que monta a página e devolve { destruir? }.
const PAGINAS = {
  '/': paginaInicio,
  '/trilha': paginaTrilha,
  '/ex': (id) => {
    const item = acharItem(id);
    if (!item) return '<h1>Missão não encontrada</h1><p><a href="#/trilha">Ver o prédio</a></p>';
    return (main) => montarTela(main, item);
  },
  '/livre': () => (main) => montarTela(main, PLAYGROUND),
  '/glossario': paginaGlossario,
  '/revisao': () => '<h1>🚧 Em obra</h1><p>A revisão do dia chega na Fase 5.</p><p><a href="#/">Voltar ao início</a></p>',
};

// A tela do exercício (com o editor e o simulador) só é baixada quando alguém abre uma missão.
const montarTela = (main, item) => import('./ui/exercicio.js').then((m) => m.montarExercicio(main, item));

let paginaAtual = null;

function desenhar() {
  const main = document.getElementById('conteudo');
  Promise.resolve(paginaAtual).then((p) => p?.destruir?.());
  paginaAtual = null;
  const rota = resolverRota(location.hash);
  const conteudo = rota ? PAGINAS[rota.caminho](rota.parametro) : '<h1>Página não encontrada</h1><p><a href="#/">Voltar ao início</a></p>';
  main.classList.toggle('largo', ['/ex', '/livre', '/trilha', '/'].includes(rota?.caminho));
  if (typeof conteudo === 'function') {
    main.replaceChildren();
    paginaAtual = conteudo(main);
  } else {
    main.innerHTML = conteudo;
  }
  document.title = `${rota ? (rota.caminho === '/ex' ? acharItem(rota.parametro)?.titulo ?? rota.titulo : rota.titulo) : 'Página não encontrada'} · kube-learn`;
  for (const a of document.querySelectorAll('.topo nav a')) {
    if (a.getAttribute('href') === `#${rota?.caminho}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  // Ao trocar de página, o foco vai para o conteúdo (o leitor de tela anuncia o novo título).
  if (document.activeElement !== document.body) main.focus();
}

// Trocar o tema redesenha o prédio (ele usa as cores do tema); a tela do exercício não é recriada.
montarPreferencias(document.getElementById('botao-preferencias'), () => {
  if (['/', '/trilha'].includes(resolverRota(location.hash)?.caminho ?? '/')) desenhar();
});
window.addEventListener('hashchange', desenhar);
desenhar();
