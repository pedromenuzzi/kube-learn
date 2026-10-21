// A tela das lições sem cluster e dos quizzes: o texto, a comparação com a vida real e, no quiz, a pergunta.
import { XP } from '../conteudo/util.js';
import { NIVEIS, proximoDe } from '../conteudo/index.js';
import { registrarResultado, registrarDia, ler, CHAVES } from '../armazenamento.js';
import { hojeLocal } from '../jogo/gamificacao.js';
import { escapar } from './util.js';
import { icone } from './icones.js';

const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/** Confere a resposta do quiz. → { certa, explicacao } */
export function conferirQuiz(item, escolha) {
  if (item.alternativas) {
    const alt = item.alternativas[Number(escolha)];
    return { certa: !!alt?.certa, explicacao: alt?.explicacao ?? '' };
  }
  const dada = semAcento(String(escolha ?? ''));
  const certa = item.resposta.test(dada);
  return { certa, explicacao: certa ? item.explicacao : (item.dicaErro ?? 'Ainda não. Releia a pergunta e tente de novo.') };
}

export function montarLeitura(raiz, item) {
  const proximo = proximoDe(item);
  const nivel = NIVEIS[item.nivel];
  const jaFeito = ler(CHAVES.progresso, {})[item.id]?.status === 'resolvido';
  raiz.innerHTML = `
    <article class="leitura">
      <nav class="migalhas" aria-label="Você está em"><a href="#/trilha">${icone('voltar')} Trilha</a>
        ${nivel ? `<span aria-hidden="true">/</span> <span>Nível ${nivel.numero}: ${escapar(nivel.titulo)}</span>` : ''}</nav>
      <header class="ex-topo">
        <h1>${escapar(item.titulo)}</h1>
        <span class="chip chip-${item.tipo}">${item.tipo === 'quiz' ? 'Quiz' : 'Lição'}</span><span class="chip">${XP[item.tipo]} XP</span>
        ${jaFeito && item.tipo === 'quiz' ? `<span class="chip chip-ok">${icone('certo')} Resolvido</span>` : ''}
      </header>
      <div class="leitura-texto">${item.enunciado}</div>
      ${item.tipo === 'quiz' ? `
      <form class="quiz">
        ${item.alternativas ? `<fieldset><legend>Escolha uma resposta</legend>
          ${item.alternativas.map((a, i) => `<label class="alternativa"><input type="radio" name="escolha" value="${i}" required> <span>${a.texto}</span></label>`).join('')}
        </fieldset>` : `<p><label for="resposta">Sua resposta</label><br><input id="resposta" name="escolha" autocomplete="off" spellcheck="false" required></p>`}
        <p><button type="submit" class="botao">${icone('certo')} Responder</button></p>
      </form>` : ''}
      <div class="quiz-retorno" role="status" aria-live="polite"></div>
      ${item.vidaReal ? `
      <aside class="caixa-vida" aria-label="Na vida real"${item.tipo === 'quiz' && !jaFeito ? ' hidden' : ''}>
        <p><b>Na vida real:</b> ${escapar(item.vidaReal)}</p>
        ${item.limite ? `<p><b>Onde a comparação quebra:</b> ${escapar(item.limite)}</p>` : ''}
      </aside>` : ''}
      <p class="leitura-acoes">
        ${item.tipo === 'licao' ? `<button type="button" class="botao" data-acao="lida"${jaFeito ? ' disabled' : ''}>${icone('certo')} ${jaFeito ? 'Lida' : 'Marquei como lida'}</button>` : ''}
        ${proximo ? `<a class="botao-secundario proxima" href="#/ex/${proximo.id}">Próxima: ${escapar(proximo.titulo)} ${icone('seguir')}</a>` : ''}
      </p>
    </article>`;

  const retorno = raiz.querySelector('.quiz-retorno');
  raiz.querySelector('.quiz')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const escolha = new FormData(e.target).get('escolha');
    const r = conferirQuiz(item, escolha);
    registrarDia(hojeLocal());
    registrarResultado(item.id, r.certa);
    retorno.className = `quiz-retorno ${r.certa ? 'ok' : 'falha'}`;
    retorno.innerHTML = `<p><b>${r.certa ? `Certo! +${XP.quiz} XP.` : 'Ainda não.'}</b> ${r.explicacao}</p>`;
    if (r.certa) raiz.querySelector('.caixa-vida')?.removeAttribute('hidden');
  });
  raiz.querySelector('[data-acao=lida]')?.addEventListener('click', (e) => {
    registrarDia(hojeLocal());
    registrarResultado(item.id, true);
    e.currentTarget.innerHTML = `${icone('certo')} Lida`;
    e.currentTarget.disabled = true;
    retorno.className = 'quiz-retorno ok';
    retorno.innerHTML = `<p><b>+${XP.licao} XP.</b> Mais um contêiner embarcado.</p>`;
  });
  return {};
}
