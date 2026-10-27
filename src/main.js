import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/press-start-2p/400.css';
import { resolverRota } from './rotas.js';
import { itemDoIndice, NIVEIS } from './conteudo/indice.js';
import { conquistasMigradas } from './jogo/gamificacao.js';
import { ler, gravar, CHAVES } from './armazenamento.js';
import { paginaInicio, paginaTrilha, paginaGlossario, paginaTroubleshooting, paginaOficina, paginaPlantao, paginaDiario } from './ui/paginas.js';
import { aplicarPreferencias, montarPreferencias } from './ui/preferencias.js';
import { paginaCertificado, paginaPrivacidade } from './ui/certificado.js';
import { montarTopo, atualizarTopo, montarRodape } from './ui/topo.js';
import { icone } from './ui/icones.js';
import { escapar } from './ui/util.js';
import { definirIdioma, idioma, idiomaInicial, t } from './i18n.js';

aplicarPreferencias();

// Quem chegou antes das conquistas serem guardadas: os níveis a 100% e o navio cheio ganham o lacre agora, sem festa
// (missão nova que chegar depois não tira). Idempotente: sem nada a acrescentar, não grava.
const migradas = conquistasMigradas(NIVEIS, ler(CHAVES.progresso, {}), ler(CHAVES.conquistas, {}));
if (migradas) gravar(CHAVES.conquistas, migradas);

/** O endereço que não leva a lugar nenhum (página ou missão). */
const naoEncontrada = (missao) => `
  <section class="nao-encontrada">
    <p class="sobretitulo">${t('Erro 404')}</p>
    <h1 class="pixel">${missao ? t('Missão não encontrada') : t('Página não encontrada')}</h1>
    <p>${t('Este endereço não leva a lugar nenhum: o link pode estar errado, ou o conteúdo mudou de nome.')}</p>
    <p class="acoes"><a class="botao" href="#/trilha">${icone('trilha')} ${t('Ver a trilha')}</a> <a class="link-seta" href="#/">${t('Ir para o início')} ${icone('seguir')}</a></p>
  </section>`;

/**
 * A página que desenhou com erro: em vez da página anterior com o endereço novo (ou de uma tela branca), o aviso com o
 * caminho para contar (o Feedback abre uma issue já preenchida), para o início e para os dados (lá dá para apagar tudo).
 */
const algoQuebrou = (erro) => {
  const relato = `${t('Endereço')}: ${location.href}\n\n\`\`\`\n${`${erro?.message ?? erro}\n${erro?.stack ?? ''}`.slice(0, 1500)}\n\`\`\``;
  const issue = `https://github.com/pedromenuzzi/kube-learn/issues/new?${new URLSearchParams({ template: 'feedback.yml', title: `[feedback] ${t('Algo quebrou aqui')}: ${location.hash || '#/'}`, relato })}`;
  return `
  <section class="nao-encontrada">
    <p class="sobretitulo">${t('Erro')}</p>
    <h1 class="pixel">${t('Algo quebrou aqui.')}</h1>
    <p>${t('Isso é um defeito nosso, não seu. O que você guardou neste navegador continua lá.')}</p>
    <p class="acoes"><a class="botao" href="${escapar(issue)}" target="_blank" rel="noopener">${icone('balao')} ${t('Contar no Feedback')}</a>
      <a class="link-seta" href="#/">${t('Ir para o início')} ${icone('seguir')}</a>
      <a class="link-seta" href="#/privacidade">${t('Ver ou apagar seus dados')} ${icone('seguir')}</a></p>
  </section>`;
};

/**
 * Depois de um deploy, os arquivos antigos (com o hash no nome) somem do servidor: a aba aberta recarrega uma vez. A marca
 * na sessão evita recarregar em loop.
 */
