// O Kustomize que vem no kubectl (kubectl kustomize / apply -k): a mesma planta com ajustes por cidade. Lê o
// kustomization.yaml de uma pasta do editor, junta os recursos (e as bases), gera ConfigMaps e Secrets (com o sufixo
// de hash) e aplica os ajustes: patches, images, replicas, namespace, namePrefix/nameSuffix e labels.
import { parseAllDocuments } from 'yaml';
import { recursoDoKind } from './recursos.js';
import { btoaUtf8 } from './esquema.js';

// ---------- SHA-256 (síncrono: o crypto.subtle do navegador é assíncrono) ----------
const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(texto) {
  const bytes = new TextEncoder().encode(texto);
  const tam = Math.ceil((bytes.length + 9) / 64) * 64;
  const m = new Uint8Array(tam);
  m.set(bytes);
  m[bytes.length] = 0x80;
  new DataView(m.buffer).setUint32(tam - 4, bytes.length * 8);
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rot = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < tam; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = (m[i + t * 4] << 24) | (m[i + t * 4 + 1] << 16) | (m[i + t * 4 + 2] << 8) | m[i + t * 4 + 3];
    for (let t = 16; t < 64; t++) {
      const s0 = rot(w[t - 15], 7) ^ rot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rot(w[t - 2], 17) ^ rot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    [a, b, c, d, e, f, g, hh].forEach((v, j) => { h[j] = (h[j] + v) >>> 0; });
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** O sufixo de hash do Kustomize (hasher.go): dos dados do ConfigMap/Secret (o "name" sai vazio, como no original). */
function sufixo(obj) {
  const json = (v) => JSON.stringify(ordenar(v)).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
  const base = obj.kind === 'Secret' ? { data: obj.data ?? '', kind: 'Secret', name: '', type: obj.type ?? '' } : { data: obj.data ?? '', kind: 'ConfigMap', name: '' };
  return [...sha256(json(base)).slice(0, 10)].map((ch) => ({ 0: 'g', 1: 'h', 3: 'k', a: 'm', e: 't' }[ch] ?? ch)).join('');
}
const ordenar = (v) => (Array.isArray(v) ? v.map(ordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v);

// ---------- ler as pastas do editor ----------
const NOMES = ['kustomization.yaml', 'kustomization.yml', 'Kustomization'];
const juntarCaminho = (pasta, rel) => {
  const partes = [];
  for (const p of `${pasta}/${rel}`.split('/')) {
    if (p === '..') partes.pop();
    else if (p && p !== '.') partes.push(p);
  }
  return `${pasta.startsWith('/') ? '/' : ''}${partes.join('/')}`;
};
const normalizar = (c) => juntarCaminho(c.startsWith('/') ? '/' : '.', c).replace(/^\.\//, '') || '.';
const ehPasta = (arquivos, c) => Object.keys(arquivos).some((k) => (c === '.' ? true : k.startsWith(`${c}/`)));
const noArquivo = (arquivos, c) => arquivos[c] ?? arquivos[c.replace(/^\.\//, '')];

function lerDocs(texto) {
  return parseAllDocuments(texto, { version: '1.1' }).map((d) => d.toJS()).filter((d) => d && typeof d === 'object');
}

class ErroKustomize extends Error {}

// Os itens de uma lista do kustomization, sem os `- ` ainda vazios (null) de quem está escrevendo.
const itens = (lista) => (lista ?? []).filter((x) => x !== null && x !== undefined);

/** Constrói a pasta. → { objetos, avisos } ou { erro } (a mensagem do kubectl). */
export function construir(arquivos, pasta) {
  try {
    const avisos = [];
    const objetos = montar(arquivos, normalizar(pasta), avisos);
    return { objetos: ordenarSaida(objetos), avisos };
  } catch (e) {
    if (e instanceof ErroKustomize) return { erro: e.message };
    throw e;
  }
}

function montar(arquivos, pasta, avisos) {
  if (!ehPasta(arquivos, pasta)) throw new ErroKustomize(`error: must build at directory: not a valid directory: evalsymlink failure on '${pasta}' : lstat ${pasta}: no such file or directory`);
  const nomeK = NOMES.map((n) => (pasta === '.' ? n : `${pasta}/${n}`)).find((n) => noArquivo(arquivos, n) !== undefined);
  if (!nomeK) throw new ErroKustomize(`error: unable to find one of 'kustomization.yaml', 'kustomization.yml' or 'Kustomization' in directory '${pasta}'`);
  const k = lerDocs(noArquivo(arquivos, nomeK))[0] ?? {};
  const rel = (c) => (pasta === '.' ? normalizar(c) : juntarCaminho(pasta, c));

  // Os recursos: arquivos e bases (outras pastas com kustomization, já com os ajustes delas).
  let objetos = [];
  const torto = (k.resources ?? []).find((r) => r !== null && typeof r !== 'string'); // `- name: web` em vez do caminho
  if (torto !== undefined) {
    const tipo = Array.isArray(torto) ? 'array' : typeof torto === 'boolean' ? 'bool' : typeof torto;
    throw new ErroKustomize(`error: invalid Kustomization: json: cannot unmarshal ${tipo} into Go struct field Kustomization.resources of type string`);
  }
  for (const r of k.resources ?? []) {
    if (!r) throw new ErroKustomize(`error: accumulating resources: accumulation err='accumulating resources from '': '${pasta}' must resolve to a file': new root cannot be empty`);
    const c = rel(r);
    if (noArquivo(arquivos, c) !== undefined) {
      for (const o of lerDocs(noArquivo(arquivos, c))) {
        // ponytail: o real mostra também as labels e as annotations do objeto; aqui, como num metadata vazio
        if (!o.metadata?.name) throw new ErroKustomize(`error: accumulating resources: accumulation err='accumulating resources from '${r}': missing metadata.name in object {{${o.apiVersion ?? ''} ${o.kind ?? ''}} {{ } map[] map[]}}': must build at directory: '${c}': file is not directory`);
        objetos.push({ ...o, origem: o.metadata.name });
      }
    } else if (ehPasta(arquivos, c)) objetos.push(...montar(arquivos, c, avisos));
    else throw new ErroKustomize(`error: accumulating resources: accumulation err='accumulating resources from '${r}': open ${c}: no such file or directory'`);
  }

  // Os geradores de ConfigMap e Secret (behavior: create, merge ou replace).
  const opcoes = k.generatorOptions ?? {};
  for (const [tipo, lista] of [['ConfigMap', k.configMapGenerator], ['Secret', k.secretGenerator]]) {
    for (const g of itens(lista)) {
      const dados = {};
      for (const l of itens(g.literals)) {
        const [chave, ...v] = l.split('=');
        dados[chave] = v.join('=').replace(/^"(.*)"$/, '$1');
      }
      for (const f of itens(g.files)) {
        const [chave, caminho] = f.includes('=') ? f.split('=') : [f.split('/').pop(), f];
        const texto = noArquivo(arquivos, rel(caminho));
        if (texto === undefined) throw new ErroKustomize(`error: loading KV pairs: file sources: [${f}]: evalsymlink failure on '${rel(caminho)}' : lstat ${rel(caminho)}: no such file or directory`);
        dados[chave] = texto;
      }
      const existente = objetos.find((o) => o.kind === tipo && o.origem === g.name && o.gerado);
      if (g.behavior === 'merge' || g.behavior === 'replace') {
        if (!existente) throw new ErroKustomize(`error: merging from generator ${g.name}: id resid.ResId{Gvk:resid.Gvk{Group:"", Version:"v1", Kind:"${tipo}"}, Name:"${g.name}", Namespace:""} does not exist; cannot merge or replace`);
        existente.dadosBrutos = g.behavior === 'merge' ? { ...existente.dadosBrutos, ...dados } : dados;
        continue;
      }
      objetos.push({
        apiVersion: 'v1', kind: tipo, metadata: { name: g.name, ...(g.namespace ? { namespace: g.namespace } : {}) },
        ...(tipo === 'Secret' ? { type: g.type ?? 'Opaque' } : {}),
        origem: g.name, gerado: true, dadosBrutos: dados, semHash: g.options?.disableNameSuffixHash ?? opcoes.disableNameSuffixHash,
      });
    }
  }

  // Os ajustes (sobre os nomes originais, como o Kustomize: o patch fala "loja", mesmo com namePrefix).
  for (const p of itens(k.patches)) aplicarPatch(objetos, p.patch ?? noArquivo(arquivos, rel(p.path ?? '')), p.target, p.path);
  for (const p of itens(k.patchesStrategicMerge)) aplicarPatch(objetos, typeof p === 'string' && noArquivo(arquivos, rel(p)) !== undefined ? noArquivo(arquivos, rel(p)) : p, null, p);
  for (const im of itens(k.images)) {
    for (const o of objetos) {
      for (const ct of conteineres(o)) {
        if (typeof ct.image !== 'string') continue;
        const [nome, tag] = separarImagem(ct.image);
        if (nome !== im.name) continue;
        ct.image = `${im.newName ?? nome}${im.digest ? `@${im.digest}` : im.newTag !== undefined ? `:${im.newTag}` : tag ? `:${tag}` : ''}`;
      }
    }
  }
  for (const r of itens(k.replicas)) {
    for (const o of objetos) if (o.origem === r.name && ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(o.kind)) (o.spec ??= {}).replicas = r.count;
  }
  if (k.namespace) {
    for (const o of objetos) if (recursoDoKind(o.kind)?.namespaced !== false) o.metadata.namespace = k.namespace;
  }
  if (k.namePrefix || k.nameSuffix) {
    for (const o of objetos) if (!['Namespace', 'CustomResourceDefinition'].includes(o.kind)) o.metadata.name = `${k.namePrefix ?? ''}${o.metadata.name}${k.nameSuffix ?? ''}`;
  }
  if (k.commonLabels) {
    avisos.push("# Warning: 'commonLabels' is deprecated. Please use 'labels' instead. Run 'kustomize edit fix' to update your Kustomization automatically.");
    rotular(objetos, { pairs: k.commonLabels, includeSelectors: true });
  }
  for (const l of itens(k.labels)) rotular(objetos, l);
  if (k.commonAnnotations) for (const o of objetos) o.metadata.annotations = { ...(o.metadata.annotations ?? {}), ...k.commonAnnotations };
  return objetos;
}

/** O que sai: os dados gerados viram data, os nomes ganham o hash, e quem citava o nome antigo passa a citar o novo. */
function ordenarSaida(objetos) {
  const renomeados = new Map();
  for (const o of objetos) {
    if (o.gerado) {
      const dados = o.dadosBrutos;
      if (o.kind === 'Secret') o.data = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, btoaUtf8(v)]));
      else o.data = dados;
      const antes = o.metadata.name;
      if (!o.semHash) o.metadata.name = `${antes}-${sufixo(o)}`;
      renomeados.set(`${o.kind}/${o.origem}`, o.metadata.name);
    } else if (['ConfigMap', 'Secret', 'Service', 'ServiceAccount', 'PersistentVolumeClaim'].includes(o.kind) && o.origem !== o.metadata.name) {
      renomeados.set(`${o.kind}/${o.origem}`, o.metadata.name);
    }
  }
  const novo = (kind, nome) => renomeados.get(`${kind}/${nome}`) ?? nome;
  for (const o of objetos) {
    for (const spec of moldes(o)) {
      for (const ct of [...itens(spec.containers), ...itens(spec.initContainers)]) {
        for (const ef of itens(ct.envFrom)) {
          if (ef.configMapRef) ef.configMapRef.name = novo('ConfigMap', ef.configMapRef.name);
          if (ef.secretRef) ef.secretRef.name = novo('Secret', ef.secretRef.name);
        }
        for (const ev of itens(ct.env)) {
          if (ev.valueFrom?.configMapKeyRef) ev.valueFrom.configMapKeyRef.name = novo('ConfigMap', ev.valueFrom.configMapKeyRef.name);
          if (ev.valueFrom?.secretKeyRef) ev.valueFrom.secretKeyRef.name = novo('Secret', ev.valueFrom.secretKeyRef.name);
        }
      }
      for (const v of itens(spec.volumes)) {
        if (v.configMap) v.configMap.name = novo('ConfigMap', v.configMap.name);
        if (v.secret) v.secret.secretName = novo('Secret', v.secret.secretName);
        if (v.persistentVolumeClaim) v.persistentVolumeClaim.claimName = novo('PersistentVolumeClaim', v.persistentVolumeClaim.claimName);
      }
      if (spec.serviceAccountName) spec.serviceAccountName = novo('ServiceAccount', spec.serviceAccountName);
    }
    if (o.kind === 'Ingress') {
      for (const r of itens(o.spec?.rules)) for (const p of itens(r.http?.paths)) if (p.backend?.service) p.backend.service.name = novo('Service', p.backend.service.name);
    }
    if (o.kind === 'StatefulSet' && o.spec?.serviceName) o.spec.serviceName = novo('Service', o.spec.serviceName);
  }
  const INTERNOS = new Set(['origem', 'gerado', 'dadosBrutos', 'semHash']);
  const limpos = objetos.map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !INTERNOS.has(k))));
  const pos = (o) => {
    const i = ORDEM.indexOf(o.kind);
    if (i !== -1) return [0, i];
    return ['MutatingWebhookConfiguration', 'ValidatingWebhookConfiguration'].includes(o.kind) ? [2, 0] : [1, 0];
  };
  return limpos.map((o, i) => [o, i]).sort(([a, ia], [b, ib]) => {
    const [pa, qa] = pos(a);
    const [pb, qb] = pos(b);
    return pa - pb || qa - qb || (pa === 1 ? `${a.apiVersion}${a.kind}`.localeCompare(`${b.apiVersion}${b.kind}`) : 0) || ia - ib;
  }).map(([o]) => o);
}

