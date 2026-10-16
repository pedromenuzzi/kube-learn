// Port do text/tabwriter do Go (alinhado à esquerda, preenchido com espaços), que o kubectl usa em
// todas as tabelas e no describe. Uma célula termina num "\t"; a última célula da linha não alinha.
// Linhas seguidas que têm a coluna N formam um bloco; a largura do bloco é a maior célula + padding.

const largura = (s) => [...s].length;

/**
 * Alinha o texto. kubectl get: { minimo: 6, padding: 3 }; describe: { minimo: 0, padding: 2 }.
 */
export function tabular(texto, { minimo = 0, padding = 1 } = {}) {
  const terminaComQuebra = texto.endsWith('\n');
  const linhas = (terminaComQuebra ? texto.slice(0, -1) : texto).split('\n').map((l) => l.split('\t'));
  const larguras = [];
  const saida = [];

  const escrever = (l0, l1) => {
    for (let i = l0; i < l1; i++) {
      const celulas = linhas[i];
      let s = '';
      celulas.forEach((c, j) => {
        s += c;
        if (j < larguras.length) s += ' '.repeat(Math.max(0, larguras[j] - largura(c)));
      });
      saida[i] = s;
    }
  };

  const formatar = (l0, l1) => {
    const coluna = larguras.length;
    let inicio = l0;
    for (let atual = l0; atual < l1; atual++) {
      if (coluna >= linhas[atual].length - 1) continue;
      escrever(inicio, atual);
      inicio = atual;
      let w = minimo;
      for (; atual < l1; atual++) {
        if (coluna >= linhas[atual].length - 1) break;
        w = Math.max(w, largura(linhas[atual][coluna]) + padding);
      }
      larguras.push(w);
      formatar(inicio, atual);
      larguras.pop();
      inicio = atual;
      atual--; // o for incrementa; a linha `atual` ainda não foi vista nesta coluna
    }
    escrever(inicio, l1);
  };

  formatar(0, linhas.length);
  return saida.join('\n') + (terminaComQuebra ? '\n' : '');
}

/** Tabela do kubectl get: linhas de células → texto alinhado. */
export const tabela = (linhas) => tabular(linhas.map((l) => l.join('\t')).join('\n') + '\n', { minimo: 6, padding: 3 });
