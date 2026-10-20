// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { montarSessao, responder, termosVistos, somarDias, proximaRevisao } from '../src/jogo/revisao.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';

const termos = GLOSSARIO.filter((g) => g.nivel <= 1);

describe('revisão do dia (Leitner)', () => {
  it('sessão nova: só cartões novos, no máximo 10, cada um com uma resposta certa', () => {
    const s = montarSessao({ termos, hoje: '2026-10-20', todos: GLOSSARIO });
    expect(s).toHaveLength(10);
    for (const c of s) {
      expect(c.opcoes.filter((o) => o.certa)).toHaveLength(1);
      expect(new Set(c.opcoes.map((o) => o.texto)).size).toBe(c.opcoes.length);
    }
    expect(new Set(s.map((c) => c.formato)).size).toBeGreaterThan(1);
  });

  it('é estável no mesmo dia', () => {
    const a = montarSessao({ termos, hoje: '2026-10-20' });
    const b = montarSessao({ termos, hoje: '2026-10-20' });
    expect(a).toEqual(b);
  });

  it('acertou sobe de caixa e volta mais tarde; errou volta amanhã', () => {
    let e = responder({}, 'pod', true, '2026-10-20');
    expect(e.pod).toEqual({ caixa: 1, proxima: '2026-10-21' });
    e = responder(e, 'pod', true, '2026-10-21');
    expect(e.pod).toEqual({ caixa: 2, proxima: '2026-10-23' });
    e = responder(e, 'pod', false, '2026-10-23');
    expect(e.pod).toEqual({ caixa: 1, proxima: '2026-10-24' });
    expect(proximaRevisao(e)).toBe('2026-10-24');
  });

  it('os vencidos vêm antes dos novos; os que não venceram ficam de fora', () => {
    const estado = { pod: { caixa: 2, proxima: '2026-10-20' }, node: { caixa: 3, proxima: '2026-10-25' } };
    const s = montarSessao({ termos, estado, hoje: '2026-10-20', max: 3 });
    expect(s[0].id).toBe('pod');
    expect(s.map((c) => c.id)).not.toContain('node');
  });

  it('só os termos dos níveis com missão resolvida', () => {
    const jornada = { niveis: [{ numero: 0, itens: [{ estado: 'concluido' }] }, { numero: 1, itens: [{ estado: 'disponivel' }] }] };
    expect(termosVistos(GLOSSARIO, jornada).every((t) => t.nivel === 0)).toBe(true);
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});
