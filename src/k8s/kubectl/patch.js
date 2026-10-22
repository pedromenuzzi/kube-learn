// Os três tipos de patch do kubectl patch: strategic (o padrão para os tipos do Kubernetes: listas com chave, como
// containers e env, se juntam item a item), merge (RFC 7386: listas são trocadas inteiras) e json (RFC 6902: operações).
import { parse } from 'yaml';
import { sprint } from './colunas.js';
import { canonico } from '../aleatorio.js';

const ehMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A chave de junção (patchMergeKey) das listas com patchStrategy "merge" nos tipos do Kubernetes.
const CHAVES = {
  containers: 'name', initContainers: 'name', ephemeralContainers: 'name', env: 'name', volumes: 'name', imagePullSecrets: 'name',
  volumeMounts: 'mountPath', volumeDevices: 'devicePath', hostAliases: 'ip', topologySpreadConstraints: 'topologyKey',
  resourceClaims: 'name', schedulingGates: 'name', conditions: 'type', ownerReferences: 'uid',
};
// Nas portas, a chave depende de quem: containerPort no contêiner, port no Service.
const chaveDa = (campo, itens) => (campo === 'ports' ? (itens.some((x) => ehMapa(x) && 'containerPort' in x) ? 'containerPort' : 'port') : CHAVES[campo]);
const LISTAS_DE_VALORES = new Set(['finalizers']); // listas simples que se juntam (sem repetir)

/**
 * O mergeSortedSlice do strategicpatch: os itens só do servidor (na ordem dele) e os do patch (na ordem do patch) se
 * intercalam; um item do patch que o servidor não tinha entra antes do próximo do servidor.
 */
function intercalar(doServidor, doPatch, ordemServidor) {
  const saida = [];
  let i = 0;
  let j = 0;
  while (i < doServidor.length || j < doPatch.length) {
    if (j >= doPatch.length) saida.push(doServidor[i++]);
    else if (i >= doServidor.length) saida.push(doPatch[j++]);
    else {
      const li = ordemServidor.indexOf(doServidor[i].chave);
      const ri = ordemServidor.indexOf(doPatch[j].chave);
      saida.push(li >= 0 && ri >= 0 && li < ri ? doServidor[i++] : doPatch[j++]);
    }
  }
  return saida.map((x) => x.valor);
}

function listaEstrategica(campo, original, patch) {
  const chave = chaveDa(campo, [...original, ...patch]);
  if (LISTAS_DE_VALORES.has(campo)) return [...original, ...patch.filter((x) => !original.includes(x))];
  if (!chave) return structuredClone(patch);
  if (patch.some((x) => ehMapa(x) && x.$patch === 'replace')) return patch.filter((x) => !(ehMapa(x) && x.$patch === 'replace')).map(limpar);
  const resultado = original.map((x) => ({ chave: x?.[chave], valor: x }));
  const doPatch = [];
  for (const item of patch) {
    if (!ehMapa(item) || !(chave in item)) throw new Error(`map: ${sprint(item)} does not contain declared merge key: ${chave}`);
    const k = item[chave];
    const i = resultado.findIndex((x) => x.chave === k);
    if (item?.$patch === 'delete') {
      if (i >= 0) resultado.splice(i, 1);
      continue;
    }
    const valor = i >= 0 ? estrategico(resultado[i].valor, item) : limpar(item);
    if (i >= 0) resultado.splice(i, 1);
    doPatch.push({ chave: k, valor });
  }
  return intercalar(resultado, doPatch, original.map((x) => x?.[chave]));
}

/** Tira as diretivas ($patch, $setElementOrder...) de um pedaço novo, e os nulos (que no patch querem dizer "apague"). */
function limpar(v) {
  if (Array.isArray(v)) return v.map(limpar);
  if (!ehMapa(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([k, x]) => !k.startsWith('$') && x !== null).map(([k, x]) => [k, limpar(x)]));
}

