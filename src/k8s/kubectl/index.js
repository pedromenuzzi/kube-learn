// O kubectl simulado. `kubectl(cluster, 'kubectl get pods', { arquivos })` devolve o que o kubectl de
// verdade escreveria (stdout e stderr na ordem), o código de saída e, para -w/-f, uma função `observar()`
// que devolve as linhas novas depois que o relógio anda. Mensagens em inglês, iguais às reais.
import { palavras, lerFlags, ErroFlag, distancia } from './argv.js';
import { tabela, tabular } from '../tabwriter.js';
import { TABELAS, labelsTexto } from './tabelas.js';
import { descrever, temDescritor, templateCru } from './describe.js';
import { paraYaml, paraJson, comoLista, nomeComTipo, jsonpath } from './formatos.js';
import { lerCaminhos, lerYaml, ultimaAplicada, mesclar } from './manifestos.js';
import { RECURSOS, acharRecurso, recursoDoKind, apiVersion, nomeQualificado, pluralQualificado } from '../recursos.js';
import { decodificar, validar, explicar, btoaUtf8, ESQUEMAS } from '../esquema.js';
import { ErroApi, VERSAO_SERVIDOR } from '../cluster.js';
import { portaAlvo } from '../rede.js';
import { canonico } from '../aleatorio.js';
import { iso, parseDuracao, cpuMili as cpuMiliDe, bytes as bytesDe } from '../unidades.js';
import { cordon, taint, drain } from './manutencao.js';

export const VERSAO_CLIENTE = 'v1.37.1';
const PROTEGIDOS = new Set(['default', 'kube-system', 'kube-public']);
const FORMATOS = 'custom-columns,custom-columns-file,go-template,go-template-file,json,jsonpath,jsonpath-as-json,jsonpath-file,name,template,templatefile,wide,yaml';
const COMANDOS_REAIS = ['annotate', 'api-resources', 'api-versions', 'apply', 'attach', 'auth', 'autoscale', 'certificate', 'cluster-info', 'completion', 'config', 'cordon', 'cp', 'create', 'debug', 'delete', 'describe', 'diff', 'drain', 'edit', 'events', 'exec', 'explain', 'expose', 'get', 'help', 'kustomize', 'label', 'logs', 'patch', 'plugin', 'port-forward', 'proxy', 'replace', 'rollout', 'run', 'scale', 'set', 'taint', 'top', 'uncordon', 'version', 'wait'];

class Erro extends Error {}

/** Acumula stdout e stderr na ordem em que saem. */
class Saida {
  constructor() {
    this.partes = [];
    this.codigo = 0;
  }

  out(t) {
    if (t) this.partes.push({ fluxo: 'out', texto: t });
  }

  err(t) {
    if (t) this.partes.push({ fluxo: 'err', texto: t });
  }

  falha(t) {
    this.err(t.endsWith('\n') ? t : `${t}\n`);
    this.codigo = 1;
  }

  /** Erro que o kubectl junta e só mostra no fim (apply, create e delete com vários objetos). */
  adiar(t) {
    (this.adiados ??= []).push(t);
  }

  resultado(extra = {}) {
    for (const t of this.adiados ?? []) this.falha(t);
    this.adiados = [];
    return {
      saida: this.partes.map((p) => p.texto).join(''),
      stdout: this.partes.filter((p) => p.fluxo === 'out').map((p) => p.texto).join(''),
      stderr: this.partes.filter((p) => p.fluxo === 'err').map((p) => p.texto).join(''),
      partes: this.partes,
      codigo: this.codigo,
      ...extra,
    };
  }
}

const GLOBAIS = {
  namespace: { curto: 'n', tipo: 'string' },
  context: { tipo: 'string' },
  help: { curto: 'h', tipo: 'bool' },
  kubeconfig: { tipo: 'string' },
  v: { curto: 'v', tipo: 'string' },
};

// ---------- seletores ----------
/** '-l app=web,tier!=db,env in (a,b),chave,!chave' → função(labels) → bool */
export function seletorDeLabels(texto) {
  if (!texto) return () => true;
  const regras = [];
  let nivel = 0;
  let atual = '';
  for (const c of texto) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) {
      regras.push(atual.trim());
      atual = '';
    } else atual += c;
  }
  if (atual.trim()) regras.push(atual.trim());
  const testes = regras.map((r) => {
    let m;
    if ((m = r.match(/^([\w./-]+)\s+(in|notin)\s+\((.*)\)$/))) {
      const vals = m[3].split(',').map((x) => x.trim());
      return m[2] === 'in' ? (l) => vals.includes(l[m[1]]) : (l) => !vals.includes(l[m[1]]);
    }
    if ((m = r.match(/^([\w./-]+)\s*!=\s*(.*)$/))) return (l) => l[m[1]] !== m[2];
    if ((m = r.match(/^([\w./-]+)\s*==?\s*(.*)$/))) return (l) => l[m[1]] === m[2];
    if ((m = r.match(/^!([\w./-]+)$/))) return (l) => !(m[1] in l);
    if ((m = r.match(/^([\w./-]+)$/))) return (l) => m[1] in l;
    throw new Erro(`error: unable to parse requirement: found '${r}', expected: identifier`);
  });
  return (labels = {}) => testes.every((t) => t(labels ?? {}));
}

function seletorDeCampos(texto) {
  if (!texto) return () => true;
  const testes = texto.split(',').map((r) => {
    const m = r.match(/^([\w.]+)\s*(!=|==|=)\s*(.*)$/);
    if (!m) throw new Erro(`error: invalid selector: '${r}'; can't understand '${r}'`);
    const ler = (o) => String(m[1].split('.').reduce((a, k) => a?.[k], o) ?? '');
    return m[2] === '!=' ? (o) => ler(o) !== m[3] : (o) => ler(o) === m[3];
  });
  return (o) => testes.every((t) => t(o));
}

// ---------- contexto de cada comando ----------
function namespaceDe(cluster, flags) {
  return flags.namespace ?? cluster.contexto.namespace;
}

/** Resolve tipos e nomes dos argumentos (pods, pod/x, deploy,svc, all). → { grupos, erros, nomeado } */
function selecionar(cluster, posicionais, flags, { exigirNome = false } = {}) {
  if (!posicionais.length) throw new Erro('');
  const ns = namespaceDe(cluster, flags);
  const todosNs = !!flags['all-namespaces'];
  const casaLabel = seletorDeLabels(flags.selector);
  const casaCampo = seletorDeCampos(flags['field-selector']);
  const grupos = [];
  const erros = [];
  const recurso = (nome) => {
    const r = acharRecurso(nome);
    if (!r) throw new Erro(`error: the server doesn't have a resource type "${nome}"`);
    return r;
  };
  const grupo = (r) => {
    let g = grupos.find((x) => x.recurso === r);
    if (!g) grupos.push((g = { recurso: r, objetos: [] }));
    return g;
  };
  const buscar = (r, nome) => {
    const obj = cluster.obter(r.kind, r.namespaced ? ns : null, nome);
    if (obj) grupo(r).objetos.push(obj);
    else erros.push(`Error from server (NotFound): ${pluralQualificado(r)} "${nome}" not found`);
  };

  if (posicionais[0].includes('/')) {
    for (const p of posicionais) {
      const [tipo, nome] = p.split('/');
      if (!nome) throw new Erro(`error: arguments in resource/name form must have a single resource and name`);
      buscar(recurso(tipo), nome);
    }
    return { grupos, erros, nomeado: true };
  }
  const tipos = posicionais[0].split(',').flatMap((t) => (t === 'all' ? ['pods', 'services', 'daemonsets', 'deployments', 'replicasets', 'statefulsets', 'horizontalpodautoscalers', 'cronjobs', 'jobs'] : [t])).map(recurso);
  const nomes = posicionais.slice(1);
  if (nomes.length) {
    for (const r of tipos) for (const n of nomes) buscar(r, n);
    return { grupos, erros, nomeado: true };
  }
  if (exigirNome && !flags.selector && !flags.all) throw new Erro('error: resource(s) were provided, but no name was specified');
  for (const r of tipos) {
    const g = grupo(r);
    g.objetos = cluster.listar(r.kind, r.namespaced && !todosNs ? ns : undefined)
      .filter((o) => casaLabel(o.metadata.labels) && casaCampo(o));
  }
  return { grupos, erros, nomeado: false, tudo: posicionais[0].split(',').includes('all') };
}

const semResultados = (cluster, flags) => (flags['all-namespaces'] ? 'No resources found\n' : `No resources found in ${namespaceDe(cluster, flags)} namespace.\n`);

// ---------- get ----------
function linhasTabela(cluster, grupo, flags, { prefixo, cabecalho = true }) {
  const t = TABELAS[grupo.recurso.kind];
  const largo = flags.output === 'wide';
  const comNs = flags['all-namespaces'] && grupo.recurso.namespaced;
  const cab = [...(comNs ? ['NAMESPACE'] : []), ...t.colunas, ...(largo && t.largas ? t.largas : []), ...(flags['show-labels'] ? ['LABELS'] : [])];
  const linhas = grupo.objetos.map((o) => {
    const l = t.linha(o, cluster.agora);
    if (prefixo && !t.semNome) l[0] = `${nomeQualificado(grupo.recurso)}/${l[0]}`;
    return [...(comNs ? [o.metadata.namespace] : []), ...l, ...(largo && t.linhaLarga ? t.linhaLarga(o, cluster.agora) : []), ...(flags['show-labels'] ? [labelsTexto(o.metadata.labels)] : [])];
  });
  return cabecalho && !flags['no-headers'] ? [cab, ...linhas] : linhas;
}

function imprimirObjetos(cluster, s, objetos, flags, unico) {
  const fmt = flags.output ?? '';
  if (fmt === 'yaml') s.out(paraYaml(unico ? objetos[0] : comoLista(objetos)));
  else if (fmt === 'json') s.out(paraJson(unico ? objetos[0] : comoLista(objetos)));
  else if (fmt === 'name') s.out(objetos.map((o) => `${nomeComTipo(o)}\n`).join(''));
  else if (fmt.startsWith('jsonpath=') || fmt.startsWith('jsonpath-as-json=')) {
    const t = fmt.slice(fmt.indexOf('=') + 1);
    try {
      s.out(jsonpath(t, unico ? objetos[0] : comoLista(objetos)));
    } catch (e) {
      s.falha(`error: ${e.message}`);
    }
  } else return false;
  return true;
}

