// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ARRUMACAO_PADRAO, normalizar, mover, soltar, redimensionarColunas, redimensionarJanelas } from '../src/ui/janelas.js';

const IDS = ['missao', 'arquivos', 'terminal', 'cluster'];
const ordem = (a) => a.colunas.map((c) => c.janelas.map((j) => j.id));
const somas = (a) => [a.colunas.reduce((s, c) => s + c.largura, 0), ...a.colunas.map((c) => c.janelas.reduce((s, j) => s + j.altura, 0))].map(Math.round);

describe('janelas', () => {
  it('normaliza: tira as que não existem, põe as que faltam e soma 100', () => {
    const a = normalizar({ colunas: [{ largura: 30, janelas: [{ id: 'missao', altura: 10 }, { id: 'xxx', altura: 50 }] }] }, IDS);
    expect(ordem(a)).toEqual([['missao', 'arquivos', 'terminal', 'cluster']]);
    expect(somas(a)).toEqual([100, 100]);
    expect(ordem(normalizar(null, ['missao', 'terminal']))).toEqual([['missao'], ['terminal']]);
  });

  it('terminal em cima e arquivos embaixo', () => {
    const a = mover(normalizar(ARRUMACAO_PADRAO, IDS), 'terminal', 'cima', IDS);
    expect(ordem(a)).toEqual([['missao', 'cluster'], ['terminal', 'arquivos']]);
  });

  it('mover para o lado entra na coluna vizinha, ou abre uma nova (até 3)', () => {
    let a = mover(normalizar(ARRUMACAO_PADRAO, IDS), 'cluster', 'direita', IDS);
    expect(ordem(a)).toEqual([['missao'], ['arquivos', 'cluster', 'terminal']]);
    a = mover(a, 'terminal', 'direita', IDS);
    expect(ordem(a)).toEqual([['missao'], ['arquivos', 'cluster'], ['terminal']]);
    expect(mover(a, 'terminal', 'direita', IDS)).toEqual(a); // já está sozinho na ponta
    expect(somas(a)).toEqual([100, 100, 100, 100]);
  });

  it('soltar ao lado de outra janela cria coluna; a coluna que esvazia some', () => {
    const a = soltar(normalizar(ARRUMACAO_PADRAO, IDS), 'missao', 'terminal', 'esquerda', IDS);
    expect(ordem(a)).toEqual([['cluster'], ['missao'], ['arquivos', 'terminal']]);
    const b = soltar(a, 'cluster', 'missao', 'antes', IDS);
    expect(ordem(b)).toEqual([['cluster', 'missao'], ['arquivos', 'terminal']]);
    expect(somas(b)).toEqual([100, 100, 100]);
  });

  it('redimensionar respeita os mínimos', () => {
    const a = normalizar(ARRUMACAO_PADRAO, IDS);
    expect(redimensionarColunas(a, 0, 10).colunas.map((c) => c.largura)).toEqual([50, 50]);
    expect(redimensionarColunas(a, 0, -90).colunas[0].largura).toBe(15);
    expect(redimensionarJanelas(a, 1, 0, 90).colunas[1].janelas[1].altura).toBe(12);
  });
});
