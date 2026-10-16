// Os controladores do kube-controller-manager: cada um compara o desejado (spec) com o real e corrige.
// Rodam em laço até nada mudar (ver Cluster.reconciliar).
import { hashTemplate, canonico } from './aleatorio.js';
import { casaSeletor, estaPronto, portaAlvo } from './rede.js';
import { iso } from './unidades.js';

const clone = (o) => structuredClone(o);
const TERMINAIS = new Set(['Succeeded', 'Failed']);
const controlador = (obj) => obj.metadata.ownerReferences?.find((o) => o.controller);
const dono = (obj) => ({ apiVersion: obj.apiVersion, blockOwnerDeletion: true, controller: true, kind: obj.kind, name: obj.metadata.name, uid: obj.metadata.uid });
const revisao = (rs) => Number(rs.metadata.annotations?.['deployment.kubernetes.io/revision'] ?? 0);
const porCriacao = (a, b) => a.metadata.creationTimestamp.localeCompare(b.metadata.creationTimestamp) || a.metadata.name.localeCompare(b.metadata.name);

export function rodarControladores(c) {
  namespaces(c);
  deployments(c);
  replicasets(c);
  endpoints(c);
  coletorDeLixo(c);
}

// ---------- Namespace ----------
const CA = '-----BEGIN CERTIFICATE-----\nMIIDBTCCAe2gAwIBAgIIQ2t1YmUtbGVhcm4wDQYJKoZIhvcNAQELBQAwFTETMBEG\nA1UEAxMKa3ViZXJuZXRlczAeFw0yNjEwMTYxMjAwMDBaFw0zNjEwMTQxMjAwMDBa\n-----END CERTIFICATE-----\n';

function namespaces(c) {
  for (const ns of c.listar('Namespace')) {
    const nome = ns.metadata.name;
    if (!ns.metadata.deletionTimestamp) {
      if (!c.obter('ConfigMap', nome, 'kube-root-ca.crt')) {
        c.criar({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'kube-root-ca.crt', namespace: nome, annotations: { 'kubernetes.io/description': 'Contains a CA bundle that can be used to verify the kube-apiserver when using internal endpoints such as the internal service IPs or kubernetes.default.svc. No other usage is guaranteed across distributions of Kubernetes clusters.' } }, data: { 'ca.crt': CA } });
      }
      continue;
    }
    // Namespace sendo apagado: apaga tudo dentro e, quando acabar, o próprio namespace.
    const dentro = c.todos().filter((o) => o.metadata.namespace === nome && o.kind !== 'Event');
    for (const o of dentro) if (!o.metadata.deletionTimestamp) c.remover(o);
    if (!dentro.length) c.finalizarRemocao(ns);
  }
}

// ---------- Deployment ----------
const resolverIntOuPct = (valor, total, arredondarParaCima) => {
  if (typeof valor === 'number') return valor;
  const m = String(valor).match(/^(\d+)%$/);
  if (!m) return Number(valor) || 0;
  const v = (Number(m[1]) * total) / 100;
  return arredondarParaCima ? Math.ceil(v) : Math.floor(v);
};

function limitesRolling(d) {
  const ru = d.spec.strategy.rollingUpdate ?? {};
  const surge = resolverIntOuPct(ru.maxSurge ?? '25%', d.spec.replicas, true);
  let indisp = resolverIntOuPct(ru.maxUnavailable ?? '25%', d.spec.replicas, false);
  if (surge === 0 && indisp === 0) indisp = 1;
  return { surge, indisp: Math.min(indisp, d.spec.replicas) };
}

const semHash = (template) => {
  const t = clone(template);
  delete t.metadata?.labels?.['pod-template-hash'];
  return canonico(t);
};

/** Anotações do Deployment que vão para o ReplicaSet novo (como o change-cause). */
const anotacoesCopiadas = (d) => Object.fromEntries(Object.entries(d.metadata.annotations ?? {})
  .filter(([k]) => !k.startsWith('deployment.kubernetes.io/') && k !== 'kubectl.kubernetes.io/last-applied-configuration'));

