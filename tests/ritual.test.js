// @vitest-environment node
// O ritual do dia (as marcas que fecham o dia) e o texto do lembrete diário (.ics).
import { describe, expect, it } from 'vitest';
import { marcasDoDia, diaCumprido, lembreteIcs } from '../src/jogo/ritual.js';

const HOJE = '2026-10-26';
const jornada = { niveis: [{ itens: [{ id: 'a' }, { id: 'b' }] }], proximo: { id: 'b' } };
const marcas = (extra = {}) => marcasDoDia({ jornada, progresso: {}, hoje: HOJE, termos: 0, cartoes: 0, plantao: null, ...extra });

describe('o ritual do dia', () => {
  it('a missão de hoje: só vale resolvida hoje, na trilha', () => {
    expect(marcas()[0]).toEqual({ id: 'missao', feito: false });
    expect(marcas({ progresso: { a: { status: 'resolvido', em: '2026-10-25' } } })[0].feito).toBe(false); // ontem
    expect(marcas({ progresso: { a: { status: 'tentado', em: HOJE } } })[0].feito).toBe(false);
    expect(marcas({ progresso: { 'plantao-2026-10-26': { status: 'resolvido', em: HOJE } } })[0].feito).toBe(false); // fora da trilha
    expect(marcas({ progresso: { a: { status: 'resolvido', em: HOJE } } })[0].feito).toBe(true);
  });

  it('a revisão entra sempre; em dia é com termos vistos e sem cartão para hoje', () => {
    expect(marcas({ termos: 0, cartoes: 0 }).map((m) => m.id)).toEqual(['missao', 'revisao']);
    expect(marcas({ termos: 5, cartoes: 3 })[1]).toEqual({ id: 'revisao', feito: false });
    expect(marcas({ termos: 5, cartoes: 0 })[1]).toEqual({ id: 'revisao', feito: true });
  });

  it('o plantão só entra liberado, e conta atendido', () => {
    const plantao = `plantao-${HOJE}`;
    expect(marcas({ plantao }).at(-1)).toEqual({ id: 'plantao', feito: false });
    expect(marcas({ plantao, progresso: { [plantao]: { status: 'tentado', em: HOJE } } }).at(-1).feito).toBe(false);
    expect(marcas({ plantao, progresso: { [plantao]: { status: 'resolvido', em: HOJE } } }).at(-1).feito).toBe(true);
  });

  it('a trilha completa não cobra missão que não existe', () => {
    expect(marcasDoDia({ jornada: { ...jornada, proximo: null }, progresso: {}, hoje: HOJE, termos: 5, cartoes: 0, plantao: null }))
      .toEqual([{ id: 'revisao', feito: true }]);
  });

  it('dia cumprido: tudo feito, e com alguma marca', () => {
    const progresso = { a: { status: 'resolvido', em: HOJE }, [`plantao-${HOJE}`]: { status: 'resolvido', em: HOJE } };
    expect(diaCumprido(marcas({ progresso, termos: 5, cartoes: 0, plantao: `plantao-${HOJE}` }))).toBe(true);
    expect(diaCumprido(marcas({ progresso, termos: 5, cartoes: 1, plantao: `plantao-${HOJE}` }))).toBe(false);
    expect(diaCumprido([])).toBe(false);
  });

  // Senão o primeiro pod, sozinho (nenhuma das primeiras missões traz termo), já fechava o primeiro dia.
  it('sem termos vistos, a missão de hoje não fecha o dia: a revisão fica a fazer', () => {
    const m = marcas({ progresso: { a: { status: 'resolvido', em: HOJE } }, termos: 0, cartoes: 0 });
    expect(m).toEqual([{ id: 'missao', feito: true }, { id: 'revisao', feito: false }]);
    expect(diaCumprido(m)).toBe(false);
  });
});

describe('o lembrete diário (.ics)', () => {
  const ics = lembreteIcs({
    hora: '07:30', hoje: HOJE, agora: new Date('2026-10-26T15:04:05.123Z'), url: 'https://pedromenuzzi.github.io/kube-learn/',
    titulo: 'kube-learn: hora da sua missão', descricao: 'Uma missão e a revisão do dia, uns 15 minutos. Pulou um dia? Tudo bem: amanhã tem mais.',
  });
  const linhas = ics.split('\r\n');
  const desdobrado = ics.replace(/\r\n /g, '');

  it('todo dia, no horário escolhido (hora local, sem fuso), com o link do site', () => {
    expect(linhas[0]).toBe('BEGIN:VCALENDAR');
    expect(linhas).toContain('BEGIN:VEVENT');
    expect(linhas).toContain('RRULE:FREQ=DAILY');
    expect(linhas).toContain('DTSTART:20261026T073000');
    expect(linhas).toContain('DTSTAMP:20261026T150405Z');
    expect(linhas).toContain('URL:https://pedromenuzzi.github.io/kube-learn/');
    expect(desdobrado).toContain('DESCRIPTION:Uma missão e a revisão do dia\\, uns 15 minutos. Pulou um dia? Tudo bem: amanhã tem mais.\\nhttps://pedromenuzzi.github.io/kube-learn/');
    expect(linhas.at(-2)).toBe('END:VCALENDAR');
  });

  it('linhas em CRLF, de no máximo 75 bytes (as longas continuam com um espaço)', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const l of linhas) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(linhas.some((l) => l.startsWith(' '))).toBe(true); // a descrição é longa: dobrou
    expect(desdobrado).toContain('SUMMARY:kube-learn: hora da sua missão');
  });
});
