// As páginas fora do exercício: início, trilha (o navio) e glossário.
import { NIVEIS, TROUBLESHOOTING } from '../conteudo/index.js';
import { GLOSSARIO } from '../conteudo/glossario.js';
import { calcularJornada, sequenciaDeDias, hojeLocal } from '../jogo/gamificacao.js';
import { termosVistos } from '../jogo/revisao.js';
import { cartoesParaHoje, numerosDosDias } from '../jogo/hoje.js';
import { ler, CHAVES } from '../armazenamento.js';
import { desenharNavio, CORES } from './navio.js';
import { svgSelo, linkCompartilhar } from './selos.js';
import { escapar } from './util.js';
import { icone } from './icones.js';
import { t } from '../i18n.js';

const jornadaAtual = () => calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
const ICONE_SALA = { concluido: 'certo', proximo: 'seguir', bloqueado: 'cadeado' };
const ROTULO = () => ({ concluido: t('resolvida'), tentado: t('tentada'), proximo: t('próxima'), disponivel: t('disponível'), bloqueado: t('bloqueada') });
const SITUACAO = () => ({ bloqueado: t('Bloqueado'), carregando: t('Carregando'), pronto: t('Pronto'), lacrado: t('Lacrado!') });
const DIFICULDADE = () => ({ facil: t('Fácil'), medio: t('Médio'), dificil: t('Difícil') });

function placar(j) {
  const dias = sequenciaDeDias(ler(CHAVES.dias, []), hojeLocal());
  return `
    <dl class="placar">
      <div><dt>XP</dt><dd>${j.xp}</dd></div>
      <div><dt>${t('Dias seguidos')}</dt><dd>${dias}</dd></div>
      <div><dt>${t('Níveis prontos')}</dt><dd>${t('{n} de {total}', { n: j.niveisProntos, total: NIVEIS.length })}</dd></div>
    </dl>`;
}

const continuar = (j, classe = '') => (j.proximo
  ? `<a class="botao ${classe}" href="#/ex/${j.proximo.id}">${icone('play')}<span>${j.proximo.estado === 'tentado' ? t('Continuar') : t('Próxima missão')}: ${escapar(j.proximo.titulo)}</span></a>`
  : `<p>${t('Tudo embarcado por aqui. Novos níveis chegam em breve!')}</p>`);

/** O painel de quem volta: a sequência, o próximo passo, a revisão de hoje e o que ficou para depois. */
function painelHoje(j) {
  const hoje = hojeLocal();
  const dias = ler(CHAVES.dias, []);
  const n = numerosDosDias(dias, hoje, sequenciaDeDias(dias, hoje));
  const cartoes = cartoesParaHoje({ termos: termosVistos(GLOSSARIO, j), estado: ler(CHAVES.revisao, {}), hoje });
  const depois = j.niveis.flatMap((x) => x.itens).filter((i) => i.estado === 'tentado' && i.id !== j.proximo?.id).slice(0, 3);
  // Sem cobrança: a sequência quebrada vira convite, e a melhor e o total de dias ficam (o esforço não some).
  const selo = n.atual > 1 ? t('{n} dias seguidos. Bora manter?', { n: n.atual })
    : n.atual === 1 ? t('Primeiro dia da sequência. Amanhã tem mais.')
      : t('Recomeçar hoje vale: 2 minutos de revisão já contam.');
  return `
    <div class="heroi-texto hoje">
      <p class="heroi-selo">${icone('chama')} ${selo}</p>
      <h1 class="pixel titulo-heroi">${t('Bom te ver de volta')}</h1>
      <dl class="hoje-numeros">
        <div><dt>${t('Dias seguidos')}</dt><dd>${n.atual}</dd></div>
        <div><dt>${t('Melhor sequência')}</dt><dd>${n.melhor}</dd></div>
        <div><dt>${t('Dias de estudo')}</dt><dd>${n.total}</dd></div>
        <div><dt>XP</dt><dd>${j.xp}</dd></div>
      </dl>
      <p class="acoes">${continuar(j, 'botao-grande')}</p>
      <p class="hoje-revisao">${cartoes
    ? `<a class="link-seta" href="#/revisao">${icone('cartas')} ${t(cartoes === 1 ? 'Revisão do dia: 1 cartão, uns 2 minutos' : 'Revisão do dia: {n} cartões, uns 2 minutos', { n: cartoes })} ${icone('seguir')}</a>`
    : `${icone('certo')} ${t('Revisão do dia em dia.')}`}</p>
      ${depois.length ? `<div class="hoje-depois"><p>${t('Ficaram para depois:')}</p><ul>${depois.map((i) => `<li><a href="#/ex/${i.id}">${escapar(i.titulo)}</a></li>`).join('')}</ul></div>` : ''}
    </div>`;
}