function escalar(c, d, rs, n) {
  const antes = rs.spec.replicas;
  if (antes === n) return false;
  rs.spec.replicas = n;
  if (d.spec.strategy.type === 'RollingUpdate') {
    rs.metadata.annotations['deployment.kubernetes.io/desired-replicas'] = String(d.spec.replicas);
    rs.metadata.annotations['deployment.kubernetes.io/max-replicas'] = String(d.spec.replicas + limitesRolling(d).surge);
  }
  c.salvar(rs, { spec: true });
  c.evento(d, 'Normal', 'ScalingReplicaSet', `Scaled ${n > antes ? 'up' : 'down'} replica set ${rs.metadata.name} from ${antes} to ${n}`, { componente: 'deployment-controller' });
  return true;
}

function deployments(c) {
  for (const d of c.listar('Deployment')) {
    if (d.metadata.deletionTimestamp) continue;
    const ns = d.metadata.namespace;
    const meus = c.listar('ReplicaSet', ns).filter((rs) => controlador(rs)?.uid === d.metadata.uid && !rs.metadata.deletionTimestamp);
    const template = d.spec.template;
    const hash = hashTemplate(template);
    let novo = meus.find((rs) => semHash(rs.spec.template) === canonico(template));
    const maxRev = Math.max(0, ...meus.map(revisao));
    let criouNovo = false;

    if (!novo) {
      const labels = { ...(template.metadata?.labels ?? {}), 'pod-template-hash': hash };
      novo = c.criar({
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: `${d.metadata.name}-${hash}`,
          namespace: ns,
          labels,
          annotations: {
            ...anotacoesCopiadas(d),
            'deployment.kubernetes.io/desired-replicas': String(d.spec.replicas),
            'deployment.kubernetes.io/max-replicas': String(d.spec.replicas + (d.spec.strategy.type === 'RollingUpdate' ? limitesRolling(d).surge : 0)),
            'deployment.kubernetes.io/revision': String(maxRev + 1),
          },
          ownerReferences: [dono(d)],
        },
        spec: {
          replicas: 0,
          selector: { matchLabels: { ...d.spec.selector.matchLabels, 'pod-template-hash': hash } },
          template: { metadata: { ...clone(template.metadata ?? {}), labels }, spec: clone(template.spec) },
        },
      });
      criouNovo = true;
    } else {
      let mudou = false;
      if (revisao(novo) < maxRev) { // rollback: o ReplicaSet antigo volta a ser o atual, com revisão nova
        novo.metadata.annotations['deployment.kubernetes.io/revision'] = String(maxRev + 1);
        mudou = true;
      }
      for (const [k, v] of Object.entries(anotacoesCopiadas(d))) {
        if (novo.metadata.annotations[k] !== v) {
          novo.metadata.annotations[k] = v;
          mudou = true;
        }
      }
      if (mudou) c.salvar(novo);
    }
    const antigos = meus.filter((rs) => rs !== novo).sort(porCriacao);

    if (d.metadata.annotations?.['deployment.kubernetes.io/revision'] !== String(revisao(novo))) {
      d.metadata.annotations = { ...(d.metadata.annotations ?? {}), 'deployment.kubernetes.io/revision': String(revisao(novo)) };
      c.salvar(d);
    }

    if (!d.spec.paused) {
      if (d.spec.strategy.type === 'Recreate') recriar(c, d, novo, antigos);
      else rolling(c, d, novo, antigos);
    }
    limparHistorico(c, d, antigos);
    statusDeployment(c, d, novo, antigos, criouNovo);
  }
}

