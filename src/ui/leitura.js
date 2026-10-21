// A tela das lições sem cluster e dos quizzes: o texto, a comparação com a vida real e, no quiz, a pergunta.
import { XP } from '../conteudo/util.js';
import { NIVEIS, proximoDe } from '../conteudo/index.js';
import { registrarDia, ler, CHAVES } from '../armazenamento.js';
import { registrarComFesta } from './festa.js';
import { abrirFeedback } from './feedback.js';
import { hojeLocal } from '../jogo/gamificacao.js';
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
        ${jaFeito && item.tipo === 'quiz' ? `<span class="chip chip-ok">${icone('certo')} ${t('Resolvido')}</span>` : ''}
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
      <p class="leitura-acoes">
        ${item.tipo === 'licao' ? `<button type="button" class="botao" data-acao="lida"${jaFeito ? ' disabled' : ''}>${icone('certo')} ${jaFeito ? t('Lida') : t('Marquei como lida')}</button>` : ''}
        ${proximo ? `<a class="botao-secundario proxima" href="#/ex/${proximo.id}">${t('Próxima: {titulo}', { titulo: escapar(proximo.titulo) })} ${icone('seguir')}</a>` : ''}
      </p>
      <p class="leitura-feedback"><button type="button" class="link-botao" data-acao="feedback">${icone('balao')} ${item.tipo === 'quiz' ? t('Conte como foi este quiz') : t('Conte como foi esta lição')}</button></p>
    </article>`;

  const retorno = raiz.querySelector('.quiz-retorno');
  raiz.querySelector('.quiz')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const escolha = new FormData(e.target).get('escolha');
    const r = conferirQuiz(item, escolha);
    registrarDia(hojeLocal());
    registrarComFesta(item, r.certa);
    resposta = r.certa ? t('acertou o quiz') : t('errou o quiz (escolheu: {escolha})', { escolha: item.alternativas ? item.alternativas[Number(escolha)]?.texto : escolha });
    retorno.className = `quiz-retorno ${r.certa ? 'ok' : 'falha'}`;
    retorno.innerHTML = `<p><b>${r.certa ? t('Certo! +{xp} XP.', { xp: XP.quiz }) : t('Ainda não.')}</b> ${r.explicacao}</p>`;
    if (r.certa) raiz.querySelector('.caixa-vida')?.removeAttribute('hidden');
  });
  let resposta = null; // para o feedback
  raiz.querySelector('[data-acao=feedback]').addEventListener('click', () => abrirFeedback(item, () => ({ testes: resposta })));
  raiz.querySelector('[data-acao=lida]')?.addEventListener('click', (e) => {
    registrarDia(hojeLocal());
    registrarComFesta(item, true);
    e.currentTarget.innerHTML = `${icone('certo')} ${t('Lida')}`;
    e.currentTarget.disabled = true;
    retorno.className = 'quiz-retorno ok';
    retorno.innerHTML = `<p><b>+${XP.licao} XP.</b> ${t('Mais um contêiner embarcado.')}</p>`;
  });
  return {};
}
