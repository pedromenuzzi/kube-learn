// @vitest-environment node
// O índice leve (src/conteudo/indice.js), que a página inicial, o topo e a trilha usam no lugar do conteúdo inteiro: ele
// sai do próprio conteúdo (vite.config.js + src/conteudo/resumo.js) e tem de bater com NIVEIS, no build e no dev.
import { afterAll, describe, expect, it } from 'vitest';
import config from '../vite.config.js';
import { NIVEIS as LEVES, GLOSSARIO as TERMOS, itemDoIndice } from '../src/conteudo/indice.js';
import { NIVEIS, OFICINA, TROUBLESHOOTING, GLOSSARIO } from '../src/conteudo/index.js';
import * as conteudo from '../src/conteudo/index.js';
import { resumoDoConteudo } from '../src/conteudo/resumo.js';
import { calcularJornada } from '../src/jogo/gamificacao.js';
import { somarDias, termosVistos } from '../src/jogo/revisao.js';
import { plantaoDoDia } from '../src/jogo/plantao.js';
import { definirIdioma } from '../src/i18n.js';
import * as EN from '../src/i18n/en/index.js';

const resumoDaJornada = (j) => ({
  xp: j.xp,
  proximo: j.proximo?.id ?? null,
  niveisProntos: j.niveisProntos,
  navioCheio: j.navioCheio,
  niveis: j.niveis.map((n) => [n.numero, n.total, n.resolvidos, n.pct, n.desbloqueado, n.situacao, n.itens.map((i) => `${i.id}:${i.estado}:${i.xp}`).join()]),
});

/** Progressos de exemplo: nada, os primeiros N itens resolvidos (com um tentado no meio) e a trilha inteira. */
const TODOS = NIVEIS.flatMap((n) => n.itens.map((i) => i.id));
const progressos = [0, 7, 30, 61, 120, TODOS.length].map((n) => Object.fromEntries(TODOS.slice(0, n).map((id, k) => [id, { status: k % 9 === 4 ? 'tentado' : 'resolvido', em: '2026-10-20' }])));

describe('o índice leve', () => {
  it('tem os mesmos níveis e missões, na mesma ordem, com os campos que a home usa', () => {
    expect(LEVES.map((n) => [n.id, n.numero, n.icone, n.titulo, n.descricao])).toEqual(NIVEIS.map((n) => [n.id, n.numero, n.icone, n.titulo, n.descricao]));
    for (const [k, n] of NIVEIS.entries()) {
      expect(LEVES[k].itens.map((i) => i.id), `nível ${n.numero}`).toEqual(n.itens.map((i) => i.id));
      for (const [j, i] of n.itens.entries()) {
        const leve = LEVES[k].itens[j];
        expect([leve.tipo, leve.dificuldade, leve.titulo, leve.nivel, !!leve.terminal, leve.projeto], i.id).toEqual([i.tipo, i.dificuldade, i.titulo, i.nivel, !!i.terminal, i.projeto]);
        expect(!!leve.leitura, i.id).toBe(i.tipo === 'quiz' || (i.tipo === 'licao' && !i.inicial));
        expect(leve.enunciado, i.id).toBeUndefined(); // o texto inteiro fica no conteúdo
      }
    }
  });

  it('dá a mesma jornada, os mesmos termos para revisar e acha os títulos de todas as seções', () => {
    for (const p of progressos) {
      const leve = calcularJornada(LEVES, p);
      const completa = calcularJornada(NIVEIS, p);
      expect(resumoDaJornada(leve)).toEqual(resumoDaJornada(completa));
      expect(termosVistos(TERMOS, leve).map((g) => g.id)).toEqual(termosVistos(GLOSSARIO, completa).map((g) => g.id));
    }
    for (const i of [...TROUBLESHOOTING, ...OFICINA]) expect(itemDoIndice(i.id)?.titulo, i.id).toBe(i.titulo);
    expect(itemDoIndice('nao-existe')).toBeUndefined();
  });

  it('o chamado do Plantão (só o id e o título) é o mesmo de plantaoDoDia, sem montar o incidente', () => {
    for (let k = 0; k < 30; k++) {
      const dia = somarDias('2026-10-01', k);
      const { id, titulo } = plantaoDoDia(dia);
      expect(itemDoIndice(id)).toMatchObject({ id, titulo, secao: 'plantao' });
    }
    expect(itemDoIndice('plantao-2026-13-01')).toBeUndefined();
  });

  it('no build, o vite.config.js roda o conteúdo no Node e entrega o mesmo resumo, em JSON', async () => {
    const plugin = config.plugins.find((p) => p.name === 'indice-do-conteudo');
    plugin.configResolved({ root: process.cwd(), command: 'build' });
    const id = plugin.resolveId('virtual:indice-do-conteudo');
    const codigo = await plugin.load(id);
    expect(codigo).toMatch(/^export default \{/);
    expect(JSON.parse(codigo.replace(/^export default /, '').replace(/;$/, ''))).toEqual(JSON.parse(JSON.stringify(resumoDoConteudo(conteudo))));
  });

  describe('em inglês', () => {
    afterAll(() => definirIdioma('pt', { salvar: false }));
    it('troca o título dos níveis e das missões, e volta ao português', async () => {
      const pt = LEVES[2].itens[0].titulo;
      await definirIdioma('en', { salvar: false });
      expect(LEVES[2].titulo).toBe(EN.niveis[2].titulo);
      expect(LEVES[2].itens[0].titulo).toBe(EN.itens[LEVES[2].itens[0].id].titulo);
      const etapa = LEVES.flatMap((n) => n.itens).find((i) => i.projeto);
      expect(etapa.projeto.titulo).toBe(EN.itens[etapa.id].projeto);
      expect(itemDoIndice(TROUBLESHOOTING[0].id).titulo).toBe(EN.itens[TROUBLESHOOTING[0].id].titulo);
      // o conteúdo completo, já carregado, trocou junto
      expect(NIVEIS[2].itens[0].titulo).toBe(LEVES[2].itens[0].titulo);
      await definirIdioma('pt', { salvar: false });
      expect(LEVES[2].itens[0].titulo).toBe(pt);
    });
  });
});
