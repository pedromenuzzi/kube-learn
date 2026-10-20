// O topo do site: a marca, a navegação (que no celular vira uma barra de abas embaixo), o placar do aluno (XP e
// dias seguidos) e o botão de acessibilidade. O placar e a aba ativa são atualizados a cada troca de página.
import { NIVEIS } from '../conteudo/index.js';
import { calcularJornada, sequenciaDeDias, hojeLocal } from '../jogo/gamificacao.js';
import { ler, CHAVES } from '../armazenamento.js';
import { icone, marcaNavio } from './icones.js';

const LINKS = [['#/trilha', 'trilha', 'Trilha'], ['#/livre', 'terminal', 'Playground'], ['#/glossario', 'livro', 'Glossário'], ['#/revisao', 'cartas', 'Revisão']];

export function montarTopo(topo) {
  topo.innerHTML = `
    <div class="topo-dentro">
      <a class="marca" href="#/">${marcaNavio()}<span class="marca-nome">kube-learn</span></a>
      <nav class="nav" aria-label="Principal">
        <ul>${LINKS.map(([href, ic, rotulo]) => `<li><a href="${href}">${icone(ic)}<span>${rotulo}</span></a></li>`).join('')}</ul>
      </nav>
      <div class="topo-direita">
        <a class="placar-topo" href="#/trilha" title="Seu placar"></a>
        <button type="button" id="botao-preferencias" class="botao-icone" aria-haspopup="dialog" aria-label="Acessibilidade" title="Acessibilidade">${icone('acessibilidade')}</button>
      </div>
    </div>`;
}

/** A aba da página atual e o placar (XP e dias seguidos). */
export function atualizarTopo(caminho) {
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.getAttribute('href') === `#${caminho}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const { xp } = calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
  const dias = sequenciaDeDias(ler(CHAVES.dias, []), hojeLocal());
  const placar = document.querySelector('.placar-topo');
  if (!placar) return;
  placar.setAttribute('aria-label', `Seu placar: ${xp} XP e ${dias} ${dias === 1 ? 'dia seguido' : 'dias seguidos'} de estudo`);
  placar.innerHTML = `<span class="placar-item xp">${icone('raio')}${xp}<small>XP</small></span><span class="placar-item fogo${dias ? '' : ' apagado'}">${icone('chama')}${dias}</span>`;
}
