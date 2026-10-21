// As colunas do `kubectl get` para cada tipo (normal e -o wide), como os printers do kubectl.
import { jsonpath } from './formatos.js';
import { idade } from '../unidades.js';
import { estaPronto } from '../rede.js';
import { siglasDeAcesso } from '../discos.js';

const desde = (agora, ts) => (ts ? idade(agora - Date.parse(ts)) : '<unknown>');
export const labelsTexto = (labels) => (labels && Object.keys(labels).length ? Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join(',') : '<none>');
const seletorTexto = (sel) => labelsTexto(sel);

/** STATUS e READY do pod (a mesma lógica do printPod do kubectl, com init containers e sidecars). */
export function resumoPod(pod, agora) {
  const sts = pod.status?.containerStatuses ?? [];
  const inits = pod.status?.initContainerStatuses ?? [];
  const specInit = Object.fromEntries((pod.spec.initContainers ?? []).map((c) => [c.name, c]));
  const sidecar = (nome) => specInit[nome]?.restartPolicy === 'Always';
  let motivo = pod.status?.reason || pod.status?.phase || 'Pending';
  let prontos = 0;
  let reinicios = 0;
  let ultimoReinicio = 0;
  let reiniciosSidecar = 0;
  let ultimoSidecar = 0;
  let algumRodando = false;
  let inicializando = false;
  const fimDe = (s) => (s.lastState?.terminated?.finishedAt ? Date.parse(s.lastState.terminated.finishedAt) : 0);
  for (let i = 0; i < inits.length; i++) {
    const s = inits[i];
    reinicios += s.restartCount;
    ultimoReinicio = Math.max(ultimoReinicio, fimDe(s));
    if (sidecar(s.name)) {
      reiniciosSidecar += s.restartCount;
      ultimoSidecar = Math.max(ultimoSidecar, fimDe(s));
    }
    if (s.state.terminated && s.state.terminated.exitCode === 0) continue;
    if (sidecar(s.name) && s.started) {
      if (s.ready) prontos++;
      continue;
    }
    if (s.state.terminated) motivo = s.state.terminated.reason ? `Init:${s.state.terminated.reason}` : s.state.terminated.signal ? `Init:Signal:${s.state.terminated.signal}` : `Init:ExitCode:${s.state.terminated.exitCode}`;
    else if (s.state.waiting?.reason && s.state.waiting.reason !== 'PodInitializing') motivo = `Init:${s.state.waiting.reason}`;
    else motivo = `Init:${i}/${(pod.spec.initContainers ?? []).length}`;
    inicializando = true;
    break;
  }
  const inicializado = pod.status?.conditions?.some((c) => c.type === 'Initialized' && c.status === 'True');
  if (!inicializando || inicializado) {
    reinicios = reiniciosSidecar;
    ultimoReinicio = ultimoSidecar;
    for (let i = sts.length - 1; i >= 0; i--) {
      const s = sts[i];
      reinicios += s.restartCount;
      ultimoReinicio = Math.max(ultimoReinicio, fimDe(s));
      if (s.state.waiting?.reason) motivo = s.state.waiting.reason;
      else if (s.state.terminated?.reason) motivo = s.state.terminated.reason;
      else if (s.state.terminated) motivo = s.state.terminated.signal ? `Signal:${s.state.terminated.signal}` : `ExitCode:${s.state.terminated.exitCode}`;
      else if (s.ready && s.state.running) {
        algumRodando = true;
        prontos++;
      }
    }
    if (motivo === 'Completed' && algumRodando) motivo = estaPronto(pod) ? 'Running' : 'NotReady';
  }
  if (pod.metadata.deletionTimestamp && !['Succeeded', 'Failed'].includes(pod.status?.phase)) motivo = 'Terminating';
  const total = pod.spec.containers.length + (pod.spec.initContainers ?? []).filter((c) => c.restartPolicy === 'Always').length;
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

/** RoleBinding e ClusterRoleBinding: o crachá e, no -o wide, quem recebeu. */
const sujeitos = (b, kind) => (b.subjects ?? []).filter((x) => x.kind === kind).map((x) => (kind === 'ServiceAccount' ? `${x.namespace ?? b.metadata.namespace}/${x.name}` : x.name)).join(', ');
const vinculo = {
  colunas: ['NAME', 'ROLE', 'AGE'],
  linha: (b, agora) => [b.metadata.name, `${b.roleRef.kind}/${b.roleRef.name}`, desde(agora, b.metadata.creationTimestamp)],
  largas: ['USERS', 'GROUPS', 'SERVICEACCOUNTS'],
  linhaLarga: (b) => [sujeitos(b, 'User'), sujeitos(b, 'Group'), sujeitos(b, 'ServiceAccount')],
};

/** A coluna TARGETS do HPA: "cpu: 61%/50%" (ou <unknown> antes da primeira medida). */
export function alvosHpa(h) {
  return (h.spec.metrics ?? []).map((m, i) => {
    const r = m.resource ?? {};
    const atual = h.status?.currentMetrics?.[i]?.resource?.current;
    if (r.target?.type === 'Utilization') return `${r.name}: ${atual?.averageUtilization !== undefined ? `${atual.averageUtilization}%` : '<unknown>'}/${r.target.averageUtilization}%`;
    return `${r.name}: ${atual?.averageValue ?? '<unknown>'}/${r.target?.averageValue ?? r.target?.value}`;
  }).join(', ') || '<none>';
}

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
  DaemonSet: {
    colunas: ['NAME', 'DESIRED', 'CURRENT', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'NODE SELECTOR', 'AGE'],
    linha: (d, agora) => {
      const st = d.status ?? {};
      return [d.metadata.name, String(st.desiredNumberScheduled ?? 0), String(st.currentNumberScheduled ?? 0), String(st.numberReady ?? 0), String(st.updatedNumberScheduled ?? 0), String(st.numberAvailable ?? 0), labelsTexto(d.spec.template.spec.nodeSelector), desde(agora, d.metadata.creationTimestamp)];
    },
    largas: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    linhaLarga: (d) => [conteineres(d.spec.template.spec), imagens(d.spec.template.spec), seletorTexto(d.spec.selector.matchLabels)],
  },
  Job: {
    colunas: ['NAME', 'STATUS', 'COMPLETIONS', 'DURATION', 'AGE'],
    linha: (j, agora) => {
      const st = j.status ?? {};
      const tem = (tipo) => st.conditions?.some((c) => c.type === tipo && c.status === 'True');
      const status = tem('Complete') ? 'Complete' : tem('Failed') ? 'Failed' : j.metadata.deletionTimestamp ? 'Terminating' : tem('Suspended') ? 'Suspended' : tem('FailureTarget') ? 'FailureTarget' : tem('SuccessCriteriaMet') ? 'SuccessCriteriaMet' : 'Running';
      const feitos = st.succeeded ?? 0;
      const conclusoes = j.spec.completions !== undefined ? `${feitos}/${j.spec.completions}` : (j.spec.parallelism ?? 0) > 1 ? `${feitos}/1 of ${j.spec.parallelism}` : `${feitos}/1`;
      const inicio = st.startTime ? Date.parse(st.startTime) : null;
      const duracao = inicio === null ? '' : idade((st.completionTime ? Date.parse(st.completionTime) : agora) - inicio);
      return [j.metadata.name, status, conclusoes, duracao, desde(agora, j.metadata.creationTimestamp)];
    },
    largas: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    linhaLarga: (j) => [conteineres(j.spec.template.spec), imagens(j.spec.template.spec), seletorTexto(j.spec.selector?.matchLabels)],
  },
  CronJob: {
    colunas: ['NAME', 'SCHEDULE', 'TIMEZONE', 'SUSPEND', 'ACTIVE', 'LAST SCHEDULE', 'AGE'],
    linha: (c, agora) => [c.metadata.name, c.spec.schedule, c.spec.timeZone ?? '<none>', c.spec.suspend ? 'True' : 'False', String(c.status?.active?.length ?? 0), c.status?.lastScheduleTime ? desde(agora, c.status.lastScheduleTime) : '<none>', desde(agora, c.metadata.creationTimestamp)],
    largas: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    linhaLarga: (c) => [conteineres(c.spec.jobTemplate.spec.template.spec), imagens(c.spec.jobTemplate.spec.template.spec), seletorTexto(c.spec.jobTemplate.spec.selector?.matchLabels)],
  },
  StatefulSet: {
    colunas: ['NAME', 'READY', 'AGE'],
    linha: (s, agora) => [s.metadata.name, `${s.status?.readyReplicas ?? 0}/${s.spec.replicas}`, desde(agora, s.metadata.creationTimestamp)],
    largas: ['CONTAINERS', 'IMAGES'],
    linhaLarga: (s) => [conteineres(s.spec.template.spec), imagens(s.spec.template.spec)],
  },
  PersistentVolumeClaim: {
    colunas: ['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'AGE'],
    linha: (c, agora) => [
      c.metadata.name, c.metadata.deletionTimestamp ? 'Terminating' : c.status?.phase ?? 'Pending', c.spec.volumeName ?? '',
      c.status?.capacity?.storage ?? '', siglasDeAcesso(c.status?.accessModes), c.spec.storageClassName ?? '', c.spec.volumeAttributesClassName ?? '<unset>',
      desde(agora, c.metadata.creationTimestamp),
    ],
    largas: ['VOLUMEMODE'],
    linhaLarga: (c) => [c.spec.volumeMode ?? 'Filesystem'],
  },
  PersistentVolume: {
    colunas: ['NAME', 'CAPACITY', 'ACCESS MODES', 'RECLAIM POLICY', 'STATUS', 'CLAIM', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'REASON', 'AGE'],
    linha: (v, agora) => [
      v.metadata.name, v.spec.capacity?.storage ?? '', siglasDeAcesso(v.spec.accessModes), v.spec.persistentVolumeReclaimPolicy,
      v.metadata.deletionTimestamp ? 'Terminating' : v.status?.phase ?? 'Pending', v.spec.claimRef ? `${v.spec.claimRef.namespace}/${v.spec.claimRef.name}` : '',
      v.spec.storageClassName ?? '', v.spec.volumeAttributesClassName ?? '<unset>', v.status?.reason ?? '', desde(agora, v.metadata.creationTimestamp),
    ],
    largas: ['VOLUMEMODE'],
    linhaLarga: (v) => [v.spec.volumeMode ?? 'Filesystem'],
  },
  StorageClass: {
    colunas: ['NAME', 'PROVISIONER', 'RECLAIMPOLICY', 'VOLUMEBINDINGMODE', 'ALLOWVOLUMEEXPANSION', 'AGE'],
    linha: (s, agora) => [
      `${s.metadata.name}${s.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true' ? ' (default)' : ''}`,
      s.provisioner, s.reclaimPolicy ?? 'Delete', s.volumeBindingMode ?? 'Immediate', String(!!s.allowVolumeExpansion), desde(agora, s.metadata.creationTimestamp),
    ],
  },
  ServiceAccount: {
    colunas: ['NAME', 'AGE'],
    linha: (sa, agora) => [sa.metadata.name, desde(agora, sa.metadata.creationTimestamp)],
  },
  Role: { colunas: ['NAME', 'CREATED AT'], linha: (r) => [r.metadata.name, r.metadata.creationTimestamp] },
  ClusterRole: { colunas: ['NAME', 'CREATED AT'], linha: (r) => [r.metadata.name, r.metadata.creationTimestamp] },
  RoleBinding: vinculo,
  ClusterRoleBinding: vinculo,
  NetworkPolicy: {
    colunas: ['NAME', 'POD-SELECTOR', 'AGE'],
    linha: (np, agora) => [np.metadata.name, seletorTexto(np.spec.podSelector?.matchLabels) || '<none>', desde(agora, np.metadata.creationTimestamp)],
  },
  CustomResourceDefinition: {
    colunas: ['NAME', 'SCOPE', 'VERSIONS', 'CREATED AT'],
    linha: (crd) => [crd.metadata.name, crd.spec.scope, crd.spec.versions.map((v) => `${v.name}${v.storage ? '(storage)' : ''}`).join(','), crd.metadata.creationTimestamp],
  },
  PodDisruptionBudget: {
    colunas: ['NAME', 'MIN AVAILABLE', 'MAX UNAVAILABLE', 'ALLOWED DISRUPTIONS', 'AGE'],
    linha: (b, agora) => [b.metadata.name, String(b.spec.minAvailable ?? 'N/A'), String(b.spec.maxUnavailable ?? 'N/A'), String(b.status?.disruptionsAllowed ?? 0), desde(agora, b.metadata.creationTimestamp)],
  },
  PriorityClass: {
    colunas: ['NAME', 'VALUE', 'GLOBAL-DEFAULT', 'AGE', 'PREEMPTIONPOLICY'],
    linha: (pc, agora) => [pc.metadata.name, String(pc.value), String(!!pc.globalDefault), desde(agora, pc.metadata.creationTimestamp), pc.preemptionPolicy ?? 'PreemptLowerPriority'],
  },
  HorizontalPodAutoscaler: {
    colunas: ['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE'],
    linha: (h, agora) => [h.metadata.name, `${h.spec.scaleTargetRef.kind}/${h.spec.scaleTargetRef.name}`, alvosHpa(h), String(h.spec.minReplicas ?? 1), String(h.spec.maxReplicas), String(h.status?.currentReplicas ?? 0), desde(agora, h.metadata.creationTimestamp)],
  },
  ResourceQuota: {
    colunas: ['NAME', 'REQUEST', 'LIMIT', 'AGE'],
    linha: (q, agora) => {
      const chaves = Object.keys(q.spec.hard ?? {}).sort();
      const par = (k) => `${k}: ${q.status?.used?.[k] ?? '0'}/${q.spec.hard[k]}`;
      return [q.metadata.name, chaves.filter((k) => !k.startsWith('limits.')).map(par).join(', '), chaves.filter((k) => k.startsWith('limits.')).map(par).join(', '), desde(agora, q.metadata.creationTimestamp)];
    },
  },
  LimitRange: {
    colunas: ['NAME', 'CREATED AT'],
    linha: (l) => [l.metadata.name, l.metadata.creationTimestamp],
  },
  ConfigMap: {
    colunas: ['NAME', 'DATA', 'AGE'],
    linha: (c, agora) => [c.metadata.name, String(Object.keys(c.data ?? {}).length + Object.keys(c.binaryData ?? {}).length), desde(agora, c.metadata.creationTimestamp)],
  },
  Secret: {
    colunas: ['NAME', 'TYPE', 'DATA', 'AGE'],
    linha: (s, agora) => [s.metadata.name, s.type, String(Object.keys(s.data ?? {}).length), desde(agora, s.metadata.creationTimestamp)],
  },
  Ingress: {
    colunas: ['NAME', 'CLASS', 'HOSTS', 'ADDRESS', 'PORTS', 'AGE'],
    linha: (i, agora) => [
      i.metadata.name,
      i.spec.ingressClassName ?? '<none>',
      (i.spec.rules ?? []).map((r) => r.host ?? '*').join(',') || '*',
      (i.status?.loadBalancer?.ingress ?? []).map((x) => x.ip ?? x.hostname).join(','),
      i.spec.tls?.length ? '80, 443' : '80',
      desde(agora, i.metadata.creationTimestamp),
    ],
  },
  IngressClass: {
    colunas: ['NAME', 'CONTROLLER', 'PARAMETERS', 'AGE'],
    linha: (i, agora) => [i.metadata.name, i.spec.controller, '<none>', desde(agora, i.metadata.creationTimestamp)],
  },
  GatewayClass: {
    colunas: ['NAME', 'CONTROLLER', 'ACCEPTED', 'AGE'],
    linha: (g, agora) => [g.metadata.name, g.spec.controllerName, g.status?.conditions?.find((x) => x.type === 'Accepted')?.status ?? 'Unknown', desde(agora, g.metadata.creationTimestamp)],
  },
  Gateway: {
    colunas: ['NAME', 'CLASS', 'ADDRESS', 'PROGRAMMED', 'AGE'],
    linha: (g, agora) => [g.metadata.name, g.spec.gatewayClassName, g.status?.addresses?.[0]?.value ?? '', g.status?.conditions?.find((x) => x.type === 'Programmed')?.status ?? 'Unknown', desde(agora, g.metadata.creationTimestamp)],
  },
  HTTPRoute: {
    colunas: ['NAME', 'HOSTNAMES', 'AGE'],
    linha: (r, agora) => [r.metadata.name, JSON.stringify(r.spec.hostnames ?? []), desde(agora, r.metadata.creationTimestamp)],
  },
  Event: {
    colunas: ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'],
    linha: (e, agora) => [desde(agora, e.lastTimestamp), e.type, e.reason, `${e.involvedObject.kind.toLowerCase()}/${e.involvedObject.name}`, e.message],
    semNome: true,
  },
};

/** A tabela de um tipo: a nossa, ou a das colunas do CRD (additionalPrinterColumns; sem elas, NAME e AGE). */
export function tabelaDe(r) {
  if (TABELAS[r.kind]) return TABELAS[r.kind];
  const colunas = r.colunas ?? [{ name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp' }];
  const valor = (o, c, agora) => {
    const v = jsonpath(`{${c.jsonPath}}`, o);
    if (v === '') return '<none>';
    return c.type === 'date' ? desde(agora, v) : v;
  };
  return {
    colunas: ['NAME', ...colunas.map((c) => c.name.toUpperCase())],
    linha: (o, agora) => [o.metadata.name, ...colunas.map((c) => valor(o, c, agora))],
  };
}
