// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calcularJornada, sequenciaDeDias, LIMITE_DESBLOQUEIO } from '../src/jogo/gamificacao.js';

const p = (id, dificuldade = 'facil') => ({ id, tipo: 'problema', dificuldade });
const niveis = [
  { numero: 0, itens: [{ id: 'l0', tipo: 'licao' }, p('a'), p('b'), p('c', 'medio')] },
  { numero: 1, itens: [] }, // em obra
  { numero: 2, itens: [p('d'), p('e', 'dificil')] },
];
const resolvido = (...ids) => Object.fromEntries(ids.map((i) => [i, { status: 'resolvido' }]));

describe('jornada', () => {
  it('começo: só o térreo aberto, próximo é a lição', () => {
    const j = calcularJornada(niveis);
    expect(j.niveis.map((n) => n.andar)).toEqual(['obra', 'planta', 'planta']);
    expect(j.proximo.id).toBe('l0');
    expect(j.xp).toBe(0);
  });

  it(`abre o andar seguinte com ${LIMITE_DESBLOQUEIO}% e pula o andar em obra`, () => {
    const j = calcularJornada(niveis, resolvido('l0', 'a', 'b'));
    expect(j.niveis[0].pct).toBe(67);
    expect(j.niveis[2].desbloqueado).toBe(false);
    const k = calcularJornada(niveis, resolvido('l0', 'a', 'b', 'c'));
    expect(k.niveis.map((n) => n.andar)).toEqual(['habite-se', 'planta', 'obra']);
    expect(k.niveis[2].desbloqueado).toBe(true);
    expect(k.xp).toBe(5 + 10 + 10 + 20);
    expect(k.andaresProntos).toBe(1);
    expect(k.proximo.id).toBe('d');
  });

  it('quem já mexeu num andar continua com ele aberto', () => {
    const j = calcularJornada(niveis, { e: { status: 'tentado' } });
    expect(j.niveis[2].desbloqueado).toBe(true);
    expect(j.niveis[2].itens.find((i) => i.id === 'e').estado).toBe('tentado');
  });
});

describe('sequência de dias', () => {
  it('conta até hoje, ou até ontem de manhã', () => {
    expect(sequenciaDeDias(['2026-10-18', '2026-10-19', '2026-10-20'], '2026-10-20')).toBe(3);
    expect(sequenciaDeDias(['2026-10-18', '2026-10-19'], '2026-10-20')).toBe(2);
    expect(sequenciaDeDias(['2026-10-17', '2026-10-19'], '2026-10-20')).toBe(1);
    expect(sequenciaDeDias([], '2026-10-20')).toBe(0);
  });
});
