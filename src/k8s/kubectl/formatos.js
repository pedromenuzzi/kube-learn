// Formatos de saída: -o yaml, -o json, -o name e -o jsonpath.
import { stringify } from 'yaml';
import { nomeQualificado, recursoDoKind } from '../recursos.js';

const ordenar = (v) => {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])]));
  return v;
};

// O que o YAML 1.1 leria como outro tipo (bool, número, nulo): o go-yaml põe entre aspas duplas; o resto que não
// pode ficar sem aspas (começa com *, tem ": "...) vai entre aspas simples.
const OUTRO_TIPO = /^(?:[yYnN]|yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|null|Null|NULL|~|[-+]?[\d_]*\.?[\d_]+(?:[eE][-+]?\d+)?|0x[\da-fA-F]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|\d{4}-\d\d?-\d\d?(?:(?:[Tt]|\s+)\d\d?:\d\d:\d\d(?:\.\d*)?(?:\s*(?:Z|[-+]\d\d?(?::\d\d)?))?)?|)$/;
const aspasDoGo = (texto) => texto.replace(/(?<=(?:^|: |- ))"((?:[^"\\]|\\.)*)"$/gm, (m, dentro) => (dentro.includes('\\') || OUTRO_TIPO.test(dentro) ? m : `'${dentro.replaceAll("'", "''")}'`));

/** YAML como o kubectl: chaves em ordem alfabética, listas sem recuo, sem quebrar linhas longas. */
export const paraYaml = (obj) => aspasDoGo(stringify(ordenar(obj), { indentSeq: false, lineWidth: 0, version: '1.1', aliasDuplicateObjects: false }));

/** JSON como o kubectl: chaves em ordem, 4 espaços e <, >, & escapados (como o encoding/json do Go). */
export const paraJson = (obj) => `${JSON.stringify(ordenar(obj), null, 4)
  .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')}\n`;

export const comoLista = (itens) => ({ apiVersion: 'v1', items: itens, kind: 'List', metadata: { resourceVersion: '' } });

export const nomeComTipo = (obj) => `${nomeQualificado(recursoDoKind(obj.kind))}/${obj.metadata.name}`;

// ---------- jsonpath (o subconjunto que se usa no dia a dia) ----------

/** '{.items[*].metadata.name}' → partes: texto puro e expressões { range, end, caminho }. */
function analisarTemplate(t) {
  const partes = [];
  let i = 0;
  while (i < t.length) {
    const abre = t.indexOf('{', i);
    if (abre === -1) {
      partes.push({ texto: t.slice(i) });
      break;
    }
    if (abre > i) partes.push({ texto: t.slice(i, abre) });
    let nivel = 0;
    let j = abre;
    for (; j < t.length; j++) {
      if (t[j] === '{') nivel++;
      else if (t[j] === '}' && --nivel === 0) break;
    }
    if (j >= t.length) throw new Error(`error parsing jsonpath ${t}, unclosed action`);
    const exp = t.slice(abre + 1, j).trim();
    if (exp.startsWith('range ')) partes.push({ range: exp.slice(6).trim() });
    else if (exp === 'end') partes.push({ end: true });
    else if (/^".*"$/.test(exp) || /^'.*'$/.test(exp)) partes.push({ texto: exp.slice(1, -1).replaceAll('\\n', '\n').replaceAll('\\t', '\t') });
    else partes.push({ caminho: exp });
    i = j + 1;
  }
  return partes;
}

/** Avalia um caminho (.a.b[0].c, .items[*], [?(@.type=="Ready")]) e devolve a lista de resultados. */
export function avaliar(caminho, raiz, atual) {
  let valores = [caminho.startsWith('$') ? raiz : atual];
  const resto = caminho.replace(/^[$@]/, '');
  const re = /\.\.|\.((?:[\w/-]|\\.)+|\*)|\[([^\]]*)\]|\.?'([^']*)'/g; // \. é um ponto do nome (kubernetes\.io/change-cause)
  let m;
  while ((m = re.exec(resto))) {
    const [, escapado, colchete, citado] = m;
    const campo = escapado?.replace(/\\(.)/g, '$1');
    const proximos = [];
    for (const v of valores) {
      if (v === undefined || v === null) continue;
      if (campo === '*' || colchete === '*') proximos.push(...(Array.isArray(v) ? v : Object.values(v)));
      else if (campo !== undefined || citado !== undefined) {
        const k = campo ?? citado;
        if (Array.isArray(v)) proximos.push(...v.map((x) => x?.[k]).filter((x) => x !== undefined));
        else if (v[k] !== undefined) proximos.push(v[k]);
      } else if (colchete !== undefined) {
        const filtro = colchete.match(/^\?\(@\.([\w.-]+)\s*(==|!=)\s*["']?([^"']*)["']?\)$/);
        if (filtro) {
          const [, cam, op, val] = filtro;
          for (const x of Array.isArray(v) ? v : []) {
            const real = cam.split('.').reduce((a, k) => a?.[k], x);
            if ((String(real) === val) === (op === '==')) proximos.push(x);
          }
        } else if (/^-?\d+$/.test(colchete) && Array.isArray(v)) {
          const n = Number(colchete);
          const x = v.at(n);
          if (x !== undefined) proximos.push(x);
        } else if (/^-?\d*:-?\d*$/.test(colchete) && Array.isArray(v)) {
          const [a, b] = colchete.split(':');
          proximos.push(...v.slice(a ? Number(a) : 0, b ? Number(b) : undefined));
        } else if (v[colchete.replace(/^['"]|['"]$/g, '')] !== undefined) proximos.push(v[colchete.replace(/^['"]|['"]$/g, '')]);
      }
    }
    valores = proximos;
  }
  return valores;
}

const texto = (v) => (typeof v === 'object' && v !== null ? JSON.stringify(ordenar(v)) : String(v));

export function jsonpath(template, raiz) {
  const partes = analisarTemplate(template);
  const rodar = (inicio, fim, atual) => {
    let saida = '';
    for (let i = inicio; i < fim; i++) {
      const p = partes[i];
      if (p.texto !== undefined) saida += p.texto;
      else if (p.caminho !== undefined) saida += avaliar(p.caminho, raiz, atual).map(texto).join(' ');
      else if (p.range !== undefined) {
        let nivel = 1;
        let j = i + 1;
        for (; j < fim; j++) {
          if (partes[j].range !== undefined) nivel++;
          if (partes[j].end && --nivel === 0) break;
        }
        for (const item of avaliar(p.range, raiz, atual)) saida += rodar(i + 1, j, item);
        i = j;
      }
    }
    return saida;
  };
  return rodar(0, partes.length, raiz);
}
