// O topo do site: a marca, a navegação (que no celular vira uma barra de abas embaixo), o placar do aluno (XP e
// dias seguidos), o idioma (PT | EN) e o botão de acessibilidade. O placar e a aba ativa são atualizados a cada troca
// de página; o topo e o rodapé são montados de novo quando o idioma muda.
import { NIVEIS, GLOSSARIO } from '../conteudo/indice.js';
import { calcularJornada, sequenciaDeDias, hojeLocal } from '../jogo/gamificacao.js';
import { termosVistos } from '../jogo/revisao.js';
import { cartoesParaHoje } from '../jogo/hoje.js';
import { ler, CHAVES } from '../armazenamento.js';
import { idioma, t } from '../i18n.js';
import { icone, marcaNavio } from './icones.js';

// [href, ícone, rótulo, rótulo curto (no celular e no tablet, onde o topo aperta)]
const LINKS = () => [['#/trilha', 'trilha', t('Trilha')], ['#/troubleshooting', 'alerta', 'Troubleshooting', 'Debug'], ['#/livre', 'terminal', 'Playground'], ['#/glossario', 'livro', t('Glossário')], ['#/revisao', 'cartas', t('Revisão')]];

export function montarTopo(topo) {
  const lingua = idioma();
  topo.innerHTML = `
    <div class="topo-dentro">
      <a class="marca" href="#/">${marcaNavio()}<span class="marca-nome">kube-learn</span></a>
      <nav class="nav" aria-label="${t('Principal')}">
        <ul>${LINKS().map(([href, ic, rotulo, curto]) => `<li><a href="${href}">${icone(ic)}<span>${curto ? `<span class="rotulo-longo">${rotulo}</span><span class="rotulo-curto">${curto}</span>` : rotulo}</span>${href === '#/revisao' ? '<span class="contagem" hidden></span>' : ''}</a></li>`).join('')}</ul>
      </nav>
      <div class="topo-direita">
        <a class="placar-topo" href="#/trilha" title="${t('Seu placar')}"></a>
        <div class="idiomas" role="group" aria-label="Idioma · Language">
          <button type="button" data-idioma="pt" lang="pt-BR" title="Português" aria-pressed="${lingua === 'pt'}">PT</button>
          <button type="button" data-idioma="en" lang="en" title="English" aria-pressed="${lingua === 'en'}">EN</button>
        </div>
        <button type="button" id="botao-preferencias" class="botao-icone" aria-haspopup="dialog" aria-label="${t('Acessibilidade')}" title="${t('Acessibilidade')}">${icone('acessibilidade')}</button>
      </div>
    </div>`;
}

/** O rodapé e o link "pular para o conteúdo" (estão no index.html, em português, para quem está sem JavaScript). */
export function montarRodape() {
  const pular = document.querySelector('.pular');
  if (pular) pular.textContent = t('Pular para o conteúdo');
  const rodape = document.querySelector('.rodape-dentro');
  if (!rodape) return;
  rodape.innerHTML = `
    <p class="rodape-marca"><b>kube-learn</b> · ${t('Kubernetes contêiner por contêiner, no seu navegador.')}</p>
    <p class="rodape-links">
      <a href="https://github.com/pedromenuzzi/kube-learn">GitHub</a>
      <a href="#/privacidade">${t('Privacidade')}</a>
      <a href="https://www.gnu.org/licenses/agpl-3.0.html">${t('Código AGPL-3.0')}</a>
      <a href="https://creativecommons.org/licenses/by-sa/4.0/${idioma() === 'en' ? 'deed.en' : 'deed.pt-br'}">${t('Conteúdo CC BY-SA 4.0')}</a>
    </p>
    <p class="rodape-nota">${t('Kubernetes é marca da The Linux Foundation. Projeto independente, sem afiliação com a CNCF.')}</p>`;
}

/** A aba da página atual e o placar (XP e dias seguidos). */
export function atualizarTopo(caminho) {
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.getAttribute('href') === `#${caminho}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const jornada = calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
  const { xp } = jornada;
  const dias = sequenciaDeDias(ler(CHAVES.dias, []), hojeLocal());
  // Na aba Revisão, quantos cartões esperam hoje (some quando a revisão do dia foi feita).
  const contagem = document.querySelector('.nav .contagem');
  if (contagem) {
    const n = cartoesParaHoje({ termos: termosVistos(GLOSSARIO, jornada), estado: ler(CHAVES.revisao, {}), hoje: hojeLocal() });
    contagem.hidden = !n;
    contagem.innerHTML = n ? `<span aria-hidden="true">${n}</span><span class="visualmente-oculto">${t(n === 1 ? ', 1 cartão para hoje' : ', {n} cartões para hoje', { n })}</span>` : '';
  }
  const placar = document.querySelector('.placar-topo');
  if (!placar) return;
  // O nome do link vem do texto (um aria-label esconderia o "75 XP" que se vê; WCAG 2.5.3): os números à mostra ficam
  // fora da árvore de acessibilidade, e o leitor de tela lê a frase inteira ("75 XP, 4 dias seguidos de estudo").
  placar.innerHTML = `<span class="placar-item xp" aria-hidden="true">${icone('raio')}${xp}<small>XP</small></span>`
    + `<span class="placar-item fogo${dias ? '' : ' apagado'}" aria-hidden="true">${icone('chama')}${dias}</span>`
    + `<span class="visualmente-oculto">${t(dias === 1 ? '{xp} XP, {dias} dia seguido de estudo' : '{xp} XP, {dias} dias seguidos de estudo', { xp, dias })}</span>`;
}