function get(cluster, a, s) {
  const { posicionais, flags } = a;
  if (!posicionais.length) {
    s.err('You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.\n\n');
    s.falha('error: Required resource not specified.\nUse "kubectl explain <resource>" for a detailed description of that resource (e.g. kubectl explain pods).\nSee \'kubectl get -h\' for help and examples');
    return;
  }
  const fmt = flags.output ?? '';
  if (fmt && !['wide', 'yaml', 'json', 'name'].includes(fmt) && !/^jsonpath(-as-json)?=/.test(fmt)) {
    s.falha(`error: unable to match a printer suitable for the output format "${fmt}", allowed formats are: ${FORMATOS}`);
    return;
  }
  const sel = selecionar(cluster, posicionais, flags);
  const objetos = sel.grupos.flatMap((g) => g.objetos);
  const unico = sel.nomeado && objetos.length === 1 && sel.erros.length === 0 && posicionais.length <= 2 && !posicionais[0].includes(',');
  if (!imprimirObjetos(cluster, s, objetos, flags, unico)) {
    const comObjetos = sel.grupos.filter((g) => g.objetos.length);
    const prefixo = sel.grupos.length > 1;
    for (const g of comObjetos) if (TABELAS[g.recurso.kind].aviso) s.err(TABELAS[g.recurso.kind].aviso);
    const blocos = comObjetos.map((g) => tabela(linhasTabela(cluster, g, flags, { prefixo })));
    s.out(blocos.join('\n'));
    if (!objetos.length && !sel.nomeado) s.err(semResultados(cluster, flags));
  }
  for (const e of sel.erros) s.falha(e);
  if (flags.watch) return observarGet(cluster, sel, flags);
  return null;
}

/** -w: depois de cada tique do relógio, as linhas dos objetos que mudaram. */
function observarGet(cluster, sel, flags) {
  let desde = cluster.rv;
  const kinds = new Set(sel.grupos.map((g) => g.recurso.kind));
  const nomes = sel.nomeado ? new Set(sel.grupos.flatMap((g) => g.objetos.map((o) => o.metadata.uid))) : null;
  const ns = namespaceDe(cluster, flags);
  const casa = seletorDeLabels(flags.selector);
  return () => {
    const novos = cluster.historico.filter((h) => h.rv > desde && kinds.has(h.obj.kind));
    desde = cluster.rv;
    const linhas = [];
    for (const h of novos) {
      const r = recursoDoKind(h.obj.kind);
      if (nomes && !nomes.has(h.obj.metadata.uid)) continue;
      if (!nomes && r.namespaced && !flags['all-namespaces'] && h.obj.metadata.namespace !== ns) continue;
      if (!casa(h.obj.metadata.labels)) continue;
      linhas.push(...linhasTabela(cluster, { recurso: r, objetos: [h.obj] }, flags, { prefixo: sel.grupos.length > 1, cabecalho: false }));
    }
    if (!linhas.length) return '';
    // Cada linha nova do watch sai alinhada sozinha, como no kubectl.
    return linhas.map((l) => tabela([l])).join('');
  };
}

// ---------- describe ----------
function describe(cluster, a, s) {
  const { posicionais, flags } = a;
  if (!posicionais.length) {
    s.falha('You must specify the type of resource to describe. Use "kubectl api-resources" for a complete list of supported resources.');
    return;
  }
  const sel = selecionar(cluster, posicionais, flags);
  const objetos = sel.grupos.flatMap((g) => g.objetos);
  const textos = [];
  for (const o of objetos) {
    if (!temDescritor(o.kind)) continue;
    textos.push(descrever(cluster, o));
  }
  s.out(textos.join('\n\n'));
  if (!objetos.length && !sel.nomeado) s.err(semResultados(cluster, flags));
  for (const e of sel.erros) s.falha(e);
}

// ---------- apply / create -f ----------
function lerDocumentos(a, s, contexto) {
  if (!a.flags.filename?.length) {
    s.adiar(`error: must specify one of -f and -k\n\nSee 'kubectl ${contexto} -h' for help and examples`);
    return [];
  }
  const r = lerCaminhos(a.arquivos, a.flags.filename, a.flags.recursive);
  if (r.erro) {
    s.adiar(r.erro);
    return [];
  }
  const docs = [];
  for (const { arquivo, texto } of r.lista) {
    const y = lerYaml(texto, arquivo);
    if (y.erro) {
      s.adiar(y.erro);
      continue;
    }
    for (const doc of y.docs) docs.push({ arquivo, doc });
  }
  return docs;
}

/** Confere tipo, versão, nome e namespace do manifesto. → { recurso, ns, doc } ou mensagem de erro (string). */
function prepararDoc(cluster, { arquivo, doc }, flags, acao) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return `error: error validating "${arquivo}": error validating data: invalid object to validate; if you choose to ignore these errors, turn validation off with --validate=false`;
  const faltam = [...(doc.apiVersion ? [] : ['apiVersion not set']), ...(doc.kind ? [] : ['kind not set'])];
  if (faltam.length) return `error: error validating "${arquivo}": error validating data: [${faltam.join(', ')}]; if you choose to ignore these errors, turn validation off with --validate=false`;
  const nome = doc.metadata?.name ?? '';
  const r = recursoDoKind(doc.kind);
  if (!r || apiVersion(r) !== doc.apiVersion || !ESQUEMAS[doc.kind]) {
    return `error: resource mapping not found for name: "${nome}" namespace: "${doc.metadata?.namespace ?? ''}" from "${arquivo}": no matches for kind "${doc.kind}" in version "${doc.apiVersion}"\nensure CRDs are installed first`;
  }
  let ns = null;
  if (r.namespaced) {
    const doArquivo = doc.metadata?.namespace;
    if (doArquivo && flags.namespace && doArquivo !== flags.namespace) {
      return `error: the namespace from the provided object "${doArquivo}" does not match the namespace "${flags.namespace}". You must pass '--namespace=${doArquivo}' to perform this operation.`;
    }
    ns = doArquivo ?? namespaceDe(cluster, flags);
  }
  if (!nome && !(acao === 'create' && doc.metadata?.generateName)) {
    return `error: error when retrieving current configuration of:\nResource: "${r.grupo ? `${r.grupo}/${r.versao}` : r.versao}, Resource=${r.plural}", GroupVersionKind: "${doc.apiVersion}, Kind=${doc.kind}"\nName: "", Namespace: "${ns ?? ''}"\nfrom server for: "${arquivo}": resource name may not be empty`;
  }
  return { recurso: r, ns, doc };
}

function erroDecodificacao(doc, arquivo, verbo) {
  const d = decodificar(doc);
  const versao = doc.apiVersion.split('/').pop();
  const inicio = `Error from server (BadRequest): error when ${verbo} "${arquivo}": ${doc.kind} in version "${versao}" cannot be handled as a ${doc.kind}: `;
  if (d.tipo) return inicio + d.tipo;
  if (d.desconhecidos.length) return `${inicio}strict decoding error: ${d.desconhecidos.map((c) => `unknown field "${c}"`).join(', ')}`;
  return null;
}

const erroInvalido = (kind, nome, erros) => (erros.length === 1
  ? `The ${kind} "${nome}" is invalid: ${erros[0]}`
  : `The ${kind} "${nome}" is invalid: \n${erros.map((e) => `* ${e}`).join('\n')}`);

function mensagemErroApi(e, verbo, arquivo) {
  if (!(e instanceof ErroApi)) throw e;
  return arquivo ? `Error from server (${e.codigo}): error when ${verbo} "${arquivo}": ${e.message}` : `Error from server (${e.codigo}): ${e.message}`;
}

const sufixoDryRun = (flags) => (flags['dry-run'] === 'server' ? ' (server dry run)' : flags['dry-run'] && flags['dry-run'] !== 'none' ? ' (dry run)' : '');
const ehDryRun = (flags) => flags['dry-run'] && flags['dry-run'] !== 'none';

function apply(cluster, a, s) {
  const docs = lerDocumentos(a, s, 'apply');
  const saidaObjs = [];
  for (const item of docs) {
    const p = prepararDoc(cluster, item, a.flags, 'apply');
    if (typeof p === 'string') {
      s.adiar(p);
      continue;
    }
    const { recurso: r, ns, doc } = p;
    const vivo = cluster.obter(r.kind, ns, doc.metadata.name);
    const erroDec = erroDecodificacao(doc, item.arquivo, vivo ? 'patching' : 'creating');
    if (erroDec) {
      s.adiar(erroDec);
      continue;
    }
    const manifesto = structuredClone(doc);
    delete manifesto.status;
    manifesto.metadata = { ...manifesto.metadata, annotations: { ...(manifesto.metadata.annotations ?? {}), 'kubectl.kubernetes.io/last-applied-configuration': ultimaAplicada(doc, ns) } };
    if (r.namespaced) manifesto.metadata.namespace = ns;
    const id = `${nomeQualificado(r)}/${doc.metadata.name}`;
    try {
      if (!vivo) {
        const erros = validar(manifesto);
        if (erros.length) {
          s.adiar(erroInvalido(r.kind, doc.metadata.name, erros));
          continue;
        }
        if (ehDryRun(a.flags)) saidaObjs.push(manifesto);
        else saidaObjs.push(cluster.criar(manifesto));
        if (!a.flags.output) s.out(`${id} created${sufixoDryRun(a.flags)}\n`);
        continue;
      }
      let ultimo = null;
      try {
        ultimo = JSON.parse(vivo.metadata.annotations?.['kubectl.kubernetes.io/last-applied-configuration'] ?? 'null');
      } catch { /* anotação estragada: trata como sem histórico */ }
      const semStatus = (o) => {
        const c = structuredClone(o);
        delete c.status;
        return c;
      };
      const mesclado = mesclar(semStatus(vivo), manifesto, ultimo);
      const erros = validar(mesclado, vivo);
      if (erros.length) {
        s.adiar(erroInvalido(r.kind, doc.metadata.name, erros));
        continue;
      }
      const comparavel = (o) => {
        const c = semStatus(o);
        delete c.metadata.resourceVersion;
        delete c.metadata.annotations?.['kubectl.kubernetes.io/last-applied-configuration'];
        return canonico(c);
      };
      if (comparavel(mesclado) === comparavel(vivo) && vivo.metadata.annotations?.['kubectl.kubernetes.io/last-applied-configuration'] === manifesto.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']) {
        saidaObjs.push(vivo);
        if (!a.flags.output) s.out(`${id} unchanged${sufixoDryRun(a.flags)}\n`);
        continue;
      }
      if (ehDryRun(a.flags)) saidaObjs.push(mesclado);
      else saidaObjs.push(cluster.substituir(vivo, mesclado));
      if (!a.flags.output) s.out(`${id} configured${sufixoDryRun(a.flags)}\n`);
    } catch (e) {
      s.adiar(mensagemErroApi(e, vivo ? 'patching' : 'creating', item.arquivo));
    }
  }
  if (a.flags.output && saidaObjs.length) imprimirObjetos(cluster, s, saidaObjs, a.flags, saidaObjs.length === 1);
  cluster.reconciliar();
}

