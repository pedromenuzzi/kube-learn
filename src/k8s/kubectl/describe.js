// `kubectl describe`: escreve as mesmas linhas, com os mesmos "\t", que o describe do kubectl, e alinha
// com o tabwriter (padding 2). Cada flush() fecha um bloco de alinhamento, como no código original.
import { tabular } from '../tabwriter.js';
import { idade, rfc1123z, cpuMili, bytes, textoCpu, textoMemoria } from '../unidades.js';
import { podsNoNode, pedidosDoPod } from '../scheduler.js';
import { atobUtf8 } from '../esquema.js';
import { siglasDeAcesso, pvcsDoPod } from '../discos.js';

const NIVEL = ['', '  ', '    ', '      ', '        '];

class Escritor {
  constructor() {
    this.blocos = [];
    this.atual = '';
  }

  w(nivel, texto) {
    this.atual += NIVEL[nivel] + texto;
  }

  linha(texto) {
    this.atual += `${texto}\n`;
  }

  flush() {
    this.blocos.push(this.atual);
    this.atual = '';
  }

  texto() {
    this.flush();
    return this.blocos.map((b) => tabular(b, { minimo: 0, padding: 2 })).join('');
  }
}

const rfc = (ts) => rfc1123z(Date.parse(ts));
const MAX_ANOTACAO = 140;

function labels(w, titulo, mapa, recuo = '') {
  w.w(0, `${recuo}${titulo}:\t`);
  const chaves = Object.keys(mapa ?? {}).sort();
  if (!chaves.length) return w.linha('<none>');
  chaves.forEach((k, i) => {
    if (i) w.w(0, `${recuo}\t`);
    w.w(0, `${k}=${mapa[k]}\n`);
  });
}

function anotacoes(w, titulo, mapa, recuo = '') {
  w.w(0, `${recuo}${titulo}:\t`);
  const chaves = Object.keys(mapa ?? {}).filter((k) => k !== 'kubectl.kubernetes.io/last-applied-configuration').sort();
  if (!chaves.length) return w.linha('<none>');
  const indent = `${recuo}\t`;
  chaves.forEach((k, i) => {
    if (i) w.w(0, indent);
    const v = mapa[k].replace(/\n$/, '');
    if (v.length + k.length + 2 > MAX_ANOTACAO || v.includes('\n')) {
      w.w(0, `${k}:\n`);
      for (const s of v.split('\n')) w.w(0, `${indent}  ${s.length > MAX_ANOTACAO - 2 ? `${s.slice(0, MAX_ANOTACAO - 5)}...` : s}\n`);
    } else w.w(0, `${k}: ${v}\n`);
  });
}

function tolerancias(w, titulo, lista, recuo = '') {
  w.w(0, `${recuo}${titulo}:\t`);
  if (!lista?.length) return w.linha('<none>');
  [...lista].sort((a, b) => (a.key ?? '').localeCompare(b.key ?? '')).forEach((t, i) => {
    if (i) w.w(0, `${recuo}\t`);
    let s = t.key ?? '';
    if (t.value) s += `=${t.value}`;
    if (t.effect) s += `:${t.effect}`;
    if (t.operator === 'Exists' && !t.value) s += t.key || t.effect ? ' op=Exists' : 'op=Exists';
    if (t.tolerationSeconds !== undefined) s += ` for ${t.tolerationSeconds}s`;
    w.w(0, `${s}\n`);
  });
}

function taints(w, lista) {
  w.w(0, 'Taints:\t');
  if (!lista?.length) return w.linha('<none>');
  lista.forEach((t, i) => {
    if (i) w.w(0, '\t');
    w.w(0, `${t.key}${t.value ? `=${t.value}` : ''}:${t.effect}\n`);
  });
}

/** Ocorrências do objeto (ordenadas pela última vez), no fim do describe. */
export function escreverEventos(w, eventos, agora) {
  if (!eventos.length) {
    w.w(0, 'Events:\t<none>\n');
    return;
  }
  w.flush();
  w.w(0, 'Events:\n  Type\tReason\tAge\tFrom\tMessage\n');
  w.w(1, '----\t------\t----\t----\t-------\n');
  const ordenados = [...eventos].sort((a, b) => Date.parse(a.lastTimestamp) - Date.parse(b.lastTimestamp));
  for (const e of ordenados) {
    const primeiro = idade(agora - Date.parse(e.firstTimestamp));
    const intervalo = e.count > 1 ? `${idade(agora - Date.parse(e.lastTimestamp))} (x${e.count} over ${primeiro})` : primeiro;
    const msg = (e.involvedObject.fieldPath ? `${e.involvedObject.fieldPath}: ` : '') + e.message.trim();
    w.w(1, `${e.type}\t${e.reason}\t${intervalo}\t${e.source.component}\t${msg}\n`);
  }
}

// ---------- contêineres ----------
const portas = (ps) => (ps?.length ? ps.map((p) => `${p.containerPort}/${p.protocol}${p.name ? ` (${p.name})` : ''}`).join(', ') : '<none>');
const portasHost = (ps) => (ps?.length ? ps.map((p) => `${p.hostPort ?? 0}/${p.protocol}`).join(', ') : '<none>');

function estadoConteiner(w, rotulo, estado) {
  if (estado.running) {
    w.w(2, `${rotulo}:\tRunning\n`);
    w.w(3, `Started:\t${rfc(estado.running.startedAt)}\n`);
  } else if (estado.waiting) {
    w.w(2, `${rotulo}:\tWaiting\n`);
    if (estado.waiting.reason) w.w(3, `Reason:\t${estado.waiting.reason}\n`);
  } else if (estado.terminated) {
    const t = estado.terminated;
    w.w(2, `${rotulo}:\tTerminated\n`);
    if (t.reason) w.w(3, `Reason:\t${t.reason}\n`);
    if (t.message) w.w(3, `Message:\t${t.message}\n`);
    w.w(3, `Exit Code:\t${t.exitCode}\n`);
    if (t.signal) w.w(3, `Signal:\t${t.signal}\n`);
    w.w(3, `Started:\t${t.startedAt === '1970-01-01T00:00:00Z' ? 'Thu, 01 Jan 1970 00:00:00 +0000' : rfc(t.startedAt)}\n`);
    w.w(3, `Finished:\t${rfc(t.finishedAt)}\n`);
  } else {
    w.w(2, `${rotulo}:\tWaiting\n`);
  }
}

