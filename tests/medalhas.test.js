// @vitest-environment node
// A Oficina do kubectl: todo exercício tem meta, e a medalha sai do tempo (ouro até a meta, prata até 2x, bronze).
import { describe, expect, it } from 'vitest';
import { OFICINA } from '../src/conteudo/oficina.js';
import { medalha, faltaParaSeguinte } from '../src/jogo/medalhas.js';

describe('medalhas da Oficina', () => {
  it('todo exercício tem meta em ms, maior que zero', () => {
    for (const i of OFICINA) expect(i.meta, i.id).toBeGreaterThan(0);
  });

  it('ouro até a meta, prata até o dobro, bronze depois', () => {
    expect(medalha(30_000, 30_000)).toBe('ouro');
    expect(medalha(30_400, 30_000)).toBe('ouro'); // a tela mostra 0:30
    expect(medalha(30_600, 30_000)).toBe('prata');
    expect(medalha(60_000, 30_000)).toBe('prata');
    expect(medalha(61_000, 30_000)).toBe('bronze');
    expect(faltaParaSeguinte(30_600, 30_000)).toEqual({ seguinte: 'ouro', falta: 1000 });
  });

  it('quanto falta para a seguinte', () => {
    expect(faltaParaSeguinte(42_000, 30_000)).toEqual({ seguinte: 'ouro', falta: 12_000 });
    expect(faltaParaSeguinte(75_000, 30_000)).toEqual({ seguinte: 'prata', falta: 15_000 });
    expect(faltaParaSeguinte(20_000, 30_000)).toBeNull();
  });
});
