// @vitest-environment node
// O Plantão do dia: toda dupla de defeitos (de tipos diferentes, em todas as variantes) tem conserto, e o começo falha.
import { describe, expect, it } from 'vitest';
import { CENARIOS, DEFEITOS, DUPLAS, montarPlantao, plantaoDoDia } from '../src/jogo/plantao.js';
import { acharItem, proximoDe } from '../src/conteudo/index.js';
import { rodarTestes } from '../src/verificacoes.js';
import { aluno } from './trilha.js';

const tipos = Object.keys(DEFEITOS);
const duplas = tipos.flatMap((a, i) => tipos.slice(i + 1).flatMap((b) => DEFEITOS[a].flatMap((da, x) => DEFEITOS[b].map((db, y) => [`${a}${x} + ${b}${y}`, da, db]))));

describe('o Plantão do dia', () => {
  it('o mesmo dia dá o mesmo plantão; o morador muda todo dia, e as 28 duplas passam antes de alguma repetir', () => {
    expect(plantaoDoDia('2026-10-22').inicial).toEqual(plantaoDoDia('2026-10-22').inicial);
    const dias = Array.from({ length: DUPLAS.length }, (_, i) => plantaoDoDia(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)));
    dias.slice(1).forEach((p, i) => expect(p.titulo).not.toBe(dias[i].titulo));
    expect(new Set(dias.map((p) => p.diagnostico)).size).toBe(DUPLAS.length);
  });

  it('o id do dia abre o plantão; data inválida não abre nada, e o plantão não tem "próximo"', () => {
    const item = acharItem('plantao-2026-10-22');
    expect(item.secao).toBe('plantao');
    expect(proximoDe(item)).toBeNull();
    expect(acharItem('plantao-2026-02-30')).toBeNull();
    expect(acharItem('plantao-ontem')).toBeNull();
  });

  // Senão um defeito que não quebra nada passaria escondido atrás do outro da dupla.
  it('cada defeito, sozinho, já quebra o plantão', () => {
    const inofensivos = tipos.flatMap((tipo) => DEFEITOS[tipo].flatMap((d, x) => {
      const item = montarPlantao(`plantao-so-${tipo}-${x}`, CENARIOS[0], [d]);
      return rodarTestes(item, aluno(item, { resolvido: false }), { todos: true }).every((t) => t.ok) ? [`${tipo}${x}`] : [];
    }));
    expect(inofensivos).toEqual([]);
  });

  duplas.forEach(([nome, a, b], i) => {
    it(`${nome}: o conserto passa e o começo falha`, () => {
      const item = montarPlantao(`plantao-teste-${i}`, CENARIOS[i % CENARIOS.length], [a, b]);
      const certo = rodarTestes(item, aluno(item, { resolvido: true }), { todos: true });
      expect(certo.flatMap((t) => t.regras.filter((x) => !x.ok).map((x) => `${x.mensagem} (${x.detalhe})`))).toEqual([]);
      const quebrado = rodarTestes(item, aluno(item, { resolvido: false }), { todos: true });
      expect(quebrado.some((t) => !t.ok)).toBe(true);
    });
  });
});