function conteineres(w, titulo, lista, status, recuo = '') {
  w.w(0, `${recuo}${titulo}:\n`);
  for (const c of lista) {
    const st = status?.find((s) => s.name === c.name);
    w.w(1, `${recuo ? ' ' : ''}${c.name}:\n`);
    if (st) w.w(2, `Container ID:\t${st.containerID ?? ''}\n`);
    w.w(2, `Image:\t${c.image}\n`);
    if (st) w.w(2, `Image ID:\t${st.imageID ?? ''}\n`);
    const p = portas(c.ports);
    w.w(2, `${p.includes(',') ? 'Ports' : 'Port'}:\t${p}\n`);
    const hp = portasHost(c.ports);
    w.w(2, `${hp.includes(',') ? 'Host Ports' : 'Host Port'}:\t${hp}\n`);
    if (c.command?.length) {
      w.w(2, 'Command:\n');
      for (const x of c.command) w.w(3, `${x}\n`);
    }
    if (c.args?.length) {
      w.w(2, 'Args:\n');
      for (const x of c.args) w.w(3, `${x}\n`);
    }
    if (st) {
      estadoConteiner(w, 'State', st.state);
      if (st.lastState?.terminated) estadoConteiner(w, 'Last State', st.lastState);
      w.w(2, `Ready:\t${st.ready ? 'True' : 'False'}\n`);
      w.w(2, `Restart Count:\t${st.restartCount}\n`);
    }
    for (const tipo of ['limits', 'requests']) {
      const r = c.resources?.[tipo];
      if (r && Object.keys(r).length) {
        w.w(2, `${tipo === 'limits' ? 'Limits' : 'Requests'}:\n`);
        for (const k of Object.keys(r).sort()) w.w(3, `${k}:\t${r[k]}\n`);
      }
    }
    for (const [rotulo, chave] of [['Liveness', 'livenessProbe'], ['Readiness', 'readinessProbe'], ['Startup', 'startupProbe']]) {
      if (c[chave]) w.w(2, `${rotulo}:\t${textoSonda(c[chave])}\n`);
    }
    for (const ef of c.envFrom ?? []) {
      if (ef === c.envFrom[0]) w.w(2, 'Environment Variables from:\n');
      const [tipo, ref] = ef.configMapRef ? ['ConfigMap', ef.configMapRef] : ['Secret', ef.secretRef];
      w.w(3, `${ref.name}\t${tipo}\t${ef.prefix ? `with prefix '${ef.prefix}'` : ''}Optional: ${!!ref.optional}\n`);
    }
    w.w(2, `Environment:${c.env?.length ? '' : '\t<none>'}\n`);
    for (const e of c.env ?? []) {
      if (!e.valueFrom) {
        String(e.value ?? '').split('\n').forEach((s, i) => w.w(3, i ? `\t${s}\n` : `${e.name}:\t${s}\n`));
      } else if (e.valueFrom.configMapKeyRef) {
        const r = e.valueFrom.configMapKeyRef;
        w.w(3, `${e.name}:\t<set to the key '${r.key}' of config map '${r.name}'>\tOptional: ${!!r.optional}\n`);
      } else if (e.valueFrom.secretKeyRef) {
        const r = e.valueFrom.secretKeyRef;
        w.w(3, `${e.name}:\t<set to the key '${r.key}' in secret '${r.name}'>\tOptional: ${!!r.optional}\n`);
      } else if (e.valueFrom.fieldRef) {
        w.w(3, `${e.name}:\t (${e.valueFrom.fieldRef.apiVersion ?? 'v1'}:${e.valueFrom.fieldRef.fieldPath})\n`);
      }
    }
    const mounts = [...(c.volumeMounts ?? [])].sort((a, b) => a.mountPath.localeCompare(b.mountPath));
    w.w(2, `Mounts:${mounts.length ? '' : '\t<none>'}\n`);
    for (const m of mounts) w.w(3, `${m.mountPath} from ${m.name} (${m.readOnly ? 'ro' : 'rw'}${m.subPath ? `,path=${JSON.stringify(m.subPath)}` : ''})\n`);
  }
}

/** "http-get http://:80/healthz delay=0s timeout=1s period=10s successThreshold=1 failureThreshold=3" */
function textoSonda(p) {
  const acao = p.httpGet ? `http-get ${(p.httpGet.scheme ?? 'HTTP').toLowerCase()}://${p.httpGet.host ?? ''}:${p.httpGet.port}${p.httpGet.path ?? ''}`
    : p.tcpSocket ? `tcp-socket ${p.tcpSocket.host ?? ''}:${p.tcpSocket.port}`
      : p.exec ? `exec [${(p.exec.command ?? []).join(' ')}]` : 'unknown';
  return `${acao} delay=${p.initialDelaySeconds ?? 0}s timeout=${p.timeoutSeconds ?? 1}s period=${p.periodSeconds ?? 10}s successThreshold=${p.successThreshold ?? 1} failureThreshold=${p.failureThreshold ?? 3}`;
}

function volumes(w, lista, recuo = '') {
  if (!lista?.length) {
    w.w(0, `${recuo}Volumes:\t<none>\n`);
    return;
  }
  w.w(0, `${recuo}Volumes:\n`);
  for (const v of lista) {
    w.w(1, `${recuo ? ' ' : ''}${v.name}:\n`);
    if (v.projected) {
      w.w(2, 'Type:\tProjected (a volume that contains injected data from multiple sources)\n');
      for (const s of v.projected.sources) {
        if (s.serviceAccountToken) w.w(2, `TokenExpirationSeconds:\t${s.serviceAccountToken.expirationSeconds}\n`);
        else if (s.configMap) w.w(2, `ConfigMapName:\t${s.configMap.name}\n    Optional:\t${!!s.configMap.optional}\n`);
        else if (s.downwardAPI) w.w(2, 'DownwardAPI:\ttrue\n');
        else if (s.secret) w.w(2, `SecretName:\t${s.secret.name}\n    Optional:\t${!!s.secret.optional}\n`);
      }
    } else if (v.configMap) {
      w.w(2, 'Type:\tConfigMap (a volume populated by a ConfigMap)\n');
      w.w(2, `Name:\t${v.configMap.name}\n`);
      w.w(2, `Optional:\t${!!v.configMap.optional}\n`);
    } else if (v.secret) {
      w.w(2, 'Type:\tSecret (a volume populated by a Secret)\n');
      w.w(2, `SecretName:\t${v.secret.secretName}\n`);
      w.w(2, `Optional:\t${!!v.secret.optional}\n`);
    } else if (v.emptyDir) {
      w.w(2, 'Type:\tEmptyDir (a temporary directory that shares a pod\'s lifetime)\n');
      w.w(2, `Medium:\t${v.emptyDir.medium ?? ''}\n`);
      w.w(2, `SizeLimit:\t${v.emptyDir.sizeLimit ?? '<unset>'}\n`);
    } else if (v.persistentVolumeClaim) {
      w.w(2, 'Type:\tPersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)\n');
      w.w(2, `ClaimName:\t${v.persistentVolumeClaim.claimName}\n`);
      w.w(2, `ReadOnly:\t${!!v.persistentVolumeClaim.readOnly}\n`);
    } else if (v.hostPath) {
      w.w(2, 'Type:\tHostPath (bare host directory volume)\n');
      w.w(2, `Path:\t${v.hostPath.path}\n`);
      w.w(2, `HostPathType:\t${v.hostPath.type ?? ''}\n`);
    } else {
      w.w(2, 'Type:\t<unknown>\n');
    }
  }
}

function templateDePod(w, t) {
  w.w(0, 'Pod Template:\n');
  labels(w, '  Labels', t.metadata?.labels);
  if (Object.keys(t.metadata?.annotations ?? {}).length) anotacoes(w, '  Annotations', t.metadata.annotations);
  if (t.spec.serviceAccountName) w.w(1, `Service Account:\t${t.spec.serviceAccountName}\n`);
  if (t.spec.initContainers?.length) conteineres(w, 'Init Containers', t.spec.initContainers, null, '  ');
  conteineres(w, 'Containers', t.spec.containers, null, '  ');
  volumes(w, t.spec.volumes, '  ');
  if (t.spec.priorityClassName) w.w(1, `Priority Class Name:\t${t.spec.priorityClassName}\n`);
  labels(w, '  Node-Selectors', t.spec.nodeSelector);
  tolerancias(w, '  Tolerations', t.spec.tolerations);
}

/** O template de pod sem alinhamento (como o `rollout history --revision` imprime). */
export function templateCru(t) {
  const w = new Escritor();
  templateDePod(w, t);
  w.flush();
  return w.blocos.join('');
}

const controladoPor = (o) => {
  const r = o.metadata.ownerReferences?.find((x) => x.controller);
  return r ? `${r.kind}/${r.name}` : null;
};