export function paginaInicio() {
  return (main) => {
    const j = jornadaAtual();
    const voltou = Object.keys(ler(CHAVES.progresso, {})).length > 0;
    main.innerHTML = `
      <section class="heroi">
        <canvas class="navio" aria-hidden="true"></canvas>
        ${voltou ? painelHoje(j) : `<div class="heroi-texto">
          <p class="heroi-selo">${icone('frasco')} ${t('Um cluster de verdade, simulado no navegador')}</p>
          <h1 class="pixel titulo-heroi">${t('Aprenda Kubernetes contêiner por contêiner')}</h1>
          <p class="chamada">${t('Você escreve YAML, usa o <code>kubectl</code> e vê os pods nascerem, quebrarem e voltarem. Cada missão resolvida embarca um contêiner no seu navio.')}</p>
          <p class="acoes">${continuar(j, 'botao-grande')} <a class="link-seta" href="#/trilha">${t('Ver a trilha')} ${icone('seguir')}</a></p>
          <ul class="vantagens"><li>${icone('certo')} ${t('Sem conta')}</li><li>${icone('certo')} ${t('Sem custo')}</li><li>${icone('certo')} ${t('Tudo fica no seu navegador')}</li></ul>
        </div>`}
      </section>
      ${voltou ? '' : `<section class="cartoes" aria-label="${t('Como funciona')}">
        <article><span class="cartao-icone">${icone('terminal')}</span><h2>${t('kubectl de verdade')}</h2><p>${t('A saída do terminal é igual à de um cluster real (conferida contra um cluster kind). O que você aprende aqui vale lá fora.')}</p></article>
        <article><span class="cartao-icone">${icone('casa')}</span><h2>${t('Vida real em tudo')}</h2><p>${t('Pod é apartamento, Service é ramal, limite de memória é disjuntor. E cada comparação diz onde deixa de valer. <a href="#/glossario">Veja o glossário</a>.')}</p></article>
        <article><span class="cartao-icone">${icone('trilha')}</span><h2>${t('Seu navio enche')}</h2><p>${t('Cada missão embarca um contêiner com a cor do nível; com 70% de um nível, o próximo abre. Até onde a pilha aguenta?')}</p></article>
      </section>`}`;
    return { destruir: desenharNavio(main.querySelector('canvas'), j) };
  };
}

const sala = (i) => {
  const marca = `<span class="sala-marca" aria-hidden="true">${ICONE_SALA[i.estado] ? icone(ICONE_SALA[i.estado]) : ''}</span>`;
  // Prática (no terminal ou no editor, com cluster e testes), lição ou quiz: o chip diz o que a missão é.
  const chip = i.tipo === 'problema'
    ? `<span class="chip chip-${i.dificuldade}" title="${i.terminal ? t('Prática no terminal') : t('Prática no editor')}">${icone(i.terminal ? 'terminal' : 'editor')}<span class="chip-texto">${t('Prática')} · ${DIFICULDADE()[i.dificuldade]}</span></span>`
    : i.tipo === 'licao'
      ? `<span class="chip chip-licao">${icone('livro')}<span class="chip-texto">${t('Lição')}</span></span>`
      : `<span class="chip chip-quiz">${icone('lista')}<span class="chip-texto">Quiz</span></span>`;
  const resto = `${chip}<span class="sala-xp">${i.xp} XP</span>`;
  return `<li class="sala-${i.estado}">${i.estado === 'bloqueado'
    ? `<span>${marca}<span class="sala-titulo">${escapar(i.titulo)} <span class="visualmente-oculto">(${t('bloqueada')})</span></span>${resto}</span>`
    : `<a href="#/ex/${i.id}">${marca}<span class="sala-titulo">${i.projeto ? `<span class="visualmente-oculto">${t('{projeto}, etapa {etapa}', { projeto: escapar(i.projeto.titulo), etapa: i.projeto.etapa })}: </span>` : ''}${escapar(i.titulo)} <span class="visualmente-oculto">(${ROTULO()[i.estado]})</span></span>${resto}</a>`}</li>`;
};

/** "2 leituras · 12 práticas (5 no terminal)": o que o nível tem. */
function contagem(itens) {
  const leituras = itens.filter((i) => i.tipo === 'licao').length;
  const quizzes = itens.filter((i) => i.tipo === 'quiz').length;
  const praticas = itens.filter((i) => i.tipo === 'problema');
  const noTerminal = praticas.filter((i) => i.terminal).length;
  const plural = (n, um, varios) => t(n === 1 ? um : varios, { n });
  const pr = praticas.length && plural(praticas.length, '{n} prática', '{n} práticas');
  return [
    leituras && plural(leituras, '{n} lição', '{n} lições'),
    pr && (noTerminal ? t('{praticas} ({n} no terminal)', { praticas: pr, n: noTerminal }) : pr),
    quizzes && plural(quizzes, '{n} quiz', '{n} quizzes'),
  ].filter(Boolean).join(' · ');
}

