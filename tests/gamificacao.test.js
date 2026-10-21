// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calcularJornada, sequenciaDeDias, novidades, LIMITE_DESBLOQUEIO } from '../src/jogo/gamificacao.js';
import { empilhar, VAGAS } from '../src/ui/navio.js';

const p = (id, dificuldade = 'facil') => ({ id, tipo: 'problema', dificuldade });
const niveis = [
  { numero: 0, itens: [{ id: 'l0', tipo: 'licao' }, p('a'), p('b'), p('c', 'medio')] },
  { numero: 1, itens: [] }, // em obra
  { numero: 2, itens: [p('d'), p('e', 'dificil')] },
];
const resolvido = (...ids) => Object.fromEntries(ids.map((i) => [i, { status: 'resolvido' }]));

describe('o que celebrar', () => {
  const tipos = (antes, depois) => novidades(calcularJornada(niveis, resolvido(...antes)), calcularJornada(niveis, resolvido(...depois))).map((e) => `${e.tipo}${e.nivel ? `:${e.nivel.numero}` : ''}`);
  it('uma missão a mais, sem mudar de patamar: nada além do contêiner', () => {
    expect(tipos(['l0'], ['l0', 'a'])).toEqual([]);
  });
  it('o nível que fecha (100%) é lacrado e abre o seguinte (pulando o que está em obra)', () => {
    expect(tipos(['l0', 'a', 'b'], ['l0', 'a', 'b', 'c'])).toEqual(['lacre:0', 'desbloqueio:2']);
  });
  it('o último lacre carrega o navio', () => {
    expect(tipos(['l0', 'a', 'b', 'c', 'd'], ['l0', 'a', 'b', 'c', 'd', 'e'])).toEqual(['lacre:2']);
    const cheio = (ids) => ({ ...calcularJornada(niveis, resolvido(...ids)), navioCheio: ids.length === 6 });
    expect(novidades(cheio(['l0', 'a', 'b', 'c', 'd']), cheio(['l0', 'a', 'b', 'c', 'd', 'e'])).at(-1).tipo).toBe('navio');
  });
});

describe('jornada', () => {
  it('começo: só o nível 0 aberto, próximo é a lição', () => {
    const j = calcularJornada(niveis);
    expect(j.niveis.map((n) => n.situacao)).toEqual(['carregando', 'bloqueado', 'bloqueado']);
    expect(j.proximo.id).toBe('l0');
    expect(j.xp).toBe(0);
  });

  it(`abre o nível seguinte com ${LIMITE_DESBLOQUEIO}% e pula o nível sem conteúdo`, () => {
    const j = calcularJornada(niveis, resolvido('l0', 'a', 'b'));
    expect(j.niveis[0].pct).toBe(67);
    expect(j.niveis[2].desbloqueado).toBe(false);
    const k = calcularJornada(niveis, resolvido('l0', 'a', 'b', 'c'));
    expect(k.niveis.map((n) => n.situacao)).toEqual(['lacrado', 'bloqueado', 'carregando']);
    expect(k.niveis[2].desbloqueado).toBe(true);
    expect(k.xp).toBe(5 + 10 + 10 + 20);
    expect(k.niveisProntos).toBe(1);
    expect(k.proximo.id).toBe('d');
  });

  it('quem já mexeu num nível continua com ele aberto', () => {
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

describe('pilha do navio', () => {
  it('20 pés ocupam uma vaga, 40 pés duas; quem não cabe sobe uma fileira', () => {
    const itens = [...Array(VAGAS - 1)].map((_, k) => p(`f${k}`)).concat(p('m', 'medio'), { id: 'l', tipo: 'licao' });
    const pilha = empilhar(itens);
    expect(pilha.at(-3)).toMatchObject({ fileira: 0, vaga: VAGAS - 2, largura: 1 });
    expect(pilha.at(-2)).toMatchObject({ fileira: 1, vaga: 0, largura: 2 });
    expect(pilha.at(-1)).toMatchObject({ fileira: 1, vaga: 2, largura: 1 });
  });
});