function createArquivos(cluster, a, s) {
  const docs = lerDocumentos(a, s, 'create');
  const criados = [];
  for (const item of docs) {
    const p = prepararDoc(cluster, item, a.flags, 'create');
    if (typeof p === 'string') {
      s.adiar(p);
      continue;
    }
    const { recurso: r, ns, doc } = p;
    const erroDec = erroDecodificacao(doc, item.arquivo, 'creating');
    if (erroDec) {
      s.adiar(erroDec);
      continue;
    }
    const manifesto = structuredClone(doc);
    if (r.namespaced) manifesto.metadata = { ...manifesto.metadata, namespace: ns };
    const erros = validar(manifesto);
    if (erros.length) {
      s.adiar(erroInvalido(r.kind, doc.metadata.name, erros));
      continue;
    }
    try {
      if (cluster.obter(r.kind, ns, doc.metadata.name)) throw new ErroApi('AlreadyExists', `${pluralQualificado(r)} "${doc.metadata.name}" already exists`);
      const obj = ehDryRun(a.flags) ? manifesto : cluster.criar(manifesto);
      criados.push(obj);
      if (!a.flags.output) s.out(`${nomeQualificado(r)}/${obj.metadata.name} created${sufixoDryRun(a.flags)}\n`);
    } catch (e) {
      s.adiar(mensagemErroApi(e, 'creating', item.arquivo));
    }
  }
  if (a.flags.output && criados.length) imprimirObjetos(cluster, s, criados, a.flags, criados.length === 1);
  cluster.reconciliar();
}

// ---------- create <tipo> / run ----------
const nomeDoConteiner = (imagem) => imagem.split('@')[0].replace(/:[^/:]+$/, '').split('/').pop().replace(/[^a-z0-9-]/g, '-');

/** Cria (ou mostra, com --dry-run) um objeto gerado por create/run. */
function criarGerado(cluster, a, s, obj) {
  const r = recursoDoKind(obj.kind);
  const id = `${nomeQualificado(r)}/${obj.metadata.name}`;
  if (ehDryRun(a.flags)) {
    if (!imprimirObjetos(cluster, s, [obj], a.flags, true)) s.out(`${id} created${sufixoDryRun(a.flags)}\n`);
    return null;
  }
  const ns = r.namespaced ? namespaceDe(cluster, a.flags) : null;
  const manifesto = structuredClone(obj);
  delete manifesto.status;
  if (ns) manifesto.metadata.namespace = ns;
  const erros = validar(manifesto);
  if (erros.length) {
    s.falha(erroInvalido(obj.kind, obj.metadata.name, erros));
    return null;
  }
  try {
    const criado = cluster.criar(manifesto);
    if (!imprimirObjetos(cluster, s, [criado], a.flags, true)) s.out(`${id} created\n`);
    cluster.reconciliar();
    return criado;
  } catch (e) {
    s.falha(mensagemErroApi(e));
    return null;
  }
}

function literais(lista, s, arquivos, flagArquivo) {
  const dados = {};
  for (const l of lista ?? []) {
    const i = l.indexOf('=');
    if (i <= 0) {
      s.falha(`error: invalid literal source ${l}, expected key=value`);
      return null;
    }
    dados[l.slice(0, i)] = l.slice(i + 1);
  }
  for (const f of flagArquivo ?? []) {
    const [k, caminho] = f.includes('=') ? [f.slice(0, f.indexOf('=')), f.slice(f.indexOf('=') + 1)] : [f.split('/').pop(), f];
    const c = caminho.replace(/^\.\//, '');
    if (!(c in arquivos)) {
      s.falha(`error: error reading ${caminho}: no such file or directory`);
      return null;
    }
    dados[k] = arquivos[c];
  }
  return dados;
}

function create(cluster, a, s) {
  const [sub, ...resto] = a.posicionais;
  if (!sub) return createArquivos(cluster, a, s);
  const nome = resto[0];
  const precisaNome = () => {
    if (nome) return false;
    s.falha(`error: exactly one NAME is required, got ${resto.length}\nSee 'kubectl create ${sub} -h' for help and examples`);
    return true;
  };
  switch (sub) {
    case 'deployment':
    case 'deploy': {
      if (precisaNome()) return;
      const imgs = a.flags.image ?? [];
      if (!imgs.length) return s.falha('error: required flag(s) "image" not set');
      const labels = { app: nome };
      return criarGerado(cluster, a, s, {
        apiVersion: 'apps/v1', kind: 'Deployment',
        metadata: { labels, name: nome },
        spec: {
          replicas: a.flags.replicas ?? 1,
          selector: { matchLabels: { ...labels } },
          strategy: {},
          template: {
            metadata: { labels: { ...labels } },
            spec: { containers: imgs.map((img) => ({ image: img, name: nomeDoConteiner(img), ...(a.flags.port ? { ports: [{ containerPort: Number(a.flags.port) }] } : {}), resources: {} })) },
          },
        },
        status: {},
      });
    }
    case 'namespace':
    case 'ns':
      if (precisaNome()) return;
      return criarGerado(cluster, a, s, { apiVersion: 'v1', kind: 'Namespace', metadata: { name: nome }, spec: {}, status: {} });
    case 'configmap':
    case 'cm': {
      if (precisaNome()) return;
      const dados = literais(a.flags['from-literal'], s, a.arquivos, a.flags['from-file']);
      if (!dados) return;
      return criarGerado(cluster, a, s, { apiVersion: 'v1', ...(Object.keys(dados).length ? { data: dados } : {}), kind: 'ConfigMap', metadata: { name: nome } });
    }
    case 'secret': {
      const [tipo, nomeSecret] = resto;
      if (tipo !== 'generic') return s.falha(`error: unknown command "${tipo ?? ''}" for "kubectl create secret"`);
      if (!nomeSecret) return s.falha('error: exactly one NAME is required, got 0');
      const dados = literais(a.flags['from-literal'], s, a.arquivos, a.flags['from-file']);
      if (!dados) return;
      const data = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, btoaUtf8(v)]));
      return criarGerado(cluster, a, s, { apiVersion: 'v1', ...(Object.keys(data).length ? { data } : {}), kind: 'Secret', metadata: { name: nomeSecret }, ...(a.flags.type ? { type: a.flags.type } : {}) });
    }
    case 'service':
    case 'svc': {
      const [tipo, nomeSvc] = resto;
      const tipos = { clusterip: 'ClusterIP', nodeport: 'NodePort', loadbalancer: 'LoadBalancer' };
      if (!tipos[tipo]) return s.falha(`error: unknown command "${tipo ?? ''}" for "kubectl create service"`);
      if (!nomeSvc) return s.falha('error: exactly one NAME is required, got 0');
      const portas = (a.flags.tcp ?? []).map((t) => {
        const [porta, alvo] = t.split(':');
        return { name: `${porta}-${alvo ?? porta}`, port: Number(porta), protocol: 'TCP', targetPort: Number(alvo ?? porta) };
      });
      return criarGerado(cluster, a, s, {
        apiVersion: 'v1', kind: 'Service',
        metadata: { labels: { app: nomeSvc }, name: nomeSvc },
        spec: { ports: portas, selector: { app: nomeSvc }, type: tipos[tipo] },
        status: { loadBalancer: {} },
      });
    }
    case 'job': {
      if (precisaNome()) return;
      if (a.flags.from) { // um Job agora, a partir do molde de um CronJob (para testar sem esperar o horário)
        const [tipo, nomeCj] = a.flags.from.split('/');
        if (!['cronjob', 'cronjobs', 'cj'].includes(tipo) || !nomeCj) return s.falha(`error: from must be an existing cronjob`);
        const cj = cluster.obter('CronJob', namespaceDe(cluster, a.flags), nomeCj);
        if (!cj) return s.falha(`error: failed to retrieve cronjob: cronjobs.batch "${nomeCj}" not found`);
        const molde = structuredClone(cj.spec.jobTemplate);
        return criarGerado(cluster, a, s, {
          apiVersion: 'batch/v1', kind: 'Job',
          metadata: { annotations: { 'cronjob.kubernetes.io/instantiate': 'manual', ...(molde.metadata?.annotations ?? {}) }, ...(molde.metadata?.labels ? { labels: molde.metadata.labels } : {}), name: nome, ownerReferences: [{ apiVersion: 'batch/v1', controller: true, kind: 'CronJob', name: cj.metadata.name, uid: cj.metadata.uid }] },
          spec: molde.spec,
        });
      }
      const imagem = a.flags.image?.[0];
      if (!imagem) return s.falha('error: required flag(s) "image" not set');
      return criarGerado(cluster, a, s, {
        apiVersion: 'batch/v1', kind: 'Job',
        metadata: { name: nome },
        spec: { template: { metadata: {}, spec: { containers: [{ ...(a.depois?.length ? { command: a.depois } : {}), image: imagem, name: nome, resources: {} }], restartPolicy: 'Never' } } },
        status: {},
      });
    }
    case 'cronjob':
    case 'cj': {
      if (precisaNome()) return;
      const imagem = a.flags.image?.[0];
      if (!imagem) return s.falha('error: required flag(s) "image" not set');
      if (!a.flags.schedule) return s.falha('error: required flag(s) "schedule" not set');
      return criarGerado(cluster, a, s, {
        apiVersion: 'batch/v1', kind: 'CronJob',
        metadata: { name: nome },
        spec: {
          jobTemplate: { metadata: { name: nome }, spec: { template: { metadata: {}, spec: { containers: [{ ...(a.depois?.length ? { command: a.depois } : {}), image: imagem, name: nome, resources: {} }], restartPolicy: a.flags.restart ?? 'OnFailure' } } } },
          schedule: a.flags.schedule,
        },
        status: {},
      });
    }
    default:
      return s.falha(`error: unknown command "${sub}" for "kubectl create"\n\nDid you mean this?\n\t${['deployment', 'namespace', 'configmap', 'secret', 'service', 'job', 'cronjob'].sort((x, y) => distancia(sub, x) - distancia(sub, y))[0]}\n`);
  }
}

function run(cluster, a, s) {
  const [nome] = a.posicionais;
  if (!nome) return s.falha("error: NAME is required for run\nSee 'kubectl run -h' for help and examples");
  if (!a.flags.image) return s.falha('error: required flag(s) "image" not set');
  const labels = a.flags.labels ? Object.fromEntries(a.flags.labels.split(',').map((x) => x.split('='))) : { run: nome };
  const resto = a.depois ?? [];
  const ct = {
    ...(a.flags.command ? { command: resto } : resto.length ? { args: resto } : {}),
    ...(a.flags.env?.length ? { env: a.flags.env.map((e) => ({ name: e.split('=')[0], value: e.split('=').slice(1).join('=') })) } : {}),
    image: a.flags.image,
    ...(a.flags['image-pull-policy'] ? { imagePullPolicy: a.flags['image-pull-policy'] } : {}),
    name: nome,
    ...(a.flags.port ? { ports: [{ containerPort: Number(a.flags.port) }] } : {}),
    resources: {},
    ...(a.flags.stdin ? { stdin: true, ...(a.flags.tty ? { tty: true, stdinOnce: true } : {}) } : {}),
  };
  let obj = {
    apiVersion: 'v1', kind: 'Pod',
    metadata: { labels, name: nome },
    spec: { containers: [ct], dnsPolicy: 'ClusterFirst', restartPolicy: a.flags.restart ?? 'Always' },
    status: {},
  };
  if (a.flags.overrides) {
    try {
      obj = mesclar(obj, JSON.parse(a.flags.overrides), null);
    } catch {
      return s.falha('error: Invalid JSON Patch');
    }
  }
  if (!ehDryRun(a.flags) && cluster.obter('Pod', namespaceDe(cluster, a.flags), nome)) return s.falha(`Error from server (AlreadyExists): pods "${nome}" already exists`);
  const pod = criarGerado(cluster, a, s, obj);
  if (pod && a.flags.stdin && a.flags.tty) {
    s.partes.pop(); // com -it o kubectl não imprime "pod/x created"
    cluster.avancarAte(() => pod.status?.phase !== 'Pending', '2m');
    return abrirSessao(cluster, s, pod, nome, ['sh'], a.flags.rm);
  }
  return null;
}

