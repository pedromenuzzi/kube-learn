// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ARRUMACAO_PADRAO, normalizar, mover, soltar, redimensionarColunas, redimensionarJanelas } from '../src/ui/janelas.js';

const IDS = ['missao', 'arquivos', 'paineis'];
const ordem = (a) => a.colunas.map((c) => c.janelas.map((j) => j.id));
const somas = (a) => [a.colunas.reduce((s, c) => s + c.largura, 0), ...a.colunas.map((c) => c.janelas.reduce((s, j) => s + j.altura, 0))].map(Math.round);

describe('janelas', () => {
  it('normaliza: tira as que não existem (de versões antigas), põe as que faltam e soma 100', () => {
    const antiga = { colunas: [{ largura: 40, janelas: [{ id: 'missao', altura: 60 }, { id: 'cluster', altura: 40 }] }, { largura: 60, janelas: [{ id: 'arquivos', altura: 50 }, { id: 'terminal', altura: 50 }] }] };
    const a = normalizar(antiga, IDS);
    expect(ordem(a)).toEqual([['missao'], ['arquivos', 'paineis']]);
    expect(somas(a)).toEqual([100, 100, 100]);
    expect(ordem(normalizar(null, ['missao', 'paineis']))).toEqual([['missao'], ['paineis']]);
  });

  it('terminal em cima e arquivos embaixo', () => {
    expect(ordem(mover(normalizar(ARRUMACAO_PADRAO, IDS), 'paineis', 'cima', IDS))).toEqual([['missao'], ['paineis', 'arquivos']]);
  });

  it('mover para o lado entra na coluna vizinha, ou abre uma nova (até 3)', () => {
    let a = mover(normalizar(ARRUMACAO_PADRAO, IDS), 'paineis', 'esquerda', IDS);
    expect(ordem(a)).toEqual([['missao', 'paineis'], ['arquivos']]);
    a = mover(a, 'missao', 'esquerda', IDS);
    expect(ordem(a)).toEqual([['missao'], ['paineis'], ['arquivos']]);
    expect(mover(a, 'missao', 'esquerda', IDS)).toEqual(a); // já está sozinha na ponta
    expect(somas(a)).toEqual([100, 100, 100, 100]);
  });

  it('soltar ao lado de outra janela cria coluna; a coluna que esvazia some', () => {
    const a = soltar(normalizar(ARRUMACAO_PADRAO, IDS), 'paineis', 'missao', 'esquerda', IDS);
    expect(ordem(a)).toEqual([['paineis'], ['missao'], ['arquivos']]);
    const b = soltar(a, 'paineis', 'arquivos', 'antes', IDS);
    expect(ordem(b)).toEqual([['missao'], ['paineis', 'arquivos']]);
    expect(somas(b)).toEqual([100, 100, 100]);
  });

  it('redimensionar respeita os mínimos', () => {
    const a = normalizar(ARRUMACAO_PADRAO, IDS);
    expect(redimensionarColunas(a, 0, 10).colunas.map((c) => c.largura)).toEqual([50, 50]);
    expect(redimensionarColunas(a, 0, -90).colunas[0].largura).toBe(15);
    expect(redimensionarJanelas(a, 1, 0, 90).colunas[1].janelas[1].altura).toBe(12);
  });
});
