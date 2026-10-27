// O que o site guarda: o ler() que aguenta dado torto, a forma de cada chave e o restaurar do "Baixar meus dados".
import { beforeEach, describe, expect, it } from 'vitest';
import { CHAVES, FORMAS, ler, gravar, apagarTudo, exportarTudo, conferirDados, restaurar, registrarResultado } from '../src/armazenamento.js';

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
