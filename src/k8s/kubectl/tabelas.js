// As colunas do `kubectl get` para cada tipo (normal e -o wide), como os printers do kubectl.
import { idade } from '../unidades.js';
import { estaPronto } from '../rede.js';

const desde = (agora, ts) => (ts ? idade(agora - Date.parse(ts)) : '<unknown>');
export const labelsTexto = (labels) => (labels && Object.keys(labels).length ? Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join(',') : '<none>');
const seletorTexto = (sel) => labelsTexto(sel);

/** STATUS e READY do pod (a mesma lógica do printPod do kubectl). */
export function resumoPod(pod, agora) {
  const sts = pod.status?.containerStatuses ?? [];
  let motivo = pod.status?.reason || pod.status?.phase || 'Pending';
  let prontos = 0;
  let reinicios = 0;
  let ultimoReinicio = 0;
  let algumRodando = false;
  for (let i = sts.length - 1; i >= 0; i--) {
    const s = sts[i];
    reinicios += s.restartCount;
    const fim = s.lastState?.terminated?.finishedAt;
    if (fim && Date.parse(fim) > ultimoReinicio) ultimoReinicio = Date.parse(fim);
    if (s.state.waiting?.reason) motivo = s.state.waiting.reason;
    else if (s.state.terminated?.reason) motivo = s.state.terminated.reason;
    else if (s.state.terminated) motivo = s.state.terminated.signal ? `Signal:${s.state.terminated.signal}` : `ExitCode:${s.state.terminated.exitCode}`;
    else if (s.ready && s.state.running) {
      algumRodando = true;
      prontos++;
    }
  }
  if (motivo === 'Completed' && algumRodando) motivo = estaPronto(pod) ? 'Running' : 'NotReady';
  if (pod.metadata.deletionTimestamp && !['Succeeded', 'Failed'].includes(pod.status?.phase)) motivo = 'Terminating';
  const total = pod.spec.containers.length;
  return {
    pronto: `${prontos}/${total}`,
    status: motivo,
    reinicios: reinicios && ultimoReinicio ? `${reinicios} (${idade(agora - ultimoReinicio)} ago)` : String(reinicios),
  };
}

