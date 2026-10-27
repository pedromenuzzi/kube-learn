// A tela da revisão do dia: um cartão por vez, com a explicação depois de responder.
import { NIVEIS } from '../conteudo/index.js';
import { GLOSSARIO } from '../conteudo/glossario.js';
import { calcularJornada, hojeLocal } from '../jogo/gamificacao.js';
import { montarSessao, responder, termosVistos, proximaRevisao } from '../jogo/revisao.js';
import { ler, gravar, CHAVES, registrarDia } from '../armazenamento.js';
import { escapar } from './util.js';
import { icone } from './icones.js';
import { focarMostrando } from './leitura.js';
import { idioma, t } from '../i18n.js';

// 'AAAA-MM-DD' → 21/10/2026 (em inglês, Oct 21, 2026)
const mostrarData = (d) => (idioma() === 'en' ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' }) : d.split('-').reverse().join('/'));

// A sessão do dia fica aqui, fora da página: trocar o idioma (ou sair e voltar) refaz os mesmos cartões, no mesmo ponto.
// { hoje, plano: [{ id, formato }], i (o cartão da vez), acertos, resposta: { id da alternativa escolhida, certo } | null }
let sessao = null;

/** Depois de responder: a certa com ✓ e "resposta certa", a escolhida errada com ✗ e "sua resposta" (texto, não só cor). */
function marcar(form, c, resposta) {
  form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
  form.querySelectorAll('.alternativa').forEach((rotulo, k) => {
    const o = c.opcoes[k];
    if (o.id === resposta.id) rotulo.querySelector('input').checked = true;
    const [classe, sinal, texto] = o.certa ? ['certa', '✓', t('resposta certa')] : o.id === resposta.id ? ['errada', '✗', t('sua resposta')] : [];
    if (!classe) return;
    rotulo.classList.add(classe);
    rotulo.insertAdjacentHTML('beforeend', `<span class="resultado-alternativa"><span class="visualmente-oculto">, </span><span aria-hidden="true">${sinal}</span> ${texto}</span>`);
  });
}

export function paginaRevisao(_parametro, opcoes = {}) {
  return (main) => {
    const hoje = hojeLocal();
    let estado = ler(CHAVES.revisao, {});
    const termos = termosVistos(GLOSSARIO, calcularJornada(NIVEIS, ler(CHAVES.progresso, {})));
    // A sessão de hoje continua até o fim (e o resumo fica na troca de idioma); acabada, a próxima visita monta outra.
    const acabou = sessao && sessao.i >= sessao.plano.length;
    if (sessao?.hoje !== hoje || (acabou && !opcoes.manter)) sessao = { hoje, plano: null, i: 0, acertos: 0, resposta: null };
    const cartoes = montarSessao({ termos, estado, hoje, todos: GLOSSARIO, plano: sessao.plano });
    sessao.plano ??= cartoes.map(({ id, formato }) => ({ id, formato }));

    const cabecalho = `<p class="sobretitulo">${t('Um pouco por dia')}</p><h1 class="pixel">${t('Revisão do dia')}</h1>
      <p>${t('Cartões com os termos que a trilha já te ensinou. Acertou, o cartão volta daqui a mais dias; errou, volta amanhã. É assim que a memória fixa: pouco por dia, no dia certo.')}</p>`;

    if (!termos.length) {
      main.innerHTML = `${cabecalho}<p class="nota">${t('Ainda não há cartões: cada lição da trilha traz para a revisão os termos que ela ensina.')}</p>
        <p><a class="botao" href="#/trilha">${icone('trilha')} ${t('Ir para a trilha')}</a></p>`;
      return {};
    }
    if (!cartoes.length) {
      const prox = proximaRevisao(estado, termos);
      main.innerHTML = `${cabecalho}<p class="quiz-retorno ok"><b>${t('Tudo revisado por hoje.')}</b> ${prox ? t('Os próximos cartões vencem em {data}.', { data: mostrarData(prox) }) : ''}</p>
        <p><a href="#/glossario">${t('Ver o glossário inteiro')}</a></p>`;
      return {};
    }

    /** A explicação depois de responder (no aria-live), com o botão do próximo cartão. */
    const mostrarRetorno = (retorno, certo) => {
      const x = cartoes[sessao.i].explicacao;
      retorno.className = `quiz-retorno ${certo ? 'ok' : 'falha'}`;
      retorno.innerHTML = `<p><b>${certo ? t('Certo!') : t('Não foi dessa vez.')}</b></p>
        <p><b>${escapar(x.termo)}</b>: ${escapar(x.definicao)}</p>
        <p><b>${t('Na vida real:')}</b> ${escapar(x.vidaReal)}</p>
        <p><b>${t('Onde quebra:')}</b> ${escapar(x.limite)}</p>
        <p><button type="button" class="botao" data-proximo>${sessao.i + 1 < cartoes.length ? `${t('Próximo cartão')} ${icone('seguir')}` : t('Terminar')}</button></p>`;
      const proximo = retorno.querySelector('[data-proximo]');
      proximo.addEventListener('click', () => {
        sessao.i++;
        sessao.resposta = null;
        desenhar();
      });
      return proximo;
    };

    const desenhar = () => {
      const { i } = sessao;
      if (i >= cartoes.length) {
        const prox = proximaRevisao(estado, termos);
        main.innerHTML = `${cabecalho}<p class="quiz-retorno ok" role="status"><b>${t('Revisão feita: {acertos} de {total} certos.', { acertos: sessao.acertos, total: cartoes.length })}</b>
          ${t('Os cartões errados voltam amanhã.')} ${prox ? t('Próxima revisão: {data}.', { data: mostrarData(prox) }) : ''}</p>
          <p><a class="botao" href="#/trilha">${icone('trilha')} ${t('Voltar à trilha')}</a></p>`;
        main.querySelector('.botao').focus();
        return;
      }
      const c = cartoes[i];
      main.innerHTML = `${cabecalho}
        <article class="cartao-revisao">
          <p class="progresso-revisao"><span>${t('Cartão {n} de {total}', { n: i + 1, total: cartoes.length })}</span><span class="barra" aria-hidden="true"><span style="width: ${(i / cartoes.length) * 100}%"></span></span></p>
          <form class="quiz">
            <fieldset${c.codigo ? ' aria-describedby="revisao-codigo"' : ''}><legend>${c.pergunta}</legend>
              ${c.codigo ? `<pre class="manual" id="revisao-codigo"><code>${escapar(c.codigo)}</code></pre>` : ''}
              ${c.opcoes.map((o, k) => `<label class="alternativa"><input type="radio" name="escolha" value="${k}" required> <span>${escapar(o.texto)}</span></label>`).join('')}
            </fieldset>
            <p><button type="submit" class="botao">${icone('certo')} ${t('Responder')}</button></p>
          </form>
          <div class="quiz-retorno" role="status" aria-live="polite"></div>
        </article>`;
      const form = main.querySelector('form');
      const retorno = main.querySelector('.quiz-retorno');
      // Já respondido (a troca de idioma depois de responder): mostra a resposta, sem contar de novo.
      if (sessao.resposta) {
        marcar(form, c, sessao.resposta);
        mostrarRetorno(retorno, sessao.resposta.certo);
        return;
      }
      // O foco no primeiro rádio, e o cartão (o "Cartão N de 10" e a pergunta) logo abaixo do topo: a página não volta
      // ao começo entre um cartão e outro.
      focarMostrando(form.querySelector('input'), main.querySelector('.cartao-revisao'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const escolhida = c.opcoes[Number(new FormData(form).get('escolha'))];
        sessao.resposta = { id: escolhida.id, certo: escolhida.certa };
        if (escolhida.certa) sessao.acertos++;
        estado = responder(estado, c.id, escolhida.certa, hoje);
        gravar(CHAVES.revisao, estado);
        registrarDia(hoje);
        dispatchEvent(new Event('kube-learn:progresso')); // o topo conta junto: a aba Revisão e o dia de estudo
        marcar(form, c, sessao.resposta);
        // O foco no Próximo, e as alternativas com o ✓ e o ✗ abaixo do topo (o foco sozinho centralizaria o botão).
        focarMostrando(mostrarRetorno(retorno, escolhida.certa), form.querySelector('fieldset'));
      });
    };
    desenhar();
    return {};
  };
}