function rolling(c, d, novo, antigos) {
  const replicas = d.spec.replicas;
  const { surge, indisp } = limitesRolling(d);
  const soma = (l, f) => l.reduce((s, rs) => s + f(rs), 0);
  const spec = (rs) => rs.spec.replicas;
  const disponiveis = (rs) => rs.status?.availableReplicas ?? 0;

  if (soma(antigos, spec) === 0) {
    escalar(c, d, novo, replicas);
    return;
  }
  const todos = [novo, ...antigos];
  const total = soma(todos, spec);
  if (total < replicas + surge && novo.spec.replicas < replicas) {
    const n = Math.min(novo.spec.replicas + (replicas + surge - total), replicas);
    if (escalar(c, d, novo, n)) return;
  }
  const minDisp = replicas - indisp;
  const maxDescer = soma(todos, spec) - minDisp - (novo.spec.replicas - disponiveis(novo));
  if (maxDescer <= 0) return;
  let descidos = 0;
  for (const rs of antigos) { // primeiro os antigos que nem estão disponíveis
    if (descidos >= maxDescer) break;
    const ruins = rs.spec.replicas - disponiveis(rs);
    if (!rs.spec.replicas || ruins <= 0) continue;
    const n = Math.min(maxDescer - descidos, ruins);
    escalar(c, d, rs, rs.spec.replicas - n);
    descidos += n;
  }
  const disp = soma(todos, disponiveis);
  if (disp <= minDisp) return;
  let falta = disp - minDisp;
  for (const rs of antigos) {
    if (falta <= 0) break;
    if (!rs.spec.replicas) continue;
    const n = Math.min(rs.spec.replicas, falta);
    escalar(c, d, rs, rs.spec.replicas - n);
    falta -= n;
  }
}

function recriar(c, d, novo, antigos) {
  let desceu = false;
  for (const rs of antigos) if (rs.spec.replicas) desceu = escalar(c, d, rs, 0) || desceu;
  if (desceu) return;
  const uids = new Set(antigos.map((rs) => rs.metadata.uid));
  const restam = c.listar('Pod', d.metadata.namespace).some((p) => uids.has(controlador(p)?.uid));
  if (!restam) escalar(c, d, novo, d.spec.replicas);
}

function limparHistorico(c, d, antigos) {
  const parados = antigos.filter((rs) => rs.spec.replicas === 0 && !(rs.status?.replicas));
  const sobra = parados.length - (d.spec.revisionHistoryLimit ?? 10);
  for (const rs of parados.slice(0, Math.max(0, sobra))) c.remover(rs);
}

function condicao(anterior, tipo, status, reason, message, agora, atualizou) {
  const a = anterior?.find((x) => x.type === tipo);
  const mudouStatus = !a || a.status !== status;
  const mudouMotivo = !a || a.reason !== reason || a.message !== message;
  return {
    lastTransitionTime: mudouStatus ? iso(agora) : a.lastTransitionTime,
    lastUpdateTime: mudouStatus || mudouMotivo || atualizou ? iso(agora) : a.lastUpdateTime,
    message,
    reason,
    status,
    type: tipo,
  };
}

function statusDeployment(c, d, novo, antigos, criouNovo) {
  const todos = [novo, ...antigos];
  const soma = (f) => todos.reduce((s, rs) => s + (f(rs) ?? 0), 0);
  const replicas = soma((rs) => rs.status?.replicas);
  const atualizadas = novo.status?.replicas ?? 0;
  const prontas = soma((rs) => rs.status?.readyReplicas);
  const disponiveis = soma((rs) => rs.status?.availableReplicas);
  const indisponiveis = Math.max(0, soma((rs) => rs.spec.replicas) - disponiveis);
  const terminando = soma((rs) => rs.status?.terminatingReplicas);
  const desejadas = d.spec.replicas;
  const anterior = d.status ?? {};
  const minDisp = d.spec.strategy.type === 'RollingUpdate' ? desejadas - limitesRolling(d).indisp : 0;

  const completo = atualizadas === desejadas && replicas === desejadas && disponiveis === desejadas && novo.spec.replicas === desejadas;
  const progrediu = anterior.updatedReplicas !== atualizadas || anterior.availableReplicas !== disponiveis || anterior.readyReplicas !== prontas || criouNovo;
  const progAnt = anterior.conditions?.find((x) => x.type === 'Progressing');
  let prog;
  if (criouNovo) prog = ['True', 'NewReplicaSetCreated', `Created new replica set "${novo.metadata.name}"`];
  else if (completo) prog = ['True', 'NewReplicaSetAvailable', `ReplicaSet "${novo.metadata.name}" has successfully progressed.`];
  else if (progrediu || progAnt?.reason === 'NewReplicaSetAvailable') prog = ['True', 'ReplicaSetUpdated', `ReplicaSet "${novo.metadata.name}" is progressing.`];
  else if (progAnt && c.agora - Date.parse(progAnt.lastUpdateTime) > d.spec.progressDeadlineSeconds * 1000) prog = ['False', 'ProgressDeadlineExceeded', `ReplicaSet "${novo.metadata.name}" has timed out progressing.`];
  else prog = [progAnt.status, progAnt.reason, progAnt.message];

  const disponivel = disponiveis >= minDisp
    ? ['True', 'MinimumReplicasAvailable', 'Deployment has minimum availability.']
    : ['False', 'MinimumReplicasUnavailable', 'Deployment does not have minimum availability.'];

  const status = {
    ...(disponiveis ? { availableReplicas: disponiveis } : {}),
    conditions: [
      condicao(anterior.conditions, 'Available', ...disponivel, c.agora, false),
      condicao(anterior.conditions, 'Progressing', ...prog, c.agora, progrediu && !completo),
    ],
    observedGeneration: d.metadata.generation,
    ...(prontas ? { readyReplicas: prontas } : {}),
    ...(replicas ? { replicas } : {}),
    terminatingReplicas: terminando,
    ...(indisponiveis ? { unavailableReplicas: indisponiveis } : {}),
    ...(atualizadas ? { updatedReplicas: atualizadas } : {}),
  };
  if (JSON.stringify(status) !== JSON.stringify(d.status)) {
    d.status = status;
    c.salvar(d);
  }
}

