// Ajudantes para escrever o conteúdo: a tag yaml`...` e os construtores de itens.

/** yaml`...`: tira o recuo comum das linhas (para escrever YAML recuado dentro do JS) e a linha vazia do começo. */
export function yaml(partes, ...valores) {
  const texto = partes.reduce((s, p, i) => s + p + (i < valores.length ? valores[i] : ''), '');
  const linhas = texto.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const recuo = Math.min(...linhas.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return `${linhas.map((l) => l.slice(recuo)).join('\n')}\n`;
}

export const XP = { licao: 5, quiz: 5, facil: 10, medio: 20, dificil: 40 };

/** Uma lição: explicação, analogia e um YAML de exemplo para aplicar. Conclui ao aplicar sem erro. */
export const licao = (dados) => ({ tipo: 'licao', cluster: 'vazio', testes: [{ descricao: 'kubectl apply -f .', regras: [{ semErros: true }] }], ...dados });

/**
 * Um problema: enunciado, arquivos iniciais, solução e testes.
 * Teste: { descricao, oculto?, passos?: [{ comando } | { avancar }], noClusterDoAluno?, regras: [...] }.
 * Sem `passos`, o teste aplica os arquivos num cluster novo e espera 1 minuto.
 */
export const problema = (dados) => ({ tipo: 'problema', cluster: 'vazio', inicial: {}, ...dados });
