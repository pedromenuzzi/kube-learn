// kubectl cordon, uncordon, taint e drain: interditar o prédio, pôr e tirar placas de restrição e esvaziar o prédio
// para a reforma (despejando os pods pela API de eviction, que respeita os PodDisruptionBudgets).
import { iso, parseDuracao } from '../unidades.js';
import { despejar } from '../manutencao.js';
import { seletorDeLabels } from './index.js';

const EFEITOS = ['NoSchedule', 'PreferNoSchedule', 'NoExecute'];
const TIPOS_NODE = ['node', 'nodes', 'no'];

/** "nodes golden-worker" ou "node/golden-worker" → o node (ou null, com o erro já escrito). */
function acharNode(cluster, s, posicionais, verbo) {
  let [nome] = posicionais;
  let resto = posicionais.slice(1);
  if (TIPOS_NODE.includes(nome)) [nome, ...resto] = resto;
  else if (nome?.includes('/')) {
    const [tipo, n] = nome.split('/');
    if (!TIPOS_NODE.includes(tipo)) return s.falha(`error: the server doesn't have a resource type "${tipo}"`), null;
    nome = n;
  }
  if (!nome) return s.falha(`error: USAGE: ${verbo} NODE [flags]\nSee 'kubectl ${verbo} -h' for help and examples`), null;
  const node = cluster.obter('Node', null, nome);
  if (!node) return s.falha(`Error from server (NotFound): nodes "${nome}" not found`), null;
  return { node, resto };
}

/** Interdita (ou libera) o node para pods novos. Devolve se mudou. */
function interditar(cluster, s, node, sim) {
  const id = `node/${node.metadata.name}`;
  if (!!node.spec.unschedulable === sim) {
    s.out(`${id} already ${sim ? 'cordoned' : 'uncordoned'}\n`);
    return;
  }
  if (sim) node.spec.unschedulable = true;
  else delete node.spec.unschedulable;
  cluster.salvar(node);
  s.out(`${id} ${sim ? 'cordoned' : 'uncordoned'}\n`);
}

export function cordon(cluster, a, s, sim = true) {
  const achado = acharNode(cluster, s, a.posicionais, sim ? 'cordon' : 'uncordon');
  if (!achado) return;
  interditar(cluster, s, achado.node, sim);
  cluster.reconciliar();
}

// ---------- taint ----------
export function taint(cluster, a, s) {
  const achado = acharNode(cluster, s, a.posicionais, 'taint');
  if (!achado) return;
  const { node, resto } = achado;
  if (!resto.length) return s.falha("error: at least one taint update is required\nSee 'kubectl taint -h' for help and examples");
  let taints = [...(node.spec.taints ?? [])];
  let pos = false;
  let tirou = false;
  for (const spec of resto) {
    if (spec.endsWith('-')) {
      const [chaveValor, efeito] = spec.slice(0, -1).split(':');
      const chave = chaveValor.split('=')[0];
      const antes = taints.length;
      taints = taints.filter((t) => !(t.key === chave && (!efeito || t.effect === efeito)));
      if (taints.length === antes) return s.falha(`error: taint ${JSON.stringify(efeito ? `${chave}:${efeito}` : chave)} not found`);
      tirou = true;
      continue;
    }
    const [chaveValor, efeito, ...mais] = spec.split(':');
    if (efeito === undefined || mais.length) return s.falha(`error: invalid taint spec: ${spec}`);
    if (!EFEITOS.includes(efeito)) return s.falha(`error: invalid taint effect: ${efeito}, unsupported taint effect`);
    const [chave, ...valor] = chaveValor.split('=');
    const novo = { effect: efeito, key: chave, ...(valor.length && valor.join('=') ? { value: valor.join('=') } : {}), ...(efeito === 'NoExecute' ? { timeAdded: iso(cluster.agora) } : {}) };
    const igual = taints.findIndex((t) => t.key === chave && t.effect === efeito);
    if (igual !== -1 && !a.flags.overwrite) return s.falha(`error: node ${node.metadata.name} already has ${chave} taint(s) with same effect(s) and --overwrite is false`);
    if (igual !== -1) taints[igual] = novo;
    else taints.push(novo);
    pos = true;
  }
  if (taints.length) node.spec.taints = taints;
  else delete node.spec.taints;
  cluster.salvar(node);
  s.out(`node/${node.metadata.name} ${pos && tirou ? 'modified' : pos ? 'tainted' : 'untainted'}\n`);
  cluster.reconciliar();
}

// ---------- drain ----------
const IGNORAR_DS = 'cannot delete DaemonSet-managed Pods (use --ignore-daemonsets to ignore)';
const LOCAL = 'cannot delete Pods with local storage (use --delete-emptydir-data to override)';
const SEM_DONO = 'cannot delete Pods that declare no controller (use --force to override)';
const ESPERA_MAXIMA = 120_000; // sem --timeout, o drain real espera para sempre; aqui, 2 minutos do relógio

/** Uma duração do Go (time.Duration.String()): 90 s → "1m30s", 2 min → "2m0s". */
const duracaoGo = (ms) => {
  const seg = Math.round(ms / 1000);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h ? `${h}h${m}m${seg % 60}s` : m ? `${m}m${seg % 60}s` : `${seg}s`;
};

