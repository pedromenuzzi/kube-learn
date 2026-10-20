// A manutenção dos prédios: o PodDisruptionBudget ("pelo menos 2 elevadores funcionando"), o despejo (eviction)
// que o kubectl drain usa, o ciclo de vida dos nodes (o prédio sem luz vira NotReady e ganha os taints de
// unreachable) e o despejo pelos taints NoExecute (quem não tolera sai; quem tolera por N segundos sai depois).
import { iso } from './unidades.js';
import { estaPronto } from './rede.js';
import { tolera, casaLabelSelector } from './scheduler.js';

const GRACA_DO_NODE = 50_000; // node-monitor-grace-period: sem notícias do kubelet por 50 s, o node fica NotReady
const NAO_RESPONDE = 'node.kubernetes.io/unreachable';
const INTERDITADO = 'node.kubernetes.io/unschedulable';
const TERMINAIS = new Set(['Succeeded', 'Failed']);

// ---------- PodDisruptionBudget ----------
const comoNumero = (v, total, paraCima) => {
  if (typeof v === 'number') return v;
  const pct = Number(String(v).replace('%', '')) / 100;
  return paraCima ? Math.ceil(pct * total) : Math.floor(pct * total);
};

/** Os pods que o PDB protege (mesmo namespace, seletor do PDB). */
export const podsDoPdb = (c, pdb) => c.listar('Pod', pdb.metadata.namespace).filter((p) => casaLabelSelector(pdb.spec.selector, p.metadata.labels));

/** Quantos pods se espera: com minAvailable inteiro, os que existem; senão, a soma das réplicas dos donos. */
function esperados(c, pdb, pods) {
  if (typeof pdb.spec.minAvailable === 'number') return pods.length;
  const donos = new Map();
  const donoDe = (o) => c.porUid.get(o?.metadata.ownerReferences?.find((x) => x.controller)?.uid);
  for (const p of pods) {
    const obj = donoDe(donoDe(p)) ?? donoDe(p); // o pod de um ReplicaSet conta pelo Deployment
    if (obj) donos.set(obj.metadata.uid, obj.spec?.replicas ?? 1);
  }
  return [...donos.values()].reduce((t, n) => t + n, 0);
}

export function controladorDePdbs(c) {
  for (const pdb of c.listar('PodDisruptionBudget')) {
    const pods = podsDoPdb(c, pdb);
    const total = esperados(c, pdb, pods);
    const desejados = pdb.spec.maxUnavailable !== undefined
      ? Math.max(0, total - comoNumero(pdb.spec.maxUnavailable, total, true))
      : comoNumero(pdb.spec.minAvailable ?? 1, total, true);
    const saudaveis = pods.filter((p) => !p.metadata.deletionTimestamp && estaPronto(p)).length;
    // Despejos que já foram autorizados mas o pod ainda não sumiu contam como "fora" (2 min no máximo).
    const emCurso = Object.fromEntries(Object.entries(pdb.status?.disruptedPods ?? {})
      .filter(([nome, quando]) => c.agora - Date.parse(quando) < 120_000 && pods.some((p) => p.metadata.name === nome && !p.metadata.deletionTimestamp)));
    const permitidos = Math.max(0, saudaveis - desejados - Object.keys(emCurso).length);
    const anterior = pdb.status?.conditions?.[0];
    const status = permitidos > 0 ? 'True' : 'False';
    const novo = {
      conditions: [{
        lastTransitionTime: anterior?.status === status ? anterior.lastTransitionTime : iso(c.agora),
        message: '',
        observedGeneration: pdb.metadata.generation,
        reason: permitidos > 0 ? 'SufficientPods' : 'InsufficientPods',
        status,
        type: 'DisruptionAllowed',
      }],
      currentHealthy: saudaveis,
      desiredHealthy: desejados,
      ...(Object.keys(emCurso).length ? { disruptedPods: emCurso } : {}),
      disruptionsAllowed: permitidos,
      expectedPods: total,
      observedGeneration: pdb.metadata.generation,
    };
    if (JSON.stringify(novo) !== JSON.stringify(pdb.status)) {
      pdb.status = novo;
      c.salvar(pdb);
    }
  }
}

/**
 * O despejo (a API de eviction): apaga o pod com o prazo normal, se nenhum PDB for contra.
 * → null (despejado) ou a mensagem do erro 429.
 */
export function despejar(c, pod) {
  const pdbs = c.listar('PodDisruptionBudget', pod.metadata.namespace).filter((b) => casaLabelSelector(b.spec.selector, pod.metadata.labels));
  if (pdbs.length > 1) return 'This pod has more than one PodDisruptionBudget, which the eviction subresource does not support.';
  const pdb = pdbs[0];
  // Pod que não está pronto não conta no orçamento: pode sair (unhealthyPodEvictionPolicy IfHealthyBudget).
  if (pdb && !pod.metadata.deletionTimestamp && estaPronto(pod)) {
    if ((pdb.status?.disruptionsAllowed ?? 0) <= 0) return "Cannot evict pod as it would violate the pod's disruption budget.";
    pdb.status = { ...pdb.status, disruptedPods: { ...(pdb.status.disruptedPods ?? {}), [pod.metadata.name]: iso(c.agora) }, disruptionsAllowed: pdb.status.disruptionsAllowed - 1 };
    c.salvar(pdb);
  }
  marcarRuptura(c, pod, 'EvictionByEvictionAPI', 'Eviction API: evicting');
  c.remover(pod);
  return null;
}