// ---------- delete ----------
function delete_(cluster, a, s) {
  const f = a.flags;
  const graca = f.now ? 1 : f['grace-period'] >= 0 ? f['grace-period'] : f.force ? 0 : undefined;
  if (f.force && graca === 0) s.err('Warning: Immediate deletion does not wait for confirmation that the running resource has been terminated. The resource may continue to run on the cluster indefinitely.\n');
  const propagacao = { orphan: 'Orphan', foreground: 'Foreground', background: 'Background', true: 'Background', false: 'Orphan' }[f.cascade] ?? 'Background';
  const alvos = [];
  if (f.filename?.length) {
    for (const item of lerDocumentos(a, s, 'delete')) {
      const p = prepararDoc(cluster, item, f, 'delete');
      if (typeof p === 'string') {
        s.adiar(p);
        continue;
      }
      const obj = cluster.obter(p.recurso.kind, p.ns, p.doc.metadata.name);
      if (!obj) {
        if (!f['ignore-not-found']) s.adiar(`Error from server (NotFound): error when deleting "${item.arquivo}": ${pluralQualificado(p.recurso)} "${p.doc.metadata.name}" not found`);
        continue;
      }
      alvos.push(obj);
    }
  } else {
    if (!a.posicionais.length) return s.adiar("error: You must provide one or more resources by argument or filename.\nExample resource specifications include:\n   '-f rsrc.yaml'\n   '--filename=rsrc.json'\n   '<resource> <name>'\n   '<resource>'");
    const sel = selecionar(cluster, a.posicionais, f, { exigirNome: true });
    alvos.push(...sel.grupos.flatMap((g) => g.objetos));
    if (!alvos.length && !sel.nomeado && !sel.erros.length) s.err(semResultados(cluster, f));
    for (const e of sel.erros) if (!f['ignore-not-found']) s.adiar(e);
  }
  const uids = [];
  for (const obj of alvos) {
    const r = recursoDoKind(obj.kind);
    if (obj.kind === 'Namespace' && PROTEGIDOS.has(obj.metadata.name)) {
      s.adiar(`Error from server (Forbidden): namespaces "${obj.metadata.name}" is forbidden: this namespace may not be deleted`);
      continue;
    }
    cluster.remover(obj, { graca, propagacao });
    uids.push(obj.metadata.uid);
    const onde = r.namespaced ? ` from ${obj.metadata.namespace} namespace` : '';
    s.out(`${nomeQualificado(r)} "${obj.metadata.name}" ${graca === 0 && f.force ? 'force deleted' : 'deleted'}${onde}\n`);
  }
  cluster.reconciliar();
  if (f.wait !== false && uids.length) cluster.avancarAte(() => uids.every((u) => !cluster.porUid.has(u)), '2m');
}

// ---------- logs ----------
function podDoAlvo(cluster, alvo, ns, s, { avisar = true } = {}) {
  if (!alvo.includes('/')) {
    const p = cluster.obter('Pod', ns, alvo);
    if (!p) s.falha(`Error from server (NotFound): pods "${alvo}" not found`);
    return p;
  }
  const [tipo, nome] = alvo.split('/');
  const r = acharRecurso(tipo);
  if (!r) {
    s.falha(`error: the server doesn't have a resource type "${tipo}"`);
    return null;
  }
  const obj = cluster.obter(r.kind, ns, nome);
  if (!obj) {
    s.falha(`Error from server (NotFound): ${pluralQualificado(r)} "${nome}" not found`);
    return null;
  }
  if (r.kind === 'Pod') return obj;
  const sel = obj.spec?.selector?.matchLabels ?? obj.spec?.selector;
  const pods = cluster.listar('Pod', ns).filter((p) => sel && Object.entries(sel).every(([k, v]) => p.metadata.labels?.[k] === v));
  if (!pods.length) {
    s.falha(`error: timed out waiting for the condition`);
    return null;
  }
  if (pods.length > 1 && avisar) s.err(`Found ${pods.length} pods, using pod/${pods[0].metadata.name}\n`);
  return pods[0];
}

function escolherConteiner(pod, nome, s) {
  if (nome) {
    if (![...(pod.spec.initContainers ?? []), ...pod.spec.containers].some((c) => c.name === nome)) {
      s.falha(`Error from server (BadRequest): container ${nome} is not valid for pod ${pod.metadata.name}`);
      return null;
    }
    return nome;
  }
  if (pod.spec.containers.length > 1) s.err(`Defaulted container "${pod.spec.containers[0].name}" out of: ${pod.spec.containers.map((c) => c.name).join(', ')}\n`);
  return pod.spec.containers[0].name;
}

const RFC3339NANO = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000000Z');

function logs(cluster, a, s) {
  const f = a.flags;
  const ns = namespaceDe(cluster, f);
  let pods;
  if (f.selector) {
    const casa = seletorDeLabels(f.selector);
    pods = cluster.listar('Pod', ns).filter((p) => casa(p.metadata.labels));
    if (!pods.length) return s.err(semResultados(cluster, f));
  } else {
    if (!a.posicionais.length) return s.falha("error: expected 'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]'.\nPOD or TYPE/NAME is a required argument for the logs command\nSee 'kubectl logs -h' for help and examples");
    const p = podDoAlvo(cluster, a.posicionais[0], ns, s);
    if (!p) return null;
    pods = [p];
  }
  const fontes = [];
  for (const pod of pods) {
    const nomes = f['all-containers'] ? pod.spec.containers.map((c) => c.name) : [escolherConteiner(pod, f.container ?? a.posicionais[1], s)];
    for (const nome of nomes) {
      if (!nome) return null;
      const est = cluster.kubelet.estado(pod, nome);
      if (f.previous) {
        if (!est?.ultimoTermino) {
          s.falha(`Error from server (BadRequest): previous terminated container "${nome}" in pod "${pod.metadata.name}" not found`);
          continue;
        }
        fontes.push({ pod, nome, linhas: () => est.logsAnteriores });
        continue;
      }
      if (!est || !est.id) {
        const motivo = !est || ['esperando', 'puxando'].includes(est?.fase) ? 'ContainerCreating'
          : ['erroPull', 'backoffPull'].includes(est.fase) ? 'trying and failing to pull image' : est.motivo ?? 'ContainerCreating';
        s.falha(`Error from server (BadRequest): container "${nome}" in pod "${pod.metadata.name}" is waiting to start: ${motivo}`);
        continue;
      }
      fontes.push({ pod, nome, linhas: () => cluster.kubelet.estado(pod, nome)?.logs ?? est.logs });
    }
  }
  const formatar = (fonte, l) => `${f.prefix ? `[pod/${fonte.pod.metadata.name}/${fonte.nome}] ` : ''}${f.timestamps ? `${RFC3339NANO(l.t)} ` : ''}${l.linha}\n`;
  const vistos = new Map();
  for (const fonte of fontes) {
    let ls = fonte.linhas();
    if (f.tail >= 0) ls = ls.slice(Math.max(0, ls.length - f.tail));
    s.out(ls.map((l) => formatar(fonte, l)).join(''));
    vistos.set(fonte, fonte.linhas().length);
  }
  if (f.follow && !f.previous && fontes.length) {
    return () => fontes.map((fonte) => {
      const ls = fonte.linhas();
      const novas = ls.slice(vistos.get(fonte));
      vistos.set(fonte, ls.length);
      return novas.map((l) => formatar(fonte, l)).join('');
    }).join('');
  }
  return null;
}

// ---------- exec ----------
function abrirSessao(cluster, s, pod, conteiner, argv, removerAoSair) {
  const r = cluster.kubelet.exec(pod, conteiner, argv);
  if (r.erro) {
    s.falha(r.erro);
    return null;
  }
  if (!r.shell) {
    s.out(r.saida);
    return null;
  }
  return {
    sessao: {
      prompt: '/ # ',
      executar(linha) {
        if (/^\s*exit\b/.test(linha)) {
          if (removerAoSair) {
            cluster.remover(pod);
            cluster.reconciliar();
          }
          return { saida: '', codigo: 0, sair: true };
        }
        const x = cluster.kubelet.exec(pod, conteiner, ['sh', '-c', linha]);
        return x.erro ? { saida: `${x.erro}\n`, codigo: 1, sair: true } : { saida: x.saida, codigo: x.codigo };
      },
    },
  };
}

function exec(cluster, a, s) {
  const f = a.flags;
  if (!a.posicionais.length) return s.falha("error: expected 'exec (POD | TYPE/NAME) [-c CONTAINER] [flags] -- COMMAND [args...]'.\nPOD or TYPE/NAME is a required argument for the exec command\nSee 'kubectl exec -h' for help and examples");
  if (!a.depois?.length) {
    if (a.posicionais.length > 1) return s.falha("error: exec [POD] [COMMAND] is not supported anymore. Use exec [POD] -- [COMMAND] instead\nSee 'kubectl exec -h' for help and examples");
    return s.falha("error: you must specify at least one command for the container\nSee 'kubectl exec -h' for help and examples");
  }
  const pod = podDoAlvo(cluster, a.posicionais[0], namespaceDe(cluster, f), s, { avisar: false });
  if (!pod) return null;
  if (['Succeeded', 'Failed'].includes(pod.status?.phase)) return s.falha(`error: cannot exec into a container in a completed pod; current phase is ${pod.status.phase}`);
  const nome = escolherConteiner(pod, f.container, s);
  if (!nome) return null;
  const r = cluster.kubelet.exec(pod, nome, a.depois);
  if (r.erro) return s.falha(r.erro);
  if (r.shell) {
    if (f.stdin && f.tty) return abrirSessao(cluster, s, pod, nome, a.depois, false);
    if (f.tty) s.err('Unable to use a TTY - input is not a terminal or the right kind of file\n');
    return null;
  }
  s.out(r.saida);
  if (r.codigo !== 0) {
    s.err(`command terminated with exit code ${r.codigo}\n`);
    s.codigo = r.codigo;
  }
  return null;
}

