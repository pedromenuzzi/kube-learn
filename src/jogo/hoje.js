// O "hoje" do aluno, para o painel da página inicial e o número na aba Revisão: quantos cartões esperam por ele, e os
// números da sua sequência de estudo. Funções puras, testadas em tests/hoje.test.js.
import { somarDias, termosDeHoje } from './revisao.js';

/**
 * Quantos cartões a revisão de hoje tem: os vencidos e os termos novos que ainda cabem na sessão do dia. Quem já fez a
 * sessão de hoje só vê o número de novo se algum cartão vencer: o selo não fica cobrando para sempre. É a mesma conta da
 * sessão (termosDeHoje), então a aba, o painel Hoje e a revisão dizem o mesmo número.
 */
export const cartoesParaHoje = (opcoes) => termosDeHoje(opcoes).length;

/** A sequência atual, a melhor de todas e o total de dias de estudo (os dias guardados, sem repetir). */
export function numerosDosDias(dias, hoje, atual) {
  const unicos = [...new Set(dias)].sort();
  let melhor = 0;
  let corrida = 0;
  unicos.forEach((d, i) => {
    corrida = i && somarDias(unicos[i - 1], 1) === d ? corrida + 1 : 1;
    melhor = Math.max(melhor, corrida);
  });
  return { atual, melhor: Math.max(melhor, atual), total: unicos.length };
}

/** Quantas coisas o aluno fez em cada dia: as missões (a data em que resolveu ou tentou); dia de estudo sem missão vale 1. */
export function atividadePorDia(progresso, dias) {
  const atividade = {};
  for (const p of Object.values(progresso)) if (p.em) atividade[p.em] = (atividade[p.em] ?? 0) + 1;
  for (const d of dias) atividade[d] = Math.max(atividade[d] ?? 0, 1);
  return atividade;
}

/**
 * O calendário do Diário de bordo: as últimas `semanas` semanas, de domingo a sábado, terminando na semana de hoje.
 * → [semana][diaDaSemana] = { dia, n, futuro }
 */
export function calendario(atividade, hoje, semanas = 18) {
  const domingo = somarDias(hoje, -new Date(`${hoje}T12:00:00Z`).getUTCDay());
  const inicio = somarDias(domingo, -7 * (semanas - 1));
  return Array.from({ length: semanas }, (_, s) => Array.from({ length: 7 }, (_, d) => {
    const dia = somarDias(inicio, s * 7 + d);
    return { dia, n: atividade[dia] ?? 0, futuro: dia > hoje };
  }));
}
