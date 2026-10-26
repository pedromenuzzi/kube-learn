// A revisão do dia (repetição espaçada, sistema de Leitner): cada termo do glossário que o aluno já viu vira um
// cartão. Acertou, o cartão sobe de caixa e volta mais tarde; errou, volta para a caixa 1 (amanhã).
// Funções puras, testadas em tests/revisao.test.js. O sorteio usa uma semente (o dia), para ser estável.
import { criarAleatorio } from '../k8s/aleatorio.js';
import { t } from '../i18n.js';

/** Dias até o cartão voltar, para cada caixa (1 a 5). */
export const INTERVALOS = [1, 2, 4, 7, 15];
export const POR_DIA = 10;

export const somarDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Os termos que a trilha já ensinou: o termo entra quando a missão que o apresenta (`item`) está resolvida, quando alguma
 * missão depois dela no mesmo nível está resolvida (quem pulou a lição não perde o termo) ou quando o nível passou dos 70%.
 */
export function termosVistos(glossario, jornada) {
  const vistos = new Set();
  for (const n of jornada.niveis) {
    const ate = n.passou ? n.itens.length : n.itens.findLastIndex((i) => i.estado === 'concluido') + 1;
    for (const i of n.itens.slice(0, ate)) vistos.add(i.id);
  }
  return glossario.filter((g) => vistos.has(g.item));
}

/** Quantos cartões o aluno já respondeu hoje (quem responde hoje fica com a próxima data = hoje + o intervalo da caixa). */
const respondidosHoje = (estado, hoje) => Object.values(estado).filter((e) => e.proxima === somarDias(hoje, INTERVALOS[e.caixa - 1])).length;

/**
 * Os termos da revisão de hoje: primeiro os vencidos (das caixas mais baixas), depois os novos, até `max`. Os termos novos
 * do dia cabem numa sessão só: quem já respondeu `max` cartões hoje não recebe termo novo, só os vencidos (quem parou no
 * meio recebe o resto). É a mesma conta da sessão (montarSessao), do número da aba e do painel Hoje.
 * `estado`: { [idDoTermo]: { caixa, proxima } }. O estado de um termo que não está em `termos` fica guardado, parado.
 */
