// A tela da revisão do dia: um cartão por vez, com a explicação depois de responder.
import { NIVEIS } from '../conteudo/index.js';
import { GLOSSARIO } from '../conteudo/glossario.js';
import { calcularJornada, hojeLocal } from '../jogo/gamificacao.js';
import { montarSessao, responder, termosVistos, proximaRevisao } from '../jogo/revisao.js';
import { ler, gravar, CHAVES, registrarDia } from '../armazenamento.js';
import { escapar } from './util.js';
import { icone } from './icones.js';
import { idioma, t } from '../i18n.js';

// 'AAAA-MM-DD' → 21/10/2026 (em inglês, Oct 21, 2026)
const mostrarData = (d) => (idioma() === 'en' ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : d.split('-').reverse().join('/'));

export function paginaRevisao() {
  return (main) => {
    const hoje = hojeLocal();
    let estado = ler(CHAVES.revisao, {});
    const termos = termosVistos(GLOSSARIO, calcularJornada(NIVEIS, ler(CHAVES.progresso, {})));
    const cartoes = montarSessao({ termos, estado, hoje, todos: GLOSSARIO });
    let i = 0;
    let acertos = 0;

    const cabecalho = `<p class="sobretitulo">${t('Um pouco por dia')}</p><h1 class="pixel">${t('Revisão do dia')}</h1>
      <p>${t('Cartões com os termos dos níveis que você já começou. Acertou, o cartão volta daqui a mais dias; errou, volta amanhã. É assim que a memória fixa: pouco por dia, no dia certo.')}</p>`;

    if (!termos.length) {
      main.innerHTML = `${cabecalho}<p class="nota">${t('Ainda não há cartões: resolva uma missão e os termos daquele nível entram na revisão.')}</p>
        <p><a class="botao" href="#/trilha">${icone('trilha')} ${t('Ir para a trilha')}</a></p>`;
      return {};
    }
    if (!cartoes.length) {
      const prox = proximaRevisao(estado);
      main.innerHTML = `${cabecalho}<p class="quiz-retorno ok"><b>${t('Tudo revisado por hoje.')}</b> ${prox ? t('Os próximos cartões vencem em {data}.', { data: mostrarData(prox) }) : ''}</p>
        <p><a href="#/glossario">${t('Ver o glossário inteiro')}</a></p>`;
      return {};
    }

    const desenhar = () => {
      if (i >= cartoes.length) {
        main.innerHTML = `${cabecalho}<p class="quiz-retorno ok" role="status"><b>${t('Revisão feita: {acertos} de {total} certos.', { acertos, total: cartoes.length })}</b>
          ${t('Os cartões errados voltam amanhã.')} ${proximaRevisao(estado) ? t('Próxima revisão: {data}.', { data: mostrarData(proximaRevisao(estado)) }) : ''}</p>
          <p><a class="botao" href="#/trilha">${icone('trilha')} ${t('Voltar à trilha')}</a></p>`;
        main.querySelector('.botao').focus();
        return;
      }
      const c = cartoes[i];
      main.innerHTML = `${cabecalho}
        <article class="cartao-revisao">
          <p class="progresso-revisao"><span>${t('Cartão {n} de {total}', { n: i + 1, total: cartoes.length })}</span><span class="barra" aria-hidden="true"><span style="width: ${(i / cartoes.length) * 100}%"></span></span></p>
          <form class="quiz">
            <fieldset><legend>${c.pergunta}</legend>
              ${c.opcoes.map((o, k) => `<label class="alternativa"><input type="radio" name="escolha" value="${k}" required> <span>${escapar(o.texto)}</span></label>`).join('')}
            </fieldset>
            <p><button type="submit" class="botao">${icone('certo')} ${t('Responder')}</button></p>
          </form>
          <div class="quiz-retorno" role="status" aria-live="polite"></div>
        </article>`;
      const form = main.querySelector('form');
      form.querySelector('input').focus();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const certo = c.opcoes[Number(new FormData(form).get('escolha'))].certa;
        if (certo) acertos++;
        estado = responder(estado, c.id, certo, hoje);
        gravar(CHAVES.revisao, estado);
        registrarDia(hoje);
        form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
        const x = c.explicacao;
        const retorno = main.querySelector('.quiz-retorno');
        retorno.className = `quiz-retorno ${certo ? 'ok' : 'falha'}`;
        retorno.innerHTML = `<p><b>${certo ? t('Certo!') : t('Não foi dessa vez.')}</b></p>
          <p><b>${escapar(x.termo)}</b>: ${escapar(x.definicao)}</p>
          <p><b>${t('Na vida real:')}</b> ${escapar(x.vidaReal)}</p>
          <p><b>${t('Onde quebra:')}</b> ${escapar(x.limite)}</p>
          <p><button type="button" class="botao" data-proximo>${i + 1 < cartoes.length ? `${t('Próximo cartão')} ${icone('seguir')}` : t('Terminar')}</button></p>`;
        const proximo = retorno.querySelector('[data-proximo]');
        proximo.addEventListener('click', () => {
          i++;
          desenhar();
        });
        proximo.focus();
      });
    };
    desenhar();
    return {};
  };
}