// ---------- scale / rollout / set image ----------
function alvoUnico(cluster, a, s, verbo) {
  const ns = namespaceDe(cluster, a.flags);
  let tipo;
  let nome;
  if (a.posicionais[0]?.includes('/')) [tipo, nome] = a.posicionais[0].split('/');
  else [tipo, nome] = a.posicionais;
  if (!tipo) {
    s.falha(`error: required resource not specified\nSee 'kubectl ${verbo} -h' for help and examples`);
    return null;
  }
  const r = acharRecurso(tipo);
  if (!r) {
    s.falha(`error: the server doesn't have a resource type "${tipo}"`);
    return null;
  }
  if (!nome) {
    s.falha(`error: resource name may not be empty`);
    return null;
  }
  const obj = cluster.obter(r.kind, r.namespaced ? ns : null, nome);
  if (!obj) {
    s.falha(`Error from server (NotFound): ${pluralQualificado(r)} "${nome}" not found`);
    return null;
  }
  return { r, obj };
}

function scale(cluster, a, s) {
  if (a.flags.replicas === undefined) return s.falha('error: required flag(s) "replicas" not set');
  const alvo = alvoUnico(cluster, a, s, 'scale');
  if (!alvo) return;
  const { r, obj } = alvo;
  if (!['Deployment', 'ReplicaSet', 'StatefulSet'].includes(obj.kind)) return s.falha('Error from server (NotFound): the server could not find the requested resource');
  if (a.flags.replicas < 0) return s.falha('error: The --replicas=COUNT flag is required, and COUNT must be greater than or equal to 0');
  obj.spec.replicas = a.flags.replicas;
  cluster.salvar(obj, { spec: true });
  s.out(`${nomeQualificado(r)}/${obj.metadata.name} scaled\n`);
  cluster.reconciliar();
}

const revisao = (rs) => Number(rs.metadata.annotations?.['deployment.kubernetes.io/revision'] ?? 0);
const rssDo = (cluster, d) => cluster.listar('ReplicaSet', d.metadata.namespace).filter((rs) => rs.metadata.ownerReferences?.some((o) => o.uid === d.metadata.uid));

function statusRollout(d) {
  const st = d.status ?? {};
  if (d.metadata.generation > (st.observedGeneration ?? 0)) return { msg: 'Waiting for deployment spec update to be observed...\n' };
  if (st.conditions?.find((c) => c.type === 'Progressing')?.reason === 'ProgressDeadlineExceeded') return { erro: `error: deployment "${d.metadata.name}" exceeded its progress deadline` };
  const n = d.metadata.name;
  if ((st.updatedReplicas ?? 0) < d.spec.replicas) return { msg: `Waiting for deployment "${n}" rollout to finish: ${st.updatedReplicas ?? 0} out of ${d.spec.replicas} new replicas have been updated...\n` };
  if ((st.replicas ?? 0) > (st.updatedReplicas ?? 0)) return { msg: `Waiting for deployment "${n}" rollout to finish: ${(st.replicas ?? 0) - (st.updatedReplicas ?? 0)} old replicas are pending termination...\n` };
  if ((st.availableReplicas ?? 0) < (st.updatedReplicas ?? 0)) return { msg: `Waiting for deployment "${n}" rollout to finish: ${st.availableReplicas ?? 0} of ${st.updatedReplicas ?? 0} updated replicas are available...\n` };
  return { msg: `deployment "${n}" successfully rolled out\n`, pronto: true };
}

/** O que o `rollout status` diz de um StatefulSet (o statusViewer do kubectl). */
function statusRolloutSts(sts) {
  const st = sts.status ?? {};
  if (sts.spec.updateStrategy?.type !== 'RollingUpdate') return { erro: 'error: rollout status is only available for RollingUpdate strategy type' };
  if (!st.observedGeneration || sts.metadata.generation > st.observedGeneration) return { msg: 'Waiting for statefulset spec update to be observed...\n' };
  if ((st.readyReplicas ?? 0) < sts.spec.replicas) return { msg: `Waiting for ${sts.spec.replicas - (st.readyReplicas ?? 0)} pods to be ready...\n` };
  const particao = sts.spec.updateStrategy.rollingUpdate?.partition ?? 0;
  if ((st.updatedReplicas ?? 0) < sts.spec.replicas - particao) return { msg: `Waiting for partitioned roll out to finish: ${st.updatedReplicas ?? 0} out of ${sts.spec.replicas - particao} new pods have been updated...\n` };
  return { msg: `partitioned roll out complete: ${st.updatedReplicas ?? 0} new pods have been updated...\n`, pronto: true };
}

/** O que o `rollout status` diz de um DaemonSet. */
function statusRolloutDs(ds) {
  const st = ds.status ?? {};
  if (ds.spec.updateStrategy?.type !== 'RollingUpdate') return { erro: 'error: rollout status is only available for RollingUpdate strategy type' };
  if (ds.metadata.generation > (st.observedGeneration ?? 0)) return { msg: 'Waiting for daemon set spec update to be observed...\n' };
  if ((st.updatedNumberScheduled ?? 0) < (st.desiredNumberScheduled ?? 0)) return { msg: `Waiting for daemon set "${ds.metadata.name}" rollout to finish: ${st.updatedNumberScheduled ?? 0} out of ${st.desiredNumberScheduled} new pods have been updated...\n` };
  if ((st.numberAvailable ?? 0) < (st.desiredNumberScheduled ?? 0)) return { msg: `Waiting for daemon set "${ds.metadata.name}" rollout to finish: ${st.numberAvailable ?? 0} of ${st.desiredNumberScheduled} updated pods are available...\n` };
  return { msg: `daemon set "${ds.metadata.name}" successfully rolled out\n`, pronto: true };
}

function rollout(cluster, a, s) {
  const [sub, ...resto] = a.posicionais;
  const subs = ['history', 'pause', 'restart', 'resume', 'status', 'undo'];
  if (!subs.includes(sub)) {
    return s.falha(sub ? `error: unknown command "${sub}" for "kubectl rollout"` : "error: Required resource not specified.\nSee 'kubectl rollout -h' for help and examples");
  }
  const alvo = alvoUnico(cluster, { ...a, posicionais: resto }, s, `rollout ${sub}`);
  if (!alvo) return;
  const { r, obj: d } = alvo;
  const id = `${nomeQualificado(r)}/${d.metadata.name}`;
  const sts = ['StatefulSet', 'DaemonSet'].includes(d.kind) && ['status', 'restart'].includes(sub);
  if (d.kind !== 'Deployment' && !sts) return s.falha(`error: no ${sub === 'history' ? 'history viewer' : sub === 'status' ? 'status viewer' : 'rollbacker'} has been implemented for "${d.kind}"`);
  switch (sub) {
    case 'status': {
      const limite = a.flags.timeout ? parseDuracao(a.flags.timeout) : 20 * 60_000;
      const fim = cluster.agora + limite;
      let rvAnterior = null;
      for (;;) {
        const st = d.kind === 'StatefulSet' ? statusRolloutSts(d) : d.kind === 'DaemonSet' ? statusRolloutDs(d) : statusRollout(d);
        if (st.erro) return s.falha(st.erro);
        if (d.metadata.resourceVersion !== rvAnterior || st.pronto) s.out(st.msg);
        rvAnterior = d.metadata.resourceVersion;
        if (st.pronto) return;
        if (cluster.agora >= fim) return s.falha('error: timed out waiting for the condition');
        cluster.avancar(1000);
      }
    }
    case 'history': {
      const rss = rssDo(cluster, d).sort((x, y) => revisao(x) - revisao(y));
      if (a.flags.revision) {
        const rs = rss.find((x) => revisao(x) === a.flags.revision);
        if (!rs) return s.falha(`error: unable to find the specified revision`);
        const t = structuredClone(rs.spec.template);
        t.metadata.annotations = { ...(t.metadata.annotations ?? {}), ...(rs.metadata.annotations?.['kubernetes.io/change-cause'] ? { 'kubernetes.io/change-cause': rs.metadata.annotations['kubernetes.io/change-cause'] } : {}) };
        if (!Object.keys(t.metadata.annotations).length) delete t.metadata.annotations;
        return s.out(`${id} with revision #${a.flags.revision}\n${templateCru(t)}\n`);
      }
      const linhas = [['REVISION', 'CHANGE-CAUSE'], ...rss.map((rs) => [String(revisao(rs)), rs.metadata.annotations?.['kubernetes.io/change-cause'] ?? '<none>'])];
      return s.out(`${id} \n${tabular(`${linhas.map((l) => l.join('\t')).join('\n')}\n`, { padding: 2 })}\n`);
    }
    case 'undo': {
      const rss = rssDo(cluster, d).sort((x, y) => revisao(y) - revisao(x));
      const atual = revisao(rss[0] ?? { metadata: {} });
      const alvoRev = a.flags['to-revision'] || rss.map(revisao).find((x) => x < atual);
      if (!alvoRev) return s.falha(`error: no rollout history found for deployment "${d.metadata.name}"`);
      const rs = rss.find((x) => revisao(x) === alvoRev);
      if (!rs) return s.falha(`error: unable to find specified revision ${alvoRev} in history`);
      const t = structuredClone(rs.spec.template);
      delete t.metadata.labels['pod-template-hash'];
      if (canonico(t) === canonico(d.spec.template)) return s.out(`${id} skipped rollback (current template already matches revision ${alvoRev})\n`);
      if (d.metadata.annotations?.['kubectl.kubernetes.io/last-applied-configuration']) {
        s.err(`Warning: resource deployments/${d.metadata.name} was previously managed with 'kubectl apply'. Rolling back will not update the kubectl.kubernetes.io/last-applied-configuration annotation, which may cause unexpected behavior on future 'kubectl apply' operations. Consider using 'kubectl apply' with your previous configuration file instead.\n`);
      }
      d.spec.template = t;
      cluster.salvar(d, { spec: true });
      s.out(`${id} rolled back\n`);
      return cluster.reconciliar();
    }
    case 'restart':
      d.spec.template.metadata.annotations = { ...(d.spec.template.metadata.annotations ?? {}), 'kubectl.kubernetes.io/restartedAt': iso(cluster.agora).replace('Z', '+00:00') };
      cluster.salvar(d, { spec: true });
      s.out(`${id} restarted\n`);
      return cluster.reconciliar();
    case 'pause':
    case 'resume': {
      const pausar = sub === 'pause';
      if (!!d.spec.paused === pausar) return s.falha(`error: ${pluralQualificado(r)} "${d.metadata.name}" is ${pausar ? 'already paused' : 'not paused'}`);
      d.spec.paused = pausar;
      if (!pausar) delete d.spec.paused;
      cluster.salvar(d, { spec: true });
      s.out(`${id} ${pausar ? 'paused' : 'resumed'}\n`);
      return cluster.reconciliar();
    }
  }
}

