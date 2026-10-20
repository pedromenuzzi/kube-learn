// As páginas fora do exercício: início, trilha (o navio) e glossário.
import { NIVEIS } from '../conteudo/index.js';
import { GLOSSARIO } from '../conteudo/glossario.js';
import { calcularJornada, sequenciaDeDias, hojeLocal } from '../jogo/gamificacao.js';
import { ler, CHAVES } from '../armazenamento.js';
import { desenharNavio, CORES } from './navio.js';
import { svgSelo, linkCompartilhar } from './selos.js';
import { escapar } from './util.js';
import { icone } from './icones.js';

const jornadaAtual = () => calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
const ICONE_SALA = { concluido: 'certo', proximo: 'seguir', bloqueado: 'cadeado' };
const ROTULO = { concluido: 'resolvida', tentado: 'tentada', proximo: 'próxima', disponivel: 'disponível', bloqueado: 'bloqueada' };
const SITUACAO = { bloqueado: 'Bloqueado', carregando: 'Carregando', pronto: 'Pronto', lacrado: 'Lacrado!' };
const TIPO = { licao: ['Lição', 'chip-licao'], quiz: ['Quiz', 'chip-quiz'], facil: ['Fácil', 'chip-facil'], medio: ['Médio', 'chip-medio'], dificil: ['Difícil', 'chip-dificil'] };

function placar(j) {
  const dias = sequenciaDeDias(ler(CHAVES.dias, []), hojeLocal());
  return `
    <dl class="placar">
      <div><dt>XP</dt><dd>${j.xp}</dd></div>
      <div><dt>Dias seguidos</dt><dd>${dias}</dd></div>
      <div><dt>Níveis prontos</dt><dd>${j.niveisProntos} de ${NIVEIS.length}</dd></div>
    </dl>`;
}

const continuar = (j, classe = '') => (j.proximo
  ? `<a class="botao ${classe}" href="#/ex/${j.proximo.id}">${icone('play')}<span>${j.proximo.estado === 'tentado' ? 'Continuar' : 'Próxima missão'}: ${escapar(j.proximo.titulo)}</span></a>`
  : '<p>Tudo embarcado por aqui. Novos níveis chegam em breve!</p>');

export function paginaInicio() {
  return (main) => {
    const j = jornadaAtual();
    main.innerHTML = `
      <section class="heroi">
        <canvas class="navio" aria-hidden="true"></canvas>
        <div class="heroi-texto">
          <p class="heroi-selo">${icone('frasco')} Um cluster de verdade, simulado no navegador</p>
          <h1 class="pixel titulo-heroi">Aprenda Kubernetes contêiner por contêiner</h1>
          <p class="chamada">Você escreve YAML, usa o <code>kubectl</code> e vê os pods nascerem, quebrarem e voltarem.
             Cada missão resolvida embarca um contêiner no seu navio.</p>
          <p class="acoes">${continuar(j, 'botao-grande')} <a class="link-seta" href="#/trilha">Ver a trilha ${icone('seguir')}</a></p>
          <ul class="vantagens"><li>${icone('certo')} Sem conta</li><li>${icone('certo')} Sem custo</li><li>${icone('certo')} Tudo fica no seu navegador</li></ul>
        </div>
      </section>
      <section class="cartoes" aria-label="Como funciona">
        <article><span class="cartao-icone">${icone('terminal')}</span><h2>kubectl de verdade</h2><p>A saída do terminal é igual à de um cluster real (conferida contra um cluster kind). O que você aprende aqui vale lá fora.</p></article>
        <article><span class="cartao-icone">${icone('casa')}</span><h2>Vida real em tudo</h2><p>Pod é apartamento, Service é ramal, limite de memória é disjuntor. E cada comparação diz onde deixa de valer. <a href="#/glossario">Veja o glossário</a>.</p></article>
        <article><span class="cartao-icone">${icone('trilha')}</span><h2>Seu navio enche</h2><p>Cada missão embarca um contêiner com a cor do nível; com 70% de um nível, o próximo abre. Até onde a pilha aguenta?</p></article>
      </section>`;
    return { destruir: desenharNavio(main.querySelector('canvas'), j) };
  };
}

const sala = (i) => {
  const marca = `<span class="sala-marca" aria-hidden="true">${ICONE_SALA[i.estado] ? icone(ICONE_SALA[i.estado]) : ''}</span>`;
  const [tipo, classe] = TIPO[i.tipo === 'problema' ? i.dificuldade : i.tipo] ?? ['', ''];
  const resto = `<span class="chip ${classe}">${tipo}</span><span class="sala-xp">${i.xp} XP</span>`;
  return `<li class="sala-${i.estado}">${i.estado === 'bloqueado'
    ? `<span>${marca}<span class="sala-titulo">${escapar(i.titulo)} <span class="visualmente-oculto">(bloqueada)</span></span>${resto}</span>`
    : `<a href="#/ex/${i.id}">${marca}<span class="sala-titulo">${escapar(i.titulo)} <span class="visualmente-oculto">(${ROTULO[i.estado]})</span></span>${resto}</a>`}</li>`;
};

