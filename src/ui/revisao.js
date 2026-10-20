// A tela da revisão do dia: um cartão por vez, com a explicação depois de responder.
import { NIVEIS } from '../conteudo/index.js';
import { GLOSSARIO } from '../conteudo/glossario.js';
import { calcularJornada, hojeLocal } from '../jogo/gamificacao.js';
import { montarSessao, responder, termosVistos, proximaRevisao } from '../jogo/revisao.js';
import { ler, gravar, CHAVES, registrarDia } from '../armazenamento.js';
import { escapar } from './util.js';

const dataBr = (d) => d.split('-').reverse().join('/');

export function paginaRevisao() {
  return (main) => {
    const hoje = hojeLocal();
    let estado = ler(CHAVES.revisao, {});
    const termos = termosVistos(GLOSSARIO, calcularJornada(NIVEIS, ler(CHAVES.progresso, {})));
    const cartoes = montarSessao({ termos, estado, hoje, todos: GLOSSARIO });
    let i = 0;
    let acertos = 0;

    const cabecalho = `<h1 class="pixel">Revisão do dia</h1>
      <p>Cartões com os termos dos níveis que você já começou. Acertou, o cartão volta daqui a mais dias; errou, volta
         amanhã. É assim que a memória fixa: pouco por dia, no dia certo.</p>`;

    if (!termos.length) {
      main.innerHTML = `${cabecalho}<p class="nota">Ainda não há cartões: resolva uma missão e os termos daquele nível entram na revisão.</p>
        <p><a class="botao" href="#/trilha">Ir para a trilha</a></p>`;
      return {};
    }
    if (!cartoes.length) {
      const prox = proximaRevisao(estado);
      main.innerHTML = `${cabecalho}<p class="quiz-retorno ok"><b>✅ Tudo revisado por hoje.</b> ${prox ? `Os próximos cartões vencem em ${dataBr(prox)}.` : ''}</p>
        <p><a href="#/glossario">Ver o glossário inteiro</a></p>`;
      return {};
    }

    const desenhar = () => {
      if (i >= cartoes.length) {
        main.innerHTML = `${cabecalho}<p class="quiz-retorno ok" role="status"><b>🎉 Revisão feita: ${acertos} de ${cartoes.length} certos.</b>
          Os cartões errados voltam amanhã. ${proximaRevisao(estado) ? `Próxima revisão: ${dataBr(proximaRevisao(estado))}.` : ''}</p>
          <p><a class="botao" href="#/trilha">Voltar à trilha</a></p>`;
        main.querySelector('.botao').focus();
        return;
      }
      const c = cartoes[i];
      main.innerHTML = `${cabecalho}
        <article class="cartao-revisao">
          <p class="nota">Cartão ${i + 1} de ${cartoes.length}</p>
          <form class="quiz">
            <fieldset><legend>${c.pergunta}</legend>
              ${c.opcoes.map((o, k) => `<label class="alternativa"><input type="radio" name="escolha" value="${k}" required> <span>${escapar(o.texto)}</span></label>`).join('')}
            </fieldset>
            <p><button type="submit" class="botao">Responder</button></p>
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
        retorno.innerHTML = `<p><b>${certo ? '✅ Certo!' : '❌ Não foi dessa vez.'}</b></p>
          <p><b>${escapar(x.termo)}</b>: ${escapar(x.definicao)}</p>
          <p><span aria-hidden="true">🏠</span> ${escapar(x.vidaReal)}</p>
          <p><span aria-hidden="true">⚠️</span> Onde quebra: ${escapar(x.limite)}</p>
          <p><button type="button" class="botao" data-proximo>${i + 1 < cartoes.length ? 'Próximo cartão ▶' : 'Terminar'}</button></p>`;
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