function set(cluster, a, s) {
  const [sub, ...resto] = a.posicionais;
  if (sub !== 'image') return s.falha(sub ? `error: unknown command "${sub}" for "kubectl set"` : "error: Required resource not specified.\nSee 'kubectl set -h' for help and examples");
  const pares = resto.filter((x) => x.includes('='));
  const recursos = resto.filter((x) => !x.includes('='));
  const alvo = alvoUnico(cluster, { ...a, posicionais: recursos }, s, 'set image');
  if (!alvo) return;
  if (!pares.length) return s.falha('error: at least one image update is required');
  const { r, obj } = alvo;
  const spec = obj.kind === 'Pod' ? obj.spec : obj.spec.template?.spec;
  if (!spec) return s.falha(`error: ${r.kind} is not supported`);
  for (const par of pares) {
    const [ct, img] = par.split('=');
    const lista = ct === '*' ? spec.containers : spec.containers.filter((c) => c.name === ct);
    if (!lista.length) return s.falha(`error: unable to find container named "${ct}"`);
    for (const c of lista) c.image = img;
  }
  cluster.salvar(obj, { spec: obj.kind !== 'Pod' });
  s.out(`${nomeQualificado(r)}/${obj.metadata.name} image updated\n`);
  cluster.reconciliar();
}

// ---------- autoscale / top ----------
function autoscale(cluster, a, s) {
  const alvo = alvoUnico(cluster, a, s, 'autoscale');
  if (!alvo) return;
  const { obj } = alvo;
  if (!['Deployment', 'ReplicaSet', 'StatefulSet'].includes(obj.kind)) return s.falha(`error: cannot autoscale a ${obj.kind}: cannot autoscale a ${obj.kind}`);
  if (a.flags['cpu-percent'] !== undefined) s.err("Flag --cpu-percent has been deprecated, Use --cpu with percentage or resource quantity format (e.g., '70%' for utilization or '500m' for milliCPU).\n");
  const max = a.flags.max;
  if (!(max >= 1)) return s.falha(`error: --max=MAXPODS is required and must be at least 1, max: ${max ?? -1}`);
  const cpu = a.flags.cpu ?? (a.flags['cpu-percent'] !== undefined ? `${a.flags['cpu-percent']}%` : undefined);
  const alvoCpu = cpu === undefined ? null : /%$/.test(cpu) ? { averageUtilization: Number(cpu.slice(0, -1)), type: 'Utilization' } : { averageValue: cpu, type: 'AverageValue' };
  const hpa = {
    apiVersion: 'autoscaling/v2', kind: 'HorizontalPodAutoscaler',
    metadata: { name: a.flags.name ?? obj.metadata.name },
    spec: {
      maxReplicas: max,
      ...(alvoCpu ? { metrics: [{ resource: { name: 'cpu', target: alvoCpu }, type: 'Resource' }] } : {}),
      ...(a.flags.min !== undefined ? { minReplicas: a.flags.min } : {}),
      scaleTargetRef: { apiVersion: obj.apiVersion, kind: obj.kind, name: obj.metadata.name },
    },
    status: { currentMetrics: null, desiredReplicas: 0 },
  };
  if (ehDryRun(a.flags)) {
    if (!imprimirObjetos(cluster, s, [hpa], a.flags, true)) s.out(`horizontalpodautoscaler.autoscaling/${hpa.metadata.name} autoscaled${sufixoDryRun(a.flags)}\n`);
    return;
  }
  const manifesto = structuredClone(hpa);
  delete manifesto.status;
  manifesto.metadata.namespace = namespaceDe(cluster, a.flags);
  try {
    const criado = cluster.criar(manifesto);
    if (!imprimirObjetos(cluster, s, [criado], a.flags, true)) s.out(`horizontalpodautoscaler.autoscaling/${criado.metadata.name} autoscaled\n`);
    cluster.reconciliar();
  } catch (e) {
    s.falha(mensagemErroApi(e));
  }
}

const miliTexto = (m) => `${Math.round(m)}m`;
const miTexto = (b) => `${Math.floor(b / 2 ** 20)}Mi`;
// O que o node gasta além dos pods (o próprio kubelet, o containerd, o sistema).
const BASE_NODE = { controlPlane: { cpu: 250, memoria: 850 * 2 ** 20 }, worker: { cpu: 60, memoria: 280 * 2 ** 20 } };

function top(cluster, a, s) {
  const [sub, nome] = a.posicionais;
  const tipo = { pod: 'pods', pods: 'pods', po: 'pods', node: 'nodes', nodes: 'nodes', no: 'nodes' }[sub];
  if (!tipo) return s.falha(sub ? `error: unknown command "${sub}" for "kubectl top"` : "error: Required resource not specified.\nSee 'kubectl top -h' for help and examples");
  if (!cluster.metricasLigadas) return s.falha('error: Metrics API not available');
  const usoDe = (p) => {
    const m = cluster.metricas?.get(p.metadata.uid);
    return m ? Object.values(m.conteineres).reduce((t, u) => ({ cpu: t.cpu + u.cpu, memoria: t.memoria + u.memoria }), { cpu: 0, memoria: 0 }) : null;
  };
  if (tipo === 'nodes') {
    const nodes = nome ? [cluster.obter('Node', null, nome)].filter(Boolean) : cluster.listar('Node');
    if (nome && !nodes.length) return s.falha(`Error from server (NotFound): nodes "${nome}" not found`);
    if (!cluster.metricas) return s.falha('error: metrics not available yet');
    const linhas = nodes.map((n) => {
      const base = BASE_NODE[n.metadata.labels['node-role.kubernetes.io/control-plane'] !== undefined ? 'controlPlane' : 'worker'];
      const soma = cluster.listar('Pod').filter((p) => p.spec.nodeName === n.metadata.name).map(usoDe).filter(Boolean)
        .reduce((t, u) => ({ cpu: t.cpu + u.cpu, memoria: t.memoria + u.memoria }), { ...base });
      const pct = (v, cap) => `${Math.floor((v / cap) * 100)}%`;
      return [n.metadata.name, miliTexto(soma.cpu), pct(soma.cpu, cpuMiliDe(n.status.allocatable.cpu)), miTexto(soma.memoria), pct(soma.memoria, bytesDe(n.status.allocatable.memory)), ''];
    });
    return s.out(tabela([...(a.flags['no-headers'] ? [] : [['NAME', 'CPU(cores)', 'CPU(%)', 'MEMORY(bytes)', 'MEMORY(%)', '']]), ...linhas]));
  }
  const ns = namespaceDe(cluster, a.flags);
  const todos = a.flags['all-namespaces'];
  const casa = seletorDeLabels(a.flags.selector);
  let pods = cluster.listar('Pod', todos ? undefined : ns).filter((p) => casa(p.metadata.labels) && (!nome || p.metadata.name === nome));
  if (nome && !pods.length) return s.falha(`Error from server (NotFound): pods "${nome}" not found`);
  const comUso = pods.map((p) => [p, usoDe(p)]).filter(([, u]) => u);
  if (!comUso.length) {
    if (nome) return s.falha(`error: Metrics not available for pod ${ns}/${nome}, age: ${idadeGo(cluster.agora - Date.parse(pods[0].metadata.creationTimestamp))}`);
    return s.falha('error: metrics not available yet');
  }
  if (a.flags['sort-by'] === 'cpu') comUso.sort((x, y) => y[1].cpu - x[1].cpu);
  if (a.flags['sort-by'] === 'memory') comUso.sort((x, y) => y[1].memoria - x[1].memoria);
  pods = comUso;
  const cab = a.flags.containers ? ['POD', 'NAME', 'CPU(cores)', 'MEMORY(bytes)', ''] : ['NAME', 'CPU(cores)', 'MEMORY(bytes)', ''];
  const linhas = a.flags.containers
    ? pods.flatMap(([p]) => Object.entries(cluster.metricas.get(p.metadata.uid).conteineres).map(([nomeCt, u]) => [...(todos ? [p.metadata.namespace] : []), p.metadata.name, nomeCt, miliTexto(u.cpu), miTexto(u.memoria), '']))
    : pods.map(([p, u]) => [...(todos ? [p.metadata.namespace] : []), p.metadata.name, miliTexto(u.cpu), miTexto(u.memoria), '']);
  s.out(tabela([...(a.flags['no-headers'] ? [] : [[...(todos ? ['NAMESPACE'] : []), ...cab]]), ...linhas]));
}

/** Duração como o Go escreve (1m22.65s). */
const idadeGo = (ms) => {
  const seg = ms / 1000;
  const min = Math.floor(seg / 60);
  const resto = Number((seg - min * 60).toFixed(2));
  return min ? `${min}m${resto}s` : `${resto}s`;
};

// ---------- wait ----------
/** kubectl wait --for=condition=complete job/x (ou Ready, ou delete): o relógio anda até valer ou dar o timeout. */
function wait(cluster, a, s) {
  const para = a.flags.for;
  if (!para) return s.falha("error: --for must be specified\nSee 'kubectl wait -h' for help and examples");
  const m = para.match(/^condition=([\w.-]+)(?:=(\w+))?$/i);
  if (!m && para !== 'delete') return s.falha(`error: unrecognized condition: "${para}"`);
  const sel = selecionar(cluster, a.posicionais, a.flags);
  for (const e of sel.erros) s.falha(e);
  const alvos = sel.grupos.flatMap((g) => g.objetos.map((o) => ({ o, r: g.recurso })));
  if (!alvos.length && !sel.erros.length) return s.falha('error: no matching resources found');
  const valeu = ({ o }) => (para === 'delete'
    ? !cluster.porUid.has(o.metadata.uid)
    : (o.status?.conditions ?? []).some((c) => c.type.toLowerCase() === m[1].toLowerCase() && c.status.toLowerCase() === (m[2] ?? 'True').toLowerCase()));
  cluster.avancarAte(() => alvos.every(valeu), a.flags.timeout ?? '30s');
  for (const x of alvos) {
    if (valeu(x)) s.out(`${nomeQualificado(x.r)}/${x.o.metadata.name} condition met\n`);
    else s.falha(`error: timed out waiting for the condition on ${pluralQualificado(x.r)}/${x.o.metadata.name}`);
  }
}