/** O que fazer com cada pod do node: despejar, ignorar com aviso ou recusar o drain (os filtros do kubectl). */
function classificar(pod, flags) {
  const terminou = ['Succeeded', 'Failed'].includes(pod.status?.phase);
  const dono = pod.metadata.ownerReferences?.find((o) => o.controller);
  if (pod.metadata.annotations?.['kubernetes.io/config.mirror']) return { sai: false };
  if (dono?.kind === 'DaemonSet') return flags['ignore-daemonsets'] ? { sai: false, aviso: 'ignoring DaemonSet-managed Pods' } : { sai: false, erro: IGNORAR_DS };
  if (!terminou && (pod.spec.volumes ?? []).some((v) => v.emptyDir) && !flags['delete-emptydir-data']) return { sai: false, erro: LOCAL };
  if (!terminou && !dono) return flags.force ? { sai: true, aviso: 'deleting Pods that declare no controller' } : { sai: false, erro: SEM_DONO };
  return { sai: true };
}

/** Junta por mensagem: "mensagem: ns/a, ns/b". */
const agrupar = (lista) => {
  const por = new Map();
  for (const { msg, pod } of lista) por.set(msg, [...(por.get(msg) ?? []), `${pod.metadata.namespace}/${pod.metadata.name}`]);
  return [...por].map(([msg, pods]) => `${msg}: ${pods.join(', ')}`);
};
const agregado = (erros) => (erros.length === 1 ? erros[0] : `[${erros.join(', ')}]`);

export function drain(cluster, a, s) {
  const achado = acharNode(cluster, s, a.posicionais, 'drain');
  if (!achado) return;
  const { node } = achado;
  const nome = node.metadata.name;
  interditar(cluster, s, node, true);
  cluster.reconciliar();

  const naoDrenou = (erro) => {
    s.err(`error: unable to drain node "${nome}" due to error: ${erro}, continuing command...\n`);
    s.err(`There are pending nodes to be drained:\n ${nome}\n`);
    s.falha(erro);
  };
  const casa = a.flags['pod-selector'] ? seletorDeLabels(a.flags['pod-selector']) : () => true;
  const pods = cluster.listar('Pod').filter((p) => p.spec.nodeName === nome && casa(p.metadata.labels ?? {}));
  const decisoes = pods.map((pod) => ({ pod, ...classificar(pod, a.flags) }));
  const erros = agrupar(decisoes.filter((d) => d.erro).map((d) => ({ msg: d.erro, pod: d.pod })));
  if (erros.length) return naoDrenou(agregado(erros));
  const avisos = agrupar(decisoes.filter((d) => d.aviso).map((d) => ({ msg: d.aviso, pod: d.pod })));
  if (avisos.length) s.err(`Warning: ${avisos.join('; ')}\n`);

  // Despeja todos de uma vez; quem o PDB barrar tenta de novo a cada 5 s. Cada despejado é esperado até sumir.
  const limite = a.flags.timeout && parseDuracao(a.flags.timeout) > 0 ? parseDuracao(a.flags.timeout) : null;
  const inicio = cluster.agora;
  const fila = decisoes.filter((d) => d.sai).map(({ pod }) => ({ pod, proxima: cluster.agora, despejado: false, pronto: false }));
  while (fila.some((x) => !x.pronto)) {
    for (const x of fila.filter((y) => !y.despejado && cluster.agora >= y.proxima)) {
      s.out(`evicting pod ${x.pod.metadata.namespace}/${x.pod.metadata.name}\n`);
      const recusa = cluster.porUid.has(x.pod.metadata.uid) ? despejar(cluster, x.pod) : null;
      if (recusa) {
        s.err(`error when evicting pods/"${x.pod.metadata.name}" -n "${x.pod.metadata.namespace}" (will retry after 5s): ${recusa}\n`);
        x.proxima = cluster.agora + 5000;
      } else x.despejado = true;
    }
    cluster.reconciliar();
    for (const x of fila.filter((y) => y.despejado && !y.pronto && !cluster.porUid.has(y.pod.metadata.uid))) {
      s.out(`pod/${x.pod.metadata.name} evicted\n`);
      x.pronto = true;
    }
    if (!fila.some((x) => !x.pronto)) break;
    const passou = cluster.agora - inicio;
    if (passou >= (limite ?? ESPERA_MAXIMA)) {
      const x = fila.find((y) => !y.pronto);
      const erro = x.despejado
        ? `error when waiting for pod "${x.pod.metadata.name}" in namespace "${x.pod.metadata.namespace}" to terminate: global timeout reached: ${duracaoGo(limite ?? ESPERA_MAXIMA)}`
        : `error when evicting pods/"${x.pod.metadata.name}" -n "${x.pod.metadata.namespace}": global timeout reached: ${duracaoGo(limite ?? ESPERA_MAXIMA)}`;
      if (!limite) s.err('(simulador: o drain de verdade ficaria esperando para sempre; parei depois de 2 minutos do relógio. Veja o PDB ou use --timeout.)\n');
      s.err(`There are pending pods in node "${nome}" when an error occurred: ${erro}\n${fila.map((y) => `pod/${y.pod.metadata.name}\n`).join('')}`);
      return naoDrenou(erro);
    }
    cluster.avancar(1000);
  }
  s.out(`node/${nome} drained\n`);
}