/** A condição DisruptionTarget: o pod vai sair por um motivo de fora (despejo, taint, preempção). */
export function marcarRuptura(c, pod, reason, message) {
  if (TERMINAIS.has(pod.status?.phase) || pod.metadata.deletionTimestamp) return;
  pod.status = {
    ...pod.status,
    conditions: [...(pod.status?.conditions ?? []).filter((x) => x.type !== 'DisruptionTarget'), { lastProbeTime: null, lastTransitionTime: iso(c.agora), message, reason, status: 'True', type: 'DisruptionTarget' }],
  };
  c.salvar(pod);
}

// ---------- o ciclo de vida dos nodes ----------
const temTaint = (node, key, effect) => (node.spec.taints ?? []).some((t) => t.key === key && t.effect === effect);

function trocarTaints(c, node, taints) {
  if (taints.length) node.spec.taints = taints;
  else delete node.spec.taints;
  c.salvar(node);
}

/**
 * O node-lifecycle-controller e o taint-eviction-controller:
 * - node interditado (cordon) ganha o taint node.kubernetes.io/unschedulable:NoSchedule;
 * - node cujo kubelet parou de dar notícias há 50 s fica NotReady (condições Unknown), ganha os taints de
 *   unreachable e os pods dele deixam de estar prontos (saem dos Services);
 * - pods num node com taint NoExecute que não toleram saem na hora; os que toleram por N segundos, depois.
 */
export function controladorDeNodes(c) {
  for (const node of c.listar('Node')) {
    const interditado = !!node.spec.unschedulable;
    if (interditado !== temTaint(node, INTERDITADO, 'NoSchedule')) {
      trocarTaints(c, node, interditado
        ? [...(node.spec.taints ?? []), { effect: 'NoSchedule', key: INTERDITADO, timeAdded: iso(c.agora) }]
        : node.spec.taints.filter((t) => t.key !== INTERDITADO));
    }

    const caiu = c.nodesCaidos.get(node.metadata.name);
    const pronto = node.status.conditions.find((x) => x.type === 'Ready');
    if (caiu !== undefined && c.agora - caiu >= GRACA_DO_NODE && pronto.status !== 'Unknown') {
      node.status.conditions = node.status.conditions.map((x) => ({ ...x, lastTransitionTime: iso(c.agora), message: 'Kubelet stopped posting node status.', reason: 'NodeStatusUnknown', status: 'Unknown' }));
      trocarTaints(c, node, [...(node.spec.taints ?? []), { effect: 'NoExecute', key: NAO_RESPONDE, timeAdded: iso(c.agora) }, { effect: 'NoSchedule', key: NAO_RESPONDE }]);
      c.evento(node, 'Normal', 'NodeNotReady', `Node ${node.metadata.name} status is now: NodeNotReady`, { componente: 'node-controller' });
      for (const pod of c.listar('Pod').filter((p) => p.spec.nodeName === node.metadata.name && !TERMINAIS.has(p.status?.phase))) {
        pod.status.conditions = (pod.status.conditions ?? []).map((x) => (x.type === 'Ready' && x.status !== 'False' ? { ...x, lastTransitionTime: iso(c.agora), status: 'False' } : x));
        c.salvar(pod);
        c.evento(pod, 'Warning', 'NodeNotReady', 'Node is not ready', { componente: 'node-controller' });
      }
    }

    const semExecutar = (node.spec.taints ?? []).filter((t) => t.effect === 'NoExecute');
    if (!semExecutar.length) continue;
    for (const pod of c.listar('Pod').filter((p) => p.spec.nodeName === node.metadata.name && !p.metadata.deletionTimestamp && !TERMINAIS.has(p.status?.phase))) {
      // Para cada taint: sai já (não tolera), sai no prazo (tolerationSeconds) ou fica (tolera para sempre).
      const prazos = semExecutar.map((t) => {
        const tol = (pod.spec.tolerations ?? []).find((x) => tolera({ spec: { tolerations: [x] } }, t));
        if (!tol) return 0;
        if (tol.tolerationSeconds === undefined) return Infinity;
        return Date.parse(t.timeAdded ?? iso(c.agora)) + tol.tolerationSeconds * 1000 - c.agora;
      });
      if (Math.min(...prazos) > 0) continue;
      marcarRuptura(c, pod, 'DeletionByTaintManager', 'Taint manager: deleting due to NoExecute taint');
      c.remover(pod);
    }
  }
}
