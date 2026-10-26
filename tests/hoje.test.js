// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { atividadePorDia, calendario, cartoesParaHoje, numerosDosDias } from '../src/jogo/hoje.js';
import { montarSessao, responder, somarDias, termosDeHoje } from '../src/jogo/revisao.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';

const termos = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const HOJE = '2026-10-22';

describe('o hoje do aluno', () => {
  it('antes de revisar: os vencidos e os novos', () => {
    const estado = { a: { caixa: 2, proxima: '2026-10-20' }, b: { caixa: 3, proxima: '2026-10-30' } };
    expect(cartoesParaHoje({ termos, estado, hoje: HOJE })).toBe(1 + 2); // a vencido; c e d novos
  });

  it('parou no meio da sessão: o resto dela (os novos que ainda cabem nos 10 do dia)', () => {
    // a respondido hoje na caixa 2 (volta em 2 dias); b vencido de outro dia; c e d novos
    const estado = { a: { caixa: 2, proxima: '2026-10-24' }, b: { caixa: 1, proxima: '2026-10-21' } };
    expect(cartoesParaHoje({ termos, estado, hoje: HOJE })).toBe(3);
    expect(cartoesParaHoje({ termos, estado, hoje: HOJE, max: 2 })).toBe(1); // a sessão de 2 era b e a: falta só o vencido b
    estado.c = { caixa: 1, proxima: '2026-10-23' }; // c respondido hoje também: nenhum novo cabe, fica só o vencido b
    expect(cartoesParaHoje({ termos, estado, hoje: HOJE, max: 2 })).toBe(1);
  });

  it('parou no meio de uma sessão com vencidos: os vencidos que faltam ocupam lugar, nenhum novo a mais entra', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));
    const estado = Object.fromEntries(muitos.slice(0, 5).map((g) => [g.id, { caixa: 1, proxima: '2026-10-20' }])); // 5 vencidos
    const sessao = termosDeHoje({ termos: muitos, estado, hoje: HOJE }); // os termos que a sessão monta
    expect(sessao.map((g) => g.id)).toEqual(muitos.slice(0, 10).map((g) => g.id)); // 5 vencidos + 5 novos
    let depois = estado;
    for (const g of sessao.slice(0, 3)) depois = responder(depois, g.id, true, HOJE); // respondeu 3 vencidos e recarregou
    expect(termosDeHoje({ termos: muitos, estado: depois, hoje: HOJE }).map((g) => g.id)).toEqual(muitos.slice(3, 10).map((g) => g.id));
    expect(cartoesParaHoje({ termos: muitos, estado: depois, hoje: HOJE })).toBe(7);
  });

  it('depois da sessão do dia: os novos não voltam a cobrar, só um vencido', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}` }));
    const estado = Object.fromEntries(muitos.slice(0, 10).map((g) => [g.id, { caixa: 1, proxima: '2026-10-23' }])); // os 10 de hoje
    expect(cartoesParaHoje({ termos: muitos, estado, hoje: HOJE })).toBe(0);
    estado.t29 = { caixa: 3, proxima: '2026-10-22' }; // um vencido de outro dia
    expect(cartoesParaHoje({ termos: muitos, estado, hoje: HOJE })).toBe(1);
  });

  it('o número da aba e do painel é o tamanho da sessão, antes, durante e depois de revisar', () => {
    const vistos = GLOSSARIO.filter((g) => g.nivel <= 2);
    const conferir = (estado, hoje) => expect(cartoesParaHoje({ termos: vistos, estado, hoje }))
      .toBe(montarSessao({ termos: vistos, estado, hoje, todos: GLOSSARIO }).length);
    let estado = {};
    conferir(estado, HOJE);
    const sessao = montarSessao({ termos: vistos, estado, hoje: HOJE, todos: GLOSSARIO });
    sessao.forEach((c, k) => {
      estado = responder(estado, c.id, k % 3 !== 0, HOJE);
      conferir(estado, HOJE);
    });
    expect(cartoesParaHoje({ termos: vistos, estado, hoje: HOJE })).toBe(0); // revisou tudo: a aba e o painel dizem 0
    for (let d = 1; d <= 20; d++) conferir(estado, somarDias(HOJE, d));
  });

  it('nunca passa da sessão do dia', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}` }));
    expect(cartoesParaHoje({ termos: muitos, hoje: HOJE })).toBe(10);
  });

  it('a melhor sequência e o total de dias', () => {
    const dias = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-21', '2026-10-22', '2026-10-22'];
    expect(numerosDosDias(dias, HOJE, 2)).toEqual({ atual: 2, melhor: 3, total: 6 });
    expect(numerosDosDias([], HOJE, 0)).toEqual({ atual: 0, melhor: 0, total: 0 });
  });
});

describe('o calendário do diário', () => {
  it('conta as missões de cada dia, e o dia de estudo sem missão vale 1', () => {
    const progresso = { a: { status: 'resolvido', em: '2026-10-20' }, b: { status: 'tentado', em: '2026-10-20' }, c: { status: 'resolvido', em: '2026-10-21' } };
    expect(atividadePorDia(progresso, ['2026-10-20', '2026-10-22'])).toEqual({ '2026-10-20': 2, '2026-10-21': 1, '2026-10-22': 1 });
  });

  it('semanas de domingo a sábado, terminando na semana de hoje (os dias depois de hoje ficam marcados)', () => {
    const semanas = calendario({ '2026-10-20': 3 }, '2026-10-22', 2); // 22/10/2026 é uma quinta
    expect(semanas.map((s) => s.map((c) => c.dia.slice(8)))).toEqual([['11', '12', '13', '14', '15', '16', '17'], ['18', '19', '20', '21', '22', '23', '24']]);
    expect(semanas[1][2]).toEqual({ dia: '2026-10-20', n: 3, futuro: false });
    expect(semanas[1].filter((c) => c.futuro).map((c) => c.dia)).toEqual(['2026-10-23', '2026-10-24']);
  });
});
