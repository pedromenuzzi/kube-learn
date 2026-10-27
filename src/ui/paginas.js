// As páginas fora do exercício: início, trilha (o navio), as seções (Troubleshooting, Oficina, Plantão do dia), o Diário de
// bordo e o glossário. O início e a trilha usam só o índice leve e desenham na hora; as outras trazem o texto que mostram
// por import() (devolvem uma promessa, e o main.js mostra "Carregando…" enquanto isso).
import { NIVEIS, GLOSSARIO } from '../conteudo/indice.js';
import { calcularJornada, sequenciaDeDias, hojeLocal } from '../jogo/gamificacao.js';
import { somarDias, termosVistos } from '../jogo/revisao.js';
import { atividadePorDia, calendario, cartoesParaHoje, numerosDosDias } from '../jogo/hoje.js';
import { chamadoDoDia, NIVEL_DO_PLANTAO } from '../jogo/rodizio.js';
import { marcasDoDia, diaCumprido, lembreteIcs } from '../jogo/ritual.js';
import { ler, CHAVES } from '../armazenamento.js';
import { desenharNavio, CORES } from './navio.js';
import { svgSelo, linkCompartilhar, SITE } from './selos.js';
import { compartilharResultado, htmlCompartilhar, tempoEEntregas, textoDoPlantao } from './compartilhar.js';
import { escapar, minutosESegundos } from './util.js';
import { icone } from './icones.js';
import { idioma, t } from '../i18n.js';

const jornadaAtual = () => calcularJornada(NIVEIS, ler(CHAVES.progresso, {}), ler(CHAVES.conquistas, {}));
const ICONE_SALA = { concluido: 'certo', proximo: 'seguir', bloqueado: 'cadeado' };
const ROTULO = () => ({ concluido: t('resolvida'), tentado: t('tentada'), proximo: t('próxima'), disponivel: t('disponível'), bloqueado: t('bloqueada') });
const SITUACAO = () => ({ bloqueado: t('Bloqueado'), carregando: t('Carregando'), pronto: t('Pronto'), lacrado: t('Lacrado!') });
const DIFICULDADE = () => ({ facil: t('Fácil'), medio: t('Médio'), dificil: t('Difícil') });
/** 'qui., 22 de out.' / 'Thu, Oct 22' */
const dataCurta = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString(idioma() === 'en' ? 'en-US' : 'pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const resolvido = (progresso, id) => progresso[id]?.status === 'resolvido';

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
  : j.navioCheio
    ? `<a class="botao ${classe}" href="#/certificado">${icone('lacre')}<span>${t('Pegar o seu certificado')}</span></a>`
    : `<p>${t('Tudo embarcado por aqui. Novos níveis chegam em breve!')}</p>`);

// O Plantão do dia traz dois defeitos dos níveis 3 a 7: no painel, ele vira link quando o Nível NIVEL_DO_PLANTAO
// (jogo/plantao.js) abre. A Oficina usa Deployment: abre com o Nível 2.
const NIVEL_DA_OFICINA = 2;

/** O dia de hoje: as marcas do ritual, se ele está cumprido, os cartões da revisão e o plantão (null antes do Nível 6). */
function diaDeHoje(j, hoje) {
  const progresso = ler(CHAVES.progresso, {});
  const vistos = termosVistos(GLOSSARIO, j);
  const cartoes = cartoesParaHoje({ termos: vistos, estado: ler(CHAVES.revisao, {}), hoje });
  const plantao = j.niveis[NIVEL_DO_PLANTAO].desbloqueado ? chamadoDoDia(hoje) : null;
  const marcas = marcasDoDia({ jornada: j, progresso, hoje, termos: vistos.length, cartoes, plantao: plantao?.id });
  // Sem termos vistos, a revisão espera a primeira missão da trilha que traz cartões (hoje, a lição de imagem e contêiner).
  const primeirosCartoes = vistos.length ? null : j.niveis.flatMap((n) => n.itens).find((i) => i.estado !== 'concluido' && GLOSSARIO.some((g) => g.item === i.id));
  return { hoje, marcas, cumprido: diaCumprido(marcas), termos: vistos.length, cartoes, plantao, primeirosCartoes };
}

