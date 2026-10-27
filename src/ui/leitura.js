// A tela das lições sem cluster e dos quizzes: o texto, a comparação com a vida real e, no quiz, a pergunta.
import { XP } from '../conteudo/util.js';
import { NIVEIS, proximoDe } from '../conteudo/index.js';
import { registrarDia, ler, CHAVES } from '../armazenamento.js';
import { registrarComFesta } from './festa.js';
import { abrirFeedback } from './feedback.js';
import { calcularJornada, hojeLocal, novidades } from '../jogo/gamificacao.js';
import { escapar } from './util.js';
import { icone } from './icones.js';
import { t } from '../i18n.js';

const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/** Confere a resposta do quiz. → { certa, explicacao } */
export function conferirQuiz(item, escolha) {
  if (item.alternativas) {
    const alt = item.alternativas[Number(escolha)];
    return { certa: !!alt?.certa, explicacao: alt?.explicacao ?? '' };
  }
  const dada = semAcento(String(escolha ?? ''));
  const certa = item.resposta.test(dada);
  return { certa, explicacao: certa ? item.explicacao : (item.dicaErro ?? t('Ainda não. Releia a pergunta e tente de novo.')) };
}

const jornada = () => calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
const proxima = (proximo) => t('Próxima: {titulo}', { titulo: escapar(proximo.titulo) });

/**
 * Um próximo passo só. Lição por ler: um botão que marca como lida e já abre a próxima (sem próxima, só marca).
 * Lição lida: a próxima é o botão principal. Quiz: a próxima é secundária até o acerto, quando vira a principal.
 */
function acoes(item, proximo, jaFeito) {
  if (item.tipo === 'licao' && !jaFeito) {
    return proximo
      ? `<a class="botao proxima" data-acao="lida" href="#/ex/${proximo.id}">${icone('certo')} ${t('Lida · Próxima: {titulo}', { titulo: escapar(proximo.titulo) })} ${icone('seguir')}</a>`
      : `<button type="button" class="botao" data-acao="lida">${icone('certo')} ${t('Marquei como lida')}</button>`;
  }
  return proximo ? `<a class="${item.tipo === 'licao' ? 'botao' : 'botao-secundario'} proxima" href="#/ex/${proximo.id}">${proxima(proximo)} ${icone('seguir')}</a>` : '';
}

/**
 * Foca `foco` sem o navegador rolar até ele (ele o centralizaria e, no celular, o "Certo! +5 XP" sumia embaixo do topo)
 * e rola o mínimo para `mostrar` começar abaixo do topo e da faixa do nível novo, e o foco ficar acima da barra de abas
 * do celular. Quando não cabem os dois, quem usa o teclado (o anel de foco à vista, :focus-visible) fica com o foco à
 * vista (WCAG 2.4.11); com o mouse ou o dedo, não há anel, e o começo de `mostrar` vem primeiro. A rolagem é calculada
 * aqui (scrollBy): o scroll-padding do html, que vale para o scrollIntoView e o foco do navegador, não conta duas vezes.
 */
export function focarMostrando(foco, mostrar) {
  foco.focus({ preventScroll: true });
  // A faixa acabou de entrar e ainda desce (festa-descer): vale a caixa de layout dela, sem o transform da animação.
  const faixas = [...document.querySelectorAll('.festa-faixa')].map((f) => f.offsetTop + f.offsetHeight);
  const acima = Math.max(document.querySelector('.topo')?.getBoundingClientRect().bottom ?? 0, ...faixas) + 12;
  const nav = document.querySelector('.nav');
  const abaixo = (nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight) - 12;
  const folga = mostrar.getBoundingClientRect().top - acima; // < 0: o começo está escondido; > 0: dá para descer isso
  const delta = Math.max(Math.min(0, folga), foco.getBoundingClientRect().bottom - abaixo);
  const rolar = foco.matches(':focus-visible') ? delta : Math.min(delta, folga);
  if (rolar) scrollBy({ top: rolar });
}

