import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/press-start-2p/400.css';
import { resolverRota } from './rotas.js';
import { acharItem, PLAYGROUND } from './conteudo/index.js';
import { paginaInicio, paginaTrilha, paginaGlossario } from './ui/paginas.js';
import { aplicarPreferencias, montarPreferencias } from './ui/preferencias.js';
import { montarLeitura } from './ui/leitura.js';
import { paginaRevisao } from './ui/revisao.js';
import { paginaCertificado, paginaPrivacidade } from './ui/certificado.js';
import { montarTopo, atualizarTopo } from './ui/topo.js';

aplicarPreferencias();
montarTopo(document.querySelector('.topo'));

// Cada página devolve HTML (texto) ou uma função que monta a página e devolve { destruir? }.
const PAGINAS = {
  '/': paginaInicio,
  '/trilha': paginaTrilha,
  '/ex': (id) => {
    const item = acharItem(id);
    if (!item) return '<h1>Missão não encontrada</h1><p><a href="#/trilha">Ver a trilha</a></p>';
    if (item.tipo === 'quiz' || (item.tipo === 'licao' && !item.inicial)) return (main) => montarLeitura(main, item);
    return (main) => montarTela(main, item);
  },
  '/livre': () => (main) => montarTela(main, PLAYGROUND),
  '/glossario': paginaGlossario,
  '/revisao': paginaRevisao,
  '/certificado': paginaCertificado,
  '/privacidade': paginaPrivacidade,
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
  const leitura = rota?.caminho === '/ex' && ['quiz', 'licao'].includes(acharItem(rota.parametro)?.tipo) && !acharItem(rota.parametro)?.inicial;
  main.classList.toggle('largo', !leitura && ['/ex', '/livre', '/trilha', '/'].includes(rota?.caminho));
  main.classList.toggle('medio', rota?.caminho === '/glossario');
  if (typeof conteudo === 'function') {
    main.replaceChildren();
    paginaAtual = conteudo(main);
  } else {
    main.innerHTML = conteudo;
  }
  document.title = `${rota ? (rota.caminho === '/ex' ? acharItem(rota.parametro)?.titulo ?? rota.titulo : rota.titulo) : 'Página não encontrada'} · kube-learn`;
  atualizarTopo(rota?.caminho);
  // Cada página entra com um fade curto (o CSS desliga com "reduzir movimento").
  main.classList.remove('entrando');
  void main.offsetWidth;
  main.classList.add('entrando');
  // Ao trocar de página, o foco vai para o conteúdo (o leitor de tela anuncia o novo título).
  if (document.activeElement !== document.body) main.focus();
}

// Trocar o tema redesenha o navio (ele usa as cores do tema); a tela do exercício não é recriada.
montarPreferencias(document.getElementById('botao-preferencias'), () => {
  if (['/', '/trilha'].includes(resolverRota(location.hash)?.caminho ?? '/')) desenhar();
});
window.addEventListener('hashchange', desenhar);
window.addEventListener('kube-learn:progresso', () => atualizarTopo(resolverRota(location.hash)?.caminho));
desenhar();
