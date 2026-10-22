// O kubectl get com colunas e ordem escolhidas: -o custom-columns, --sort-by e -L (como o customcolumn.go, o
// sorter.go e o tablePrinter do kubectl).
import { avaliar } from './formatos.js';
import { tabela } from '../tabwriter.js';

/** O RelaxedJSONPathExpression do kubectl: 'a.b', '.a.b', '{a.b}' e '{.a.b}' viram '.a.b'. */
export function caminhoRelaxado(expr) {
  if (!expr) return '';
  const m = expr.match(/^\{\.?([^{}]+)\}$|^\.?([^{}]+)$/);
  if (!m) throw new Error("unexpected path string, expected a 'name1.name2' or '.name1.name2' or '{name1.name2}' or '{.name1.name2}'");
  return `.${m[1] ?? m[2]}`;
}

/** 'NOME:.metadata.name,IMAGEM:.spec.containers[*].image' → [{ cabecalho, caminho }]. */
export function lerColunas(spec) {
  if (!spec) throw new Error('custom-columns format specified but no custom columns given');
  return spec.split(',').map((parte) => {
    const i = parte.indexOf(':');
    if (i === -1) throw new Error(`unexpected custom-columns spec: ${parte}, expected <header>:<json-path-expr>`);
    return { cabecalho: parte.slice(0, i), caminho: caminhoRelaxado(parte.slice(i + 1)) };
  });
}

/** Um valor como o fmt.Sprint do Go escreve (mapas em ordem: map[a:1 b:2]; listas: [x y]). */
export const sprint = (v) => {
  if (v === null || v === undefined) return '<nil>';
  if (Array.isArray(v)) return `[${v.map(sprint).join(' ')}]`;
  if (typeof v === 'object') return `map[${Object.keys(v).sort().map((k) => `${k}:${sprint(v[k])}`).join(' ')}]`;
  return String(v);
};

const valores = (caminho, obj) => (caminho ? avaliar(caminho, obj, obj) : []);

/** A tabela do -o custom-columns: um valor por célula (vários, separados por vírgula; nenhum, <none>). */
export function tabelaDeColunas(colunas, objetos, semCabecalho) {
  const linhas = objetos.map((o) => colunas.map((c) => valores(c.caminho, o).map(sprint).join(',') || '<none>'));
  return tabela([...(semCabecalho ? [] : [colunas.map((c) => c.cabecalho)]), ...linhas]);
}

// ---------- --sort-by ----------
const SUFIXOS = { n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18, Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, Pi: 2 ** 50, Ei: 2 ** 60 };
/** '100m', '1Gi', '3' → número; o que não é quantidade → null (como o resource.ParseQuantity). */
const quantidade = (s) => {
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(Ki|Mi|Gi|Ti|Pi|Ei|[numkMGTPE])?$/);
  return m ? Number(m[1]) * (SUFIXOS[m[2]] ?? 1) : null;
};

/** O sortorder.NaturalLess: os números dentro do texto comparam pelo valor ("pod-2" antes de "pod-10"). */
export function naturalMenor(a, b) {
  const digito = (c) => c >= '0' && c <= '9';
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const da = digito(a[i]);
    const db = digito(b[j]);
    if (da !== db) return da;
    if (!da) {
      if (a[i] !== b[j]) return a[i] < b[j];
      i++;
      j++;
      continue;
    }
    while (a[i] === '0') i++;
    while (b[j] === '0') j++;
    const ia = i;
    const jb = j;
    while (i < a.length && digito(a[i])) i++;
    while (j < b.length && digito(b[j])) j++;
    if (i - ia !== j - jb) return i - ia < j - jb;
    if (a.slice(ia, i) !== b.slice(jb, j)) return a.slice(ia, i) < b.slice(jb, j);
    if (ia !== jb) return ia < jb;
  }
  return a.length < b.length;
}

/** O isLess do kubectl: números por valor, quantidades por quantidade, textos pela ordem natural; o nulo vem antes. */
function menor(x, y) {
  if (x === null) return y !== null;
  if (y === null) return false;
  if (typeof x === 'number' && typeof y === 'number') return x < y;
  if (typeof x === 'string' && typeof y === 'string') {
    const qx = quantidade(x);
    const qy = quantidade(y);
    return qx !== null && qy !== null ? qx < qy : naturalMenor(x, y);
  }
  return false; // ponytail: o kubectl sai com "unsortable type" (bool, mapa, tipos misturados); aqui só não troca
}

export const semCampo = (expr) => `couldn't find any field with path "{${caminhoRelaxado(expr)}}" in the list of objects`;

/**
 * --sort-by: os objetos em ordem. Quem não tem o campo vai para o começo (o Less do kubectl diz "menor" para ele,
 * e a ordenação por inserção do Go, que é a que roda em listas de até 12 itens, deixa esses em ordem inversa).
 * Nenhum objeto com o campo → erro, como o real.
 */
export function ordenarPor(objetos, expr) {
  const caminho = caminhoRelaxado(expr);
  const chaves = objetos.map((o) => {
    const v = valores(caminho, o);
    return v.length ? v[0] : undefined;
  });
  if (objetos.length && chaves.every((v) => v === undefined)) throw Object.assign(new Error(semCampo(expr)), { semCampo: true });
  const itens = objetos.map((o, i) => ({ o, v: chaves[i] }));
  const less = (a, b) => (a.v === undefined ? true : b.v === undefined ? false : menor(a.v, b.v));
  for (let i = 1; i < itens.length; i++) {
    for (let j = i; j > 0 && less(itens[j], itens[j - 1]); j--) [itens[j], itens[j - 1]] = [itens[j - 1], itens[j]];
  }
  return itens.map((x) => x.o);
}

// ---------- -L ----------
/** As chaves do -L (a flag pode vir repetida e com vírgulas) e o cabeçalho de cada uma: o último pedaço, em maiúsculas. */
export const chavesDeLabel = (lista) => (lista ?? []).flatMap((x) => x.split(',')).filter(Boolean);
export const cabecalhoDeLabel = (chave) => chave.split('/').pop().toUpperCase();