// Cada nível é um cartão que abre e fecha; abertos ficam só os que estão em andamento (o resto é um resumo).
function nivel(n) {
  const cor = n.desbloqueado && !n.concluido ? ` style="--cor-nivel: ${CORES[n.numero % CORES.length]}"` : '';
  const aberto = n.desbloqueado && !n.concluido;
  const status = n.emObra ? t('Em breve') : `${SITUACAO()[n.situacao]} · ${t('{n} de {total} missões ({pct}%)', { n: n.resolvidos, total: n.total, pct: n.pct })}`;
  return `
    <li class="nivel nivel-${n.emObra ? 'embreve' : n.situacao}" id="nivel-${n.numero}"${cor}>
      <details${aberto ? ' open' : ''}>
        <summary>
          ${n.concluido ? svgSelo(n, { tamanho: 36 }) : `<span class="nivel-icone" aria-hidden="true">${n.icone}</span>`}
          <span class="nivel-cabeca"><span class="pixel rotulo-nivel">${t('Nível {n}', { n: n.numero })}</span><h2>${escapar(n.titulo)}</h2></span>
          <span class="nivel-situacao">${n.concluido ? `<span class="chip chip-ok">${t('Lacrado')}</span>` : n.emObra ? `<span class="chip">${t('Em breve')}</span>` : !n.desbloqueado ? `<span class="chip">${icone('cadeado')} ${t('Bloqueado')}</span>` : ''}${icone('divisa', 'icone divisa')}</span>
          <span class="nivel-barra"><span class="nivel-status">${status}</span>${n.emObra ? '' : `<span class="barra" aria-hidden="true"><span style="width: ${n.pct}%"></span></span>`}</span>
        </summary>
        <div class="nivel-corpo">
          <p class="nota">${escapar(n.descricao)}</p>
          ${n.itens.length ? `<p class="nivel-conta">${contagem(n.itens)}</p>` : ''}
          ${n.emObra ? `<p class="nota">${t('As missões deste nível ainda estão sendo escritas.')}</p>` : ''}
          ${!n.emObra && !n.desbloqueado ? `<p class="nota">${t('Abre quando o nível anterior tiver 70% das missões resolvidas.')}</p>` : ''}
          ${n.concluido ? `<div class="nivel-selo"><p>${t('<b>Lacrado!</b> Nível concluído.')} <a href="${linkCompartilhar()}" target="_blank" rel="noopener">${t('Compartilhar no LinkedIn')}</a></p></div>` : ''}
          ${n.itens.length ? `<ul class="salas">${n.itens.map((i) => (i.projeto?.etapa === 1 ? `<li class="sala-grupo" aria-hidden="true">${icone('arvore')} ${escapar(i.projeto.titulo)}</li>` : '') + sala(i)).join('')}</ul>` : ''}
        </div>
      </details>
    </li>`;
}

export function paginaTrilha() {
  return (main) => {
    const j = jornadaAtual();
    main.innerHTML = `
      <div class="trilha">
        <header class="trilha-topo">
          <div><p class="sobretitulo">${t('A trilha')}</p><h1 class="pixel">${t('Seu navio')}</h1></div>
          ${placar(j)}
        </header>
        <div class="trilha-corpo">
          <aside class="trilha-lateral" aria-label="${t('Seu navio')}">
            <canvas class="navio" aria-hidden="true"></canvas>
            ${continuar(j)}
            <p class="atalhos"><a href="#/revisao">${icone('cartas')} ${t('Revisão do dia')}</a> <a href="#/certificado">${icone('lacre')} ${t('Seus lacres')}</a></p>
          </aside>
          <ol class="niveis">${j.niveis.map(nivel).join('')}
          </ol>
        </div>
      </div>`;
    const parar = desenharNavio(main.querySelector('canvas'), j);
    const atual = j.proximo ? main.querySelector(`#nivel-${j.proximo.nivel}`) : null;
    if (atual && atual.getBoundingClientRect().top > innerHeight * 0.6) atual.scrollIntoView({ block: 'start' });
    return { destruir: parar };
  };
}