// ---------- ReplicaSet ----------
/** Ordem de quem sai primeiro quando sobra pod (como o controller.ActivePods). */
function ordemParaApagar(a, b) {
  const nivel = (p) => [
    p.spec.nodeName ? 1 : 0,
    { Pending: 0, Unknown: 1, Running: 2 }[p.status?.phase] ?? 0,
    estaPronto(p) ? 1 : 0,
    -(p.status?.containerStatuses ?? []).reduce((s, x) => s + x.restartCount, 0),
  ];
  const na = nivel(a);
  const nb = nivel(b);
  for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) return na[i] - nb[i];
  return b.metadata.creationTimestamp.localeCompare(a.metadata.creationTimestamp);
}

function replicasets(c) {
  for (const rs of c.listar('ReplicaSet')) {
    if (rs.metadata.deletionTimestamp) continue;
    const ns = rs.metadata.namespace;
    const sel = rs.spec.selector.matchLabels;
    const pods = c.listar('Pod', ns);
    for (const p of pods) {
      const ctrl = controlador(p);
      const casa = casaSeletor(sel, p.metadata.labels);
      if (!ctrl && casa && !p.metadata.deletionTimestamp && !TERMINAIS.has(p.status?.phase)) { // adota o pod órfão
        p.metadata.ownerReferences = [...(p.metadata.ownerReferences ?? []), dono(rs)];
        c.salvar(p);
      } else if (ctrl?.uid === rs.metadata.uid && !casa) { // a label mudou: solta o pod
        p.metadata.ownerReferences = p.metadata.ownerReferences.filter((o) => o.uid !== rs.metadata.uid);
        if (!p.metadata.ownerReferences.length) delete p.metadata.ownerReferences;
        c.salvar(p);
      }
    }
    const meus = () => c.listar('Pod', ns).filter((p) => controlador(p)?.uid === rs.metadata.uid);
    const ativos = meus().filter((p) => !p.metadata.deletionTimestamp && !TERMINAIS.has(p.status?.phase));
    const diff = rs.spec.replicas - ativos.length;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        const pod = c.criar({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            generateName: `${rs.metadata.name}-`,
            namespace: ns,
            labels: clone(rs.spec.template.metadata?.labels ?? {}),
            ...(rs.spec.template.metadata?.annotations ? { annotations: clone(rs.spec.template.metadata.annotations) } : {}),
            ownerReferences: [dono(rs)],
          },
          spec: clone(rs.spec.template.spec),
        });
        c.evento(rs, 'Normal', 'SuccessfulCreate', `Created pod: ${pod.metadata.name}`, { componente: 'replicaset-controller' });
      }
    } else if (diff < 0) {
      for (const p of ativos.sort(ordemParaApagar).slice(0, -diff)) {
        c.remover(p);
        c.evento(rs, 'Normal', 'SuccessfulDelete', `Deleted pod: ${p.metadata.name}`, { componente: 'replicaset-controller' });
      }
    }
    const todos = meus();
    const vivos = todos.filter((p) => !p.metadata.deletionTimestamp && !TERMINAIS.has(p.status?.phase));
    const prontos = vivos.filter(estaPronto);
    const minReady = (rs.spec.minReadySeconds ?? 0) * 1000;
    const disponiveis = prontos.filter((p) => c.agora - Date.parse(p.status.conditions.find((x) => x.type === 'Ready').lastTransitionTime) >= minReady);
    const status = {
      ...(disponiveis.length ? { availableReplicas: disponiveis.length } : {}),
      ...(vivos.length ? { fullyLabeledReplicas: vivos.length } : {}),
      observedGeneration: rs.metadata.generation,
      ...(prontos.length ? { readyReplicas: prontos.length } : {}),
      replicas: vivos.length,
      terminatingReplicas: todos.length - vivos.length,
    };
    if (JSON.stringify(status) !== JSON.stringify(rs.status)) {
      rs.status = status;
      c.salvar(rs);
    }
  }
}