/** O ritual do dia: cada marca diz em texto se está feita e, com tudo feito, o dia ganha um fecho (sem "só mais uma"). */
function ritual(dia) {
  if (!dia.marcas.length) return '';
  const rotulo = {
    missao: () => t('Uma missão da trilha'),
    revisao: (feito) => (feito ? t('Revisão do dia em dia.')
      : dia.primeirosCartoes ? t('Revisão do dia: os primeiros cartões chegam com «{titulo}»', { titulo: escapar(dia.primeirosCartoes.titulo) })
      : `<a class="link-seta" href="#/revisao">${t(dia.cartoes === 1 ? 'Revisão do dia: 1 cartão, uns 2 minutos' : 'Revisão do dia: {n} cartões, uns 2 minutos', { n: dia.cartoes })} ${icone('seguir')}</a>`),
    plantao: (feito) => (feito ? t('Plantão do dia atendido. O morador agradece!')
      : `<a class="link-seta" href="#/ex/${dia.plantao.id}">${t('Plantão do dia: {titulo}', { titulo: escapar(dia.plantao.titulo) })} ${icone('seguir')}</a>`),
  };
  return `
      <section class="ritual" aria-labelledby="ritual-titulo">
        <h2 id="ritual-titulo">${t('Ritual do dia')} <span>${t('{n} de {total}', { n: dia.marcas.filter((m) => m.feito).length, total: dia.marcas.length })}</span></h2>
        <ul>${dia.marcas.map((m) => `
          <li class="${m.feito ? 'ritual-feito' : 'ritual-falta'}${m.id === 'revisao' ? ' hoje-cartoes' : ''}"><span class="ritual-marca">${m.feito ? `${icone('certo')}${t('Feito')}` : t('A fazer')}</span> <span>${rotulo[m.id](m.feito)}</span></li>`).join('')}
        </ul>
        ${dia.cumprido ? `<p class="ritual-fecho" role="status">${icone('certo')} ${t('Dia cumprido. Bom descanso, amanhã tem mais.')}</p>` : ''}
      </section>`;
}

/**
 * O lembrete diário: o aluno escolhe a hora e baixa um .ics para a própria agenda (feito aqui; nada sai do navegador).
 * `aberto`: o primeiro dia que fecha já mostra o lembrete (é a hora de marcar o de amanhã).
 */
const lembrete = (aberto = false) => `
      <details class="lembrete"${aberto ? ' open' : ''}>
        <summary>${icone('relogio')} ${t('Lembrete diário')}</summary>
        <p class="nota">${t('Escolha a hora e abra o arquivo na sua agenda (Google Agenda, Outlook, celular): ela avisa todo dia. O arquivo é feito aqui mesmo, e nada sai do navegador.')}</p>
        <form>
          <label for="lembrete-hora">${t('Horário')}</label>
          <input id="lembrete-hora" name="hora" type="time" value="19:00" required>
          <button type="submit">${icone('baixar')} ${t('Baixar o lembrete (.ics)')}</button>
        </form>
        <p class="nota lembrete-aviso" role="status"></p>
      </details>`;