export function termosDeHoje({ termos, estado = {}, hoje, max = POR_DIA }) {
  const vencidos = termos.filter((g) => estado[g.id] && estado[g.id].proxima <= hoje)
    .sort((a, b) => estado[a.id].caixa - estado[b.id].caixa || estado[a.id].proxima.localeCompare(estado[b.id].proxima));
  const novos = termos.filter((g) => !estado[g.id]).slice(0, Math.max(0, max - respondidosHoje(estado, hoje)));
  return [...vencidos, ...novos].slice(0, max);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const embaralhar = (lista, rnd) => {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
};

/**
 * Os formatos, na ordem em que entram numa sessão curta. Três treinam as comparações com a vida real (termo, analogia,
 * limite) e dois treinam o Kubernetes em si (definicao: a definição → o termo; exemplo: o comando ou YAML → o termo).
 */
export const FORMATOS = ['termo', 'definicao', 'analogia', 'exemplo', 'limite'];

// Exemplos que servem a mais de um termo vizinho (o aluno que marcasse o outro não estaria errado): sem cartão de exemplo.
const EXEMPLO_AMBIGUO = new Set(['imagem', 'kubelet', 'reconciliacao', 'ingress', 'statefulset', 'daemonset', 'limitrange', 'antiafinidade', 'node-notready', 'crashloopbackoff']);

const normalizar = (s) => s.toLowerCase().replace(/[-\s]/g, '');
/** Os nomes de um termo: o id e as partes do termo ("Taint e toleration" → taint, toleration; "Controlador (controller)"). */
const nomes = (g) => [g.id, ...g.termo.split(/[()×/]|\s(?:e|and)\s/)].map(normalizar).filter((n) => n.length > 2);
/** O texto cita o termo? Aí o cartão entregaria a resposta, ou a alternativa também estaria certa. */
export const cita = (texto, g) => nomes(g).some((n) => normalizar(texto).includes(n));

/** O formato serve para este termo? (definição e exemplo não podem dizer o nome da resposta) */
const serve = {
  definicao: (g) => !cita(g.definicao, g),
  exemplo: (g) => Boolean(g.exemplo) && !EXEMPLO_AMBIGUO.has(g.id) && !cita(g.exemplo, g),
};

/** Até 3 alternativas erradas, do mesmo nível ou dos vizinhos primeiro (as mais parecidas), sorteadas. */
const distratores = (g, outros, rnd, aceita = () => true) => embaralhar(outros.filter((o) => o.id !== g.id && aceita(o)), rnd)
  .sort((a, b) => Math.max(Math.abs(a.nivel - g.nivel), 1) - Math.max(Math.abs(b.nivel - g.nivel), 1))
  .slice(0, 3);

// Cada alternativa leva o id do termo (no verdadeiro ou falso, 'verdadeiro' e 'falso'): a resposta dada é guardada por ele.
const escolherTermo = (g, errados, rnd) => embaralhar([{ id: g.id, texto: g.termo, certa: true }, ...errados.map((o) => ({ id: o.id, texto: o.termo, certa: false }))], rnd);

/** Um cartão sobre o termo `g`, no `formato` pedido. `outros` dão as alternativas erradas. */
function cartao(g, outros, rnd, formato) {
  const explicacao = { termo: g.termo, definicao: g.definicao, vidaReal: g.vidaReal, limite: g.limite };
  if (formato === 'definicao' || formato === 'exemplo') {
    const texto = formato === 'definicao' ? g.definicao : g.exemplo;
    // Nenhuma alternativa errada citada no texto mostrado, nem com o mesmo exemplo: seria resposta certa também.
    const errados = distratores(g, outros, rnd, (o) => !cita(texto, o) && o.exemplo !== g.exemplo);
    if (!errados.length) return cartao(g, outros, rnd, 'termo'); // sem alternativa errada, não há pergunta
    return formato === 'definicao'
      ? { id: g.id, formato, explicacao, pergunta: t('Qual termo tem esta definição? <q>{definicao}</q>', { definicao: esc(g.definicao) }), opcoes: escolherTermo(g, errados, rnd) }
      : { id: g.id, formato, explicacao, pergunta: t('Qual termo este exemplo mostra?'), codigo: g.exemplo, opcoes: escolherTermo(g, errados, rnd) };
  }
  const errados = distratores(g, outros, rnd);
  if (formato === 'termo') {
    return {
      id: g.id, formato, explicacao,
      pergunta: t('Qual conceito é esta comparação? <q>{vidaReal}</q>', { vidaReal: esc(g.vidaReal) }),
      opcoes: escolherTermo(g, errados, rnd),
    };
  }
  if (formato === 'analogia') {
    return {
      id: g.id, formato, explicacao,
      pergunta: t('Qual comparação com a vida real combina com <b>{termo}</b>?', { termo: esc(g.termo) }),
      opcoes: embaralhar([{ id: g.id, texto: g.vidaReal, certa: true }, ...errados.map((o) => ({ id: o.id, texto: o.vidaReal, certa: false }))], rnd),
    };
  }
  // Verdadeiro ou falso: este limite é o desta comparação? (metade das vezes, é o limite de outro termo)
  const verdadeiro = rnd() < 0.5 || !errados.length;
  const limite = verdadeiro ? g.limite : errados[0].limite;
  return {
    id: g.id, formato, explicacao,
    pergunta: t('<b>{termo}</b> é como <q>{vidaReal}</q> Verdadeiro ou falso: um limite dessa comparação é <q>{limite}</q>', { termo: esc(g.termo), vidaReal: esc(g.vidaReal), limite: esc(limite) }),
    opcoes: [{ id: 'verdadeiro', texto: t('Verdadeiro'), certa: verdadeiro }, { id: 'falso', texto: t('Falso'), certa: !verdadeiro }],
  };
}

/** O formato de cada cartão: [{ id, formato }]. */
function planejar(escolhidos, hoje) {
  const rnd = criarAleatorio(`revisao:${hoje}`).proximo;
  // Os formatos saem de um baralho: numa sessão de 10, dois de cada (as comparações ficam com 3 de cada 5). A vez da
  // definição ou do exemplo vai para o que saiu menos hoje entre os que servem ao termo; se nenhum serve, comparação.
  const formatos = embaralhar(escolhidos.map((_, k) => FORMATOS[k % FORMATOS.length]), rnd);
  const usados = { definicao: 0, exemplo: 0 };
  return escolhidos.map((g, k) => {
    let formato = formatos[k];
    if (formato in usados) {
      formato = [formato, formato === 'definicao' ? 'exemplo' : 'definicao'].filter((f) => serve[f](g))
        .sort((a, b) => usados[a] - usados[b])[0] ?? 'termo';
      if (formato in usados) usados[formato]++;
    }
    return { id: g.id, formato };
  });
}

/**
 * Os cartões de hoje (os termos de termosDeHoje). `todos` (o glossário) dá as alternativas erradas: só os termos já
 * vistos e os do mesmo nível do cartão, nunca os de um nível que o aluno ainda não abriu. `plano` ([{ id, formato }],
 * de uma sessão já começada) refaz os mesmos cartões, no idioma atual (a troca de idioma no meio da sessão).
 */
export function montarSessao({ termos, estado = {}, hoje, max = POR_DIA, todos = termos, plano }) {
  const vistos = new Set(termos.map((g) => g.id));
  const lista = [...termos, ...todos];
  return (plano ?? planejar(termosDeHoje({ termos, estado, hoje, max }), hoje)).map(({ id, formato }) => {
    const g = lista.find((x) => x.id === id);
    const outros = todos.filter((o) => vistos.has(o.id) || o.nivel === g.nivel);
    // cada cartão com o seu sorteio: refeito em outro idioma, não mexe no sorteio dos outros
    return cartao(g, outros, criarAleatorio(`revisao:${hoje}:${id}`).proximo, formato in serve && !serve[formato](g) ? 'termo' : formato);
  });
}

/** Registra a resposta: acertou sobe de caixa (até 5), errou volta para a 1. */
export function responder(estado, id, certo, hoje) {
  const caixa = certo ? Math.min((estado[id]?.caixa ?? 0) + 1, INTERVALOS.length) : 1;
  return { ...estado, [id]: { caixa, proxima: somarDias(hoje, INTERVALOS[caixa - 1]) } };
}

/** A próxima data com cartão vencido (para "volte em ..."), entre os `termos` vistos (sem eles, entre todos). */
export const proximaRevisao = (estado, termos) => Object.entries(estado)
  .filter(([id]) => !termos || termos.some((g) => g.id === id)).map(([, e]) => e.proxima).sort()[0] ?? null;
