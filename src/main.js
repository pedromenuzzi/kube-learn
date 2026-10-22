import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/press-start-2p/400.css';
import { resolverRota } from './rotas.js';
import { acharItem, PLAYGROUND } from './conteudo/index.js';
import { paginaInicio, paginaTrilha, paginaGlossario, paginaTroubleshooting } from './ui/paginas.js';
import { aplicarPreferencias, montarPreferencias } from './ui/preferencias.js';
import { montarLeitura } from './ui/leitura.js';
import { paginaRevisao } from './ui/revisao.js';
import { paginaCertificado, paginaPrivacidade } from './ui/certificado.js';
import { montarTopo, atualizarTopo, montarRodape } from './ui/topo.js';
import { icone } from './ui/icones.js';
import { definirIdioma, idioma, idiomaInicial, t } from './i18n.js';

aplicarPreferencias();

/** O endereço que não leva a lugar nenhum (página ou missão). */
const naoEncontrada = (missao) => `
  <section class="nao-encontrada">
    <p class="sobretitulo">${t('Erro 404')}</p>
    <h1 class="pixel">${missao ? t('Missão não encontrada') : t('Página não encontrada')}</h1>
    <p>${t('Este endereço não leva a lugar nenhum: o link pode estar errado, ou o conteúdo mudou de nome.')}</p>
    <p class="acoes"><a class="botao" href="#/trilha">${icone('trilha')} ${t('Ver a trilha')}</a> <a class="link-seta" href="#/">${t('Ir para o início')} ${icone('seguir')}</a></p>
  </section>`;

// Cada página devolve HTML (texto) ou uma função que monta a página e devolve { destruir? }.
const PAGINAS = {
  '/': paginaInicio,
  '/trilha': paginaTrilha,
  '/ex': (id, opcoes) => {
    const item = acharItem(id);
    if (!item) return naoEncontrada(true);
    if (item.tipo === 'quiz' || (item.tipo === 'licao' && !item.inicial)) return (main) => montarLeitura(main, item);
    return (main) => montarTela(main, item, opcoes);
  },
  '/livre': (_, opcoes) => (main) => montarTela(main, PLAYGROUND, opcoes),
  '/troubleshooting': paginaTroubleshooting,
  '/glossario': paginaGlossario,
  '/revisao': paginaRevisao,
  '/certificado': paginaCertificado,
  '/privacidade': paginaPrivacidade,
};

/**
 * Depois de um deploy, os arquivos antigos (com o hash no nome) somem do servidor: a aba aberta recarrega uma vez, em vez
 * de ficar em "Montando o cluster…" para sempre. A marca na sessão evita recarregar em loop.
 */
function recarregarUmaVez() {
  try {
    if (Date.now() - Number(sessionStorage.getItem('kube-learn:recarregou') ?? 0) < 60_000) return;
    sessionStorage.setItem('kube-learn:recarregou', String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  location.reload();
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  recarregarUmaVez();
});

let paginaAtual = null;
let geracao = 0; // cada desenho é uma geração: o que chega atrasado de uma geração velha não entra na tela
let primeiroDesenho = true;

// A tela do exercício (com o editor e o simulador) só é baixada quando alguém abre uma missão.
// `opcoes.manter`: a mesma missão de novo (troca de idioma), com o cluster como estava.
const montarTela = (main, item, opcoes) => {
  const minha = geracao;
  main.innerHTML = `<p class="nota carregando" role="status">${t('Montando o cluster…')}</p>`;
  // Um quadro antes de montar: montar o cluster segura a tela por um instante, e o "Montando o cluster…" aparece antes.
  const umQuadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  return import('./ui/exercicio.js').then(
    async (m) => {
      await umQuadro();
      return minha === geracao ? m.montarExercicio(main, item, opcoes) : null; // o aluno já saiu para outra página
    },
    recarregarUmaVez,
  );
};

function desenhar(opcoes = {}) {
  const main = document.getElementById('conteudo');
  geracao += 1;
  // Página nova começa no topo (a trilha rola até o nível atual depois); a troca de idioma fica onde está.
  if (!opcoes.manter && !primeiroDesenho) window.scrollTo({ top: 0, behavior: 'instant' });
  Promise.resolve(paginaAtual).then((p) => p?.destruir?.());
  paginaAtual = null;
  const rota = resolverRota(location.hash);
  const conteudo = rota ? PAGINAS[rota.caminho](rota.parametro, opcoes) : naoEncontrada(false);
  const leitura = rota?.caminho === '/ex' && ['quiz', 'licao'].includes(acharItem(rota.parametro)?.tipo) && !acharItem(rota.parametro)?.inicial;
  main.classList.toggle('largo', !leitura && ['/ex', '/livre', '/trilha', '/'].includes(rota?.caminho));
  main.classList.toggle('medio', ['/glossario', '/troubleshooting'].includes(rota?.caminho));
  if (typeof conteudo === 'function') {
    main.replaceChildren();
    paginaAtual = conteudo(main);
  } else {
    main.innerHTML = conteudo;
  }
  document.title = `${rota ? (rota.caminho === '/ex' ? acharItem(rota.parametro)?.titulo ?? t(rota.titulo) : t(rota.titulo)) : t('Página não encontrada')} · kube-learn`;
  atualizarTopo(rota?.caminho);
  // Cada página entra com um fade curto (o CSS desliga com "reduzir movimento").
  main.classList.remove('entrando');
  void main.offsetWidth;
  main.classList.add('entrando');
  // Ao trocar de página, o foco vai para o conteúdo (o leitor de tela anuncia o novo título). Na primeira, não: quem
  // chega pelo link fica no começo da página, com o "pular para o conteúdo".
  if (!primeiroDesenho) main.focus({ preventScroll: true });
  primeiroDesenho = false;
}

// O topo, o rodapé e o diálogo das preferências (montados de novo quando o idioma muda).
const topo = document.querySelector('.topo');
function montarMoldura() {
  montarTopo(topo);
  montarRodape();
  document.querySelector('dialog.preferencias')?.remove();
  // Trocar o tema redesenha o navio (ele usa as cores do tema); a tela do exercício não é recriada.
  montarPreferencias(document.getElementById('botao-preferencias'), () => {
    if (['/', '/trilha'].includes(resolverRota(location.hash)?.caminho ?? '/')) desenhar();
  });
}

// O botão PT | EN do topo: troca o idioma na hora, em qualquer tela (a missão aberta continua com o mesmo cluster).
topo.addEventListener('click', async (e) => {
  const novo = e.target.closest('[data-idioma]')?.dataset.idioma;
  if (!novo || novo === idioma()) return;
  try {
    await definirIdioma(novo);
  } catch {
    recarregarUmaVez(); // o pacote do inglês sumiu num deploy
    return;
  }
  montarMoldura();
  desenhar({ manter: true });
  topo.querySelector(`[data-idioma="${novo}"]`)?.focus();
});

function iniciar() {
  montarMoldura();
  window.addEventListener('hashchange', () => desenhar());
  (window.requestIdleCallback ?? setTimeout)(() => import('./ui/exercicio.js').catch(() => {})); // só adianta: se falhar, a missão tenta de novo
  window.addEventListener('kube-learn:progresso', () => atualizarTopo(resolverRota(location.hash)?.caminho));
  desenhar();
}

// Em inglês, o texto é baixado antes de desenhar a primeira tela (se falhar, segue em português).
if (idiomaInicial() === 'en') definirIdioma('en', { salvar: false }).then(iniciar, iniciar);
else iniciar();
