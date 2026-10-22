// O "hoje" do aluno, para o painel da página inicial e o número na aba Revisão: quantos cartões esperam por ele, e os
// números da sua sequência de estudo. Funções puras, testadas em tests/hoje.test.js.
import { INTERVALOS, POR_DIA, somarDias } from './revisao.js';

/** O cartão foi respondido hoje? (quem responde hoje fica com a próxima data = hoje + o intervalo da caixa) */
const respondidoHoje = (e, hoje) => e.proxima === somarDias(hoje, INTERVALOS[e.caixa - 1]);

/**
 * Quantos cartões a revisão de hoje tem: os vencidos e, se o aluno ainda não revisou hoje, os termos novos (até a sessão
 * do dia). Quem já revisou hoje só vê o número de novo se algum cartão vencer: o selo não fica cobrando para sempre.
 */
export function cartoesParaHoje({ termos, estado = {}, hoje, max = POR_DIA }) {
  const vencidos = termos.filter((g) => estado[g.id] && estado[g.id].proxima <= hoje).length;
  const revisouHoje = Object.values(estado).some((e) => respondidoHoje(e, hoje));
  const novos = revisouHoje ? 0 : termos.filter((g) => !estado[g.id]).length;
  return Math.min(vencidos + novos, max);
}

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
