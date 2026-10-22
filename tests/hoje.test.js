// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cartoesParaHoje, numerosDosDias } from '../src/jogo/hoje.js';

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