const portasServico = (svc) => (svc.spec.ports?.length
  ? svc.spec.ports.map((p) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol}`).join(',')
  : '<none>');

const ipExterno = (svc) => {
  const ext = svc.spec.externalIPs ?? [];
  if (svc.spec.type === 'LoadBalancer') {
    const ing = (svc.status?.loadBalancer?.ingress ?? []).map((i) => i.ip ?? i.hostname);
    const todos = [...ing, ...ext];
    return todos.length ? todos.join(',') : '<pending>';
  }
  if (svc.spec.type === 'ExternalName') return svc.spec.externalName;
  return ext.length ? ext.join(',') : '<none>';
};

export function enderecosEndpoints(ep) {
  const lista = [];
  for (const s of ep.subsets ?? []) {
    for (const p of s.ports ?? []) for (const a of s.addresses ?? []) lista.push(`${a.ip}:${p.port}`);
    if (!(s.ports ?? []).length) for (const a of s.addresses ?? []) lista.push(a.ip);
  }
  if (!lista.length) return '<none>';
  return lista.length > 3 ? `${lista.slice(0, 3).join(',')} + ${lista.length - 3} more...` : lista.join(',');
}

const papeis = (node) => {
  const r = Object.keys(node.metadata.labels ?? {}).filter((k) => k.startsWith('node-role.kubernetes.io/')).map((k) => k.split('/')[1]).filter(Boolean);
  return r.length ? r.sort().join(',') : '<none>';
};

const statusNode = (node) => {
  const pronto = node.status.conditions.find((c) => c.type === 'Ready')?.status === 'True';
  return [pronto ? 'Ready' : 'NotReady', ...(node.spec.unschedulable ? ['SchedulingDisabled'] : [])].join(',');
};

const conteineres = (spec) => spec.containers.map((c) => c.name).join(',');
const imagens = (spec) => spec.containers.map((c) => c.image).join(',');

/**
 * Cada tipo: colunas e linha(obj, agora); `largas` e `linhaLarga` para -o wide.
 */
export const TABELAS = {
  Pod: {
    colunas: ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'],
    linha: (p, agora) => {
      const r = resumoPod(p, agora);
      return [p.metadata.name, r.pronto, r.status, r.reinicios, desde(agora, p.metadata.creationTimestamp)];
    },
    largas: ['IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES'],
    linhaLarga: (p) => [p.status?.podIP || '<none>', p.spec.nodeName || '<none>', p.status?.nominatedNodeName || '<none>', '<none>'],
  },
  Deployment: {
    colunas: ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'],
    linha: (d, agora) => [d.metadata.name, `${d.status?.readyReplicas ?? 0}/${d.spec.replicas}`, String(d.status?.updatedReplicas ?? 0), String(d.status?.availableReplicas ?? 0), desde(agora, d.metadata.creationTimestamp)],
    largas: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    linhaLarga: (d) => [conteineres(d.spec.template.spec), imagens(d.spec.template.spec), seletorTexto(d.spec.selector.matchLabels)],
  },
  ReplicaSet: {
    colunas: ['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'],
    linha: (rs, agora) => [rs.metadata.name, String(rs.spec.replicas), String(rs.status?.replicas ?? 0), String(rs.status?.readyReplicas ?? 0), desde(agora, rs.metadata.creationTimestamp)],
    largas: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    linhaLarga: (rs) => [conteineres(rs.spec.template.spec), imagens(rs.spec.template.spec), seletorTexto(rs.spec.selector.matchLabels)],
  },
  Service: {
    colunas: ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'],
    linha: (s, agora) => [s.metadata.name, s.spec.type, s.spec.clusterIP || '<none>', ipExterno(s), portasServico(s), desde(agora, s.metadata.creationTimestamp)],
    largas: ['SELECTOR'],
    linhaLarga: (s) => [seletorTexto(s.spec.selector)],
  },
  Endpoints: {
    colunas: ['NAME', 'ENDPOINTS', 'AGE'],
    linha: (e, agora) => [e.metadata.name, enderecosEndpoints(e), desde(agora, e.metadata.creationTimestamp)],
    aviso: 'Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice\n',
  },
  Namespace: {
    colunas: ['NAME', 'STATUS', 'AGE'],
    linha: (n, agora) => [n.metadata.name, n.status?.phase ?? 'Active', desde(agora, n.metadata.creationTimestamp)],
  },
  Node: {
    colunas: ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'],
    linha: (n, agora) => [n.metadata.name, statusNode(n), papeis(n), desde(agora, n.metadata.creationTimestamp), n.status.nodeInfo.kubeletVersion],
    largas: ['INTERNAL-IP', 'EXTERNAL-IP', 'OS-IMAGE', 'KERNEL-VERSION', 'CONTAINER-RUNTIME'],
    linhaLarga: (n) => [
      n.status.addresses.find((a) => a.type === 'InternalIP')?.address ?? '<none>',
      n.status.addresses.find((a) => a.type === 'ExternalIP')?.address ?? '<none>',
      n.status.nodeInfo.osImage,
      `${n.status.nodeInfo.kernelVersion} (${n.status.nodeInfo.architecture})`,
      n.status.nodeInfo.containerRuntimeVersion,
    ],
  },
  ConfigMap: {
    colunas: ['NAME', 'DATA', 'AGE'],
    linha: (c, agora) => [c.metadata.name, String(Object.keys(c.data ?? {}).length + Object.keys(c.binaryData ?? {}).length), desde(agora, c.metadata.creationTimestamp)],
  },
  Secret: {
    colunas: ['NAME', 'TYPE', 'DATA', 'AGE'],
    linha: (s, agora) => [s.metadata.name, s.type, String(Object.keys(s.data ?? {}).length), desde(agora, s.metadata.creationTimestamp)],
  },
  Event: {
    colunas: ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'],
    linha: (e, agora) => [desde(agora, e.lastTimestamp), e.type, e.reason, `${e.involvedObject.kind.toLowerCase()}/${e.involvedObject.name}`, e.message],
    semNome: true,
  },
};
