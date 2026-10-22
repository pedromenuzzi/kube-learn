import { describe, expect, it } from 'vitest';
import { resolverRota } from '../src/rotas.js';

describe('resolverRota', () => {
  it('sem hash vai para o início', () => {
    expect(resolverRota('')).toMatchObject({ caminho: '/', parametro: null });
    expect(resolverRota('#/')).toMatchObject({ caminho: '/' });
  });

  it('rotas simples', () => {
    expect(resolverRota('#/trilha')).toMatchObject({ caminho: '/trilha', titulo: 'Trilha' });
    expect(resolverRota('#/glossario/')).toMatchObject({ caminho: '/glossario' });
  });

  it('exercício exige o id', () => {
    expect(resolverRota('#/ex/pod-primeiro')).toMatchObject({ caminho: '/ex', parametro: 'pod-primeiro' });
    expect(resolverRota('#/ex/a%20b')).toMatchObject({ parametro: 'a b' });
    expect(resolverRota('#/ex')).toBeNull();
  });

  it('rota desconhecida ou com parâmetro sobrando é null', () => {
    expect(resolverRota('#/nada')).toBeNull();
    expect(resolverRota('#/trilha/extra')).toBeNull();
  });

  it('escape quebrado no endereço não derruba a página (vira "não encontrada")', () => {
    expect(resolverRota('#/ex/%')).toBeNull();
    expect(resolverRota('#/ex/%E0%A4%A')).toBeNull();
  });
});
