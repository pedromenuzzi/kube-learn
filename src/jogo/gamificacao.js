// As regras do jogo (funções puras, testadas em tests/gamificacao.test.js): XP, níveis, desbloqueio a 70%,
// próximo passo e sequência de dias.
import { XP } from '../conteudo/util.js';

/** O nível seguinte abre quando o anterior tem esta porcentagem dos exercícios resolvidos. */
export const LIMITE_DESBLOQUEIO = 70;

export const xpDoItem = (item) => (item.tipo === 'licao' || item.tipo === 'quiz' ? XP[item.tipo] : XP[item.dificuldade] ?? 0);
const contaNaPorcentagem = (item) => item.tipo !== 'licao';

/**
 * O estado da trilha. `progresso`: { [id]: { status: 'resolvido' | 'tentado', em } }.
 * Cada nível ganha: total, resolvidos, pct, emObra (sem itens), desbloqueado, passou (≥ 70%), concluido (100%)
 * e a situação do nível ('bloqueado' | 'carregando' | 'pronto' | 'lacrado'); cada item: estado e xp.
 */
export function calcularJornada(niveis, progresso = {}) {
  let xp = 0;
  let anteriorPassou = true;
  const resultado = niveis.map((n) => {
    const conta = n.itens.filter(contaNaPorcentagem);
    const resolvidos = conta.filter((i) => progresso[i.id]?.status === 'resolvido').length;
    const pct = conta.length ? Math.round((resolvidos / conta.length) * 100) : 0;
    const emObra = n.itens.length === 0;
    const comProgresso = n.itens.some((i) => progresso[i.id]);
    const desbloqueado = !emObra && (anteriorPassou || comProgresso);
    const passou = emObra || pct >= LIMITE_DESBLOQUEIO;
    const concluido = !emObra && pct === 100;
    if (!emObra) anteriorPassou = passou;
    const itens = n.itens.map((i) => {
      const status = progresso[i.id]?.status;
      if (status === 'resolvido') xp += xpDoItem(i);
      const estado = status === 'resolvido' ? 'concluido' : status === 'tentado' ? 'tentado' : desbloqueado ? 'disponivel' : 'bloqueado';
      return { ...i, estado, xp: xpDoItem(i) };
    });
    const situacao = emObra || !desbloqueado ? 'bloqueado' : concluido ? 'lacrado' : passou ? 'pronto' : 'carregando';
    return { ...n, itens, total: conta.length, resolvidos, pct, emObra, desbloqueado, passou: !emObra && passou, concluido, situacao };
  });

  // O próximo: o primeiro em aberto depois do último resolvido (quem deixou uma missão para trás lá no começo segue em
  // frente; quem acabou de errar a da vez continua nela); sem nada depois, o primeiro em aberto da trilha.
  const abertos = resultado.filter((n) => n.desbloqueado).flatMap((n) => n.itens);
  const ultimoFeito = abertos.findLastIndex((i) => i.estado === 'concluido');
  const emAberto = (i) => i.estado === 'disponivel' || i.estado === 'tentado';
  const proximo = abertos.slice(ultimoFeito + 1).find(emAberto) ?? abertos.find(emAberto) ?? null;
  if (proximo?.estado === 'disponivel') proximo.estado = 'proximo';
  const comConteudo = resultado.filter((n) => !n.emObra);
  return {
    xp,
    niveis: resultado,
    proximo,
    niveisProntos: resultado.filter((n) => n.passou).length,
    navioCheio: comConteudo.length === resultado.length && comConteudo.every((n) => n.concluido),
  };
}

/**
 * O que celebrar depois de resolver um item: compara a jornada de antes com a de depois.
 * → [{ tipo: 'desbloqueio' | 'lacre', nivel }, { tipo: 'navio' }], na ordem em que aparecem.
 */
export function novidades(antes, depois) {
  const eventos = [];
  depois.niveis.forEach((n, i) => {
    const a = antes.niveis[i];
    if (n.desbloqueado && !a.desbloqueado) eventos.push({ tipo: 'desbloqueio', nivel: n });
    if (n.concluido && !a.concluido) eventos.push({ tipo: 'lacre', nivel: n });
  });
  if (depois.navioCheio && !antes.navioCheio) eventos.push({ tipo: 'navio' });
  return eventos;
}

const diaAnterior = (dia) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Dias seguidos de estudo, terminando hoje (ou ontem, para não zerar de manhã). */
export function sequenciaDeDias(diasAtivos, hoje) {
  const dias = new Set(diasAtivos);
  let dia = dias.has(hoje) ? hoje : diaAnterior(hoje);
  let total = 0;
  while (dias.has(dia)) {
    total += 1;
    dia = diaAnterior(dia);
  }
  return total;
}

/** Data local AAAA-MM-DD. */
export const hojeLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
