// Ajudantes para escrever o conteúdo: a tag yaml`...` e os construtores de itens.

/** yaml`...`: tira o recuo comum das linhas (para escrever YAML recuado dentro do JS) e a linha vazia do começo. */
export function yaml(partes, ...valores) {
  const texto = partes.reduce((s, p, i) => s + p + (i < valores.length ? valores[i] : ''), '');
  const linhas = texto.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const recuo = Math.min(...linhas.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return `${linhas.map((l) => l.slice(recuo)).join('\n')}\n`;
}

export const XP = { licao: 5, quiz: 5, facil: 10, medio: 20, dificil: 40 };

/**
 * Uma lição: `conteudo` (HTML), vidaReal e limite. Com `inicial` (um YAML de exemplo), abre na tela do exercício
 * e conclui ao aplicar sem erro; sem ele, é só leitura e conclui no botão "Marquei como lida".
 */
export const licao = (dados) => ({
  tipo: 'licao',
  cluster: 'vazio',
  ...(dados.inicial ? { solucao: dados.inicial, testes: [{ descricao: 'kubectl apply -f .', regras: [{ semErros: true }] }] } : { testes: [] }),
  ...dados,
  enunciado: dados.conteudo,
});

/**
 * Um quiz: `pergunta` (HTML) e `alternativas` [{ texto, certa?, explicacao }] — ou `resposta` (RegExp) para
 * uma resposta digitada, com `explicacao`. Vale 5 XP.
 */
export const quiz = (dados) => ({ tipo: 'quiz', testes: [], ...dados, enunciado: dados.pergunta });

/**
 * Um problema: enunciado, arquivos iniciais, solução e testes.
 * Teste: { descricao, oculto?, passos?: [{ comando } | { avancar }], noClusterDoAluno?, regras: [...] }.
 * Sem `passos`, o teste aplica os arquivos num cluster novo e espera 1 minuto.
 * `armadilhas`: os atalhos que parecem conserto e não são (apagar a sonda, afrouxar a cota...). Cada uma é a solução com
 * um desvio: { descricao, arquivos? (todos os arquivos) | mudar?(arquivos da solução) → arquivos, historico?, resposta? };
 * o teste da trilha confere que nenhuma passa.
 */
export const problema = (dados) => ({ tipo: 'problema', cluster: 'vazio', inicial: {}, ...dados });

/**
 * Um projeto: etapas encadeadas. Cada etapa é um problema que começa dos arquivos da anterior (os do aluno, se ele
 * já fez; senão, a solução de referência) mais os `novos` desta etapa. → a lista de itens (um por etapa).
 * etapa: { titulo, dificuldade, enunciado, vidaReal, limite, dica, novos?, solucao (todos os arquivos ao fim), testes, ... }
 */
export function projeto({ id, titulo, cluster = 'vazio', etapas }) {
  let anterior = {};
  return etapas.map((e, i) => {
    const { novos = {}, solucao, ...resto } = e;
    const item = problema({
      cluster,
      ...resto,
      id: `${id}-${i + 1}`,
      projeto: { id, titulo, etapa: i + 1, total: etapas.length },
      continuaDe: i ? `${id}-${i}` : null,
      novos,
      inicial: { ...anterior, ...novos },
      solucao,
    });
    anterior = solucao;
    return item;
  });
}