// ---------- expose / port-forward ----------
function expose(cluster, a, s) {
  const alvo = alvoUnico(cluster, a, s, 'expose');
  if (!alvo) return;
  const { obj } = alvo;
  let seletor;
  let porta;
  if (obj.kind === 'Deployment' || obj.kind === 'ReplicaSet') {
    seletor = obj.spec.selector.matchLabels;
    porta = obj.spec.template.spec.containers.flatMap((c) => c.ports ?? [])[0]?.containerPort;
  } else if (obj.kind === 'Pod') {
    seletor = obj.metadata.labels;
    porta = obj.spec.containers.flatMap((c) => c.ports ?? [])[0]?.containerPort;
  } else if (obj.kind === 'Service') {
    seletor = obj.spec.selector;
    porta = obj.spec.ports?.[0]?.port;
  } else return s.falha(`error: cannot expose a ${obj.kind}`);
  if (!seletor || !Object.keys(seletor).length) return s.falha(`error: couldn't retrieve selectors via --selector flag or introspection: the ${obj.kind.toLowerCase()} has no labels and cannot be exposed`);
  porta = a.flags.port ?? porta;
  if (!porta) return s.falha("error: couldn't find port via --port flag or introspection\nSee 'kubectl expose -h' for help and examples");
  const tipos = { clusterip: 'ClusterIP', nodeport: 'NodePort', loadbalancer: 'LoadBalancer' };
  const tipo = tipos[(a.flags.type ?? 'ClusterIP').toLowerCase()];
  if (!tipo) return s.falha(`error: Service "${a.flags.name ?? obj.metadata.name}" is invalid: spec.type: Unsupported value: "${a.flags.type}": supported values: "ClusterIP", "ExternalName", "LoadBalancer", "NodePort"`);
  const alvoPorta = a.flags['target-port'] ?? porta;
  const svc = {
    apiVersion: 'v1', kind: 'Service',
    metadata: { ...(obj.metadata.labels ? { labels: { ...obj.metadata.labels } } : {}), name: a.flags.name ?? obj.metadata.name },
    spec: { ports: [{ port: Number(porta), protocol: 'TCP', targetPort: /^\d+$/.test(String(alvoPorta)) ? Number(alvoPorta) : alvoPorta }], selector: { ...seletor }, ...(tipo !== 'ClusterIP' ? { type: tipo } : {}) },
    status: { loadBalancer: {} },
  };
  if (ehDryRun(a.flags)) {
    if (!imprimirObjetos(cluster, s, [svc], a.flags, true)) s.out(`service/${svc.metadata.name} exposed${sufixoDryRun(a.flags)}\n`);
    return;
  }
  const manifesto = structuredClone(svc);
  delete manifesto.status;
  manifesto.metadata.namespace = namespaceDe(cluster, a.flags);
  try {
    const criado = cluster.criar(manifesto);
    if (!imprimirObjetos(cluster, s, [criado], a.flags, true)) s.out(`service/${criado.metadata.name} exposed\n`);
    cluster.reconciliar();
  } catch (e) {
    s.falha(mensagemErroApi(e));
  }
}

