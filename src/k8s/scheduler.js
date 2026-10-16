// O scheduler: escolhe um node para cada pod sem node. Filtra (taints, seletor, recursos) e pontua
// (espalha réplicas do mesmo dono e prefere nodes mais livres), com as mensagens do kube-scheduler.
import { cpuMili, bytes, iso } from './unidades.js';

const TERMINAIS = new Set(['Succeeded', 'Failed']);
const REPETIR_EM = 300_000; // como o podMaxInUnschedulablePodsDuration do kube-scheduler

export const pedidosDoPod = (pod) => pod.spec.containers.reduce((t, c) => ({
  cpu: t.cpu + cpuMili(c.resources?.requests?.cpu ?? c.resources?.limits?.cpu),
  memoria: t.memoria + bytes(c.resources?.requests?.memory ?? c.resources?.limits?.memory),
}), { cpu: 0, memoria: 0 });

export const tolera = (pod, taint) => (pod.spec.tolerations ?? []).some((t) => {
  const chave = t.operator === 'Exists' && !t.key ? true : t.key === taint.key;
  const valor = t.operator === 'Exists' || (t.value ?? '') === (taint.value ?? '');
  const efeito = !t.effect || t.effect === taint.effect;
  return chave && valor && efeito;
});

export const nodePronto = (node) => node.status.conditions.find((c) => c.type === 'Ready')?.status === 'True';

/** Pods que ocupam o node (contam no espaço dele). */
export const podsNoNode = (c, nome) => c.listar('Pod').filter((p) => p.spec.nodeName === nome && !TERMINAIS.has(p.status?.phase));

export function usoDoNode(c, nome) {
  return podsNoNode(c, nome).reduce((t, p) => {
    const r = pedidosDoPod(p);
    return { cpu: t.cpu + r.cpu, memoria: t.memoria + r.memoria, pods: t.pods + 1 };
  }, { cpu: 0, memoria: 0, pods: 0 });
}

export function agendar(c) {
  const nodes = c.listar('Node');
  for (const pod of c.listar('Pod')) {
    if (pod.spec.nodeName || pod.metadata.deletionTimestamp) continue;
    const tentativa = c.agendamento.get(pod.metadata.uid);
    if (tentativa && c.agora < tentativa.proxima && tentativa.mudancas === c.mudancasDeCapacidade) continue;

    const pedido = pedidosDoPod(pod);
    const motivos = {};
    const preempcao = {};
    const conta = (obj, k) => { obj[k] = (obj[k] ?? 0) + 1; };
    const candidatos = [];
    for (const node of nodes) {
      if (node.spec.unschedulable) { conta(motivos, 'node(s) were unschedulable'); conta(preempcao, 'Preemption is not helpful for scheduling'); continue; }
      const taints = [...(node.spec.taints ?? []), ...(nodePronto(node) ? [] : [{ key: 'node.kubernetes.io/not-ready', effect: 'NoSchedule' }])];
      if (taints.some((t) => (t.effect === 'NoSchedule' || t.effect === 'NoExecute') && !tolera(pod, t))) {
        conta(motivos, 'node(s) had untolerated taint(s)'); conta(preempcao, 'Preemption is not helpful for scheduling'); continue;
      }
      const sel = pod.spec.nodeSelector ?? {};
      if (Object.entries(sel).some(([k, v]) => node.metadata.labels?.[k] !== v)) {
        conta(motivos, "node(s) didn't match Pod's node affinity/selector"); conta(preempcao, 'Preemption is not helpful for scheduling'); continue;
      }
      const uso = usoDoNode(c, node.metadata.name);
      const cap = { cpu: cpuMili(node.status.allocatable.cpu), memoria: bytes(node.status.allocatable.memory), pods: Number(node.status.allocatable.pods) };
      const faltas = [];
      if (uso.pods + 1 > cap.pods) faltas.push('Too many pods');
      if (uso.cpu + pedido.cpu > cap.cpu) faltas.push('Insufficient cpu');
      if (uso.memoria + pedido.memoria > cap.memoria) faltas.push('Insufficient memory');
      if (faltas.length) {
        faltas.forEach((f) => conta(motivos, f));
        const cabeVazio = pedido.cpu <= cap.cpu && pedido.memoria <= cap.memoria;
        conta(preempcao, cabeVazio ? 'No preemption victims found for incoming pod' : 'Preemption is not helpful for scheduling');
        continue;
      }
      const dono = pod.metadata.ownerReferences?.find((o) => o.controller)?.uid;
      const irmaos = dono ? podsNoNode(c, node.metadata.name).filter((p) => p.metadata.ownerReferences?.some((o) => o.uid === dono)).length : 0;
      const livre = (cap.cpu ? (cap.cpu - uso.cpu - pedido.cpu) / cap.cpu : 0) + (cap.memoria ? (cap.memoria - uso.memoria - pedido.memoria) / cap.memoria : 0);
      candidatos.push({ node, nota: -irmaos * 100 + livre * 10 + c.aleatorio.proximo() });
    }

    if (candidatos.length) {
      const { node } = candidatos.sort((a, b) => b.nota - a.nota)[0];
      pod.spec.nodeName = node.metadata.name;
      pod.status = {
        conditions: [{ lastProbeTime: null, lastTransitionTime: iso(c.agora), status: 'True', type: 'PodScheduled' }],
        phase: 'Pending',
        qosClass: pod.status?.qosClass,
      };
      c.agendamento.delete(pod.metadata.uid);
      c.salvar(pod);
      c.evento(pod, 'Normal', 'Scheduled', `Successfully assigned ${pod.metadata.namespace}/${pod.metadata.name} to ${node.metadata.name}`, { componente: 'default-scheduler' });
      continue;
    }

    const lista = (obj) => Object.entries(obj).map(([m, n]) => `${n} ${m}`).sort().join(', ');
    const msg = nodes.length
      ? `0/${nodes.length} nodes are available: ${lista(motivos)}. preemption: 0/${nodes.length} nodes are available: ${lista(preempcao)}.`
      : 'no nodes available to schedule pods';
    const anterior = pod.status?.conditions?.find((x) => x.type === 'PodScheduled');
    const status = {
      ...pod.status,
      conditions: [{ lastProbeTime: null, lastTransitionTime: anterior?.status === 'False' ? anterior.lastTransitionTime : iso(c.agora), message: msg, reason: 'Unschedulable', status: 'False', type: 'PodScheduled' }],
      phase: 'Pending',
    };
    c.agendamento.set(pod.metadata.uid, { proxima: c.agora + REPETIR_EM, mudancas: c.mudancasDeCapacidade });
    if (JSON.stringify(status) !== JSON.stringify(pod.status)) {
      pod.status = status;
      c.salvar(pod);
    }
    c.evento(pod, 'Warning', 'FailedScheduling', msg, { componente: 'default-scheduler' });
  }
}
