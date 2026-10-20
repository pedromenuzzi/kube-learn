// @vitest-environment node
// O teste da trilha inteira: toda solução passa em todos os testes (inclusive os ocultos) e todo código
// inicial ainda falha em algum. Assim, nenhum exercício chega ao aluno quebrado ou já resolvido.
import { describe, expect, it } from 'vitest';
import { ITENS } from '../src/conteudo/index.js';
import { montarCluster, CLUSTERS } from '../src/conteudo/clusters.js';
import { rodarTestes, TIPOS_DE_REGRA } from '../src/verificacoes.js';
import { kubectl } from '../src/k8s/kubectl/index.js';
import { explicar } from '../src/k8s/esquema.js';
import { acharRecurso } from '../src/k8s/recursos.js';

/** Monta o que o aluno teria: arquivos e, nos exercícios de terminal, o cluster depois dos comandos. */
function aluno(item, { resolvido }) {
  const arquivos = { ...(resolvido ? item.solucao : item.inicial) };
  const clusterDoAluno = montarCluster(item.cluster, item.id);
  const historico = resolvido ? item.solucaoTerminal ?? [] : [];
  for (const linha of historico) kubectl(clusterDoAluno, linha, { arquivos });
  clusterDoAluno.avancar('1m');
  return { arquivos, clusterDoAluno, historico, resposta: resolvido ? item.resposta : '' };
}

describe('a trilha inteira', () => {
  it('ids únicos e campos obrigatórios', () => {
    const ids = ITENS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of ITENS) {
      expect(i.titulo, i.id).toBeTruthy();
      expect(i.enunciado, i.id).toBeTruthy();
      expect(i.vidaReal, `${i.id}: toda missão tem a comparação com a vida real`).toBeTruthy();
      expect(i.limite, `${i.id}: e onde a comparação quebra`).toBeTruthy();
      expect(CLUSTERS[i.cluster], `${i.id}: cluster ${i.cluster}`).toBeTruthy();
      for (const t of i.testes) for (const r of t.regras) expect(TIPOS_DE_REGRA.some((k) => k in r), `${i.id}: ${JSON.stringify(r)}`).toBe(true);
      for (const m of i.manual ?? []) {
        const [tipo, ...caminho] = m.split('.');
        expect(explicar(acharRecurso(tipo), caminho).erro, `${i.id}: manual ${m}`).toBeUndefined();
      }
    }
  });

  for (const item of ITENS.filter((i) => i.tipo === 'problema')) {
    describe(item.id, () => {
      it('a solução passa em todos os testes', () => {
        const r = rodarTestes(item, aluno(item, { resolvido: true }), { todos: true });
        const falhas = r.flatMap((t) => t.regras.filter((x) => !x.ok).map((x) => `${t.descricao}: ${x.mensagem} (${x.detalhe})`));
        expect(falhas).toEqual([]);
      });
      it('o código inicial ainda não passa', () => {
        const r = rodarTestes(item, aluno(item, { resolvido: false }), { todos: true });
        expect(r.some((t) => !t.ok)).toBe(true);
      });
    });
  }
});
