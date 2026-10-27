// O que o site guarda: o ler() que aguenta dado torto, a forma de cada chave e o restaurar do "Baixar meus dados".
import { beforeEach, describe, expect, it } from 'vitest';
import { CHAVES, FORMAS, ler, gravar, apagarTudo, exportarTudo, conferirDados, restaurar, registrarResultado } from '../src/armazenamento.js';
import { normalizar } from '../src/ui/janelas.js';
import { arquivosIniciais } from '../src/ui/exercicio.js';

const bruto = () => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));

beforeEach(() => localStorage.clear());

describe('ler() com dado torto', () => {
  it.each([
    ['null', {}], ['"x"', {}], ['[]', {}], ['3', {}], ['{}', []], ['null', []], ['null', ''], ['{}', ''],
  ])('%s onde o padrão é %j: volta o padrão, e o guardado fica', (guardado, padrao) => {
    localStorage.setItem('kube-learn:k', guardado);
    expect(ler('k', padrao)).toEqual(padrao);
    expect(localStorage.getItem('kube-learn:k')).toBe(guardado);
  });

  it('JSON quebrado volta o padrão; sem padrão, volta o que está lá', () => {
    localStorage.setItem('kube-learn:k', '{quebrado');
    expect(ler('k', {})).toEqual({});
    localStorage.setItem('kube-learn:k', 'null');
    expect(ler('k')).toBeNull();
  });

  it('as entradas null de um objeto somem (quem lê faz p.status sem medo)', () => {
    localStorage.setItem('kube-learn:progresso', '{"x":null,"y":{"status":"resolvido"}}');
    expect(ler(CHAVES.progresso, {})).toEqual({ y: { status: 'resolvido' } });
  });

  it('registrarResultado sobre progresso="null" não cai', () => {
    localStorage.setItem('kube-learn:progresso', 'null');
    expect(registrarResultado('a', true, '2026-01-01')).toEqual({ a: { status: 'resolvido', em: '2026-01-01' } });
  });
});

// O dado torto por dentro (a forma de fora certa): a entrada torta sai, a boa fica. Um caso por chave.
const TORTOS = [
  ['progresso', { a: { status: 'resolvido', em: '2026-01-02' }, b: { status: 'tentado' }, c: { status: 'x' }, d: 5, e: { status: 'resolvido', em: 123 } },
    { a: { status: 'resolvido', em: '2026-01-02' }, b: { status: 'tentado' }, e: { status: 'resolvido' } }],
  ['conquistas', { lacres: 'abc', navio: 7 }, {}],
  ['conquistas', { lacres: { 0: '2026-01-02', 1: true, 2: null }, navio: '2026-02-01' }, { lacres: { 0: '2026-01-02' }, navio: '2026-02-01' }],
  ['dias', [null, 5, '2026-01-02', 'ontem'], ['2026-01-02']],
  ['revisao', { pod: {}, svc: { caixa: 6, proxima: '2026-01-02' }, ns: { caixa: 1.5, proxima: '2026-01-02' }, cm: { caixa: 2, proxima: 'x' }, ok: { caixa: 5, proxima: '2026-01-02' } },
    { ok: { caixa: 5, proxima: '2026-01-02' } }],
  ['recordes', { a: 'abc', b: 0, c: -1, d: null, e: 1200 }, { e: 1200 }],
  ['plantoes', { x: { ms: 'a' }, y: { ms: 10, entregas: 1.5 }, z: { ms: 0, entregas: 0 } }, { z: { ms: 0, entregas: 0 } }],
  ['plantaoAberto', { x: { ms: -1, entregas: 1 }, z: { ms: 5, entregas: 2 } }, { z: { ms: 5, entregas: 2 } }],
  ['arquivos:n1', { 'a.yaml': 'x', 'b.yaml': 5, c: null }, { 'a.yaml': 'x' }],
];