/** Strategic merge patch. */
export function estrategico(original, patch) {
  if (!ehMapa(patch)) return structuredClone(patch);
  if (patch.$patch === 'replace') return limpar(patch);
  if (!ehMapa(original)) return limpar(patch);
  const saida = structuredClone(original);
  for (const [k, v] of Object.entries(patch)) {
    if (k.startsWith('$deleteFromPrimitiveList/') && Array.isArray(saida[k.slice(25)])) saida[k.slice(25)] = saida[k.slice(25)].filter((x) => !v.includes(x));
    if (k.startsWith('$')) continue; // ponytail: $retainKeys e $setElementOrder não são simulados
    if (v === null) delete saida[k];
    else if (Array.isArray(v) && Array.isArray(saida[k])) saida[k] = listaEstrategica(k, saida[k], v);
    else saida[k] = ehMapa(v) ? estrategico(saida[k], v) : limpar(v);
  }
  return saida;
}

/**
 * O patch do original para o editado, como o kubectl edit manda (o CreateTwoWayMergePatch): mapas só com o que mudou
 * (null apaga); listas com chave (containers, env...) só com os itens que mudaram, mais o $setElementOrder e os
 * $patch: delete; finalizers com o $deleteFromPrimitiveList; as outras listas, inteiras. Com `merge` (os tipos de CRD,
 * que o kubectl não conhece), o merge patch do RFC 7386: toda lista vai inteira.
 */
export function diferenca(original, editado, merge = false) {
  const patch = {};
  for (const [k, v] of Object.entries(editado)) {
    const o = original[k];
    if (canonico(o) === canonico(v)) continue;
    if (ehMapa(o) && ehMapa(v)) {
      const sub = diferenca(o, v, merge);
      if (Object.keys(sub).length) patch[k] = sub;
    } else if (!merge && Array.isArray(o) && Array.isArray(v) && LISTAS_DE_VALORES.has(k)) {
      const novos = v.filter((x) => !o.includes(x));
      const saem = o.filter((x) => !v.includes(x));
      Object.assign(patch, { [`$setElementOrder/${k}`]: v }, novos.length ? { [k]: novos } : {}, saem.length ? { [`$deleteFromPrimitiveList/${k}`]: saem } : {});
    } else if (!merge && Array.isArray(o) && Array.isArray(v) && [...o, ...v].every(ehMapa) && chaveDa(k, [...o, ...v])) {
      Object.assign(patch, diferencaDeLista(k, o, v));
    } else patch[k] = v;
  }
  for (const k of Object.keys(original)) if (!(k in editado)) patch[k] = null;
  return patch;
}

function diferencaDeLista(campo, original, editado) {
  const chave = chaveDa(campo, [...original, ...editado]);
  const itens = [];
  for (const item of editado) {
    const o = original.find((x) => x[chave] === item[chave]);
    const d = o ? diferenca(o, item) : item;
    if (Object.keys(d).length) itens.push(o ? { ...d, [chave]: item[chave] } : item);
  }
  for (const o of original) if (!editado.some((x) => x[chave] === o[chave])) itens.push({ $patch: 'delete', [chave]: o[chave] });
  const ordem = editado.map((x) => ({ [chave]: x[chave] }));
  const mesmaOrdem = canonico(ordem) === canonico(original.filter((o) => editado.some((x) => x[chave] === o[chave])).map((x) => ({ [chave]: x[chave] })));
  if (!itens.length && mesmaOrdem) return {};
  return { [`$setElementOrder/${campo}`]: ordem, ...(itens.length ? { [campo]: itens } : {}) };
}

/** JSON merge patch (RFC 7386). */
export function mesclarJson(original, patch) {
  if (!ehMapa(patch)) return structuredClone(patch);
  const saida = ehMapa(original) ? structuredClone(original) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete saida[k];
    else saida[k] = mesclarJson(saida[k], v);
  }
  return saida;
}

