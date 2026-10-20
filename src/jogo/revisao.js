// A revisão do dia (repetição espaçada, sistema de Leitner): cada termo do glossário que o aluno já viu vira um
// cartão. Acertou, o cartão sobe de caixa e volta mais tarde; errou, volta para a caixa 1 (amanhã).
// Funções puras, testadas em tests/revisao.test.js. O sorteio usa uma semente (o dia), para ser estável.
import { criarAleatorio } from '../k8s/aleatorio.js';

/** Dias até o cartão voltar, para cada caixa (1 a 5). */
export const INTERVALOS = [1, 2, 4, 7, 15];
export const POR_DIA = 10;

export const somarDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Os termos dos níveis em que o aluno já resolveu alguma coisa. */
export function termosVistos(glossario, jornada) {
  const niveis = new Set(jornada.niveis.filter((n) => n.itens.some((i) => i.estado === 'concluido')).map((n) => n.numero));
  return glossario.filter((g) => niveis.has(g.nivel));
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const embaralhar = (lista, rnd) => {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
};

/** Um cartão sobre o termo `t`, num dos três formatos. `outros` são de onde saem as alternativas erradas. */
function cartao(t, outros, rnd) {
  const formato = ['termo', 'analogia', 'limite'][Math.floor(rnd() * 3)];
  const errados = embaralhar(outros.filter((o) => o.id !== t.id), rnd).slice(0, 3);
  const explicacao = { termo: t.termo, definicao: t.definicao, vidaReal: t.vidaReal, limite: t.limite };
  if (formato === 'termo') {
    return {
      id: t.id, formato, explicacao,
      pergunta: `Qual conceito é esta comparação? <q>${esc(t.vidaReal)}</q>`,
      opcoes: embaralhar([{ texto: t.termo, certa: true }, ...errados.map((o) => ({ texto: o.termo, certa: false }))], rnd),
    };
  }
  if (formato === 'analogia') {
    return {
      id: t.id, formato, explicacao,
      pergunta: `Qual comparação com a vida real combina com <b>${esc(t.termo)}</b>?`,
      opcoes: embaralhar([{ texto: t.vidaReal, certa: true }, ...errados.map((o) => ({ texto: o.vidaReal, certa: false }))], rnd),
    };
  }
  // Verdadeiro ou falso: este limite é o desta comparação? (metade das vezes, é o limite de outro termo)
  const verdadeiro = rnd() < 0.5 || !errados.length;
  const limite = verdadeiro ? t.limite : errados[0].limite;
  return {
    id: t.id, formato, explicacao,
    pergunta: `<b>${esc(t.termo)}</b> é como <q>${esc(t.vidaReal)}</q> Verdadeiro ou falso: um limite dessa comparação é <q>${esc(limite)}</q>`,
    opcoes: [{ texto: 'Verdadeiro', certa: verdadeiro }, { texto: 'Falso', certa: !verdadeiro }],
  };
}

/**
 * Os cartões de hoje: primeiro os vencidos (das caixas mais baixas), depois os novos, até `max`.
 * `estado`: { [idDoTermo]: { caixa, proxima } }.
 */
export function montarSessao({ termos, estado = {}, hoje, max = POR_DIA, todos = termos }) {
  const rnd = criarAleatorio(`revisao:${hoje}`).proximo;
  const vencidos = termos.filter((t) => estado[t.id] && estado[t.id].proxima <= hoje)
    .sort((a, b) => estado[a.id].caixa - estado[b.id].caixa || estado[a.id].proxima.localeCompare(estado[b.id].proxima));
  const novos = termos.filter((t) => !estado[t.id]);
  const escolhidos = [...vencidos, ...novos].slice(0, max);
  const pool = todos.length >= 4 ? todos : termos;
  return escolhidos.map((t) => cartao(t, pool, rnd));
}

/** Registra a resposta: acertou sobe de caixa (até 5), errou volta para a 1. */
export function responder(estado, id, certo, hoje) {
  const caixa = certo ? Math.min((estado[id]?.caixa ?? 0) + 1, INTERVALOS.length) : 1;
  return { ...estado, [id]: { caixa, proxima: somarDias(hoje, INTERVALOS[caixa - 1]) } };
}

/** A próxima data com cartão vencido (para "volte em ..."). */
export const proximaRevisao = (estado) => Object.values(estado).map((e) => e.proxima).sort()[0] ?? null;