// ---------- Endpoints ----------
function endpoints(c) {
  for (const svc of c.listar('Service')) {
    const sel = svc.spec.selector;
    if (!sel || !Object.keys(sel).length) continue;
    const ns = svc.metadata.namespace;
    const pods = c.listar('Pod', ns)
      .filter((p) => casaSeletor(sel, p.metadata.labels) && p.status?.podIP && !p.metadata.deletionTimestamp && !TERMINAIS.has(p.status?.phase))
      .sort((a, b) => a.status.podIP.localeCompare(b.status.podIP, undefined, { numeric: true }));
    const endereco = (p) => ({ ip: p.status.podIP, nodeName: p.spec.nodeName, targetRef: { kind: 'Pod', name: p.metadata.name, namespace: ns, uid: p.metadata.uid } });
    const comPorta = pods.filter((p) => svc.spec.ports.every((sp) => portaAlvo(p, sp.targetPort) !== null));
    const portas = svc.spec.ports.map((sp) => ({
      ...(sp.name ? { name: sp.name } : {}),
      port: comPorta.length ? portaAlvo(comPorta[0], sp.targetPort) : Number(sp.targetPort) || sp.port,
      protocol: sp.protocol,
    }));
    const prontos = comPorta.filter(estaPronto);
    const naoProntos = comPorta.filter((p) => !estaPronto(p));
    const subsets = comPorta.length ? [{
      ...(prontos.length ? { addresses: prontos.map(endereco) } : {}),
      ...(naoProntos.length ? { notReadyAddresses: naoProntos.map(endereco) } : {}),
      ports: portas,
    }] : undefined;
    const atual = c.obter('Endpoints', ns, svc.metadata.name);
    if (!atual) {
      c.criar({
        apiVersion: 'v1',
        kind: 'Endpoints',
        metadata: { name: svc.metadata.name, namespace: ns, labels: { ...(svc.metadata.labels ?? {}), 'endpoints.kubernetes.io/managed-by': 'endpoint-controller' } },
        ...(subsets ? { subsets } : {}),
      });
    } else if (JSON.stringify(atual.subsets) !== JSON.stringify(subsets)) {
      if (subsets) atual.subsets = subsets;
      else delete atual.subsets;
      atual.metadata.annotations = { 'endpoints.kubernetes.io/last-change-trigger-time': iso(c.agora) };
      c.salvar(atual);
    }
  }
  // Endpoints de Service que não existe mais.
  for (const ep of c.listar('Endpoints')) {
    if (ep.metadata.labels?.['endpoints.kubernetes.io/managed-by'] && !c.obter('Service', ep.metadata.namespace, ep.metadata.name)) c.finalizarRemocao(ep);
  }
}

// ---------- coletor de lixo ----------
function coletorDeLixo(c) {
  for (const o of c.todos()) {
    const refs = o.metadata.ownerReferences;
    if (!refs?.length || o.metadata.deletionTimestamp) continue;
    if (refs.every((r) => !c.porUid.has(r.uid))) c.remover(o);
  }
}