export function montarLeitura(raiz, item) {
  const proximo = proximoDe(item);
  const nivel = NIVEIS[item.nivel];
  const jaFeito = ler(CHAVES.progresso, {})[item.id]?.status === 'resolvido';
  raiz.innerHTML = `
    <article class="leitura">
      <nav class="migalhas" aria-label="${t('Você está em')}"><a href="#/trilha">${icone('voltar')} ${t('Trilha')}</a>
        ${nivel ? `<span aria-hidden="true">/</span> <span>${t('Nível {n}: {titulo}', { n: nivel.numero, titulo: escapar(nivel.titulo) })}</span>` : ''}</nav>
      <header class="ex-topo">
        <h1>${escapar(item.titulo)}</h1>
        <span class="chip chip-${item.tipo}">${item.tipo === 'quiz' ? 'Quiz' : t('Lição')}</span><span class="chip">${XP[item.tipo]} XP</span>
        ${jaFeito ? `<span class="chip chip-ok">${icone('certo')} ${item.tipo === 'quiz' ? t('Resolvido') : t('Lida')}</span>` : ''}
      </header>
      <div class="leitura-texto">${item.enunciado}</div>
      ${item.tipo === 'quiz' ? `
      <form class="quiz">
        ${item.alternativas ? `<fieldset><legend>${t('Escolha uma resposta')}</legend>
          ${item.alternativas.map((a, i) => `<label class="alternativa"><input type="radio" name="escolha" value="${i}" required> <span>${a.texto}</span></label>`).join('')}
        </fieldset>` : `<p><label for="resposta">${t('Sua resposta')}</label><br><input id="resposta" name="escolha" autocomplete="off" spellcheck="false" required></p>`}
        <p><button type="submit" class="botao">${icone('certo')} ${t('Responder')}</button></p>
      </form>` : ''}
      <div class="quiz-retorno" role="status" aria-live="polite"></div>
      ${item.vidaReal ? `
      <aside class="caixa-vida" aria-label="${t('Na vida real')}"${item.tipo === 'quiz' && !jaFeito ? ' hidden' : ''}>
        <p><b>${t('Na vida real:')}</b> ${escapar(item.vidaReal)}</p>
        ${item.limite ? `<p><b>${t('Onde a comparação quebra:')}</b> ${escapar(item.limite)}</p>` : ''}
      </aside>` : ''}
      <p class="leitura-acoes">${acoes(item, proximo, jaFeito)}</p>
      <p class="leitura-feedback"><button type="button" class="link-botao" data-acao="feedback">${icone('balao')} ${item.tipo === 'quiz' ? t('Conte como foi este quiz') : t('Conte como foi esta lição')}</button></p>
    </article>`;

  const retorno = raiz.querySelector('.quiz-retorno');
  raiz.querySelector('.quiz')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const escolha = new FormData(e.target).get('escolha');
    const r = conferirQuiz(item, escolha);
    registrarDia(hojeLocal());
    const primeira = registrarComFesta(item, r.certa);
    resposta = r.certa ? t('acertou o quiz') : t('errou o quiz (escolheu: {escolha})', { escolha: item.alternativas ? item.alternativas[Number(escolha)]?.texto : escolha });
    retorno.className = `quiz-retorno ${r.certa ? 'ok' : 'falha'}`;
    const titulo = !r.certa ? t('Ainda não.') : primeira ? t('Certo! +{xp} XP.', { xp: XP.quiz }) : t('Certo! (Você já tinha acertado este.)');
    retorno.innerHTML = `<p><b>${titulo}</b> ${r.explicacao}</p>`;
    if (!r.certa) return;
    raiz.querySelector('.caixa-vida')?.removeAttribute('hidden');
    // Acertou: o próximo passo é a próxima (o lacre que aparecer depois devolve o foco a ela).
    const link = raiz.querySelector('.proxima');
    link?.classList.replace('botao-secundario', 'botao');
    if (link) focarMostrando(link, retorno);
  });
  let resposta = null; // para o feedback
  raiz.querySelector('[data-acao=feedback]').addEventListener('click', () => abrirFeedback(item, () => ({ testes: resposta })));
  const lida = raiz.querySelector('[data-acao=lida]');
  lida?.addEventListener('click', (e) => {
    if (lida.dataset.lida) return; // já marcada: o link só leva à próxima
    lida.dataset.lida = 'sim';
    const antes = jornada();
    registrarDia(hojeLocal());
    const primeira = registrarComFesta(item, true);
    retorno.className = 'quiz-retorno ok';
    retorno.innerHTML = primeira ? `<p><b>+${XP.licao} XP.</b> ${t('Mais um contêiner embarcado.')}</p>` : `<p>${t('Lida. (Você já tinha lido esta lição.)')}</p>`;
    if (!proximo) {
      lida.innerHTML = `${icone('certo')} ${t('Lida')}`;
      lida.disabled = true;
    } else if (primeira && novidades(antes, jornada()).length) {
      // Abriu um nível ou fechou um lacre: a festa aparece inteira aqui, e a próxima fica a um Enter.
      e.preventDefault();
      lida.innerHTML = `${proxima(proximo)} ${icone('seguir')}`;
      focarMostrando(lida, retorno);
    } else if (primeira) {
      // Segue para a próxima: quem usa leitor de tela também fica sabendo do XP (a região fica no index.html).
      const anuncio = document.getElementById('festa-anuncio');
      if (anuncio) anuncio.textContent = t('Lição lida: +{xp} XP.', { xp: XP.licao });
    }
  });
  return {};
}
