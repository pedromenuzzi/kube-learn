// `kubectl describe`: escreve as mesmas linhas, com os mesmos "\t", que o describe do kubectl, e alinha
// com o tabwriter (padding 2). Cada flush() fecha um bloco de alinhamento, como no código original.
import { tabular } from '../tabwriter.js';
import { idade, rfc1123z, cpuMili, bytes } from '../unidades.js';
import { podsNoNode, pedidosDoPod } from '../scheduler.js';
import { atobUtf8 } from '../esquema.js';

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

  Namespace(w, n) {
    w.w(0, `Name:\t${n.metadata.name}\n`);
    labels(w, 'Labels', n.metadata.labels);
    anotacoes(w, 'Annotations', n.metadata.annotations);
    w.w(0, `Status:\t${n.status?.phase}\n`);
    w.w(0, '\n');
    w.w(0, 'No resource quota.\n');
    w.w(0, '\n');
    w.w(0, 'No LimitRange resource.\n');
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

const seletor = (sel) => Object.entries(sel?.matchLabels ?? {}).sort().map(([k, v]) => `${k}=${v}`).join(',');
const cpuTexto = (m) => (m === 0 ? '0' : m % 1000 === 0 ? String(m / 1000) : `${m}m`);
function memTexto(b) {
  if (b === 0) return '0';
  for (const [suf, f] of [['Gi', 2 ** 30], ['Mi', 2 ** 20], ['Ki', 2 ** 10]]) if (b % f === 0) return `${b / f}${suf}`;
  return String(b);
}

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
for (const k of ['IngressClass', 'GatewayClass', 'Gateway', 'HTTPRoute']) DESCRITORES[k] = generico;

export const temDescritor = (kind) => kind in DESCRITORES;

/** Texto do describe de um objeto. */
export function descrever(cluster, obj) {
  const eventos = cluster.eventos.filter((e) => e.involvedObject.uid === obj.metadata.uid);
  const w = new Escritor();
  DESCRITORES[obj.kind](w, obj, { cluster, agora: cluster.agora, eventos });
  return w.texto();
}