// Cada nível é um cartão que abre e fecha; abertos ficam só os que estão em andamento (o resto é um resumo).
function nivel(n) {
  const cor = n.desbloqueado && !n.concluido ? ` style="--cor-nivel: ${CORES[n.numero % CORES.length]}"` : '';
  const aberto = n.desbloqueado && !n.concluido;
  const status = n.emObra ? 'Em breve' : `${SITUACAO[n.situacao]} · ${n.resolvidos} de ${n.total} missões (${n.pct}%)`;
  return `
    <li class="nivel nivel-${n.emObra ? 'embreve' : n.situacao}" id="nivel-${n.numero}"${cor}>
      <details${aberto ? ' open' : ''}>
        <summary>
          ${n.concluido ? svgSelo(n, { tamanho: 36 }) : `<span class="nivel-icone" aria-hidden="true">${n.icone}</span>`}
          <span class="nivel-cabeca"><span class="pixel rotulo-nivel">Nível ${n.numero}</span><h2>${escapar(n.titulo)}</h2></span>
          <span class="nivel-situacao">${n.concluido ? '<span class="chip chip-ok">Lacrado</span>' : n.emObra ? '<span class="chip">Em breve</span>' : !n.desbloqueado ? `<span class="chip">${icone('cadeado')} Bloqueado</span>` : ''}${icone('divisa', 'icone divisa')}</span>
          <span class="nivel-barra"><span class="nivel-status">${status}</span>${n.emObra ? '' : `<span class="barra" aria-hidden="true"><span style="width: ${n.pct}%"></span></span>`}</span>
        </summary>
        <div class="nivel-corpo">
          <p class="nota">${escapar(n.descricao)}</p>
          ${n.emObra ? '<p class="nota">As missões deste nível ainda estão sendo escritas.</p>' : ''}
          ${!n.emObra && !n.desbloqueado ? '<p class="nota">Abre quando o nível anterior tiver 70% das missões resolvidas.</p>' : ''}
          ${n.concluido ? `<div class="nivel-selo"><p><b>Lacrado!</b> Nível concluído. <a href="${linkCompartilhar()}" target="_blank" rel="noopener">Compartilhar no LinkedIn</a></p></div>` : ''}
          ${n.itens.length ? `<ul class="salas">${n.itens.map(sala).join('')}</ul>` : ''}
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
          <div><p class="sobretitulo">A trilha</p><h1 class="pixel">Seu navio</h1></div>
          ${placar(j)}
        </header>
        <div class="trilha-corpo">
          <aside class="trilha-lateral" aria-label="Seu navio">
            <canvas class="navio" aria-hidden="true"></canvas>
            ${continuar(j)}
            <p class="atalhos"><a href="#/revisao">${icone('cartas')} Revisão do dia</a> <a href="#/certificado">${icone('lacre')} Seus lacres</a></p>
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

const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function paginaGlossario() {
  return (main) => {
    const grupos = NIVEIS.map((n) => ({ n, termos: GLOSSARIO.filter((g) => g.nivel === n.numero) })).filter((g) => g.termos.length);
    main.innerHTML = `
      <p class="sobretitulo">Referência</p>
      <h1 class="pixel">Glossário</h1>
      <p>Cada termo com a definição, a comparação com a vida real e onde a comparação deixa de valer.</p>
      <div class="glossario-barra">
        <p class="campo-busca">${icone('busca')}<label for="busca-glossario" class="visualmente-oculto">Buscar</label>
          <input id="busca-glossario" type="search" placeholder="Buscar: pod, service, disjuntor..." autocomplete="off"></p>
        <div class="filtros" role="group" aria-label="Filtrar por nível">
          <button type="button" aria-pressed="true" data-nivel="">Todos</button>
          ${grupos.map(({ n }) => `<button type="button" aria-pressed="false" data-nivel="${n.numero}"><span aria-hidden="true">${n.icone}</span> ${escapar(n.titulo)}</button>`).join('')}
        </div>
      </div>
      <p class="nota" role="status" aria-live="polite" id="glossario-total">${GLOSSARIO.length} termos</p>
      ${grupos.map(({ n, termos }) => `
        <section class="grupo-glossario" data-nivel="${n.numero}" aria-labelledby="g-${n.numero}">
          <h2 id="g-${n.numero}"><span aria-hidden="true">${n.icone}</span> ${escapar(n.titulo)}</h2>
          <div class="grade-termos">${termos.map((g) => `
          <article class="termo" id="termo-${g.id}" data-busca="${escapar(semAcento([g.termo, g.definicao, g.vidaReal].join(' ')))}">
            <h3>${escapar(g.termo)}</h3>
            <p>${escapar(g.definicao)}</p>
            <p class="vida-real"><b>Na vida real:</b> ${escapar(g.vidaReal)}</p>
            <p class="limite"><b>Onde quebra:</b> ${escapar(g.limite)}</p>
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
      main.querySelector('#glossario-total').textContent = `${total} ${total === 1 ? 'termo' : 'termos'}`;
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