function baixarLembrete(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const hora = form.elements.hora.value;
  const ics = lembreteIcs({
    hora, hoje: hojeLocal(), agora: new Date(), url: SITE,
    titulo: t('kube-learn: hora da sua missão'),
    descricao: t('Uma missão e a revisão do dia, uns 15 minutos. Pulou um dia? Tudo bem: amanhã tem mais.'),
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'kube-learn-lembrete.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); // depois que o download começou
  form.nextElementSibling.textContent = t('Lembrete baixado: todo dia às {hora}. Abra o arquivo kube-learn-lembrete.ics para pô-lo na sua agenda.', { hora });
}

/** O painel de quem volta: a sequência, o próximo passo, o ritual do dia e o que ficou para depois. */
function painelHoje(j, dia) {
  const { hoje } = dia;
  const dias = ler(CHAVES.dias, []);
  const n = numerosDosDias(dias, hoje, sequenciaDeDias(dias, hoje));
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
      ${dia.cumprido && j.proximo ? '' : `<p class="acoes">${continuar(j, 'botao-grande')}</p>`}
      ${ritual(dia)}
      ${dia.plantao ? '' : `<p class="hoje-revisao hoje-extra">${icone('cadeado')} ${t('Plantão do dia: abre no Nível {n}', { n: NIVEL_DO_PLANTAO })}</p>`}
      ${j.niveis[NIVEL_DA_OFICINA].desbloqueado ? `<p class="hoje-revisao hoje-extra"><a class="link-seta" href="#/oficina">${icone('raio')} ${t('Oficina do kubectl: bata um recorde')} ${icone('seguir')}</a></p>` : ''}
      <p class="hoje-revisao hoje-extra"><a class="link-seta" href="#/diario">${icone('livro')} ${t('Seu diário de bordo')} ${icone('seguir')}</a></p>
      ${depois.length ? `<div class="hoje-depois"><p>${t('Ficaram para depois:')}</p><ul>${depois.map((i) => `<li><a href="#/ex/${i.id}">${escapar(i.titulo)}</a></li>`).join('')}</ul></div>` : ''}
      ${lembrete()}
    </div>`;
}

export function paginaInicio() {
  return (main) => {
    const j = jornadaAtual();
    const hoje = hojeLocal();
    const comecou = Object.keys(ler(CHAVES.progresso, {})).length > 0;
    // De volta é quem estudou num dia antes de hoje. No primeiro dia, o herói de boas-vindas fica, com o próximo passo.
    const voltou = comecou && ler(CHAVES.dias, []).some((d) => d < hoje);
    const dia = comecou ? diaDeHoje(j, hoje) : null;
    // Dia cumprido com missão pela frente: sem "mais uma" (nem o "Continue de onde parou:" que a anunciava); o ritual fecha.
    const fechou = dia?.cumprido && j.proximo;
    main.innerHTML = `
      <section class="heroi">
        <canvas class="navio" aria-hidden="true"></canvas>
        ${voltou ? painelHoje(j, dia) : `<div class="heroi-texto">
          <p class="heroi-selo">${icone('frasco')} ${t('Um cluster de verdade, simulado no navegador')}</p>
          <h1 class="pixel titulo-heroi">${t('Aprenda Kubernetes contêiner por contêiner')}</h1>
          ${fechou ? '' : `<p class="chamada">${comecou ? t('Continue de onde parou:') : t('Você escreve YAML, usa o <code>kubectl</code> e vê os pods nascerem, quebrarem e voltarem. Cada missão resolvida embarca um contêiner no seu navio.')}</p>`}
          <p class="acoes">${fechou ? '' : continuar(j, 'botao-grande')} <a class="link-seta" href="#/trilha">${t('Ver a trilha')} ${icone('seguir')}</a></p>
          ${comecou ? ritual(dia) + lembrete(fechou) : `<ul class="vantagens"><li>${icone('certo')} ${t('Sem conta')}</li><li>${icone('certo')} ${t('Sem custo')}</li><li>${icone('certo')} ${t('Tudo fica no seu navegador')}</li></ul>`}
        </div>`}
      </section>
      ${voltou ? '' : `<section class="cartoes" aria-label="${t('Como funciona')}">
        <article><span class="cartao-icone">${icone('terminal')}</span><h2>${t('kubectl de verdade')}</h2><p>${t('A saída do terminal é igual à de um cluster real (conferida contra um cluster kind). O que você aprende aqui vale lá fora.')}</p></article>
        <article><span class="cartao-icone">${icone('casa')}</span><h2>${t('Vida real em tudo')}</h2><p>${t('Pod é apartamento, Service é ramal, limite de memória é disjuntor. E cada comparação diz onde deixa de valer. <a href="#/glossario">Veja o glossário</a>.')}</p></article>
        <article><span class="cartao-icone">${icone('trilha')}</span><h2>${t('Seu navio enche')}</h2><p>${t('Cada missão embarca um contêiner com a cor do nível; com 70% de um nível, o próximo abre. Até onde a pilha aguenta?')}</p></article>
      </section>`}`;
    main.querySelector('.lembrete form')?.addEventListener('submit', baixarLembrete);
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
  // Lacrado com missões que chegaram depois: o lacre fica, e as novas aparecem abertas, como convite.
  const aberto = n.desbloqueado && (!n.concluido || n.novas > 0);
  const novas = n.novas === 1 ? t('1 missão nova') : t('{n} missões novas', { n: n.novas });
  const status = n.emObra ? t('Em breve') : `${SITUACAO()[n.situacao]} · ${n.novas ? novas : t('{n} de {total} missões ({pct}%)', { n: n.resolvidos, total: n.total, pct: n.pct })}`;
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
          ${n.concluido ? `<div class="nivel-selo"><p>${n.novas ? t('<b>Lacrado!</b> O lacre é seu. Chegou conteúdo novo por aqui: {novas}, quando quiser.', { novas }) : t('<b>Lacrado!</b> Nível concluído.')} <a href="${linkCompartilhar()}" target="_blank" rel="noopener">${t('Compartilhar no LinkedIn')}</a></p></div>` : ''}
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
            <p class="atalhos"><a href="#/revisao">${icone('cartas')} ${t('Revisão do dia')}</a> <a href="#/certificado">${icone('lacre')} ${t('Seus lacres')}</a> <a href="#/oficina">${icone('raio')} ${t('Oficina do kubectl')}</a> <a href="#/diario">${icone('livro')} ${t('Diário de bordo')}</a></p>
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
const chamado = (i, status, extra = '') => {
  const situacao = SITUACAO_CHAMADO()[status];
  return `
    <li class="chamado">
      <p class="chamado-chips"><span class="chip chip-${i.dificuldade}">${icone('terminal')} ${DIFICULDADE()[i.dificuldade]}</span>${situacao ? ` <span class="chip ${situacao[0]}">${icone(situacao[1])} ${situacao[2]}</span>` : ''}</p>
      <h2><a href="#/ex/${i.id}">${escapar(i.titulo)}</a></h2>
      <blockquote class="relato"><p>${i.relato}</p><footer>${escapar(i.morador)}</footer></blockquote>${extra}
    </li>`;
};

export async function paginaTroubleshooting() {
  const { TROUBLESHOOTING } = await import('../conteudo/index.js');
  const progresso = ler(CHAVES.progresso, {});
  return `
    <p class="sobretitulo">${t('Plantão')}</p>
    <h1 class="pixel">Troubleshooting</h1>
    <p>${t('Clusters que chegam quebrados com <b>mais de um defeito</b>: cada conserto revela o próximo. Investigue no terminal (<code>get</code>, <code>describe</code>, <code>logs</code>, <code>get events</code>) e conserte até o morador ficar satisfeito. Abre desde o começo e não vale XP: é treino de plantão. Os incidentes de um defeito só ficam no <a href="#/trilha">nível 9 da trilha</a>.')}</p>
    <p class="nota">${icone('alerta')} ${t('Todo dia chega um chamado novo no <a href="#/plantao">Plantão do dia</a>.')}</p>
    <ul class="chamados">${TROUBLESHOOTING.map((i) => chamado(i, progresso[i.id]?.status)).join('')}</ul>
    <p class="nota">${icone('raio')} ${t('Quer treinar os comandos em si? A <a href="#/oficina">Oficina do kubectl</a> tem exercícios curtos, contra o relógio.')}</p>`;
}

// A Oficina do kubectl: os exercícios e o seu recorde em cada um.
export async function paginaOficina() {
  const { OFICINA } = await import('../conteudo/index.js');
  const recordes = ler(CHAVES.recordes, {});
  const comRecorde = OFICINA.filter((i) => recordes[i.id]).length;
  return `
    <p class="sobretitulo">${t('Fluência')}</p>
    <h1 class="pixel">${t('Oficina do kubectl')}</h1>
    <p>${t('Exercícios curtos de terminal, contra o relógio: os comandos que poupam tempo no dia a dia (e na prova CKAD). O relógio começa quando o exercício abre, e vale o seu recorde. Abre desde o começo e não vale XP.')}</p>
    <p class="nota">${t('{n} de {total} com recorde', { n: comRecorde, total: OFICINA.length })}</p>
    <ol class="oficina">${OFICINA.map((i) => `
      <li><a href="#/ex/${i.id}">
        <span class="oficina-titulo">${escapar(i.titulo)}</span>
        <span class="chip chip-${i.dificuldade}">${DIFICULDADE()[i.dificuldade]}</span>
        <span class="oficina-recorde">${recordes[i.id] ? `${icone('raio')} ${t('Recorde: {tempo}', { tempo: minutosESegundos(recordes[i.id]) })}` : t('Sem recorde ainda')}</span>
      </a></li>`).join('')}</ol>`;
}

// O Plantão do dia: o chamado de hoje em destaque (com o resultado, se já foi atendido) e os dos últimos dias (quem
// perdeu um dia ainda pode atender).
export async function paginaPlantao() {
  const { plantaoDoDia } = await import('../jogo/plantao.js');
  const progresso = ler(CHAVES.progresso, {});
  const placares = ler(CHAVES.plantoes, {});
  const hoje = plantaoDoDia(hojeLocal());
  const anteriores = [1, 2, 3, 4, 5, 6, 7].map((n) => plantaoDoDia(somarDias(hojeLocal(), -n)));
  const atendidos = Object.keys(progresso).filter((id) => id.startsWith('plantao-') && resolvido(progresso, id)).length;
  const cedo = !jornadaAtual().niveis.find((n) => n.numero === NIVEL_DO_PLANTAO)?.desbloqueado;
  const deHoje = placares[hoje.id];
  const acao = deHoje
    ? `<p class="plantao-acoes"><span>${icone('relogio')} ${t('Atendido em {tempo}', { tempo: tempoEEntregas(deHoje) })}</span> ${htmlCompartilhar(textoDoPlantao(hoje, deHoje))}</p>`
    : resolvido(progresso, hoje.id) ? '' : `<p class="plantao-acoes"><a class="botao botao-grande" href="#/ex/${hoje.id}">${icone('play')} ${t('Atender agora')}</a></p>`;
  return (main) => {
    main.innerHTML = `
      <p class="sobretitulo">${t('Todo dia, um chamado novo')}</p>
      <h1 class="pixel">${t('Plantão do dia')}</h1>
      <p>${t('Um incidente novo por dia, o mesmo para todo mundo: a aplicação de um morador chega com dois defeitos. Uns 10 minutos de investigação no terminal. Não vale XP: vale o morador satisfeito.')}</p>
      <p class="nota">${t(atendidos === 1 ? '1 plantão atendido até hoje' : '{n} plantões atendidos até hoje', { n: atendidos })}</p>
      ${cedo ? `<p class="nota">${icone('trilha')} ${t('Recomendado a partir do Nível {n}: os defeitos passam por probes e limites (Nível 6) e por agendamento (Nível 7). Mas pode atender já: a aba Solução explica o que estava quebrado.', { n: NIVEL_DO_PLANTAO })}</p>` : ''}
      <ul class="chamados plantao-hoje">${chamado(hoje, progresso[hoje.id]?.status, acao)}</ul>
      <h2>${t('Os dos últimos dias')}</h2>
      <p class="nota">${t('Perdeu um dia? O chamado continua aberto.')}</p>
      <ol class="oficina plantoes">${anteriores.map((i) => `
        <li><a href="#/ex/${i.id}">
          <span class="oficina-titulo"><span class="plantao-dia">${dataCurta(i.id.slice(8))}</span> ${escapar(i.titulo)}</span>
          <span class="oficina-recorde">${resolvido(progresso, i.id) ? `${icone('certo')} ${placares[i.id] ? t('Atendido em {tempo}', { tempo: minutosESegundos(placares[i.id].ms) }) : t('Atendido')}` : t('Em aberto')}</span>
        </a></li>`).join('')}</ol>`;
    main.querySelector('[data-acao=compartilhar]')?.addEventListener('click', (e) => compartilharResultado(e.currentTarget));
    return {};
  };
}

// O Diário de bordo: o caminho até aqui (os números, os dias de estudo e as últimas conquistas).
const SECAO = () => ({ troubleshooting: 'Troubleshooting', oficina: t('Oficina do kubectl'), plantao: t('Plantão do dia') });
const intensidade = (n) => (n >= 4 ? 3 : n >= 2 ? 2 : n);

export async function paginaDiario() {
  const { TROUBLESHOOTING, OFICINA, acharItem } = await import('../conteudo/index.js');
  const progresso = ler(CHAVES.progresso, {});
  const dias = ler(CHAVES.dias, []);
  const hoje = hojeLocal();
  const j = jornadaAtual();
  const n = numerosDosDias(dias, hoje, sequenciaDeDias(dias, hoje));
  const recordes = ler(CHAVES.recordes, {});
  const cartoes = Object.values(ler(CHAVES.revisao, {}));
  const soma = (f) => j.niveis.reduce((s, x) => s + f(x), 0);
  const numeros = [
    [t('Dias de estudo'), n.total],
    [t('Sequência atual'), n.atual],
    [t('Melhor sequência'), n.melhor],
    ['XP', j.xp],
    [t('Missões da trilha'), t('{n} de {total}', { n: soma((x) => x.resolvidos), total: soma((x) => x.total) })],
    [t('Níveis lacrados'), t('{n} de {total}', { n: j.niveis.filter((x) => x.concluido).length, total: NIVEIS.length })],
    [t('Incidentes resolvidos'), t('{n} de {total}', { n: TROUBLESHOOTING.filter((i) => resolvido(progresso, i.id)).length, total: TROUBLESHOOTING.length })],
    [t('Plantões atendidos'), Object.keys(progresso).filter((id) => id.startsWith('plantao-') && resolvido(progresso, id)).length],
    [t('Recordes na Oficina'), t('{n} de {total}', { n: OFICINA.filter((i) => recordes[i.id]).length, total: OFICINA.length })],
    [t('Termos firmes na memória'), cartoes.filter((c) => c.caixa >= 4).length],
  ];
  const atividade = atividadePorDia(progresso, dias);
  const semanas = calendario(atividade, hoje);
  const noCalendario = semanas.flat().filter((c) => !c.futuro);
  const diasNoCalendario = noCalendario.filter((c) => c.n).length;
  const maisCheio = noCalendario.reduce((m, c) => (c.n > (m?.n ?? 1) ? c : m), null);
  // As mais novas primeiro: a data e, no mesmo dia, a ordem em que entraram no progresso.
  const recentes = Object.entries(progresso).reverse()
    .filter(([, p]) => p.status === 'resolvido' && p.em)
    .sort((a, b) => b[1].em.localeCompare(a[1].em))
    .map(([id, p]) => ({ item: acharItem(id), em: p.em }))
    .filter((x) => x.item && x.item.tipo !== 'licao')
    .slice(0, 8);
  return `
    <p class="sobretitulo">${t('O caminho até aqui')}</p>
    <h1 class="pixel">${t('Diário de bordo')}</h1>
    <p>${t('Tudo o que você já fez por aqui, num lugar só. O que conta é o caminho: cada dia de estudo entra no calendário, e nenhum some.')}</p>
    <dl class="diario-numeros">${numeros.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')}</dl>
    <section class="diario-bloco" aria-labelledby="diario-dias">
      <h2 id="diario-dias">${t('Seus dias')}</h2>
      <div class="calendario" aria-hidden="true">${semanas.map((s) => `<div class="cal-semana">${s.map((c) => `<span class="cal-dia${c.futuro ? ' cal-futuro' : ` cal-${intensidade(c.n)}`}" title="${dataCurta(c.dia)}"></span>`).join('')}</div>`).join('')}</div>
      <p class="cal-legenda" aria-hidden="true">${t('Menos')} <span class="cal-dia cal-0"></span><span class="cal-dia cal-1"></span><span class="cal-dia cal-2"></span><span class="cal-dia cal-3"></span> ${t('Mais')}</p>
      <p class="nota">${t(diasNoCalendario === 1 ? '1 dia de estudo nas últimas {semanas} semanas.' : '{n} dias de estudo nas últimas {semanas} semanas.', { n: diasNoCalendario, semanas: semanas.length })}${maisCheio ? ` ${t('O dia mais cheio: {dia}, com {n} missões.', { dia: dataCurta(maisCheio.dia), n: maisCheio.n })}` : ''}</p>
    </section>
    <section class="diario-bloco" aria-labelledby="diario-recentes">
      <h2 id="diario-recentes">${t('Últimas conquistas')}</h2>
      ${recentes.length ? `<ol class="oficina diario-recentes">${recentes.map(({ item, em }) => `
        <li><a href="#/ex/${item.id}">
          <span class="oficina-titulo"><span class="plantao-dia">${dataCurta(em)}</span> ${escapar(item.titulo)}</span>
          <span class="oficina-recorde">${item.secao ? SECAO()[item.secao] : t('Nível {n}', { n: item.nivel })}</span>
        </a></li>`).join('')}</ol>` : `<p>${t('O diário começa na primeira missão.')} <a href="#/trilha">${t('Ver a trilha')}</a></p>`}
    </section>
    <p class="nota">${t('Tudo isto fica só neste navegador (veja a <a href="#/privacidade">privacidade</a>).')}</p>`;
}

const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export async function paginaGlossario() {
  // O glossário inteiro (definição, vida real e limite), pelo conteúdo: é ele que acompanha a troca de idioma.
  const { GLOSSARIO } = await import('../conteudo/index.js');
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