describe('ler() com dado torto por dentro', () => {
  it.each(TORTOS)('%s %j: só as entradas boas', (chave, guardado, limpo) => {
    gravar(chave, guardado);
    expect(ler(chave, FORMAS[chave] ?? {})).toEqual(limpo);
  });

  it('sem padrão, a chave do site usa a sua forma: arquivos:<id> = 5 volta null (a missão abre com os iniciais)', () => {
    gravar('arquivos:n11-loja-1', 5);
    gravar('progresso', { 'n11-loja-1': { status: 'resolvido' } });
    expect(ler('arquivos:n11-loja-1')).toBeNull();
    expect(arquivosIniciais({ continuaDe: 'n11-loja-1', inicial: { 'a.yaml': '' } }, null)).toEqual({ 'a.yaml': '' });
  });

  it('o arquivo baixado com dado torto restaura, e volta limpo', () => {
    localStorage.setItem('kube-learn:dias', '{}');
    localStorage.setItem('kube-learn:progresso', 'null');
    localStorage.setItem('kube-learn:xyz', '1'); // chave que o site não conhece: fica fora do arquivo
    for (const [chave, guardado] of TORTOS) gravar(chave, guardado);
    const arquivo = JSON.parse(JSON.stringify(exportarTudo()));
    expect(conferirDados(arquivo)).toBeNull();
    expect(restaurar(arquivo)).toBeNull();
    expect(ler('dias', [])).toEqual(['2026-01-02']);
    expect(ler('revisao', {})).toEqual({ ok: { caixa: 5, proxima: '2026-01-02' } });
  });

  it('o restaurar grava limpo o arquivo com entradas tortas (forma de fora certa)', () => {
    expect(restaurar({ revisao: { pod: {} }, recordes: { a: 'abc', b: 9 } })).toBeNull();
    expect(JSON.parse(localStorage.getItem('kube-learn:revisao'))).toEqual({});
    expect(JSON.parse(localStorage.getItem('kube-learn:recordes'))).toEqual({ b: 9 });
  });

  it('janelas: coluna torta some, e a arrumação continua válida', () => {
    const a = normalizar({ colunas: [{}, null, 'x', { largura: 'a', janelas: [null, { id: 'missao', altura: 'b' }] }] }, ['missao', 'paineis']);
    expect(a.colunas.map((c) => c.janelas.map((j) => j.id))).toEqual([['missao', 'paineis']]);
    expect(a.colunas[0].largura).toBe(100);
    expect(normalizar({ colunas: 'x' }, ['missao']).colunas[0].janelas[0].id).toBe('missao');
  });
});

describe('FORMAS', () => {
  it('toda chave de CHAVES tem a sua forma (chave nova entra na tabela)', () => {
    expect(Object.values(CHAVES).filter((c) => !(c in FORMAS))).toEqual([]);
  });
});

describe('restaurar', () => {
  const PERFIL = {
    progresso: { 'n0-quiz-latest': { status: 'resolvido', em: '2026-01-02' } },
    dias: ['2026-01-01', '2026-01-02'],
    revisao: { pod: { caixa: 2, proxima: '2026-01-05' } },
    recordes: { 'of-get': 12000 },
    plantoes: { 'plantao-1': { ms: 90000, entregas: 2 } },
    nome: 'Ana',
    preferencias: { tema: 'escuro', idioma: 'en' },
    janelas: { colunas: [] },
    'arquivos:n1-diario': { 'pod.yaml': 'kind: Pod\n' },
    conquistas: { lacres: { 0: '2026-01-02' } },
  };

  it('ida e volta: exportarTudo → apagarTudo → restaurar → igual', () => {
    for (const [k, v] of Object.entries(PERFIL)) gravar(k, v);
    const copia = JSON.parse(JSON.stringify(exportarTudo())); // como o arquivo baixado
    apagarTudo();
    expect(exportarTudo()).toEqual({});
    expect(restaurar(copia)).toBeNull();
    expect(exportarTudo()).toEqual(PERFIL);
  });

  it('substitui tudo, sem mesclar, e avisa o placar', () => {
    gravar('dias', ['2025-12-31']);
    gravar('arquivos:outra', { 'a.yaml': '' });
    let avisos = 0;
    const contar = () => { avisos += 1; };
    addEventListener('kube-learn:progresso', contar);
    restaurar({ nome: 'Bia' });
    removeEventListener('kube-learn:progresso', contar);
    expect(exportarTudo()).toEqual({ nome: 'Bia' });
    expect(avisos).toBe(1);
  });

  it.each([
    ['não é objeto', []],
    ['nulo', null],
    ['vazio ({}): sem progresso aqui, apagaria tudo sem perguntar', {}],
    ['chave estranha', { xyz: 1 }],
    ['arquivos: sem id', { 'arquivos:': {} }],
    ['progresso em lista', { progresso: [] }],
    ['dias em objeto', { dias: {} }],
    ['nome nulo', { nome: null }],
  ])('%s: devolve o problema e não toca em nada', (_, dados) => {
    gravar('progresso', { a: { status: 'resolvido', em: '2026-01-01' } });
    gravar('preferencias', { tema: 'claro' });
    const antes = bruto();
    const problema = restaurar(dados);
    expect(problema?.texto).toBeTruthy();
    expect(conferirDados(dados)).toEqual(problema);
    expect(bruto()).toEqual(antes);
  });
});