// Os incidentes da seção Troubleshooting: o relato de cada morador e se você já resolveu.
const SITUACAO_CHAMADO = () => ({ resolvido: ['chip-ok', 'certo', t('Resolvido')], tentado: ['chip-medio', 'relogio', t('Em andamento')] });
const chamado = (i, status) => {
  const situacao = SITUACAO_CHAMADO()[status];
  return `
    <li class="chamado">
      <p class="chamado-chips"><span class="chip chip-${i.dificuldade}">${icone('terminal')} ${DIFICULDADE()[i.dificuldade]}</span>${situacao ? ` <span class="chip ${situacao[0]}">${icone(situacao[1])} ${situacao[2]}</span>` : ''}</p>
      <h2><a href="#/ex/${i.id}">${escapar(i.titulo)}</a></h2>
      <blockquote class="relato"><p>${i.relato}</p><footer>${escapar(i.morador)}</footer></blockquote>
    </li>`;
};

export function paginaTroubleshooting() {
  const progresso = ler(CHAVES.progresso, {});
  return `
    <p class="sobretitulo">${t('Plantão')}</p>
    <h1 class="pixel">Troubleshooting</h1>
    <p>${t('Clusters que chegam quebrados com <b>mais de um defeito</b>: cada conserto revela o próximo. Investigue no terminal (<code>get</code>, <code>describe</code>, <code>logs</code>, <code>get events</code>) e conserte até o morador ficar satisfeito. Abre desde o começo e não vale XP: é treino de plantão. Os incidentes de um defeito só ficam no <a href="#/trilha">nível 9 da trilha</a>.')}</p>
    <ul class="chamados">${TROUBLESHOOTING.map((i) => chamado(i, progresso[i.id]?.status)).join('')}</ul>`;
}

const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function paginaGlossario() {
  return (main) => {
    const grupos = NIVEIS.map((n) => ({ n, termos: GLOSSARIO.filter((g) => g.nivel === n.numero) })).filter((g) => g.termos.length);
    main.innerHTML = `
      <p class="sobretitulo">${t('Referência')}</p>
      <h1 class="pixel">${t('Glossário')}</h1>
      <p>${t('Cada termo com a definição, a comparação com a vida real e onde a comparação deixa de valer.')}</p>
      <div class="glossario-barra">
        <p class="campo-busca">${icone('busca')}<label for="busca-glossario" class="visualmente-oculto">${t('Buscar')}</label>
          <input id="busca-glossario" type="search" placeholder="${t('Buscar: pod, service, disjuntor...')}" autocomplete="off"></p>
        <div class="filtros" role="group" aria-label="${t('Filtrar por nível')}">
          <button type="button" aria-pressed="true" data-nivel="">${t('Todos')}</button>
          ${grupos.map(({ n }) => `<button type="button" aria-pressed="false" data-nivel="${n.numero}"><span aria-hidden="true">${n.icone}</span> ${escapar(n.titulo)}</button>`).join('')}
        </div>
      </div>
      <p class="nota" role="status" aria-live="polite" id="glossario-total">${t('{n} termos', { n: GLOSSARIO.length })}</p>
      ${grupos.map(({ n, termos }) => `
        <section class="grupo-glossario" data-nivel="${n.numero}" aria-labelledby="g-${n.numero}">
          <h2 id="g-${n.numero}"><span aria-hidden="true">${n.icone}</span> ${escapar(n.titulo)}</h2>
          <div class="grade-termos">${termos.map((g) => `
          <article class="termo" id="termo-${g.id}" data-busca="${escapar(semAcento([g.termo, g.definicao, g.vidaReal].join(' ')))}">
            <h3>${escapar(g.termo)}</h3>
            <p>${escapar(g.definicao)}</p>
            <p class="vida-real"><b>${t('Na vida real:')}</b> ${escapar(g.vidaReal)}</p>
            <p class="limite"><b>${t('Onde quebra:')}</b> ${escapar(g.limite)}</p>
            ${g.exemplo ? `<pre><code>${escapar(g.exemplo)}</code></pre>` : ''}
          </article>`).join('')}
          </div>
        </section>`).join('')}`;
    const busca = main.querySelector('#busca-glossario');
    let nivel = '';
    const filtrar = () => {
      const q = semAcento(busca.value.trim());
      let total = 0;
      for (const s of main.querySelectorAll('.grupo-glossario')) {
        let n = 0;
        if (!nivel || s.dataset.nivel === nivel) {
          for (const a of s.querySelectorAll('.termo')) {
            a.hidden = !!q && !a.dataset.busca.includes(q);
            n += !a.hidden;
          }
        }
        s.hidden = !n;
        total += n;
      }
      main.querySelector('#glossario-total').textContent = t(total === 1 ? '{n} termo' : '{n} termos', { n: total });
    };
    busca.addEventListener('input', filtrar);
    main.querySelector('.filtros').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      nivel = b.dataset.nivel;
      for (const x of main.querySelectorAll('.filtros button')) x.setAttribute('aria-pressed', String(x === b));
      filtrar();
    });
    return {};
  };
}