function portForward(cluster, a, s) {
  const [alvoTxt, ...portas] = a.posicionais;
  if (!alvoTxt || !portas.length) return s.falha("error: TYPE/NAME and list of ports are required for port-forward\nSee 'kubectl port-forward -h' for help and examples");
  const ns = namespaceDe(cluster, a.flags);
  let pod;
  let svc = null;
  if (alvoTxt.includes('/') && !/^(pods?|po)\//.test(alvoTxt)) {
    const [tipo, nome] = alvoTxt.split('/');
    const r = acharRecurso(tipo);
    if (!r) return s.falha(`error: the server doesn't have a resource type "${tipo}"`);
    const obj = cluster.obter(r.kind, ns, nome);
    if (!obj) return s.falha(`Error from server (NotFound): ${pluralQualificado(r)} "${nome}" not found`);
    const sel = r.kind === 'Service' ? obj.spec.selector : obj.spec.selector?.matchLabels;
    if (r.kind === 'Service') svc = obj;
    pod = cluster.listar('Pod', ns).filter((p) => casaLabels(sel, p.metadata.labels) && p.status?.phase === 'Running')[0];
    if (!pod) return s.falha(`error: unable to forward port because pod is not running. Current status=Pending`);
  } else {
    const nome = alvoTxt.replace(/^(pods?|po)\//, '');
    pod = cluster.obter('Pod', ns, nome);
    if (!pod) return s.falha(`Error from server (NotFound): pods "${nome}" not found`);
    if (pod.status?.phase !== 'Running') return s.falha(`error: unable to forward port because pod is not running. Current status=${pod.status?.phase ?? 'Pending'}`);
  }
  let saida = '';
  for (const p of portas) {
    const [local, remota] = p.includes(':') ? p.split(':').map(Number) : [Number(p), Number(p)];
    let noPod = remota;
    if (svc) {
      const sp = svc.spec.ports.find((x) => x.port === remota);
      if (!sp) return s.falha(`error: Service ${svc.metadata.name} does not have a service port ${remota}`);
      noPod = portaAlvo(pod, sp.targetPort);
    }
    if (cluster.encaminhamentos.some((e) => e.local === local)) {
      return s.falha(`Unable to listen on port ${local}: Listeners failed to create with the following errors: [unable to create listener: Error listen tcp4 127.0.0.1:${local}: bind: address already in use unable to create listener: Error listen tcp6 [::1]:${local}: bind: address already in use]\nerror: unable to listen on any of the requested ports: [{${local} ${noPod}}]`);
    }
    cluster.encaminhamentos.push({ local, ns, pod: pod.metadata.name, remota: noPod });
    saida += `Forwarding from 127.0.0.1:${local} -> ${noPod}\nForwarding from [::1]:${local} -> ${noPod}\n`;
  }
  s.out(saida);
}

const casaLabels = (sel, labels = {}) => !!sel && Object.keys(sel).length > 0 && Object.entries(sel).every(([k, v]) => labels[k] === v);

// ---------- label / annotate ----------
function etiquetar(cluster, a, s, campo) {
  const ehLabel = campo === 'labels';
  const pares = a.posicionais.filter((x) => x.includes('=') || /-$/.test(x));
  const recursos = a.posicionais.filter((x) => !pares.includes(x));
  if (!pares.length) return s.falha(`error: at least one ${ehLabel ? 'label' : 'annotation'} update is required\nSee 'kubectl ${ehLabel ? 'label' : 'annotate'} -h' for help and examples`);
  const sel = selecionar(cluster, recursos, a.flags);
  for (const e of sel.erros) s.falha(e);
  for (const g of sel.grupos) {
    for (const obj of g.objetos) {
      const atual = { ...(obj.metadata[campo] ?? {}) };
      let mudou = false;
      let soRemocao = true;
      for (const p of pares) {
        if (p.endsWith('-') && !p.includes('=')) {
          const k = p.slice(0, -1);
          if (k in atual) {
            delete atual[k];
            mudou = true;
          }
          continue;
        }
        soRemocao = false;
        const [k, ...v] = p.split('=');
        const valor = v.join('=');
        if (k in atual && atual[k] !== valor && !a.flags.overwrite) {
          return s.falha(ehLabel
            ? `error: '${k}' already has a value (${atual[k]}), and --overwrite is false`
            : `error: --overwrite is false but found the following declared annotation(s): '${k}' already has a value (${atual[k]})`);
        }
        if (atual[k] !== valor) {
          atual[k] = valor;
          mudou = true;
        }
      }
      const id = `${nomeQualificado(g.recurso)}/${obj.metadata.name}`;
      if (!mudou) {
        s.out(`${id} not ${ehLabel ? 'labeled' : 'annotated'}\n`);
        continue;
      }
      obj.metadata[campo] = atual;
      if (!Object.keys(atual).length) delete obj.metadata[campo];
      cluster.salvar(obj);
      s.out(`${id} ${ehLabel ? (soRemocao ? 'unlabeled' : 'labeled') : 'annotated'}\n`);
    }
  }
  cluster.reconciliar();
}

// ---------- config, versão, ajuda ----------
function config(cluster, a, s) {
  const [sub, nome] = a.posicionais;
  const ctx = cluster.contexto;
  switch (sub) {
    case 'get-contexts':
      return s.out(tabela([['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO', 'NAMESPACE'], ['*', ctx.nome, ctx.nome, ctx.nome, ctx.namespaceDefinido ? ctx.namespace : '']]));
    case 'current-context':
      return s.out(`${ctx.nome}\n`);
    case 'use-context':
      if (nome !== ctx.nome) return s.falha(`error: no context exists with the name: "${nome}"`);
      return s.out(`Switched to context "${ctx.nome}".\n`);
    case 'set-context': {
      if (!a.flags.current && nome !== ctx.nome) return s.falha("error: you must specify a non-empty context name or --current");
      if (a.flags.namespace !== undefined) {
        ctx.namespace = a.flags.namespace || 'default';
        ctx.namespaceDefinido = !!a.flags.namespace;
      }
      return s.out(`Context "${ctx.nome}" modified.\n`);
    }
    case 'view':
      return s.out(paraYaml({
        apiVersion: 'v1',
        clusters: [{ cluster: { 'certificate-authority-data': 'DATA+OMITTED', server: 'https://127.0.0.1:6443' }, name: ctx.nome }],
        contexts: [{ context: { cluster: ctx.nome, ...(ctx.namespaceDefinido ? { namespace: ctx.namespace } : {}), user: ctx.nome }, name: ctx.nome }],
        'current-context': ctx.nome,
        kind: 'Config',
        preferences: {},
        users: [{ name: ctx.nome, user: { 'client-certificate-data': 'DATA+OMITTED', 'client-key-data': 'DATA+OMITTED' } }],
      }));
    default:
      return s.falha(sub ? `error: unknown command "${sub}" for "kubectl config"` : 'error: Required subcommand not specified. Available: current-context, get-contexts, set-context, use-context, view');
  }
}

function apiResources(cluster, a, s) {
  const filtro = a.flags.namespaced;
  const lista = [...RECURSOS]
    .filter((r) => filtro === undefined || String(r.namespaced) === String(filtro))
    .sort((x, y) => (x.grupo || '').localeCompare(y.grupo || '') || x.plural.localeCompare(y.plural));
  if (a.flags.output === 'name') return s.out(lista.map((r) => `${r.plural}${r.grupo ? `.${r.grupo}` : ''}\n`).join(''));
  s.out(tabela([['NAME', 'SHORTNAMES', 'APIVERSION', 'NAMESPACED', 'KIND'], ...lista.map((r) => [r.plural, r.curtos.join(','), apiVersion(r), String(r.namespaced), r.kind])]));
}

function explain(cluster, a, s) {
  const [alvo] = a.posicionais;
  if (!alvo) return s.falha("error: You must specify the type of resource to explain. Use \"kubectl api-resources\" for a complete list of supported resources.");
  const [tipo, ...caminho] = alvo.split('.');
  const r = acharRecurso(tipo);
  if (!r || !ESQUEMAS[r.kind]) return s.falha(`error: the server doesn't have a resource type "${tipo}"`);
  const x = explicar(r, caminho);
  if (x.erro) return s.falha(x.erro);
  s.out(x.saida);
}

const AJUDA = `kubectl controls the Kubernetes cluster manager.

 Find more information at: https://kubernetes.io/docs/reference/kubectl/

Basic Commands (Beginner):
  create          Create a resource from a file or from stdin
  expose          Take a replication controller, service, deployment or pod and expose it as a new Kubernetes service
  run             Run a particular image on the cluster
  set             Set specific features on objects

Basic Commands (Intermediate):
  explain         Get documentation for a resource
  get             Display one or many resources
  edit            Edit a resource on the server
  delete          Delete resources by file names, stdin, resources and names, or by resources and label selector

Deploy Commands:
  rollout         Manage the rollout of a resource
  scale           Set a new size for a deployment, replica set, or replication controller
  autoscale       Auto-scale a deployment, replica set, stateful set, or replication controller

Cluster Management Commands:
  top             Display resource (CPU/memory) usage

Troubleshooting and Debugging Commands:
  describe        Show details of a specific resource or group of resources
  logs            Print the logs for a container in a pod
  exec            Execute a command in a container

Advanced Commands:
  apply           Apply a configuration to a resource by file name or stdin
  wait            Experimental: Wait for a specific condition on one or many resources

Settings Commands:
  label           Update the labels on a resource
  annotate        Update the annotations on a resource

Other Commands:
  api-resources   Print the supported API resources on the server
  cluster-info    Display cluster information
  config          Modify kubeconfig files
  version         Print the client and server version information

Usage:
  kubectl [flags] [options]

Use "kubectl <command> --help" for more information about a given command.
Use "kubectl options" for a list of global command-line options (applies to all commands).
`;

// ---------- tabela de comandos ----------
const SAIDA = { output: { curto: 'o', tipo: 'string' } };
const SELETOR = { selector: { curto: 'l', tipo: 'string' } };
const ARQUIVOS = { filename: { curto: 'f', tipo: 'lista' }, recursive: { curto: 'R', tipo: 'bool' } };
const DRY = { 'dry-run': { tipo: 'string' } };

const COMANDOS = {
  get: { flags: { ...SAIDA, ...SELETOR, watch: { curto: 'w', tipo: 'bool' }, 'all-namespaces': { curto: 'A', tipo: 'bool' }, 'show-labels': { tipo: 'bool' }, 'no-headers': { tipo: 'bool' }, 'field-selector': { tipo: 'string' } }, rodar: get },
  describe: { flags: { ...SELETOR, 'all-namespaces': { curto: 'A', tipo: 'bool' } }, rodar: describe },
  apply: { flags: { ...ARQUIVOS, ...SAIDA, ...DRY, 'server-side': { tipo: 'bool' }, validate: { tipo: 'string' } }, rodar: apply },
  create: {
    flags: { ...ARQUIVOS, ...SAIDA, ...DRY, image: { tipo: 'lista' }, replicas: { curto: 'r', tipo: 'int' }, port: { tipo: 'string' }, 'from-literal': { tipo: 'lista' }, 'from-file': { tipo: 'lista' }, tcp: { tipo: 'lista' }, type: { tipo: 'string' }, 'save-config': { tipo: 'bool' }, validate: { tipo: 'string' }, schedule: { tipo: 'string' }, from: { tipo: 'string' }, restart: { tipo: 'string' } },
    rodar: create,
  },
  run: {
    flags: { ...SAIDA, ...DRY, image: { tipo: 'string' }, port: { tipo: 'string' }, labels: { curto: 'l', tipo: 'string' }, env: { tipo: 'lista' }, restart: { tipo: 'string' }, command: { tipo: 'bool' }, rm: { tipo: 'bool' }, stdin: { curto: 'i', tipo: 'bool' }, tty: { curto: 't', tipo: 'bool' }, 'image-pull-policy': { tipo: 'string' }, overrides: { tipo: 'string' } },
    rodar: run,
  },
  delete: {
    flags: { ...ARQUIVOS, ...SELETOR, all: { tipo: 'bool' }, force: { tipo: 'bool' }, 'grace-period': { tipo: 'int', padrao: -1 }, wait: { tipo: 'bool', padrao: true }, cascade: { tipo: 'string' }, now: { tipo: 'bool' }, 'all-namespaces': { curto: 'A', tipo: 'bool' }, 'ignore-not-found': { tipo: 'bool' }, 'field-selector': { tipo: 'string' } },
    rodar: delete_,
  },
  logs: {
    flags: { container: { curto: 'c', tipo: 'string' }, previous: { curto: 'p', tipo: 'bool' }, follow: { curto: 'f', tipo: 'bool' }, tail: { tipo: 'int', padrao: -1 }, timestamps: { tipo: 'bool' }, ...SELETOR, 'all-containers': { tipo: 'bool' }, prefix: { tipo: 'bool' } },
    rodar: logs,
  },
  exec: { flags: { container: { curto: 'c', tipo: 'string' }, stdin: { curto: 'i', tipo: 'bool' }, tty: { curto: 't', tipo: 'bool' }, quiet: { curto: 'q', tipo: 'bool' } }, rodar: exec },
  scale: { flags: { replicas: { tipo: 'int' }, 'current-replicas': { tipo: 'int' } }, rodar: scale },
  rollout: { flags: { revision: { tipo: 'int' }, 'to-revision': { tipo: 'int' }, timeout: { tipo: 'string' }, watch: { curto: 'w', tipo: 'bool' } }, rodar: rollout },
  set: { flags: {}, rodar: set },
  expose: { flags: { ...SAIDA, ...DRY, port: { tipo: 'string' }, 'target-port': { tipo: 'string' }, type: { tipo: 'string' }, name: { tipo: 'string' }, protocol: { tipo: 'string' } }, rodar: expose },
  'port-forward': { flags: { address: { tipo: 'string' } }, rodar: portForward },
  wait: { flags: { ...SELETOR, for: { tipo: 'string' }, timeout: { tipo: 'string' }, all: { tipo: 'bool' } }, rodar: wait },
  autoscale: { flags: { ...SAIDA, ...DRY, cpu: { tipo: 'string' }, 'cpu-percent': { tipo: 'int' }, min: { tipo: 'int' }, max: { tipo: 'int' }, name: { tipo: 'string' } }, rodar: autoscale },
  label: { flags: { overwrite: { tipo: 'bool' }, ...SELETOR, all: { tipo: 'bool' } }, rodar: (c, a, s) => etiquetar(c, a, s, 'labels') },
  annotate: { flags: { overwrite: { tipo: 'bool' }, ...SELETOR, all: { tipo: 'bool' } }, rodar: (c, a, s) => etiquetar(c, a, s, 'annotations') },
  config: { flags: { current: { tipo: 'bool' } }, rodar: config },
  'api-resources': { flags: { ...SAIDA, namespaced: { tipo: 'string' } }, rodar: apiResources },
  explain: { flags: { recursive: { tipo: 'bool' } }, rodar: explain },
  version: { flags: { ...SAIDA, client: { tipo: 'bool' } }, rodar: (c, a, s) => s.out(`Client Version: ${VERSAO_CLIENTE}\nKustomize Version: v5.8.1\n${a.flags.client ? '' : `Server Version: ${VERSAO_SERVIDOR}\n`}`) },
  'cluster-info': { flags: {}, rodar: (c, a, s) => s.out('Kubernetes control plane is running at https://127.0.0.1:6443\nCoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy\n\nTo further debug and diagnose cluster problems, use \'kubectl cluster-info dump\'.\n') },
  top: { flags: { ...SELETOR, 'all-namespaces': { curto: 'A', tipo: 'bool' }, containers: { tipo: 'bool' }, 'sort-by': { tipo: 'string' }, 'no-headers': { tipo: 'bool' } }, rodar: top },
  cordon: { flags: {}, rodar: (c, a, s) => cordon(c, a, s, true) },
  uncordon: { flags: {}, rodar: (c, a, s) => cordon(c, a, s, false) },
  taint: { flags: { overwrite: { tipo: 'bool' } }, rodar: taint },
  drain: {
    flags: { 'ignore-daemonsets': { tipo: 'bool' }, force: { tipo: 'bool' }, 'delete-emptydir-data': { tipo: 'bool' }, 'pod-selector': { tipo: 'string' }, timeout: { tipo: 'string' }, 'grace-period': { tipo: 'int' } },
    rodar: drain,
  },
  help: { flags: {}, rodar: (c, a, s) => s.out(AJUDA) },
};

/** Acha o subcomando: a primeira palavra que não é flag global (nem valor de flag global). */
function separarComando(args) {
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    if (['-n', '--namespace', '--context', '--kubeconfig'].includes(x)) {
      i++;
      continue;
    }
    if (x.startsWith('-')) continue;
    return { nome: x, resto: [...args.slice(0, i), ...args.slice(i + 1)] };
  }
  return { nome: null, resto: args };
}

/**
 * Roda uma linha de comando do kubectl.
 * opções: { arquivos } — os arquivos do editor, para o -f.
 * → { saida, stdout, stderr, partes, codigo, observar?, sessao? }
 */
export function kubectl(cluster, linha, { arquivos = {} } = {}) {
  const s = new Saida();
  const args = Array.isArray(linha) ? linha : palavras(linha);
  if (args[0] === 'kubectl' || args[0] === 'k') args.shift();
  const { nome, resto } = separarComando(args);
  if (!nome) {
    s.out(AJUDA);
    return s.resultado();
  }
  const cmd = COMANDOS[nome];
  if (!cmd) {
    if (COMANDOS_REAIS.includes(nome)) {
      s.falha(`error: o comando "${nome}" ainda não existe neste simulador (ele chega em um nível mais adiante da trilha).`);
      return s.resultado();
    }
    const sugestoes = COMANDOS_REAIS.filter((c) => distancia(nome, c) <= 2);
    s.falha(`error: unknown command "${nome}" for "kubectl"${sugestoes.length ? `\n\nDid you mean this?\n${sugestoes.map((x) => `\t${x}`).join('\n')}\n` : "\nRun 'kubectl --help' for usage."}`);
    return s.resultado();
  }
  let lidos;
  try {
    lidos = lerFlags(resto, { ...GLOBAIS, ...cmd.flags });
  } catch (e) {
    if (!(e instanceof ErroFlag)) throw e;
    s.falha(`error: ${e.message}\nSee 'kubectl ${nome} --help' for usage.`);
    return s.resultado();
  }
  if (lidos.flags.help) {
    s.out(`Use "kubectl ${nome} --help" no terminal de verdade para ver todas as opções. Aqui, a aba Manual da missão explica as que você vai usar.\n`);
    return s.resultado();
  }
  try {
    const extra = cmd.rodar(cluster, { ...lidos, arquivos }, s);
    if (typeof extra === 'function') return s.resultado({ observar: extra });
    if (extra?.sessao) return s.resultado({ sessao: extra.sessao });
  } catch (e) {
    if (e instanceof Erro) {
      if (e.message) s.falha(e.message);
      else s.falha(`error: Required resource not specified.\nSee 'kubectl ${nome} -h' for help and examples`);
    } else throw e;
  }
  return s.resultado();
}

