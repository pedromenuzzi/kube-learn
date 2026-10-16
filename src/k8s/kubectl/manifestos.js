// Ler os arquivos do -f (pasta, vários documentos YAML) e o "kubectl apply" (merge em três vias).
import { parseAllDocuments } from 'yaml';
import { canonico } from '../aleatorio.js';

const EXTENSOES = /\.(ya?ml|json)$/;

/**
 * Os arquivos do -f. `arquivos` é { caminho: conteúdo } (o editor). '.' ou uma pasta pega os arquivos
 * dela (com -R, também das subpastas). → [{ arquivo, texto }] ou { erro }.
 */
export function lerCaminhos(arquivos, caminhos, recursivo) {
  const saida = [];
  for (const bruto of caminhos) {
    const c = bruto.replace(/^\.\//, '').replace(/\/$/, '');
    if (c in arquivos) {
      saida.push({ arquivo: bruto, texto: arquivos[c] });
      continue;
    }
    const pasta = c === '.' || c === '' ? '' : `${c}/`;
    const dentro = Object.keys(arquivos).filter((k) => k.startsWith(pasta) && EXTENSOES.test(k) && (recursivo || !k.slice(pasta.length).includes('/'))).sort();
    if (!dentro.length && !Object.keys(arquivos).some((k) => k.startsWith(pasta))) return { erro: `error: the path "${bruto}" does not exist` };
    for (const k of dentro) saida.push({ arquivo: k, texto: arquivos[k] });
  }
  return { lista: saida };
}

/** Mensagem do erro de YAML no formato do go-yaml (o que o kubectl mostra). */
function mensagemYaml(erro, texto) {
  const linha = erro.linePos?.[0]?.line ?? 1;
  if (erro.code === 'TAB_AS_INDENT' || /tab/i.test(erro.message)) {
    const comTab = texto.split('\n').findIndex((l) => /^\s*\t/.test(l));
    return `yaml: line ${comTab >= 0 ? comTab + 1 : linha}: found character that cannot start any token`;
  }
  if (['BAD_INDENT', 'BLOCK_AS_IMPLICIT_KEY', 'MULTILINE_IMPLICIT_KEY', 'UNEXPECTED_TOKEN'].includes(erro.code)) {
    return `yaml: line ${linha}: mapping values are not allowed in this context`;
  }
  if (erro.code === 'DUPLICATE_KEY') return `yaml: unmarshal errors:\n  line ${linha}: mapping key "${erro.message.match(/"?([^"\s]+)"?/)?.[1] ?? ''}" already defined`;
  return `yaml: line ${linha}: did not find expected key`;
}

/** Texto YAML (vários documentos) → { docs: [objetos] } ou { erro }. */
export function lerYaml(texto, arquivo) {
  if (texto.trim().startsWith('{') || texto.trim().startsWith('[')) {
    try {
      const v = JSON.parse(texto);
      return { docs: Array.isArray(v) ? v : v.kind === 'List' ? v.items : [v] };
    } catch (e) {
      return { erro: `error: error parsing ${arquivo}: ${e.message}` };
    }
  }
  const docs = parseAllDocuments(texto, { version: '1.1', uniqueKeys: true });
  const lista = Array.isArray(docs) ? docs : [docs];
  const saida = [];
  for (const d of lista) {
    if (d.errors?.length) return { erro: `error: error parsing ${arquivo}: error converting YAML to JSON: ${mensagemYaml(d.errors[0], texto)}` };
    const v = d.toJS({ maxAliasCount: 100 });
    if (v === null || v === undefined) continue;
    if (v.kind === 'List' && Array.isArray(v.items)) saida.push(...v.items);
    else saida.push(v);
  }
  return { docs: saida };
}

/** A anotação last-applied-configuration: o manifesto como foi aplicado (chaves em ordem). */
export function ultimaAplicada(manifesto, ns) {
  const m = structuredClone(manifesto);
  m.metadata = { ...m.metadata, annotations: { ...(m.metadata.annotations ?? {}) } };
  delete m.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
  if (ns) m.metadata.namespace = ns;
  return `${canonico(m)}\n`;
}

const ehObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);
const CHAVES_LISTA = ['name', 'containerPort', 'mountPath', 'port'];
const chaveDeLista = (lista) => CHAVES_LISTA.find((k) => lista.length && lista.every((x) => ehObjeto(x) && x[k] !== undefined));

/**
 * Merge em três vias, como o apply do kubectl: o que está no manifesto novo vence; o que estava no
 * último aplicado e saiu do novo é apagado; o resto (o que o servidor ou outros comandos puseram) fica.
 * Listas de objetos com nome (containers, env, ports, volumes) se juntam item a item.
 */
export function mesclar(vivo, novo, ultimo) {
  if (Array.isArray(novo) && Array.isArray(vivo)) {
    const chave = chaveDeLista(novo) && chaveDeLista(vivo) === chaveDeLista(novo) ? chaveDeLista(novo) : null;
    if (!chave) return structuredClone(novo);
    const ult = Array.isArray(ultimo) ? ultimo : [];
    const resultado = novo.map((item) => {
      const v = vivo.find((x) => x[chave] === item[chave]);
      const u = ult.find((x) => x[chave] === item[chave]);
      return v ? mesclar(v, item, u) : structuredClone(item);
    });
    for (const v of vivo) {
      const noNovo = novo.some((x) => x[chave] === v[chave]);
      const noUltimo = ult.some((x) => x[chave] === v[chave]);
      if (!noNovo && !noUltimo) resultado.push(structuredClone(v));
    }
    return resultado;
  }
  if (!ehObjeto(novo) || !ehObjeto(vivo)) return structuredClone(novo);
  const saida = structuredClone(vivo);
  for (const [k, v] of Object.entries(novo)) saida[k] = k in vivo ? mesclar(vivo[k], v, ultimo?.[k]) : structuredClone(v);
  for (const k of Object.keys(ultimo ?? {})) if (!(k in novo)) delete saida[k];
  return saida;
}