function recarregarUmaVez() {
  try {
    if (Date.now() - Number(sessionStorage.getItem('kube-learn:recarregou') ?? 0) < 60_000) return;
    sessionStorage.setItem('kube-learn:recarregou', String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  location.reload();
}

/** O topo que quebra não leva a página junto (a #/privacidade, com o "Apagar meus dados", sempre abre). */
function topoComCuidado(caminho) {
  try {
    atualizarTopo(caminho);
  } catch (erro) {
    console.error(erro);
  }
}

let paginaAtual = null;
let geracao = 0; // cada desenho é uma geração: o que chega atrasado de uma geração velha não entra na tela
let primeiroDesenho = true;

// A tela do exercício (com o editor e o simulador) só é baixada quando alguém abre uma missão; em inglês, junto vêm as
// descrições do kubectl explain. `opcoes.manter`: a mesma missão de novo (troca de idioma), com o cluster como estava.
const telaDoExercicio = (item, opcoes) => import('./ui/exercicio.js').then(async (m) => {
  if (idioma() === 'en') await m.carregarEsquemaIngles().catch(() => {}); // sem elas, o explain sai com as nossas
  return (main) => {
    const minha = geracao;
    main.innerHTML = `<p class="nota carregando" role="status">${t('Montando o cluster…')}</p>`;
    // Um quadro antes de montar: montar o cluster segura a tela por um instante, e o "Montando o cluster…" aparece antes.
    return new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
      .then(() => (minha === geracao ? m.montarExercicio(main, item, opcoes) : null)); // o aluno já saiu para outra página
  };
});

// O conteúdo inteiro (o texto de todas as missões) só chega nas páginas que precisam dele.
const conteudo = () => import('./conteudo/index.js');

// Cada página devolve HTML (texto), uma função que monta a página e devolve { destruir? }, ou a promessa de um dos dois
// (a página que chega por import()). A página inicial, a trilha e a privacidade desenham na hora.
const PAGINAS = {
  '/': paginaInicio,
  '/trilha': paginaTrilha,
  '/ex': (id, opcoes) => conteudo().then(({ acharItem }) => {
    const item = acharItem(id);
    if (!item) return naoEncontrada(true);
    if (item.tipo === 'quiz' || (item.tipo === 'licao' && !item.inicial)) return import('./ui/leitura.js').then((m) => (main) => m.montarLeitura(main, item));
    return telaDoExercicio(item, opcoes);
  }),
  '/livre': (_, opcoes) => conteudo().then(({ PLAYGROUND }) => telaDoExercicio(PLAYGROUND, opcoes)),
  '/troubleshooting': paginaTroubleshooting,
  '/oficina': paginaOficina,
  '/plantao': paginaPlantao,
  '/diario': paginaDiario,
  '/glossario': paginaGlossario,
  '/revisao': (_, opcoes) => import('./ui/revisao.js').then((m) => m.paginaRevisao(_, opcoes)),
  '/certificado': paginaCertificado,
  '/privacidade': paginaPrivacidade,
};

/** Põe a página na tela. → o que ela devolveu ({ destruir? }, ou a promessa dele). */
function pintar(main, pagina) {
  if (typeof pagina !== 'function') {
    main.innerHTML = pagina;
    return null;
  }
  main.replaceChildren();
  return pagina(main);
}

/**
 * Uma parte do site não chegou (a rede caiu, ou um deploy trocou os arquivos): a página diz o que houve e tenta de novo
 * no botão, em vez de ficar em branco. Falhou de novo com a rede no ar? Era deploy: recarrega (uma vez).
 */
let falhas = 0;
// O que o Chromium, o Firefox, o Safari e o preload do Vite dizem quando um arquivo do site não chega.
const NAO_CHEGOU = /dynamically imported module|Importing a module script failed|preload|Failed to fetch/i;
function naoCarregou(main) {
  falhas += 1;
  if (falhas > 1 && navigator.onLine) recarregarUmaVez();
  main.innerHTML = `
    <section class="nao-encontrada" role="alert">
      <p class="sobretitulo">${t('Sem conexão?')}</p>
      <h1 class="pixel">${t('Esta página não carregou')}</h1>
      <p>${t('Uma parte do site não chegou até o seu navegador. Confira a conexão e tente de novo: o seu progresso continua guardado.')}</p>
      <p class="acoes"><button type="button" class="botao" data-acao="tentar">${icone('reiniciar')} ${t('Tentar de novo')}</button> <a class="link-seta" href="#/">${t('Ir para o início')} ${icone('seguir')}</a></p>
    </section>`;
  main.querySelector('[data-acao=tentar]').addEventListener('click', () => desenhar({ manter: true }));
}

function desenhar(opcoes = {}) {
  const main = document.getElementById('conteudo');
  geracao += 1;
  const minha = geracao;
  // Página nova começa no topo (a trilha rola até o nível atual depois); a troca de idioma fica onde está.
  if (!opcoes.manter && !primeiroDesenho) window.scrollTo({ top: 0, behavior: 'instant' });
  Promise.resolve(paginaAtual).then((p) => p?.destruir?.());
  paginaAtual = null;
  const rota = resolverRota(location.hash);
  const item = rota?.caminho === '/ex' ? itemDoIndice(rota.parametro) : null;
  // O título primeiro: ele bate com o endereço mesmo quando a página quebra.
  document.title = `${rota ? item?.titulo ?? t(rota.titulo) : t('Página não encontrada')} · kube-learn`;
  const quebrou = (erro) => {
    console.error(erro);
    main.classList.remove('largo', 'medio');
    main.innerHTML = algoQuebrou(erro);
  };
  // Pinta sem deixar a exceção escapar; a tela do exercício monta depois (uma promessa), e o erro de lá também vira a
  // página de erro, se o aluno ainda está nela.
  const pintarComCuidado = (p) => {
    try {
      const montada = pintar(main, p);
      return montada?.then ? montada.catch((erro) => (minha === geracao ? quebrou(erro) : null)) : montada;
    } catch (erro) {
      quebrou(erro);
      return null;
    }
  };
  try {
    topoComCuidado(rota?.caminho); // antes da página: se ela quebrar, o topo já marca a rota nova
    const pagina = rota ? PAGINAS[rota.caminho](rota.parametro, opcoes) : naoEncontrada(false);
    main.classList.toggle('largo', !item?.leitura && ['/ex', '/livre', '/trilha', '/'].includes(rota?.caminho));
    main.classList.toggle('medio', ['/glossario', '/troubleshooting', '/oficina', '/plantao', '/diario'].includes(rota?.caminho));
    if (pagina?.then) {
      main.innerHTML = `<p class="nota carregando" role="status">${t('Carregando…')}</p>`;
      paginaAtual = pagina.then((p) => {
        if (minha !== geracao) return null;
        falhas = 0;
        return pintarComCuidado(p);
      }, (erro) => {
        if (minha !== geracao) return null;
        // Um arquivo que não chegou pede o "Tentar de novo"; qualquer outro erro é defeito nosso.
        return NAO_CHEGOU.test(erro?.message) ? naoCarregou(main) : quebrou(erro);
      });
    } else {
      paginaAtual = pintarComCuidado(pagina);
    }
  } catch (erro) {
    quebrou(erro);
  }
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
  // O "pular para o conteúdo" só leva o foco ao <main>: seguir o href (#conteudo) trocaria a rota pela página 404.
  document.querySelector('.pular')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('conteudo').focus();
  });
  (window.requestIdleCallback ?? setTimeout)(() => import('./ui/exercicio.js').catch(() => {})); // só adianta: se falhar, a missão tenta de novo
  window.addEventListener('kube-learn:progresso', () => topoComCuidado(resolverRota(location.hash)?.caminho));
  desenhar();
}

// Em inglês, o texto é baixado antes de desenhar a primeira tela (se falhar, segue em português).
if (idiomaInicial() === 'en') definirIdioma('en', { salvar: false }).then(iniciar, iniciar);
else iniciar();
