// O scheduler: escolhe um node para cada pod sem node. Filtra (taints, seletor, recursos) e pontua
// (espalha réplicas do mesmo dono e prefere nodes mais livres), com as mensagens do kube-scheduler.
import { cpuMili, bytes, iso } from './unidades.js';
import { pvcsDoPod } from './discos.js';

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

    // Os discos do pod: o PVC precisa existir; ligado a um disco de um node só, o pod vai para aquele node;
    // pendente numa classe WaitForFirstConsumer, o scheduler escolhe o node e espera o disco ficar pronto.
    const pvcs = pvcsDoPod(pod).map((nome) => [nome, c.obter('PersistentVolumeClaim', pod.metadata.namespace, nome)]);
    const faltando = pvcs.find(([, pvc]) => !pvc || pvc.metadata.deletionTimestamp);
    const pendentes = pvcs.filter(([, pvc]) => pvc && pvc.status?.phase !== 'Bound').map(([, pvc]) => pvc);
    const esperaPrimeiro = (pvc) => c.obter('StorageClass', null, pvc.spec.storageClassName ?? '')?.volumeBindingMode === 'WaitForFirstConsumer';
    const semDisco = faltando
      ? `persistentvolumeclaim "${faltando[0]}" ${faltando[1] ? 'is being deleted' : 'not found'}`
      : pendentes.some((pvc) => !esperaPrimeiro(pvc)) ? 'pod has unbound immediate PersistentVolumeClaims' : null;
    if (semDisco) {
      naoCabe(c, pod, `0/${nodes.length} nodes are available: ${semDisco}. not found`);
      continue;
    }
    if (pendentes.length && pendentes.every((pvc) => pvc.metadata.annotations?.['volume.kubernetes.io/selected-node'])) continue; // o disco está sendo criado
    const nodesDosDiscos = pvcs.map(([, pvc]) => c.obter('PersistentVolume', null, pvc.spec.volumeName ?? ''))
      .map((pv) => pv?.spec.nodeAffinity?.required?.nodeSelectorTerms?.[0]?.matchExpressions?.find((e) => e.key === 'kubernetes.io/hostname')?.values ?? null)
      .filter(Boolean);

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
      if (nodesDosDiscos.some((lista) => !lista.includes(node.metadata.name))) {
        conta(motivos, 'node(s) had volume node affinity conflict'); conta(preempcao, 'Preemption is not helpful for scheduling'); continue;
      }
      const sel = pod.spec.nodeSelector ?? {};
      if (Object.entries(sel).some(([k, v]) => node.metadata.labels?.[k] !== v) || !casaAfinidade(pod, node)) {
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
      if (pendentes.length) { // escolheu o node: agora o provisionador cria o disco lá, e o pod espera
        for (const pvc of pendentes) {
          pvc.metadata.annotations = { ...(pvc.metadata.annotations ?? {}), 'volume.kubernetes.io/selected-node': node.metadata.name };
          c.salvar(pvc);
        }
        continue;
      }
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
    naoCabe(c, pod, nodes.length
      ? `0/${nodes.length} nodes are available: ${lista(motivos)}. preemption: 0/${nodes.length} nodes are available: ${lista(preempcao)}.`
      : 'no nodes available to schedule pods');
  }
}

/** A afinidade obrigatória com nodes (requiredDuringScheduling): basta um dos termos casar. */
function casaAfinidade(pod, node) {
  const termos = pod.spec.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms;
  if (!termos?.length) return true;
  const confere = (valor, e) => ({
    In: () => e.values?.includes(valor), NotIn: () => !e.values?.includes(valor), Exists: () => valor !== undefined, DoesNotExist: () => valor === undefined,
  }[e.operator]?.() ?? false);
  return termos.some((t) => (t.matchExpressions ?? []).every((e) => confere(node.metadata.labels?.[e.key], e))
    && (t.matchFields ?? []).every((e) => confere(e.key === 'metadata.name' ? node.metadata.name : undefined, e)));
}

/** O pod não coube em nenhum node: condição PodScheduled=False, evento FailedScheduling e nova tentativa mais tarde. */
function naoCabe(c, pod, msg) {
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
