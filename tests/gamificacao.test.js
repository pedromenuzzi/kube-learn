// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calcularJornada, conquistasMigradas, sequenciaDeDias, novidades, LIMITE_DESBLOQUEIO } from '../src/jogo/gamificacao.js';
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
  it('o próximo segue em frente: uma missão deixada lá atrás não prende o botão Continuar', () => {
    const j = calcularJornada(niveis, { l0: { status: 'resolvido' }, a: { status: 'tentado' }, b: { status: 'resolvido' } });
    expect(j.proximo.id).toBe('c');
    const k = calcularJornada(niveis, { l0: { status: 'resolvido' }, a: { status: 'tentado' } }); // acabou de errar a da vez
    expect(k.proximo.id).toBe('a');
    const fim = calcularJornada(niveis, { l0: { status: 'resolvido' }, a: { status: 'tentado' }, b: { status: 'resolvido' }, c: { status: 'resolvido' }, d: { status: 'resolvido' }, e: { status: 'resolvido' } });
    expect(fim.proximo.id).toBe('a'); // nada depois do último: volta para o que ficou
  });

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

describe('conquistas permanentes: missão nova vira convite, nunca perda', () => {
  // O mesmo conteúdo, depois de ganhar missões novas: uma no nível 0, quatro no nível 2.
  const crescido = [
    { ...niveis[0], itens: [...niveis[0].itens, p('nova0')] },
    niveis[1],
    { ...niveis[2], itens: [...niveis[2].itens, p('n1'), p('n2'), p('n3'), p('n4')] },
  ];
  const tudo = resolvido('l0', 'a', 'b', 'c', 'd', 'e');
  const conquistas = { lacres: { 0: '2026-09-01', 2: '2026-09-01' }, navio: '2026-09-01' };

  it('o nível lacrado que ganha 1 missão continua lacrado, com 1 nova; o navio continua cheio', () => {
    const j = calcularJornada(crescido, tudo, conquistas);
    expect(j.niveis[0]).toMatchObject({ situacao: 'lacrado', concluido: true, novas: 1, pct: 75 });
    expect(j.niveis[2]).toMatchObject({ situacao: 'lacrado', concluido: true, novas: 4, pct: 33 });
    expect(j.navioCheio).toBe(true);
    expect(j.proximo.id).toBe('n1'); // as missões novas são o convite
    // Sem as conquistas, a mesma trilha tiraria o lacre (o que o aluno via antes).
    expect(calcularJornada(crescido, tudo).niveis[0].concluido).toBe(false);
    // Resolver a missão nova não repete a festa.
    expect(novidades(j, calcularJornada(crescido, { ...tudo, ...resolvido('nova0') }, conquistas))).toEqual([]);
  });

  it('lacrado passa para o desbloqueio do seguinte, mesmo abaixo de 70%; quem nunca lacrou segue a regra dos 70%', () => {
    const niveis2 = [{ numero: 0, itens: [p('a'), p('x1'), p('x2')] }, { numero: 1, itens: [p('b')] }];
    expect(calcularJornada(niveis2, resolvido('a'), { lacres: { 0: '2026-09-01' } }).niveis[1].desbloqueado).toBe(true);
    expect(calcularJornada(niveis2, resolvido('a')).niveis[1].desbloqueado).toBe(false);
  });

  it('a migração lacra os níveis a 100% pela data da última missão de cada um e é idempotente', () => {
    const progresso = {
      l0: { status: 'resolvido', em: '2026-08-01' }, a: { status: 'resolvido', em: '2026-08-03' }, b: { status: 'resolvido', em: '2026-08-02' },
      c: { status: 'resolvido', em: '2026-08-02' }, d: { status: 'tentado', em: '2026-08-05' },
    };
    const m = conquistasMigradas(niveis, progresso);
    expect(m).toEqual({ lacres: { 0: '2026-08-03' } });
    expect(conquistasMigradas(niveis, progresso, m)).toBeNull();
    expect(conquistasMigradas(niveis, {})).toBeNull(); // perfil novo: nada a gravar
  });

  it('a migração data o navio pela última missão da trilha (o Plantão de hoje não conta)', () => {
    const semObra = [niveis[0], { ...niveis[2], numero: 1 }];
    const progresso = { ...Object.fromEntries(['l0', 'a', 'b', 'c', 'd', 'e'].map((id) => [id, { status: 'resolvido', em: '2026-09-01' }])), 'plantao-2026-10-27': { status: 'resolvido', em: '2026-10-27' } };
    const m = conquistasMigradas(semObra, progresso);
    expect(m).toEqual({ lacres: { 0: '2026-09-01', 1: '2026-09-01' }, navio: '2026-09-01' });
    expect(conquistasMigradas(semObra, progresso, m)).toBeNull();
    expect(calcularJornada([...semObra, { numero: 2, itens: [p('nova')] }], progresso, m).navioCheio).toBe(true); // um nível novo não esvazia o navio
  });
});

describe('missão nova, perfil antigo', () => {
  const D = '2026-10-27'; // o dia em que as missões novas chegaram
  const velhas = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
  const trilha = [
    { numero: 0, itens: [...velhas.map((id) => p(id)), { ...p('pr1'), desde: D }, { ...p('pr2'), desde: D }] },
    { numero: 1, itens: [p('n1')] },
  ];
  const em = (dia, ...ids) => Object.fromEntries(ids.map((id) => [id, { status: 'resolvido', em: dia }]));

  it('a migração dá lacres e navio numa passada só, com a data da última missão (T7)', () => {
    const progresso = { ...em('2026-09-01', ...velhas), ...em('2026-09-02', 'n1') };
    const m = conquistasMigradas(trilha, progresso, {}, '2026-10-30');
    expect(m).toEqual({ lacres: { 0: '2026-09-01', 1: '2026-09-02' }, navio: '2026-09-02' });
    expect(conquistasMigradas(trilha, progresso, m, '2026-10-30')).toBeNull();
  });

  it('quem passou dos 70% antes das missões novas não tem o nível seguinte trancado de novo (T8)', () => {
    const antes = em('2026-09-01', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'); // 6 de 8 = 75%: o nível 1 abriu
    const j = calcularJornada(trilha, antes);
    expect(j.niveis[0].pct).toBe(60); // a porcentagem mostrada conta todas
    expect(j.niveis[1].desbloqueado).toBe(true);
    // Resolver a prática não repete a faixa de "Nível 1 desbloqueado".
    expect(novidades(j, calcularJornada(trilha, { ...antes, ...em('2026-10-30', 'pr1') }))).toEqual([]);
    // Nem resolver mais uma antiga hoje (7 de 10 continua aberto; nunca tranca).
    expect(calcularJornada(trilha, { ...antes, ...em('2026-10-30', 'q7') }).niveis[1].desbloqueado).toBe(true);
  });

  it('perfil novo segue a regra dos 70% sobre todas', () => {
    expect(calcularJornada(trilha, em('2026-10-30', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6')).niveis[1].desbloqueado).toBe(false);
    expect(calcularJornada(trilha, em('2026-10-30', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'pr1')).niveis[1].desbloqueado).toBe(true);
    // Abaixo de 70% antes das novas: elas contam.
    expect(calcularJornada(trilha, em('2026-09-01', 'q1', 'q2', 'q3', 'q4', 'q5')).niveis[1].desbloqueado).toBe(false);
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
