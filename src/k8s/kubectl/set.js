// O kubectl set env e set resources (o set_env.go e o set_resources.go): as contas que mexem no molde de pod.
import { atobUtf8 } from '../esquema.js';

/** Os contêineres do molde que o -c escolhe ('*' é todos; a busca é a do path.Match: * e ? curingas). */
export function conteineres(spec, seletor = '*') {
  const re = new RegExp(`^${seletor.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]')}$`);
  return [...(spec.containers ?? []), ...(spec.initContainers ?? [])].filter((c) => re.test(c.name));
}

const NOME_VALIDO = /^[-._a-zA-Z][-._a-zA-Z0-9]*$/;

/** 'A=1', 'B-' → { env: [{ name, value }], remover: ['B'] } ou { erro }. */
export function lerEnv(args) {
  const env = [];
  const remover = [];
  for (const x of args) {
    if (x.includes('=')) {
      const [name, ...v] = x.split('=');
      if (!NOME_VALIDO.test(name)) return { erro: `error: "${name}" is not a valid key name: a valid environment variable name must consist of alphabetic characters, digits, '_', '-', or '.', and must not start with a digit (e.g. 'my.env-name',  or 'MY_ENV.NAME',  or 'MyEnvName1', regex used for validation is '[-._a-zA-Z][-._a-zA-Z0-9]*')` };
      env.push({ name, value: v.join('=') });
    } else remover.push(x.slice(0, -1));
  }
  return { env, remover };
}

/** As variáveis de um ConfigMap ou Secret (--from), em ordem de chave: "log.level" vira LOG_LEVEL (com aviso). */
export function envDaFonte(fonte, { prefixo = '', chaves } = {}) {
  const avisos = [];
  const ref = fonte.kind === 'Secret' ? 'secretKeyRef' : 'configMapKeyRef';
  const env = Object.keys(fonte.data ?? {}).sort().filter((k) => !chaves?.length || chaves.includes(k)).map((k) => {
    const nome = k.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
    if (nome !== k) avisos.push(`Warning: key ${k} transferred to ${nome}\n`);
    return { name: `${prefixo}${nome}`, valueFrom: { [ref]: { key: k, name: fonte.metadata.name } } };
  });
  return { env, avisos };
}

/** O updateEnv do kubectl: quem já existe é trocado no lugar, os novos vão para o fim, os "NOME-" saem. */
export function atualizarEnv(existente = [], env, remover) {
  const cobertos = new Set(remover);
  const saida = [];
  for (const e of existente) {
    if (cobertos.has(e.name)) continue;
    const novo = env.find((x) => x.name === e.name);
    if (novo) cobertos.add(e.name);
    saida.push(novo ?? e);
  }
  for (const e of env) {
    if (cobertos.has(e.name)) continue;
    cobertos.add(e.name);
    saida.push(e);
  }
  return saida;
}

/** O --overwrite=false: alguma variável já tem outro valor? → mensagem ou null */
export function sobrescreve(existente = [], env) {
  for (const e of env) {
    const atual = existente.find((x) => x.name === e.name);
    if (atual && (atual.value ?? '') !== (e.value ?? '')) return `'${atual.name}' already has a value (${atual.value ?? ''}), and --overwrite is false`;
  }
  return null;
}

/** De onde vem uma variável (o GetEnvVarRefString), para o --list. */
function origem(v) {
  if (v.configMapKeyRef) return `configmap ${v.configMapKeyRef.name}, key ${v.configMapKeyRef.key}`;
  if (v.secretKeyRef) return `secret ${v.secretKeyRef.name}, key ${v.secretKeyRef.key}`;
  if (v.fieldRef) return `field path ${v.fieldRef.fieldPath}`;
  if (v.resourceFieldRef) return `resource field ${v.resourceFieldRef.containerName ? `${v.resourceFieldRef.containerName}/` : ''}${v.resourceFieldRef.resource}`;
  return 'invalid valueFrom';
}

/** O --list: "# Deployment web, container nginx" e as variáveis (com --resolve, o valor do ConfigMap ou Secret). */
export function listarEnv(cluster, obj, cts, resolver) {
  let t = '';
  for (const c of cts) {
    t += `# ${obj.kind} ${obj.metadata.name}, container ${c.name}\n`;
    for (const e of c.env ?? []) {
      if (!e.valueFrom) t += `${e.name}=${e.value ?? ''}\n`;
      else if (resolver && (e.valueFrom.configMapKeyRef || e.valueFrom.secretKeyRef)) {
        const ref = e.valueFrom.configMapKeyRef ?? e.valueFrom.secretKeyRef;
        const fonte = cluster.obter(e.valueFrom.configMapKeyRef ? 'ConfigMap' : 'Secret', obj.metadata.namespace, ref.name);
        const bruto = fonte?.data?.[ref.key];
        t += `${e.name}=${bruto === undefined ? '' : e.valueFrom.secretKeyRef ? atobUtf8(bruto) : bruto}\n`;
      } else t += `# ${e.name} from ${origem(e.valueFrom)}\n`;
    }
  }
  return t;
}

/** '--limits=cpu=200m,memory=1Gi' → { cpu: '200m', memory: '1Gi' } ou { erro }. */
export function lerRecursos(texto) {
  const r = {};
  for (const par of texto ? texto.split(',') : []) {
    const [k, v, ...resto] = par.split('=');
    if (v === undefined || resto.length) return { erro: `error: invalid argument syntax ${par}, expected <resource>=<value>` };
    if (!/^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$/.test(v)) return { erro: "error: quantities must match the regular expression '^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$'" };
    r[k] = v;
  }
  return { recursos: r };
}
