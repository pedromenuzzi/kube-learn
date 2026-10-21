// O topo do site: a marca, a navegação (que no celular vira uma barra de abas embaixo), o placar do aluno (XP e
// dias seguidos), o idioma (PT | EN) e o botão de acessibilidade. O placar e a aba ativa são atualizados a cada troca
// de página; o topo e o rodapé são montados de novo quando o idioma muda.
import { NIVEIS } from '../conteudo/index.js';
import { calcularJornada, sequenciaDeDias, hojeLocal } from '../jogo/gamificacao.js';
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
        <ul>${LINKS().map(([href, ic, rotulo, curto]) => `<li><a href="${href}">${icone(ic)}<span>${curto ? `<span class="rotulo-longo">${rotulo}</span><span class="rotulo-curto">${curto}</span>` : rotulo}</span></a></li>`).join('')}</ul>
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
  const { xp } = calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
  const dias = sequenciaDeDias(ler(CHAVES.dias, []), hojeLocal());
  const placar = document.querySelector('.placar-topo');
  if (!placar) return;
  placar.setAttribute('aria-label', t(dias === 1 ? 'Seu placar: {xp} XP e {dias} dia seguido de estudo' : 'Seu placar: {xp} XP e {dias} dias seguidos de estudo', { xp, dias }));
  placar.innerHTML = `<span class="placar-item xp">${icone('raio')}${xp}<small>XP</small></span><span class="placar-item fogo${dias ? '' : ' apagado'}">${icone('chama')}${dias}</span>`;
}