/** JSON patch (RFC 6902). → o objeto novo, ou null se alguma operação não se aplica. */
export function aplicarJsonPatch(original, ops) {
  let doc = structuredClone(original);
  const partes = (p) => (p === '' ? [] : p.split('/').slice(1).map((x) => x.replaceAll('~1', '/').replaceAll('~0', '~')));
  const pai = (p) => {
    const ps = partes(p);
    if (!ps.length) return null;
    let alvo = doc;
    for (const x of ps.slice(0, -1)) {
      alvo = Array.isArray(alvo) ? alvo[Number(x)] : ehMapa(alvo) ? alvo[x] : undefined;
      if (alvo === undefined || alvo === null || typeof alvo !== 'object') return null;
    }
    return { alvo, chave: ps.at(-1) };
  };
  const indice = (lista, k, maisUm = 0) => (k === '-' && maisUm ? lista.length : /^\d+$/.test(k) && Number(k) < lista.length + maisUm ? Number(k) : -1);
  const ler = (p) => {
    const x = pai(p);
    if (!x) return partes(p).length ? undefined : doc;
    if (Array.isArray(x.alvo)) return x.alvo[indice(x.alvo, x.chave)];
    return Object.hasOwn(x.alvo, x.chave) ? x.alvo[x.chave] : undefined;
  };
  const tirar = (p) => {
    const x = pai(p);
    if (!x) return false;
    if (Array.isArray(x.alvo)) {
      const i = indice(x.alvo, x.chave);
      return i >= 0 && !!x.alvo.splice(i, 1);
    }
    if (!Object.hasOwn(x.alvo, x.chave)) return false;
    delete x.alvo[x.chave];
    return true;
  };
  const por = (p, valor, trocar) => {
    if (!partes(p).length) {
      doc = valor;
      return true;
    }
    const x = pai(p);
    if (!x) return false;
    if (Array.isArray(x.alvo)) {
      const i = indice(x.alvo, x.chave, trocar ? 0 : 1);
      if (i < 0) return false;
      x.alvo.splice(i, trocar ? 1 : 0, valor);
      return true;
    }
    if (trocar && !Object.hasOwn(x.alvo, x.chave)) return false;
    x.alvo[x.chave] = valor;
    return true;
  };
  for (const op of ops) {
    if (!ehMapa(op) || typeof op.path !== 'string') return null;
    let ok;
    switch (op.op) {
      case 'add': ok = 'value' in op && por(op.path, structuredClone(op.value), false); break;
      case 'replace': ok = 'value' in op && ler(op.path) !== undefined && por(op.path, structuredClone(op.value), true); break;
      case 'remove': ok = tirar(op.path); break;
      case 'test': ok = JSON.stringify(ler(op.path)) === JSON.stringify(op.value); break;
      case 'copy':
      case 'move': {
        const v = ler(op.from ?? '');
        ok = v !== undefined && (op.op === 'copy' || tirar(op.from)) && por(op.path, structuredClone(v), false);
        break;
      }
      default: ok = false;
    }
    if (!ok) return null;
  }
  return doc;
}

/**
 * O texto do -p como o kubectl lê: o que começa com "{" vai como JSON (e o servidor recusa se não for); o resto é YAML.
 * → { corpo } | { invalido: true } (JSON quebrado) | { erro } (YAML quebrado: o kubectl nem manda)
 */
export function lerPatch(texto) {
  if (texto.trimStart().startsWith('{')) {
    try {
      return { corpo: JSON.parse(texto) };
    } catch {
      return { invalido: true };
    }
  }
  try {
    return { corpo: parse(texto, { version: '1.1' }) };
  } catch (e) {
    const motivo = /Nested mappings|Implicit map keys|mapping/i.test(e.message) ? 'mapping values are not allowed in this context' : 'did not find expected key';
    return { erro: `error: unable to parse "${texto}": yaml: ${motivo}` };
  }
}

/** Tira do objeto os campos desconhecidos ("spec.template.spec.containers[0].imagem"), como o servidor no modo Warn. */
export function tirarCampos(obj, caminhos) {
  for (const c of caminhos) {
    const passos = c.match(/[^.[\]]+/g);
    let alvo = obj;
    for (const p of passos.slice(0, -1)) alvo = alvo?.[p];
    if (alvo && typeof alvo === 'object') delete alvo[passos.at(-1)];
  }
  return obj;
}