// ---------- os describers ----------
const DESCRITORES = {
  Pod(w, p, ctx) {
    w.w(0, `Name:\t${p.metadata.name}\n`);
    w.w(0, `Namespace:\t${p.metadata.namespace}\n`);
    if (p.spec.priority !== undefined) w.w(0, `Priority:\t${p.spec.priority}\n`);
    if (p.spec.priorityClassName) w.w(0, `Priority Class Name:\t${p.spec.priorityClassName}\n`);
    w.w(0, `Service Account:\t${p.spec.serviceAccountName ?? ''}\n`);
    w.w(0, p.spec.nodeName ? `Node:\t${p.spec.nodeName}/${p.status?.hostIP ?? ''}\n` : 'Node:\t<none>\n');
    if (p.status?.startTime) w.w(0, `Start Time:\t${rfc(p.status.startTime)}\n`);
    labels(w, 'Labels', p.metadata.labels);
    anotacoes(w, 'Annotations', p.metadata.annotations);
    if (p.metadata.deletionTimestamp) {
      w.w(0, `Status:\tTerminating (lasts ${idade(ctx.agora - Date.parse(p.metadata.deletionTimestamp) + p.metadata.deletionGracePeriodSeconds * 1000)})\n`);
      w.w(0, `Termination Grace Period:\t${p.metadata.deletionGracePeriodSeconds}s\n`);
    } else w.w(0, `Status:\t${p.status?.phase ?? 'Pending'}\n`);
    if (p.status?.reason) w.w(0, `Reason:\t${p.status.reason}\n`);
    if (p.status?.message) w.w(0, `Message:\t${p.status.message}\n`);
    w.w(0, `IP:\t${p.status?.podIP ?? ''}\n`);
    if (!p.status?.podIPs?.length) w.w(0, 'IPs:\t<none>\n');
    else {
      w.w(0, 'IPs:\n');
      for (const ip of p.status.podIPs) w.w(1, `IP:\t${ip.ip}\n`);
    }
    const ctrl = controladoPor(p);
    if (ctrl) w.w(0, `Controlled By:\t${ctrl}\n`);
    if (p.spec.initContainers?.length) conteineres(w, 'Init Containers', p.spec.initContainers, p.status?.initContainerStatuses);
    conteineres(w, 'Containers', p.spec.containers, p.status?.containerStatuses);
    if (p.status?.conditions?.length) {
      w.w(0, 'Conditions:\n  Type\tStatus\n');
      for (const c of p.status.conditions) w.w(1, `${c.type} \t${c.status} \n`);
    }
    volumes(w, p.spec.volumes);
    w.w(0, `QoS Class:\t${p.status?.qosClass ?? ''}\n`);
    labels(w, 'Node-Selectors', p.spec.nodeSelector);
    tolerancias(w, 'Tolerations', p.spec.tolerations);
    const espalhar = [...(p.spec.topologySpreadConstraints ?? [])].sort((a, b) => a.topologyKey.localeCompare(b.topologyKey));
    espalhar.forEach((k, i) => w.w(0, `${i ? '' : 'Topology Spread Constraints:'}\t${k.topologyKey}:${k.whenUnsatisfiable} when max skew ${k.maxSkew} is exceeded${k.labelSelector ? ` for selector ${seletor(k.labelSelector) || '<none>'}` : ''}\n`));
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  Deployment(w, d, ctx) {
    const s = d.status ?? {};
    w.w(0, `Name:\t${d.metadata.name}\n`);
    w.w(0, `Namespace:\t${d.metadata.namespace}\n`);
    w.w(0, `CreationTimestamp:\t${rfc(d.metadata.creationTimestamp)}\n`);
    labels(w, 'Labels', d.metadata.labels);
    anotacoes(w, 'Annotations', d.metadata.annotations);
    w.w(0, `Selector:\t${seletor(d.spec.selector)}\n`);
    w.w(0, `Replicas:\t${d.spec.replicas} desired | ${s.updatedReplicas ?? 0} updated | ${s.replicas ?? 0} total | ${s.availableReplicas ?? 0} available | ${s.unavailableReplicas ?? 0} unavailable\n`);
    w.w(0, `StrategyType:\t${d.spec.strategy.type}\n`);
    w.w(0, `MinReadySeconds:\t${d.spec.minReadySeconds ?? 0}\n`);
    const ru = d.spec.strategy.rollingUpdate;
    if (ru) w.w(0, `RollingUpdateStrategy:\t${ru.maxUnavailable} max unavailable, ${ru.maxSurge} max surge\n`);
    templateDePod(w, d.spec.template);
    if (s.conditions?.length) {
      w.w(0, 'Conditions:\n  Type\tStatus\tReason\n');
      w.w(1, '----\t------\t------\n');
      for (const c of s.conditions) w.w(1, `${c.type} \t${c.status}\t${c.reason}\n`);
    }
    const rss = ctx.cluster.listar('ReplicaSet', d.metadata.namespace).filter((rs) => rs.metadata.ownerReferences?.some((o) => o.uid === d.metadata.uid));
    const novo = rss.find((rs) => rs.metadata.annotations?.['deployment.kubernetes.io/revision'] === d.metadata.annotations?.['deployment.kubernetes.io/revision']);
    const fmt = (l) => (l.length ? l.map((rs) => `${rs.metadata.name} (${rs.status?.replicas ?? 0}/${rs.spec.replicas} replicas created)`).join(', ') : '<none>');
    w.w(0, `OldReplicaSets:\t${fmt(rss.filter((rs) => rs !== novo))}\n`);
    w.w(0, `NewReplicaSet:\t${fmt(novo ? [novo] : [])}\n`);
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  ReplicaSet(w, rs, ctx) {
    w.w(0, `Name:\t${rs.metadata.name}\n`);
    w.w(0, `Namespace:\t${rs.metadata.namespace}\n`);
    w.w(0, `Selector:\t${seletor(rs.spec.selector)}\n`);
    labels(w, 'Labels', rs.metadata.labels);
    anotacoes(w, 'Annotations', rs.metadata.annotations);
    const ctrl = controladoPor(rs);
    if (ctrl) w.w(0, `Controlled By:\t${ctrl}\n`);
    w.w(0, `Replicas:\t${rs.status?.replicas ?? 0} current / ${rs.spec.replicas} desired\n`);
    const pods = ctx.cluster.listar('Pod', rs.metadata.namespace).filter((p) => p.metadata.ownerReferences?.some((o) => o.uid === rs.metadata.uid));
    const conta = (fase) => pods.filter((p) => p.status?.phase === fase).length;
    w.w(0, 'Pods Status:\t');
    w.w(0, `${conta('Running')} Running / ${conta('Pending')} Waiting / ${conta('Succeeded')} Succeeded / ${conta('Failed')} Failed\n`);
    templateDePod(w, rs.spec.template);
    if (rs.status?.conditions?.length) {
      w.w(0, 'Conditions:\n  Type\tStatus\tReason\n');
      w.w(1, '----\t------\t------\n');
      for (const x of rs.status.conditions) w.w(1, `${x.type} \t${x.status}\t${x.reason}\n`);
    }
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  Service(w, s, ctx) {
    w.w(0, `Name:\t${s.metadata.name}\n`);
    w.w(0, `Namespace:\t${s.metadata.namespace}\n`);
    labels(w, 'Labels', s.metadata.labels);
    anotacoes(w, 'Annotations', s.metadata.annotations);
    w.w(0, `Selector:\t${Object.entries(s.spec.selector ?? {}).sort().map(([k, v]) => `${k}=${v}`).join(',')}\n`);
    w.w(0, `Type:\t${s.spec.type}\n`);
    if (s.spec.ipFamilyPolicy) w.w(0, `IP Family Policy:\t${s.spec.ipFamilyPolicy}\n`);
    w.w(0, `IP Families:\t${s.spec.ipFamilies?.length ? s.spec.ipFamilies.join(',') : '<none>'}\n`);
    w.w(0, `IP:\t${s.spec.clusterIP ?? ''}\n`);
    w.w(0, `IPs:\t${s.spec.clusterIPs?.length ? s.spec.clusterIPs.join(',') : '<none>'}\n`);
    if (s.spec.externalName) w.w(0, `External Name:\t${s.spec.externalName}\n`);
    if (s.status?.loadBalancer?.ingress?.length) w.w(0, `LoadBalancer Ingress:\t${s.status.loadBalancer.ingress.map((i) => i.ip ?? i.hostname).join(', ')}\n`);
    const ep = ctx.cluster.obter('Endpoints', s.metadata.namespace, s.metadata.name);
    for (const p of s.spec.ports ?? []) {
      const nome = p.name || '<unset>';
      w.w(0, `Port:\t${nome}\t${p.port}/${p.protocol}\n`);
      w.w(0, `TargetPort:\t${p.targetPort}/${p.protocol}\n`);
      if (p.nodePort) w.w(0, `NodePort:\t${nome}\t${p.nodePort}/${p.protocol}\n`);
      const alvo = (ep?.subsets ?? []).flatMap((sub) => {
        const porta = (sub.ports ?? []).find((x) => (x.name ?? '') === (p.name ?? ''));
        return porta ? (sub.addresses ?? []).map((a) => `${a.ip}:${porta.port}`) : [];
      });
      w.w(0, `Endpoints:\t${alvo.length ? (alvo.length > 3 ? `${alvo.slice(0, 3).join(',')} + ${alvo.length - 3} more...` : alvo.join(',')) : ''}\n`);
    }
    w.w(0, `Session Affinity:\t${s.spec.sessionAffinity}\n`);
    if (s.spec.externalTrafficPolicy) w.w(0, `External Traffic Policy:\t${s.spec.externalTrafficPolicy}\n`);
    if (s.spec.internalTrafficPolicy) w.w(0, `Internal Traffic Policy:\t${s.spec.internalTrafficPolicy}\n`);
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  Endpoints(w, e, ctx) {
    w.w(0, `Name:\t${e.metadata.name}\n`);
    w.w(0, `Namespace:\t${e.metadata.namespace}\n`);
    labels(w, 'Labels', e.metadata.labels);
    anotacoes(w, 'Annotations', e.metadata.annotations);
    w.w(0, 'Subsets:\n');
    for (const s of e.subsets ?? []) {
      w.w(1, `Addresses:\t${(s.addresses ?? []).map((a) => a.ip).join(',') || '<none>'}\n`);
      w.w(1, `NotReadyAddresses:\t${(s.notReadyAddresses ?? []).map((a) => a.ip).join(',') || '<none>'}\n`);
      if (s.ports?.length) {
        w.w(1, 'Ports:\n    Name\tPort\tProtocol\n    ----\t----\t--------\n');
        for (const p of s.ports) w.w(2, `${p.name || '<unset>'}\t${p.port}\t${p.protocol}\n`);
      }
      w.w(0, '\n');
    }
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  Namespace(w, n, ctx) {
    w.w(0, `Name:\t${n.metadata.name}\n`);
    labels(w, 'Labels', n.metadata.labels);
    anotacoes(w, 'Annotations', n.metadata.annotations);
    w.w(0, `Status:\t${n.status?.phase}\n`);
    w.w(0, '\n');
    const cotas = ctx.cluster.listar('ResourceQuota', n.metadata.name);
    if (!cotas.length) w.w(0, 'No resource quota.\n');
    else {
      w.w(0, 'Resource Quotas\n');
      for (const q of cotas) {
        w.w(1, `Name:\t${q.metadata.name}\n`);
        w.w(1, 'Resource\tUsed\tHard\n');
        w.w(1, '--------\t---\t---\n');
        for (const k of Object.keys(q.spec.hard ?? {}).sort()) w.w(1, `${k}\t${q.status?.used?.[k] ?? '0'}\t${q.spec.hard[k]}\n`);
      }
    }
    w.w(0, '\n');
    const faixas = ctx.cluster.listar('LimitRange', n.metadata.name);
    if (!faixas.length) w.w(0, 'No LimitRange resource.\n');
    else {
      w.w(0, 'Resource Limits\n');
      w.w(0, ' Type\tResource\tMin\tMax\tDefault Request\tDefault Limit\tMax Limit/Request Ratio\n');
      w.w(0, ' ----\t--------\t---\t---\t---------------\t-------------\t-----------------------\n');
      for (const lr of faixas) for (const l of lr.spec.limits) for (const linha of linhasDoLimite(l)) w.w(0, ` ${linha}\n`);
    }
  },

  ConfigMap(w, c, ctx) {
    w.w(0, `Name:\t${c.metadata.name}\n`);
    w.w(0, `Namespace:\t${c.metadata.namespace}\n`);
    labels(w, 'Labels', c.metadata.labels);
    anotacoes(w, 'Annotations', c.metadata.annotations);
    w.w(0, '\nData\n====\n');
    for (const k of Object.keys(c.data ?? {}).sort()) {
      w.w(0, `${k}:\n----\n`);
      w.w(0, `${c.data[k]}\n`);
      w.w(0, '\n');
    }
    w.w(0, '\nBinaryData\n====\n');
    for (const k of Object.keys(c.binaryData ?? {}).sort()) w.w(0, `${k}: ${atob(c.binaryData[k]).length} bytes\n`);
    w.w(0, '\n');
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  Secret(w, s) {
    w.w(0, `Name:\t${s.metadata.name}\n`);
    w.w(0, `Namespace:\t${s.metadata.namespace}\n`);
    labels(w, 'Labels', s.metadata.labels);
    anotacoes(w, 'Annotations', s.metadata.annotations);
    w.w(0, `\nType:\t${s.type}\n`);
    w.w(0, '\nData\n====\n');
    for (const k of Object.keys(s.data ?? {}).sort()) w.w(0, `${k}:\t${new TextEncoder().encode(atobUtf8(s.data[k])).length} bytes\n`);
  },

  ServiceAccount(w, sa, ctx) {
    w.w(0, `Name:\t${sa.metadata.name}\n`);
    w.w(0, `Namespace:\t${sa.metadata.namespace}\n`);
    labels(w, 'Labels', sa.metadata.labels);
    anotacoes(w, 'Annotations', sa.metadata.annotations);
    w.w(0, `Image pull secrets:\t${(sa.imagePullSecrets ?? []).map((x) => x.name).join(', ') || '<none>'}\n`);
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  Role: regrasDoPapel,
  ClusterRole: regrasDoPapel,
  RoleBinding: vinculo,
  ClusterRoleBinding: vinculo,

  NetworkPolicy(w, np) {
    w.w(0, `Name:\t${np.metadata.name}\n`);
    w.w(0, `Namespace:\t${np.metadata.namespace}\n`);
    w.w(0, `Created on:\t${horaGo(Date.parse(np.metadata.creationTimestamp))}\n`);
    labels(w, 'Labels', np.metadata.labels);
    anotacoes(w, 'Annotations', np.metadata.annotations);
    const s = np.spec;
    w.w(0, 'Spec:\n');
    const vazio = !Object.keys(s.podSelector?.matchLabels ?? {}).length && !s.podSelector?.matchExpressions?.length;
    w.w(1, `PodSelector:     ${vazio ? '<none> (Allowing the specific traffic to all pods in this namespace)' : seletor(s.podSelector)}\n`);
    const tipos = s.policyTypes ?? ['Ingress', ...(s.egress ? ['Egress'] : [])];
    for (const [tipo, regras, campo, rotulo, ninguem] of [['Ingress', s.ingress, 'from', 'From', 'source'], ['Egress', s.egress, 'to', 'To', 'destination']]) {
      const sentido = tipo.toLowerCase();
      if (!tipos.includes(tipo)) {
        w.w(1, `Not affecting ${sentido} traffic\n`);
        continue;
      }
      w.w(1, `Allowing ${sentido} traffic:\n`);
      if (!regras?.length) {
        w.w(2, `<none> (Selected pods are isolated for ${sentido} connectivity)\n`);
        continue;
      }
      regras.forEach((r, i) => {
        if (!r.ports?.length) w.w(2, 'To Port: <any> (traffic allowed to all ports)\n');
        for (const p of r.ports ?? []) w.w(2, `To Port: ${p.port ?? '<any>'}/${p.protocol ?? 'TCP'}\n`);
        if (!r[campo]?.length) w.w(2, `${rotulo}: <any> (traffic not restricted by ${ninguem})\n`);
        for (const par of r[campo] ?? []) {
          w.w(2, `${rotulo}:\n`);
          if (par.namespaceSelector) w.w(3, `NamespaceSelector: ${seletor(par.namespaceSelector) || '<none>'}\n`);
          if (par.podSelector) w.w(3, `PodSelector: ${seletor(par.podSelector) || '<none>'}\n`);
          if (par.ipBlock) {
            w.w(3, 'IPBlock:\n');
            w.w(4, `CIDR: ${par.ipBlock.cidr}\n`);
            w.w(4, `Except: ${(par.ipBlock.except ?? []).join(', ')}\n`);
          }
        }
        if (i < regras.length - 1) w.w(2, '----------\n');
      });
    }
    w.w(1, `Policy Types: ${tipos.join(', ')}\n`);
  },

  PodDisruptionBudget(w, b, ctx) {
    w.w(0, `Name:\t${b.metadata.name}\n`);
    w.w(0, `Namespace:\t${b.metadata.namespace}\n`);
    if (b.spec.minAvailable !== undefined) w.w(0, `Min available:\t${b.spec.minAvailable}\n`);
    else if (b.spec.maxUnavailable !== undefined) w.w(0, `Max unavailable:\t${b.spec.maxUnavailable}\n`);
    w.w(0, `Selector:\t${b.spec.selector ? seletor(b.spec.selector) || '<none>' : '<unset>'}\n`);
    w.w(0, 'Status:\n');
    const st = b.status ?? {};
    w.w(2, `Allowed disruptions:\t${st.disruptionsAllowed ?? 0}\n`);
    w.w(2, `Current:\t${st.currentHealthy ?? 0}\n`);
    w.w(2, `Desired:\t${st.desiredHealthy ?? 0}\n`);
    w.w(2, `Total:\t${st.expectedPods ?? 0}\n`);
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  PriorityClass(w, pc, ctx) {
    w.w(0, `Name:\t${pc.metadata.name}\n`);
    w.w(0, `Value:\t${pc.value}\n`);
    w.w(0, `GlobalDefault:\t${!!pc.globalDefault}\n`);
    w.w(0, `PreemptionPolicy:\t${pc.preemptionPolicy}\n`);
    w.w(0, `Description:\t${pc.description ?? ''}\n`);
    // As annotations saem cruas, como no labels.FormatLabels (a last-applied termina com uma quebra de linha).
    const an = Object.keys(pc.metadata.annotations ?? {}).sort().map((k) => `${k}=${pc.metadata.annotations[k]}`).join(',');
    w.w(0, `Annotations:\t${an || '<none>'}\n`);
    escreverEventos(w, ctx.eventos, ctx.agora);
  },

  Node(w, n, ctx) {
    const st = n.status;
    w.w(0, `Name:\t${n.metadata.name}\n`);
    const r = Object.keys(n.metadata.labels ?? {}).filter((k) => k.startsWith('node-role.kubernetes.io/')).map((k) => k.split('/')[1]);
    w.w(0, `Roles:\t${r.length ? r.sort().join(',') : '<none>'}\n`);
    labels(w, 'Labels', n.metadata.labels);
    anotacoes(w, 'Annotations', n.metadata.annotations);
    w.w(0, `CreationTimestamp:\t${rfc(n.metadata.creationTimestamp)}\n`);
    taints(w, n.spec.taints);
    w.w(0, `Unschedulable:\t${!!n.spec.unschedulable}\n`);
    w.w(0, 'Lease:\n');
    w.w(1, `HolderIdentity:\t${n.metadata.name}\n`);
    w.w(1, 'AcquireTime:\t<unset>\n');
    w.w(1, `RenewTime:\t${rfc1123z(ctx.agora - 3000)}\n`);
    w.w(0, 'Conditions:\n  Type\tStatus\tLastHeartbeatTime\tLastTransitionTime\tReason\tMessage\n');
    w.w(1, '----\t------\t-----------------\t------------------\t------\t-------\n');
    for (const c of st.conditions) w.w(1, `${c.type} \t${c.status} \t${rfc(c.lastHeartbeatTime)} \t${rfc(c.lastTransitionTime)} \t${c.reason} \t${c.message}\n`);
    w.w(0, 'Addresses:\n');
    for (const a of st.addresses) w.w(1, `${a.type}:\t${a.address}\n`);
    for (const [titulo, mapa] of [['Capacity', st.capacity], ['Allocatable', st.allocatable]]) {
      w.w(0, `${titulo}:\n`);
      for (const k of Object.keys(mapa).sort()) w.w(1, `${k}:\t${mapa[k]}\n`);
    }
    const ni = st.nodeInfo;
    w.w(0, 'System Info:\n');
    for (const [k, v] of [['Machine ID', ni.machineID], ['System UUID', ni.systemUUID], ['Boot ID', ni.bootID], ['Kernel Version', ni.kernelVersion], ['OS Image', ni.osImage],
      ['Operating System', ni.operatingSystem], ['Architecture', ni.architecture], ['Container Runtime Version', ni.containerRuntimeVersion], ['Kubelet Version', ni.kubeletVersion]]) w.w(1, `${k}:\t${v}\n`);
    w.w(0, `PodCIDR:\t${n.spec.podCIDR}\n`);
    w.w(0, `PodCIDRs:\t${n.spec.podCIDRs.join(',')}\n`);
    w.w(0, `ProviderID:\t${n.spec.providerID}\n`);
    const pods = podsNoNode(ctx.cluster, n.metadata.name);
    const capCpu = cpuMili(st.allocatable.cpu);
    const capMem = bytes(st.allocatable.memory);
    const pct = (v, cap) => (cap ? Math.floor((v / cap) * 100) : 0);
    const limites = (p) => p.spec.containers.reduce((t, c) => ({ cpu: t.cpu + cpuMili(c.resources?.limits?.cpu), memoria: t.memoria + bytes(c.resources?.limits?.memory) }), { cpu: 0, memoria: 0 });
    w.w(0, `Non-terminated Pods:\t(${pods.length} in total)\n`);
    w.w(1, 'Namespace\tName\t\tCPU Requests\tCPU Limits\tMemory Requests\tMemory Limits\tAge\n');
    w.w(1, '---------\t----\t\t------------\t----------\t---------------\t-------------\t---\n');
    const total = { rc: 0, lc: 0, rm: 0, lm: 0 };
    for (const p of pods) {
      const rq = pedidosDoPod(p);
      const lm = limites(p);
      Object.assign(total, { rc: total.rc + rq.cpu, lc: total.lc + lm.cpu, rm: total.rm + rq.memoria, lm: total.lm + lm.memoria });
      w.w(1, `${p.metadata.namespace}\t${p.metadata.name}\t\t${cpuTexto(rq.cpu)} (${pct(rq.cpu, capCpu)}%)\t${cpuTexto(lm.cpu)} (${pct(lm.cpu, capCpu)}%)\t${memTexto(rq.memoria)} (${pct(rq.memoria, capMem)}%)\t${memTexto(lm.memoria)} (${pct(lm.memoria, capMem)}%)\t${idade(ctx.agora - Date.parse(p.metadata.creationTimestamp))}\n`);
    }
    w.w(0, 'Allocated resources:\n  (Total limits may be over 100 percent, i.e., overcommitted.)\n');
    w.w(1, 'Resource\tRequests\tLimits\n');
    w.w(1, '--------\t--------\t------\n');
    w.w(1, `cpu\t${cpuTexto(total.rc)} (${pct(total.rc, capCpu)}%)\t${cpuTexto(total.lc)} (${pct(total.lc, capCpu)}%)\n`);
    w.w(1, `memory\t${memTexto(total.rm)} (${pct(total.rm, capMem)}%)\t${memTexto(total.lm)} (${pct(total.lm, capMem)}%)\n`);
    for (const k of ['ephemeral-storage', 'hugepages-1Gi', 'hugepages-2Mi']) w.w(1, `${k}\t0 (0%)\t0 (0%)\n`);
    escreverEventos(w, ctx.eventos, ctx.agora);
  },
};

// O describe genérico do kubectl (para os tipos sem describer próprio): metadados e o YAML do spec e do status.
function generico(w, o, ctx) {
  w.w(0, `Name:\t${o.metadata.name}\n`);
  if (o.metadata.namespace) w.w(0, `Namespace:\t${o.metadata.namespace}\n`);
  labels(w, 'Labels', o.metadata.labels);
  anotacoes(w, 'Annotations', o.metadata.annotations);
  w.w(0, `API Version:\t${o.apiVersion}\n`);
  w.w(0, `Kind:\t${o.kind}\n`);
  const bloco = (titulo, v, nivel) => {
    if (v === undefined) return;
    w.w(nivel, `${titulo}:\n`);
    const escrever = (val, n) => {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object') {
            const [[k0, v0], ...resto] = Object.entries(item);
            if (v0 && typeof v0 === 'object') { w.w(n, `${cap(k0)}:\n`); escrever(v0, n + 1); } else w.w(n, `${cap(k0)}:\t${v0}\n`);
            for (const [k, x] of resto) {
              if (x && typeof x === 'object') { w.w(n + 1, `${cap(k)}:\n`); escrever(x, n + 2); } else w.w(n + 1, `${cap(k)}:\t${x}\n`);
            }
          } else w.w(n, `${item}\n`);
        }
        return;
      }
      for (const [k, x] of Object.entries(val ?? {})) {
        if (x && typeof x === 'object') { w.w(n, `${cap(k)}:\n`); escrever(x, n + 1); } else w.w(n, `${cap(k)}:\t${x}\n`);
      }
    };
    escrever(v, nivel + 1);
  };
  bloco('Spec', o.spec, 0);
  bloco('Status', o.status, 0);
  escreverEventos(w, ctx.eventos, ctx.agora);
}
const cap = (k) => k.replace(/^./, (x) => x.toUpperCase()).replace(/([a-z])([A-Z])/g, '$1 $2');

/** A hora como o time.Time.String() do Go: "2026-10-16 12:00:15 +0000 UTC". */
const horaGo = (ms) => `${new Date(ms).toISOString().replace('T', ' ').slice(0, 19)} +0000 UTC`;

/**
 * As regras de uma Role/ClusterRole como o kubectl mostra: quebradas em pedaços (um recurso e um verbo por vez),
 * juntadas de novo pelo recurso e ordenadas pelo texto da regra no Go (que começa pelos verbos).
 */
function regrasDoPapel(w, r) {
  w.w(0, `Name:\t${r.metadata.name}\n`);
  labels(w, 'Labels', r.metadata.labels);
  anotacoes(w, 'Annotations', r.metadata.annotations);
  w.w(0, 'PolicyRule:\n');
  const juntas = new Map();
  for (const regra of r.rules ?? []) {
    const nomes = regra.resourceNames ?? [];
    const pedacos = regra.nonResourceURLs?.length
      ? regra.nonResourceURLs.map((u) => ({ grupos: [], recursos: [], urls: [u], nomes }))
      : (regra.apiGroups ?? []).flatMap((g) => (regra.resources ?? []).map((x) => ({ grupos: [g], recursos: [x], urls: [], nomes })));
    for (const p of pedacos) {
      const chave = JSON.stringify([p.grupos, p.recursos, p.urls, p.nomes]);
      if (!juntas.has(chave)) juntas.set(chave, { ...p, verbos: [] });
      for (const v of regra.verbs ?? []) if (!juntas.get(chave).verbos.includes(v)) juntas.get(chave).verbos.push(v);
    }
  }
  const lista = (x) => `[${x.join(' ')}]`;
  const textoGo = (p) => `Verbs:${lista(p.verbos)},APIGroups:${lista(p.grupos)},Resources:${lista(p.recursos)},ResourceNames:${lista(p.nomes)},NonResourceURLs:${lista(p.urls)}`;
  const ordenadas = [...juntas.values()].sort((a, b) => (textoGo(a) < textoGo(b) ? -1 : textoGo(a) > textoGo(b) ? 1 : 0));
  w.w(1, 'Resources\tNon-Resource URLs\tResource Names\tVerbs\n');
  w.w(1, '---------\t-----------------\t--------------\t-----\n');
  for (const p of ordenadas) {
    const recurso = p.recursos.map((x) => (p.grupos[0] ? `${x}.${p.grupos[0]}` : x)).join(', ');
    w.w(1, `${recurso}\t${lista(p.urls)}\t${lista(p.nomes)}\t${lista(p.verbos)}\n`);
  }
}

function vinculo(w, b) {
  w.w(0, `Name:\t${b.metadata.name}\n`);
  labels(w, 'Labels', b.metadata.labels);
  anotacoes(w, 'Annotations', b.metadata.annotations);
  w.w(0, 'Role:\n');
  w.w(1, `Kind:\t${b.roleRef.kind}\n`);
  w.w(1, `Name:\t${b.roleRef.name}\n`);
  w.w(0, 'Subjects:\n');
  w.w(1, 'Kind\tName\tNamespace\n');
  w.w(1, '----\t----\t---------\n');
  for (const x of b.subjects ?? []) w.w(1, `${x.kind}\t${x.name}\t${x.namespace ?? ''}\n`);
}

const OPERADOR = { In: 'in', NotIn: 'notin' };
const seletor = (sel) => [
  ...Object.entries(sel?.matchLabels ?? {}).sort().map(([k, v]) => `${k}=${v}`),
  ...(sel?.matchExpressions ?? []).map((e) => (OPERADOR[e.operator] ? `${e.key} ${OPERADOR[e.operator]} (${[...(e.values ?? [])].sort().join(',')})` : e.operator === 'Exists' ? e.key : `!${e.key}`)),
].join(',');
const cpuTexto = textoCpu;
const memTexto = textoMemoria;

DESCRITORES.Ingress = (w, ing, ctx) => {
  w.w(0, `Name:\t${ing.metadata.name}\n`);
  labels(w, 'Labels', ing.metadata.labels);
  w.w(0, `Namespace:\t${ing.metadata.namespace}\n`);
  w.w(0, `Address:\t${(ing.status?.loadBalancer?.ingress ?? []).map((x) => x.ip).join(',')}\n`);
  w.w(0, `Ingress Class:\t${ing.spec.ingressClassName ?? '<none>'}\n`);
  w.w(0, `Default backend:\t${ing.spec.defaultBackend?.service ? `${ing.spec.defaultBackend.service.name}:${ing.spec.defaultBackend.service.port?.number ?? ing.spec.defaultBackend.service.port?.name}` : '<default>'}\n`);
  w.w(0, 'Rules:\n');
  w.w(1, 'Host\tPath\tBackends\n');
  w.w(1, '----\t----\t--------\n');
  for (const r of ing.spec.rules ?? []) {
    w.w(1, `${r.host ?? '*'}\t\n`);
    for (const p of r.http?.paths ?? []) {
      const s = p.backend.service;
      const ep = ctx.cluster.obter('Endpoints', ing.metadata.namespace, s.name);
      const ends = (ep?.subsets ?? []).flatMap((x) => (x.addresses ?? []).map((a) => `${a.ip}:${x.ports?.[0]?.port}`));
      w.w(1, `\t${p.path ?? '/'}\t${s.name}:${s.port?.number ?? s.port?.name} (${ends.length ? ends.join(',') : '<error: endpoints "' + s.name + '" not found>'})\n`);
    }
  }
  anotacoes(w, 'Annotations', ing.metadata.annotations);
  escreverEventos(w, ctx.eventos, ctx.agora);
};
const statusDosPods = (ctx, dono) => {
  const pods = ctx.cluster.listar('Pod', dono.metadata.namespace).filter((p) => p.metadata.ownerReferences?.some((o) => o.uid === dono.metadata.uid));
  const conta = (fase) => pods.filter((p) => p.status?.phase === fase).length;
  return `${conta('Running')} Running / ${conta('Pending')} Waiting / ${conta('Succeeded')} Succeeded / ${conta('Failed')} Failed`;
};

DESCRITORES.DaemonSet = (w, ds, ctx) => {
  const st = ds.status ?? {};
  w.w(0, `Name:\t${ds.metadata.name}\n`);
  w.w(0, `Namespace:\t${ds.metadata.namespace}\n`);
  w.w(0, `Selector:\t${seletor(ds.spec.selector)}\n`);
  w.w(0, `Node-Selector:\t${Object.keys(ds.spec.template.spec.nodeSelector ?? {}).sort().map((k) => `${k}=${ds.spec.template.spec.nodeSelector[k]}`).join(',') || '<none>'}\n`);
  labels(w, 'Labels', ds.metadata.labels);
  anotacoes(w, 'Annotations', ds.metadata.annotations);
  w.w(0, `Desired Number of Nodes Scheduled: ${st.desiredNumberScheduled ?? 0}\n`);
  w.w(0, `Current Number of Nodes Scheduled: ${st.currentNumberScheduled ?? 0}\n`);
  w.w(0, `Number of Nodes Scheduled with Up-to-date Pods: ${st.updatedNumberScheduled ?? 0}\n`);
  w.w(0, `Number of Nodes Scheduled with Available Pods: ${st.numberAvailable ?? 0}\n`);
  w.w(0, `Number of Nodes Misscheduled: ${st.numberMisscheduled ?? 0}\n`);
  w.w(0, `Pods Status:\t${statusDosPods(ctx, ds)}\n`);
  templateDePod(w, ds.spec.template);
  escreverEventos(w, ctx.eventos, ctx.agora);
};

DESCRITORES.Job = (w, job, ctx) => {
  const s = job.spec;
  const st = job.status ?? {};
  w.w(0, `Name:\t${job.metadata.name}\n`);
  w.w(0, `Namespace:\t${job.metadata.namespace}\n`);
  w.w(0, `Selector:\t${seletor(s.selector)}\n`);
  labels(w, 'Labels', job.metadata.labels);
  anotacoes(w, 'Annotations', job.metadata.annotations);
  const ctrl = controladoPor(job);
  if (ctrl) w.w(0, `Controlled By:\t${ctrl}\n`);
  w.w(0, `Parallelism:\t${s.parallelism}\n`);
  w.w(0, s.completions !== undefined ? `Completions:\t${s.completions}\n` : 'Completions:\t<unset>\n');
  w.w(0, `Completion Mode:\t${s.completionMode}\n`);
  w.w(0, `Suspend:\t${!!s.suspend}\n`);
  w.w(0, `Backoff Limit:\t${s.backoffLimit}\n`);
  if (s.ttlSecondsAfterFinished !== undefined) w.w(0, `TTL Seconds After Finished:\t${s.ttlSecondsAfterFinished}\n`);
  if (st.startTime) w.w(0, `Start Time:\t${rfc(st.startTime)}\n`);
  if (st.completionTime) {
    w.w(0, `Completed At:\t${rfc(st.completionTime)}\n`);
    w.w(0, `Duration:\t${idade(Date.parse(st.completionTime) - Date.parse(st.startTime))}\n`);
  }
  if (s.activeDeadlineSeconds !== undefined) w.w(0, `Active Deadline Seconds:\t${s.activeDeadlineSeconds}s\n`);
  w.w(0, `Pods Statuses:\t${st.active ?? 0} Active (${st.ready ?? 0} Ready) / ${st.succeeded ?? 0} Succeeded / ${st.failed ?? 0} Failed\n`);
  templateDePod(w, s.template);
  escreverEventos(w, ctx.eventos, ctx.agora);
};

DESCRITORES.CronJob = (w, cj, ctx) => {
  const s = cj.spec;
  const js = s.jobTemplate.spec;
  w.w(0, `Name:\t${cj.metadata.name}\n`);
  w.w(0, `Namespace:\t${cj.metadata.namespace}\n`);
  labels(w, 'Labels', cj.metadata.labels);
  anotacoes(w, 'Annotations', cj.metadata.annotations);
  w.w(0, `Schedule:\t${s.schedule}\n`);
  w.w(0, `Concurrency Policy:\t${s.concurrencyPolicy}\n`);
  w.w(0, `Suspend:\t${s.suspend ? 'True' : 'False'}\n`);
  w.w(0, `Time Zone:\t${s.timeZone ?? '<unset>'}\n`);
  w.w(0, `Successful Job History Limit:\t${s.successfulJobsHistoryLimit}\n`);
  w.w(0, `Failed Job History Limit:\t${s.failedJobsHistoryLimit}\n`);
  w.w(0, `Starting Deadline Seconds:\t${s.startingDeadlineSeconds !== undefined ? `${s.startingDeadlineSeconds}s` : '<unset>'}\n`);
  w.w(0, `Selector:\t${js.selector ? seletor(js.selector) : '<unset>'}\n`);
  w.w(0, `Parallelism:\t${js.parallelism ?? '<unset>'}\n`);
  w.w(0, `Completions:\t${js.completions ?? '<unset>'}\n`);
  if (js.activeDeadlineSeconds !== undefined) w.w(0, `Active Deadline Seconds:\t${js.activeDeadlineSeconds}s\n`);
  templateDePod(w, js.template);
  w.w(0, `Last Schedule Time:\t${cj.status?.lastScheduleTime ? rfc(cj.status.lastScheduleTime) : '<unset>'}\n`);
  w.w(0, `Active Jobs:\t${cj.status?.active?.length ? cj.status.active.map((j) => j.name).join(', ') : '<none>'}\n`);
  escreverEventos(w, ctx.eventos, ctx.agora);
};

DESCRITORES.StatefulSet = (w, sts, ctx) => {
  const s = sts.spec;
  w.w(0, `Name:\t${sts.metadata.name}\n`);
  w.w(0, `Namespace:\t${sts.metadata.namespace}\n`);
  w.w(0, `CreationTimestamp:\t${rfc(sts.metadata.creationTimestamp)}\n`);
  w.w(0, `Selector:\t${seletor(s.selector)}\n`);
  labels(w, 'Labels', sts.metadata.labels);
  anotacoes(w, 'Annotations', sts.metadata.annotations);
  w.w(0, `Service Name:\t${s.serviceName ?? ''}\n`);
  w.w(0, `Pod Management Policy:\t${s.podManagementPolicy}\n`);
  w.w(0, `Replicas:\t${s.replicas} desired | ${sts.status?.replicas ?? 0} total\n`);
  w.w(0, `Update Strategy:\t${s.updateStrategy.type}\n`);
  const ru = s.updateStrategy.rollingUpdate;
  if (ru?.partition !== undefined) w.w(1, `Partition:\t${ru.partition}\n`);
  if (ru?.maxUnavailable !== undefined) w.w(1, `MaxUnavailable:\t${ru.maxUnavailable}\n`);
  w.w(0, 'Persistent Volume Claim Retention Policy:\n');
  w.w(1, `WhenDeleted:\t${s.persistentVolumeClaimRetentionPolicy.whenDeleted}\n`);
  w.w(1, `WhenScaled:\t${s.persistentVolumeClaimRetentionPolicy.whenScaled}\n`);
  const pods = ctx.cluster.listar('Pod', sts.metadata.namespace).filter((p) => p.metadata.ownerReferences?.some((o) => o.uid === sts.metadata.uid));
  const conta = (fase) => pods.filter((p) => p.status?.phase === fase).length;
  w.w(0, `Pods Status:\t${conta('Running')} Running / ${conta('Pending')} Waiting / ${conta('Succeeded')} Succeeded / ${conta('Failed')} Failed\n`);
  templateDePod(w, s.template);
  if (!s.volumeClaimTemplates?.length) w.w(0, 'Volume Claims:\t<none>\n');
  else {
    w.w(0, 'Volume Claims:\n');
    for (const t of s.volumeClaimTemplates) {
      w.w(1, `Name:\t${t.metadata.name}\n`);
      w.w(1, `StorageClass:\t${t.spec.storageClassName ?? ''}\n`);
      labels(w, '  Labels', t.metadata.labels);
      anotacoes(w, '  Annotations', t.metadata.annotations);
      w.w(1, `Capacity:\t${t.spec.resources?.requests?.storage ?? ''}\n`);
      w.w(1, `Access Modes:\t[${(t.spec.accessModes ?? []).join(' ')}]\n`);
    }
  }
  escreverEventos(w, ctx.eventos, ctx.agora);
};

DESCRITORES.PersistentVolumeClaim = (w, pvc, ctx) => {
  w.w(0, `Name:\t${pvc.metadata.name}\n`);
  w.w(0, `Namespace:\t${pvc.metadata.namespace}\n`);
  w.w(0, `StorageClass:\t${pvc.spec.storageClassName ?? ''}\n`);
  w.w(0, pvc.metadata.deletionTimestamp ? `Status:\tTerminating (lasts ${idade(ctx.agora - Date.parse(pvc.metadata.deletionTimestamp))})\n` : `Status:\t${pvc.status?.phase ?? 'Pending'}\n`);
  w.w(0, `Volume:\t${pvc.spec.volumeName ?? ''}\n`);
  labels(w, 'Labels', pvc.metadata.labels);
  anotacoes(w, 'Annotations', pvc.metadata.annotations);
  w.w(0, `Finalizers:\t[${(pvc.metadata.finalizers ?? []).join(' ')}]\n`);
  w.w(0, `Capacity:\t${pvc.status?.capacity?.storage ?? ''}\n`);
  w.w(0, `Access Modes:\t${siglasDeAcesso(pvc.status?.accessModes)}\n`);
  w.w(0, `VolumeMode:\t${pvc.spec.volumeMode ?? 'Filesystem'}\n`);
  const usando = ctx.cluster.listar('Pod', pvc.metadata.namespace).filter((p) => pvcsDoPod(p).includes(pvc.metadata.name)).map((p) => p.metadata.name);
  w.w(0, 'Used By:\t');
  if (!usando.length) w.linha('<none>');
  usando.forEach((n, i) => w.w(0, `${i ? '\t' : ''}${n}\n`));
  if (pvc.status?.conditions?.length) {
    w.w(0, 'Conditions:\n');
    w.w(1, 'Type\tStatus\tLastProbeTime\tLastTransitionTime\tReason\tMessage\n');
    w.w(1, '----\t------\t-----------------\t------------------\t------\t-------\n');
    for (const c of pvc.status.conditions) w.w(1, `${c.type} \t${c.status} \tMon, 01 Jan 0001 00:00:00 +0000 \t${rfc(c.lastTransitionTime)} \t${c.reason} \t${c.message}\n`);
  }
  escreverEventos(w, ctx.eventos, ctx.agora);
};

DESCRITORES.PersistentVolume = (w, pv, ctx) => {
  const s = pv.spec;
  w.w(0, `Name:\t${pv.metadata.name}\n`);
  labels(w, 'Labels', pv.metadata.labels);
  anotacoes(w, 'Annotations', pv.metadata.annotations);
  w.w(0, `Finalizers:\t[${(pv.metadata.finalizers ?? []).join(' ')}]\n`);
  w.w(0, `StorageClass:\t${s.storageClassName ?? ''}\n`);
  w.w(0, pv.metadata.deletionTimestamp ? `Status:\tTerminating (lasts ${idade(ctx.agora - Date.parse(pv.metadata.deletionTimestamp))})\n` : `Status:\t${pv.status?.phase ?? 'Pending'}\n`);
  w.w(0, `Claim:\t${s.claimRef ? `${s.claimRef.namespace}/${s.claimRef.name}` : ''}\n`);
  w.w(0, `Reclaim Policy:\t${s.persistentVolumeReclaimPolicy}\n`);
  w.w(0, `Access Modes:\t${siglasDeAcesso(s.accessModes)}\n`);
  w.w(0, `VolumeMode:\t${s.volumeMode ?? 'Filesystem'}\n`);
  w.w(0, `Capacity:\t${s.capacity?.storage ?? ''}\n`);
  const termos = s.nodeAffinity?.required?.nodeSelectorTerms;
  if (!termos?.length) w.w(0, 'Node Affinity:\t<none>\n');
  else {
    w.w(0, 'Node Affinity:\t\n');
    w.w(1, 'Required Terms:\t\n');
    termos.forEach((t, i) => w.w(2, `Term ${i}:\t${(t.matchExpressions ?? []).map((e) => `${e.key} ${e.operator.toLowerCase()} [${(e.values ?? []).join(', ')}]`).join(', ')}\n`));
  }
  w.w(0, `Message:\t${pv.status?.message ?? ''}\n`);
  w.w(0, 'Source:\n');
  if (s.hostPath) {
    w.w(2, 'Type:\tHostPath (bare host directory volume)\n');
    w.w(2, `Path:\t${s.hostPath.path}\n`);
    w.w(2, `HostPathType:\t${s.hostPath.type ?? ''}\n`);
  }
  escreverEventos(w, ctx.eventos, ctx.agora);
};

DESCRITORES.StorageClass = (w, sc, ctx) => {
  const an = sc.metadata.annotations ?? {};
  w.w(0, `Name:\t${sc.metadata.name}\n`);
  w.w(0, `IsDefaultClass:\t${an['storageclass.kubernetes.io/is-default-class'] === 'true' ? 'Yes' : 'No'}\n`);
  w.w(0, `Annotations:\t${Object.keys(an).sort().map((k) => `${k}=${an[k]}`).join(',') || '<none>'}\n`);
  w.w(0, `Provisioner:\t${sc.provisioner}\n`);
  w.w(0, `Parameters:\t${Object.keys(sc.parameters ?? {}).sort().map((k) => `${k}=${sc.parameters[k]}`).join(',') || '<none>'}\n`);
  w.w(0, `AllowVolumeExpansion:\t${sc.allowVolumeExpansion === undefined ? '<unset>' : sc.allowVolumeExpansion}\n`);
  w.w(0, `MountOptions:\t${sc.mountOptions?.length ? sc.mountOptions.join(', ') : '<none>'}\n`);
  w.w(0, `ReclaimPolicy:\t${sc.reclaimPolicy}\n`);
  w.w(0, `VolumeBindingMode:\t${sc.volumeBindingMode}\n`);
  escreverEventos(w, ctx.eventos, ctx.agora);
};

/** As linhas de um item de LimitRange, um recurso por linha: Type, Resource, Min, Max, Default Request, Default Limit, Ratio. */
function linhasDoLimite(l) {
  const recursos = [...new Set(['min', 'max', 'defaultRequest', 'default', 'maxLimitRequestRatio'].flatMap((k) => Object.keys(l[k] ?? {})))].sort();
  return recursos.map((r) => [l.type, r, l.min?.[r] ?? '-', l.max?.[r] ?? '-', l.defaultRequest?.[r] ?? '-', l.default?.[r] ?? '-', l.maxLimitRequestRatio?.[r] ?? '-'].join('\t'));
}

DESCRITORES.ResourceQuota = (w, q) => {
  w.w(0, `Name:\t${q.metadata.name}\n`);
  w.w(0, `Namespace:\t${q.metadata.namespace}\n`);
  w.w(0, 'Resource\tUsed\tHard\n');
  w.w(0, '--------\t----\t----\n');
  for (const k of Object.keys(q.spec.hard ?? {}).sort()) w.w(0, `${k}\t${q.status?.used?.[k] ?? '0'}\t${q.spec.hard[k]}\n`);
};

DESCRITORES.LimitRange = (w, lr) => {
  w.w(0, `Name:\t${lr.metadata.name}\n`);
  w.w(0, `Namespace:\t${lr.metadata.namespace}\n`);
  w.w(0, 'Type\tResource\tMin\tMax\tDefault Request\tDefault Limit\tMax Limit/Request Ratio\n');
  w.w(0, '----\t--------\t---\t---\t---------------\t-------------\t-----------------------\n');
  for (const l of lr.spec.limits) for (const linha of linhasDoLimite(l)) w.w(0, `${linha}\n`);
};

DESCRITORES.HorizontalPodAutoscaler = (w, h, ctx) => {
  const ref = h.spec.scaleTargetRef;
  w.w(0, `Name:\t${h.metadata.name}\n`);
  w.w(0, `Namespace:\t${h.metadata.namespace}\n`);
  labels(w, 'Labels', h.metadata.labels);
  anotacoes(w, 'Annotations', h.metadata.annotations);
  w.w(0, `CreationTimestamp:\t${rfc(h.metadata.creationTimestamp)}\n`);
  w.w(0, `Reference:\t${ref.kind}/${ref.name}\n`);
  w.w(0, 'Metrics:\t( current / target )\n');
  (h.spec.metrics ?? []).forEach((m, i) => {
    const r = m.resource ?? {};
    const atual = h.status?.currentMetrics?.[i]?.resource?.current;
    if (r.target?.type === 'Utilization') {
      const agora = atual?.averageUtilization !== undefined ? `${atual.averageUtilization}% (${atual.averageValue})` : '<unknown>';
      w.w(1, `resource ${r.name} on pods  (as a percentage of request):\t${agora} / ${r.target.averageUtilization}%\n`);
    } else w.w(1, `resource ${r.name} on pods:\t${atual?.averageValue ?? '<unknown>'} / ${r.target?.averageValue}\n`);
  });
  w.w(0, `Min replicas:\t${h.spec.minReplicas ?? 1}\n`);
  w.w(0, `Max replicas:\t${h.spec.maxReplicas}\n`);
  w.w(0, `${ref.kind} pods:\t${h.status?.currentReplicas ?? 0} current / ${h.status?.desiredReplicas ?? 0} desired\n`);
  if (h.status?.conditions?.length) {
    w.w(0, 'Conditions:\n');
    w.w(1, 'Type\tStatus\tReason\tMessage\n');
    w.w(1, '----\t------\t------\t-------\n');
    for (const c of h.status.conditions) w.w(1, `${c.type}\t${c.status}\t${c.reason}\t${c.message}\n`);
  }
  escreverEventos(w, ctx.eventos, ctx.agora);
};

for (const k of ['IngressClass', 'GatewayClass', 'Gateway', 'HTTPRoute']) DESCRITORES[k] = generico;

export const temDescritor = (kind) => kind in DESCRITORES;

/** Texto do describe de um objeto. */
export function descrever(cluster, obj) {
  const eventos = cluster.eventos.filter((e) => e.involvedObject.uid === obj.metadata.uid);
  const w = new Escritor();
  DESCRITORES[obj.kind](w, obj, { cluster, agora: cluster.agora, eventos });
  return w.texto();
}
