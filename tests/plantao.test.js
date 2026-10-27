// @vitest-environment node
// O Plantão do dia: toda dupla de defeitos (de tipos diferentes, em todas as variantes) tem conserto, e o começo falha.
import { describe, expect, it } from 'vitest';
import { CENARIOS, DEFEITOS, DUPLAS, montarPlantao, plantaoDoDia } from '../src/jogo/plantao.js';
import { acharItem, proximoDe } from '../src/conteudo/index.js';
import { rodarTestes } from '../src/verificacoes.js';
import { aluno } from './trilha.js';
import { definirIdioma } from '../src/i18n.js';

const tipos = Object.keys(DEFEITOS);
// Os atalhos que parecem conserto: tirar a sonda, o limite ou a variável faz o pod subir, mas deixa a trava de fora.
const ATALHOS = {
  'apagar a readinessProbe': (y) => y.replace(/ +readinessProbe:\n +httpGet:\n +path: .*\n +port: .*\n/, ''),
  'apagar a livenessProbe': (y) => y.replace(/ +livenessProbe:\n +tcpSocket:\n +port: .*\n/, ''),
  'apagar o limits.memory': (y) => y.replace(/ +limits:\n +memory: .*\n/, ''),
  'apagar o env': (y) => y.replace(/ +env:\n(?: +.*\n)*? +key: .*\n/, ''),
};
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
    it(`${nome}: o conserto passa, o começo falha e tirar a trava não conserta`, () => {
      const item = montarPlantao(`plantao-teste-${i}`, CENARIOS[i % CENARIOS.length], [a, b]);
      const certo = rodarTestes(item, aluno(item, { resolvido: true }), { todos: true });
      expect(certo.flatMap((t) => t.regras.filter((x) => !x.ok).map((x) => `${x.mensagem} (${x.detalhe})`))).toEqual([]);
      const quebrado = rodarTestes(item, aluno(item, { resolvido: false }), { todos: true });
      expect(quebrado.some((t) => !t.ok)).toBe(true);
      const passam = Object.entries(ATALHOS).filter(([, tirar]) => {
        const mudar = (arqs) => ({ ...arqs, 'deployment.yaml': tirar(arqs['deployment.yaml']) });
        return rodarTestes(item, aluno(item, { resolvido: true }, { mudar }), { todos: true }).every((t) => t.ok);
      });
      expect(passam.map(([atalho]) => atalho)).toEqual([]);
    });
  });

  // Todo app roda a imagem kubelearn/loja, mas o morador é a padaria: nem o teste nem o diagnóstico falam da "loja".
  it('o incidente de outro app não fala da loja: o teste confere a resposta de um pod do app', () => {
    const item = montarPlantao('plantao-sem-loja', CENARIOS[0], [DEFEITOS.memoria[0], DEFEITOS.porta[0]]);
    expect(JSON.stringify(item.testes)).not.toMatch(/loja/);
    expect(JSON.stringify(item.testes)).toContain('"pod\\":\\"padaria-');
    expect(item.diagnostico).not.toMatch(/loja/);
    const resto = Object.values(DEFEITOS).flat().map((d) => d.diagnostico(CENARIOS[0]).replace('kubelearn/loja:', 'a imagem '));
    expect(resto.filter((d) => /loja/.test(d))).toEqual([]);
  });

  it('os atalhos tiram mesmo o pedaço (senão o teste acima não prova nada)', () => {
    const certo = montarPlantao('plantao-atalhos', CENARIOS[0], []).solucao['deployment.yaml'];
    for (const [atalho, tirar] of Object.entries(ATALHOS)) expect(tirar(certo), atalho).not.toBe(certo);
  });

  it('em inglês, as descrições dos testes saem em inglês', async () => {
    await definirIdioma('en', { salvar: false });
    try {
      const item = plantaoDoDia('2026-10-22');
      expect(item.testes.map((t) => t.descricao)).toEqual(['the incident is resolved', 'the safety locks are still there']);
      expect(item.testes[1].regras.some((r) => /detector/.test(r.msg ?? ''))).toBe(true);
    } finally {
      await definirIdioma('pt', { salvar: false });
    }
  });
});
