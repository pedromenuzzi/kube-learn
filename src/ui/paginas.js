// As páginas fora do exercício: início, trilha (o prédio) e glossário.
import { NIVEIS } from '../conteudo/index.js';
import { GLOSSARIO } from '../conteudo/glossario.js';
import { calcularJornada, sequenciaDeDias, hojeLocal } from '../jogo/gamificacao.js';
import { ler, CHAVES } from '../armazenamento.js';
import { desenharPredio } from './predio.js';
import { escapar } from './util.js';

const jornadaAtual = () => calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
const nomeDoAndar = (n) => (n === 0 ? 'Térreo' : n === NIVEIS.length - 1 ? `${n}º andar · Cobertura` : `${n}º andar`);
const MARCA = { concluido: '✅', tentado: '🟡', proximo: '👉', disponivel: '⬜', bloqueado: '🔒' };
const ROTULO = { concluido: 'resolvida', tentado: 'tentada', proximo: 'próxima', disponivel: 'disponível', bloqueado: 'bloqueada' };
const STATUS_ANDAR = { planta: 'Bloqueado', obra: 'Em obra', pronto: 'Pronto', 'habite-se': '🔑 Habite-se' };

function placar(j) {
  const dias = sequenciaDeDias(ler(CHAVES.dias, []), hojeLocal());
  return `
    <dl class="placar">
      <div><dt>XP</dt><dd>${j.xp}</dd></div>
      <div><dt>🔥 Dias seguidos</dt><dd>${dias}</dd></div>
      <div><dt>Andares prontos</dt><dd>${j.andaresProntos} de ${NIVEIS.length}</dd></div>
    </dl>`;
}

const continuar = (j) => (j.proximo
  ? `<a class="botao" href="#/ex/${j.proximo.id}">▶ ${j.proximo.estado === 'tentado' ? 'Continuar' : 'Próxima missão'}: ${escapar(j.proximo.titulo)}</a>`
  : '<p>🏙️ Tudo resolvido por aqui. Novos andares chegam em breve!</p>');

export function paginaInicio() {
  return (main) => {
    const j = jornadaAtual();
    main.innerHTML = `
      <section class="heroi">
        <div>
          <h1 class="pixel titulo-heroi">Aprenda Kubernetes andar por andar</h1>
          <p class="chamada">Um cluster de verdade, só que simulado no seu navegador: você escreve YAML, usa o <code>kubectl</code>
             e vê os pods nascerem, quebrarem e voltarem. Cada ideia vem com uma comparação com a vida real.</p>
          <p class="chamada">Cada nível concluído ergue mais um andar do seu prédio, até virar arranha-céu.</p>
          <p class="acoes">${continuar(j)} <a href="#/trilha">Ver o prédio</a></p>
          <p class="nota">Sem conta, sem custo e sem cadastro. Tudo fica no seu navegador.</p>
        </div>
        <canvas class="predio predio-heroi" aria-hidden="true"></canvas>
      </section>
      <section class="cartoes" aria-label="Como funciona">
        <article><h2>🖥️ kubectl de verdade</h2><p>A saída do terminal é igual à de um cluster real (conferida contra um cluster kind). O que você aprende aqui vale lá fora.</p></article>
        <article><h2>🏠 Vida real em tudo</h2><p>Pod é apartamento, Service é ramal, limite de memória é disjuntor. E cada comparação diz onde deixa de valer. <a href="#/glossario">Veja o glossário</a>.</p></article>
        <article><h2>🏗️ Seu prédio sobe</h2><p>Cada missão resolvida acende uma janela; com 70% de um nível, o andar de cima abre.</p></article>
      </section>`;
    desenharPredio(main.querySelector('canvas'), j);
    return {};
  };
}