// A ordem "legacy" do Kustomize: o que precisa existir antes vem primeiro.
const ORDEM = ['Namespace', 'ResourceQuota', 'StorageClass', 'CustomResourceDefinition', 'ServiceAccount', 'PodSecurityPolicy', 'Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding',
  'ConfigMap', 'Secret', 'Endpoints', 'Service', 'LimitRange', 'PriorityClass', 'PersistentVolume', 'PersistentVolumeClaim', 'Deployment', 'StatefulSet', 'CronJob', 'PodDisruptionBudget'];

const moldes = (o) => [o.spec?.template?.spec, o.spec?.jobTemplate?.spec?.template?.spec, o.kind === 'Pod' ? o.spec : null].filter(Boolean);
const conteineres = (o) => moldes(o).flatMap((s) => [...itens(s.containers), ...itens(s.initContainers)]);
const separarImagem = (img) => {
  const semDigest = img.split('@')[0];
  const m = semDigest.match(/^(.*?)(?::([^:/]+))?$/);
  return [m[1], m[2]];
};

function rotular(objetos, { pairs = {}, includeSelectors = false, includeTemplates = false }) {
  for (const o of objetos) {
    o.metadata.labels = { ...(o.metadata.labels ?? {}), ...pairs };
    if (includeSelectors || includeTemplates) for (const s of [o.spec?.template, o.spec?.jobTemplate?.spec?.template].filter(Boolean)) s.metadata = { ...(s.metadata ?? {}), labels: { ...(s.metadata?.labels ?? {}), ...pairs } };
    if (!includeSelectors) continue;
    if (o.spec?.selector && ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job'].includes(o.kind)) o.spec.selector.matchLabels = { ...(o.spec.selector.matchLabels ?? {}), ...pairs };
    if (o.kind === 'Service') o.spec.selector = { ...(o.spec.selector ?? {}), ...pairs };
  }
}

/** Um patch: estratégico (um pedaço do objeto, listas de contêineres pelo nome) ou JSON 6902 (lista de operações). */
function aplicarPatch(objetos, texto, alvo, origem) {
  if (texto === undefined) throw new ErroKustomize(`error: trouble configuring builtin PatchTransformer with config: \`\npath: ${origem}\n\`: failed to get the patch file from path(${origem}): evalsymlink failure on '${origem}' : lstat ${origem}: no such file or directory`);
  const docs = typeof texto === 'string' ? lerDocs(texto) : [texto];
  for (const p of docs) {
    if (Array.isArray(p)) {
      for (const o of objetos.filter((x) => casaAlvo(x, alvo))) for (const op of itens(p)) json6902(o, op);
      continue;
    }
    const alvos = objetos.filter((o) => (alvo ? casaAlvo(o, alvo) : o.kind === p.kind && o.origem === p.metadata?.name));
    for (const o of alvos) mesclarEstrategico(o, { ...p, metadata: { ...p.metadata, name: o.metadata.name } });
  }
}

const casaAlvo = (o, a) => !!a && (!a.kind || a.kind === o.kind) && (!a.name || new RegExp(`^${a.name}$`).test(o.origem ?? o.metadata.name))
  && (!a.labelSelector || a.labelSelector.split(',').every((par) => o.metadata.labels?.[par.split('=')[0]] === par.split('=')[1]));

function mesclarEstrategico(destino, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete destino[k];
    else if (Array.isArray(v) && Array.isArray(destino[k]) && v.every((x) => x && typeof x === 'object' && 'name' in x)) {
      for (const item of v) {
        const igual = destino[k].find((x) => x?.name === item.name);
        if (igual) mesclarEstrategico(igual, item);
        else destino[k].push(structuredClone(item));
      }
    } else if (v && typeof v === 'object' && !Array.isArray(v) && destino[k] && typeof destino[k] === 'object' && !Array.isArray(destino[k])) mesclarEstrategico(destino[k], v);
    else destino[k] = structuredClone(v);
  }
}

function json6902(o, { op, path, value }) {
  if (typeof path !== 'string') return; // a operação ainda sem caminho
  const partes = path.split('/').slice(1).map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'));
  const ultimo = partes.pop();
  const pai = partes.reduce((v, p) => v?.[p], o);
  if (!pai) return;
  const chave = Array.isArray(pai) && ultimo === '-' ? pai.length : Array.isArray(pai) ? Number(ultimo) : ultimo;
  if (op === 'remove') {
    if (Array.isArray(pai)) pai.splice(chave, 1);
    else delete pai[chave];
  } else if (op === 'add' && Array.isArray(pai)) pai.splice(chave, 0, structuredClone(value));
  else pai[chave] = structuredClone(value);
}
