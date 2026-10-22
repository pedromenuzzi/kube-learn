// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { atividadePorDia, calendario, cartoesParaHoje, numerosDosDias } from '../src/jogo/hoje.js';

const termos = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const HOJE = '2026-10-22';

describe('o hoje do aluno', () => {
  it('antes de revisar: os vencidos e os novos', () => {
    const estado = { a: { caixa: 2, proxima: '2026-10-20' }, b: { caixa: 3, proxima: '2026-10-30' } };
    expect(cartoesParaHoje({ termos, estado, hoje: HOJE })).toBe(1 + 2); // a vencido; c e d novos
  });

  it('depois de revisar hoje: os novos não voltam a cobrar, só um vencido', () => {
    // a respondido hoje na caixa 2 (volta em 2 dias); b vencido de outro dia
    const estado = { a: { caixa: 2, proxima: '2026-10-24' }, b: { caixa: 1, proxima: '2026-10-21' } };
    expect(cartoesParaHoje({ termos, estado, hoje: HOJE })).toBe(1);
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