export function paginaTrilha() {
  return (main) => {
    const j = jornadaAtual();
    main.innerHTML = `
      <div class="trilha">
        <header class="trilha-topo">
          <h1 class="pixel">Seu prédio</h1>
          ${placar(j)}
          <p>${continuar(j)}</p>
        </header>
        <div class="trilha-corpo">
          <canvas class="predio" aria-hidden="true"></canvas>
          <ol class="andares">${j.niveis.map((n) => `
            <li class="andar andar-${n.andar}" id="andar-${n.numero}">
              <h2><span class="pixel rotulo-andar">${nomeDoAndar(n.numero)}</span> ${n.icone} ${escapar(n.titulo)}</h2>
              <p class="andar-status">${n.emObra ? '🚧 Em obra: as missões deste nível chegam em breve.' : `${STATUS_ANDAR[n.andar]} · ${n.resolvidos} de ${n.total} missões (${n.pct}%)`}</p>
              <p class="nota">${escapar(n.descricao)}</p>
              ${!n.emObra && !n.desbloqueado ? '<p class="nota">🔒 Abre quando o andar de baixo tiver 70% das missões resolvidas.</p>' : ''}
              ${!n.emObra ? `<progress max="100" value="${n.pct}" aria-label="Progresso do ${nomeDoAndar(n.numero)}">${n.pct}%</progress>` : ''}
              ${n.itens.length ? `<ul class="salas">${n.itens.map((i) => `
                <li class="sala-${i.estado}">${i.estado === 'bloqueado'
    ? `<span aria-label="${escapar(i.titulo)} (bloqueada)">${MARCA.bloqueado} ${escapar(i.titulo)}</span>`
    : `<a href="#/ex/${i.id}"><span aria-hidden="true">${MARCA[i.estado]}</span> ${escapar(i.titulo)} <span class="visualmente-oculto">(${ROTULO[i.estado]})</span></a>`}
                  <span class="selo">${i.xp} XP</span></li>`).join('')}</ul>` : ''}
            </li>`).join('')}
          </ol>
        </div>
      </div>`;
    desenharPredio(main.querySelector('canvas'), j);
    const atual = j.proximo ? main.querySelector(`#andar-${j.proximo.nivel}`) : null;
    atual?.scrollIntoView({ block: 'center' });
    return {};
  };
}

const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function paginaGlossario() {
  return (main) => {
    main.innerHTML = `
      <h1 class="pixel">Glossário</h1>
      <p>Cada termo com a definição, a comparação com a vida real e onde a comparação deixa de valer.</p>
      <p><label for="busca-glossario">Buscar</label>
        <input id="busca-glossario" type="search" placeholder="pod, service, disjuntor..." autocomplete="off"></p>
      <p class="nota" role="status" aria-live="polite" id="glossario-total">${GLOSSARIO.length} termos</p>
      ${NIVEIS.map((n) => {
    const termos = GLOSSARIO.filter((g) => g.nivel === n.numero);
    return termos.length ? `
        <section class="grupo-glossario" aria-labelledby="g-${n.numero}">
          <h2 id="g-${n.numero}">${n.icone} ${escapar(n.titulo)}</h2>
          ${termos.map((g) => `
          <article class="termo" id="termo-${g.id}" data-busca="${escapar(semAcento([g.termo, g.definicao, g.vidaReal].join(' ')))}">
            <h3>${escapar(g.termo)}</h3>
            <p>${escapar(g.definicao)}</p>
            <p class="vida-real"><span aria-hidden="true">🏠</span> <b>Na vida real:</b> ${escapar(g.vidaReal)}</p>
            <p class="limite"><span aria-hidden="true">⚠️</span> <b>Onde quebra:</b> ${escapar(g.limite)}</p>
            ${g.exemplo ? `<pre><code>${escapar(g.exemplo)}</code></pre>` : ''}
          </article>`).join('')}
        </section>` : '';
  }).join('')}`;
    const busca = main.querySelector('#busca-glossario');
    busca.addEventListener('input', () => {
      const q = semAcento(busca.value.trim());
      let n = 0;
      for (const a of main.querySelectorAll('.termo')) {
        const mostra = !q || a.dataset.busca.includes(q);
        a.hidden = !mostra;
        n += mostra;
      }
      for (const s of main.querySelectorAll('.grupo-glossario')) s.hidden = ![...s.querySelectorAll('.termo')].some((a) => !a.hidden);
      main.querySelector('#glossario-total').textContent = `${n} ${n === 1 ? 'termo' : 'termos'}`;
    });
    return {};
  };
}
