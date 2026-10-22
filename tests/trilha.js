// O teste da trilha inteira: toda solução passa em todos os testes (inclusive os ocultos) e todo código
// inicial ainda falha em algum. Assim, nenhum exercício chega ao aluno quebrado ou já resolvido.
// Ele é dividido nos arquivos tests/trilha-N.test.js (todos iguais) para o Vitest rodar as partes em paralelo:
// a parte N fica com uma de cada PARTES missões, em rodízio. Para mais partes, copie um deles com o próximo N.
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITENS, TROUBLESHOOTING } from '../src/conteudo/index.js';
import { montarCluster, CLUSTERS } from '../src/conteudo/clusters.js';
import { rodarTestes, TIPOS_DE_REGRA } from '../src/verificacoes.js';
import { rodarLinha } from '../src/k8s/linha.js';
import { explicar } from '../src/k8s/esquema.js';
import { acharRecurso } from '../src/k8s/recursos.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';
import { NIVEIS } from '../src/conteudo/niveis.js';
import { conferirQuiz } from '../src/ui/leitura.js';

/** Monta o que o aluno teria: arquivos e, nos exercícios de terminal, o cluster depois dos comandos. */
function aluno(item, { resolvido }) {
  const arquivos = { ...(resolvido ? item.solucao : item.inicial) };
  const clusterDoAluno = montarCluster(item.cluster, item.id);
  const historico = resolvido ? item.solucaoTerminal ?? [] : [];
  for (const linha of historico) rodarLinha(clusterDoAluno, linha, arquivos);
  clusterDoAluno.avancar('1m');
  if (!resolvido) return { arquivos, clusterDoAluno, historico, resposta: '' };
  const certa = typeof item.respostaCerta === 'function' ? item.respostaCerta(clusterDoAluno) : item.respostaCerta;
  return { arquivos, clusterDoAluno, historico, resposta: certa };
}

// A trilha e os incidentes da seção Troubleshooting (fora dos níveis).
const TODOS = [...ITENS, ...TROUBLESHOOTING];

// As partes: o N de cada tests/trilha-N.test.js, em ordem.
const PARTES = readdirSync(new URL('.', import.meta.url)).flatMap((f) => f.match(/^trilha-(\d+)\.test\.js$/)?.[1] ?? []).map(Number).sort((a, b) => a - b);

/** Roda a parte da trilha do arquivo que chama (o N de trilha-N.test.js, passado como import.meta.url). */
export function testarTrilha(arquivo) {
  const parte = Number(arquivo.match(/trilha-(\d+)\.test\.js$/)[1]);
  const minhas = (lista) => lista.filter((_, i) => i % PARTES.length === parte - 1);
  describe('a trilha inteira', () => {
    if (parte === 1) testarCampos();
    for (const item of minhas(ITENS.filter((i) => i.tipo === 'licao' && i.inicial))) {
      it(`${item.id}: o exemplo da lição aplica sem erro`, () => {
        const r = rodarTestes(item, { arquivos: item.inicial }, { todos: true });
        expect(r.every((t) => t.ok)).toBe(true);
      });
    }
    for (const item of minhas(TODOS.filter((i) => i.tipo === 'problema'))) {
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
}

/** As conferências da trilha toda de uma vez (rodam só na parte 1). */
function testarCampos() {
  it('as partes do teste vão de trilha-1 a trilha-N, sem buraco (senão umas missões ficariam sem teste)', () => {
    expect(PARTES).toEqual(PARTES.map((_, i) => i + 1));
  });

  it('ids únicos e campos obrigatórios', () => {
    const ids = TODOS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of TODOS) {
      expect(i.titulo, i.id).toBeTruthy();
      expect(i.enunciado, i.id).toBeTruthy();
      expect(i.vidaReal, `${i.id}: toda missão tem a comparação com a vida real`).toBeTruthy();
      expect(i.limite, `${i.id}: e onde a comparação quebra`).toBeTruthy();
      if (i.tipo === 'problema' || i.inicial) expect(CLUSTERS[i.cluster], `${i.id}: cluster ${i.cluster}`).toBeTruthy();
      if (i.tipo === 'quiz') {
        if (i.alternativas) {
          expect(i.alternativas.filter((a) => a.certa).length, `${i.id}: uma alternativa certa`).toBe(1);
          for (const a of i.alternativas) expect(a.explicacao, `${i.id}: toda alternativa explica`).toBeTruthy();
        } else {
          expect(i.resposta, `${i.id}: resposta`).toBeInstanceOf(RegExp);
          expect(i.explicacao, `${i.id}: explicação`).toBeTruthy();
          expect(i.exemplos?.length, `${i.id}: exemplos de resposta certa (para o teste)`).toBeTruthy();
          for (const e of i.exemplos) expect(conferirQuiz(i, e).certa, `${i.id}: "${e}"`).toBe(true);
          expect(conferirQuiz(i, 'qualquer coisa').certa).toBe(false);
        }
      }
      for (const t of i.testes) for (const r of t.regras) expect(TIPOS_DE_REGRA.some((k) => k in r), `${i.id}: ${JSON.stringify(r)}`).toBe(true);
      for (const m of i.manual ?? []) {
        const [tipo, ...caminho] = m.split('.');
        expect(explicar(acharRecurso(tipo), caminho).erro, `${i.id}: manual ${m}`).toBeUndefined();
      }
    }
  });

  it('glossário: todo termo tem definição, vida real, limite e um nível que existe', () => {
    const ids = GLOSSARIO.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GLOSSARIO) {
      for (const campo of ['termo', 'definicao', 'vidaReal', 'limite']) expect(g[campo], `${g.id}.${campo}`).toBeTruthy();
      expect(NIVEIS.some((n) => n.numero === g.nivel), `${g.id}.nivel`).toBe(true);
    }
  });
}
