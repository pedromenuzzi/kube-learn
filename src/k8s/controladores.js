// Os controladores do kube-controller-manager: cada um compara o desejado (spec) com o real e corrige.
// Rodam em laço até nada mudar (ver Cluster.reconciliar).
import { hashTemplate, canonico, uuidDe, ALFABETO } from './aleatorio.js';
import { casaSeletor, estaPronto, portaAlvo, classeDoIngress, IP_INGRESS } from './rede.js';
import { iso, cpuMili, bytes, textoMemoria } from './unidades.js';
import { controladorDeDiscos } from './discos.js';
import { lerCron, isoNoFuso } from './cron.js';
import { padroesJob } from './esquema.js';
import { tolera } from './scheduler.js';
import { controladorDeCotas } from './cotas.js';
import { controladorDeNodes, controladorDePdbs } from './manutencao.js';
import { operadorDeBackup } from './crds.js';

const clone = (o) => structuredClone(o);
const TERMINAIS = new Set(['Succeeded', 'Failed']);
const controlador = (obj) => obj.metadata.ownerReferences?.find((o) => o.controller);
const dono = (obj) => ({ apiVersion: obj.apiVersion, blockOwnerDeletion: true, controller: true, kind: obj.kind, name: obj.metadata.name, uid: obj.metadata.uid });
const revisao = (rs) => Number(rs.metadata.annotations?.['deployment.kubernetes.io/revision'] ?? 0);
const porCriacao = (a, b) => a.metadata.creationTimestamp.localeCompare(b.metadata.creationTimestamp) || a.metadata.name.localeCompare(b.metadata.name);

/** O Service `kubernetes` (o endereço do apiserver): quem apaga vê o apiserver criar de novo. */
export function servicoKubernetes(c) {
  if (c.obter('Service', 'default', 'kubernetes')) return;
  c.criar({
    apiVersion: 'v1', kind: 'Service',
    metadata: { name: 'kubernetes', namespace: 'default', labels: { component: 'apiserver', provider: 'kubernetes' } },
    spec: { clusterIP: '10.96.0.1', ports: [{ name: 'https', port: 443, protocol: 'TCP', targetPort: 6443 }] },
  });
}

/**
 * Um controlador que só lê o que está guardado (sem estado próprio): se a última rodada, nesta mesma versão do cluster,
 * não mudou nada, esta também não mudaria. Toda mudança guardada troca a versão (c.rv). O que também olha o relógio
 * diz, em `acorda(c)`, quando vence o próximo prazo que ele confere: até lá, a rodada sem mudança continua valendo.
 */
function soDoEstado(c, controlador, acorda = () => Infinity) {
  const ocioso = c.ociosos.get(controlador);
  if (ocioso?.rv === c.rv && c.agora < ocioso.ate) return;
  const antes = c.rv;
  controlador(c);
  if (c.rv === antes) c.ociosos.set(controlador, { rv: antes, ate: acorda(c) });
}

/** A próxima tentativa de criar um pod recusado (a espera crescente do FailedCreate, em criarPodDe). */
const proximaTentativa = (c) => Math.min(Infinity, ...[...c.esperaCriacao.values()].map((e) => e.proxima));

/** Quando vence o progressDeadlineSeconds de um rollout que não terminou (o Deployment vira ProgressDeadlineExceeded). */
function prazoDosRollouts(c) {
  let ate = Infinity;
  for (const d of c.listar('Deployment')) {
    const prog = d.status?.conditions?.find((x) => x.type === 'Progressing');
    if (prog && !['NewReplicaSetAvailable', 'ProgressDeadlineExceeded'].includes(prog.reason)) ate = Math.min(ate, Date.parse(prog.lastUpdateTime) + d.spec.progressDeadlineSeconds * 1000 + 1);
  }
  return ate;
}

/** O ReplicaSet com minReadySeconds e pod pronto ainda não disponível muda só com o relógio: aí, roda toda vez. */
const prazoDosReplicaSets = (c) => (c.listar('ReplicaSet').some((rs) => rs.spec.minReadySeconds && (rs.status?.readyReplicas ?? 0) !== (rs.status?.availableReplicas ?? 0)) ? -Infinity : proximaTentativa(c));

export function rodarControladores(c) {
  servicoKubernetes(c);
  controladorDeNodes(c);
  soDoEstado(c, namespaces);
  soDoEstado(c, deployments, prazoDosRollouts);
  soDoEstado(c, replicasets, prazoDosReplicaSets);
  statefulsets(c);
  soDoEstado(c, daemonsets, proximaTentativa);
  cronjobs(c);
  jobs(c);
  controladorDeDiscos(c);
  soDoEstado(c, controladorDeCotas);
  autoscalers(c);
  operadorDeBackup(c);
  servidorDeMetricas(c);
  controladorDePdbs(c);
  soDoEstado(c, endpoints);
  balanceadores(c);
  soDoEstado(c, ingresses);
  soDoEstado(c, gateways);
  soDoEstado(c, coletorDeLixo);
}

/**
 * Cria o pod de um controlador. Se o apiserver recusa (cota, LimitRange), registra FailedCreate e espera um pouco
 * (cada vez mais) antes de tentar de novo, como os controladores reais. → o pod, ou null.
 */
function criarPodDe(c, controle, manifesto, componente) {
  const espera = c.esperaCriacao.get(controle.metadata.uid);
  if (espera && c.agora < espera.proxima) return null;
  try {
    const pod = c.criar(manifesto);
    c.esperaCriacao.delete(controle.metadata.uid);
    return pod;
  } catch (e) {
    if (!e.codigo) throw e;
    const atraso = Math.min((espera?.atraso ?? 500) * 2, 60_000);
    c.esperaCriacao.set(controle.metadata.uid, { proxima: c.agora + atraso, atraso, erro: e.message });
    c.evento(controle, 'Warning', 'FailedCreate', `Error creating: ${e.message}`, { componente });
    return null;
  }
}

const cond = (tipo, motivo, mensagem, desde, status = 'True') => ({ lastTransitionTime: desde, message: mensagem, observedGeneration: 1, reason: motivo, status, type: tipo });

// ---------- LoadBalancer: o "provedor de nuvem" do simulador dá um IP externo depois de uns segundos ----------
function balanceadores(c) {
  for (const s of c.listar('Service')) {
    if (s.spec.type !== 'LoadBalancer' || s.status?.loadBalancer?.ingress?.length) continue;
    if (c.agora - Date.parse(s.metadata.creationTimestamp) < 2000) continue;
    c.trocarStatus(s, { loadBalancer: { ingress: [{ ip: c.alocarIpExterno(), ipMode: 'VIP' }] } });
    c.evento(s, 'Normal', 'EnsuredLoadBalancer', 'Ensured load balancer', { componente: 'service-controller' });
  }
}

// ---------- Ingress: o controlador da classe põe o endereço dele no status ----------
function ingresses(c) {
  for (const ing of c.listar('Ingress')) {
    const classe = classeDoIngress(c, ing);
    c.trocarStatus(ing, { loadBalancer: classe ? { ingress: [{ ip: IP_INGRESS }] } : {} });
  }
}

// ---------- Gateway API ----------
function gateways(c) {
  for (const gc of c.listar('GatewayClass')) {
    const desde = gc.status?.conditions?.[0]?.lastTransitionTime ?? iso(c.agora);
    c.trocarStatus(gc, { conditions: [cond('Accepted', 'Accepted', 'Valid GatewayClass', desde)] });
  }
  for (const gw of c.listar('Gateway')) {
    const classe = c.obter('GatewayClass', null, gw.spec.gatewayClassName);
    const desde = gw.status?.conditions?.[0]?.lastTransitionTime ?? iso(c.agora);
    const rotas = c.listar('HTTPRoute').filter((r) => (r.spec.parentRefs ?? []).some((p) => p.name === gw.metadata.name && (p.namespace ?? r.metadata.namespace) === gw.metadata.namespace));
    const status = classe
      ? {
        addresses: [{ type: 'IPAddress', value: gw.status?.addresses?.[0]?.value ?? c.alocarIpExterno() }],
        conditions: [cond('Accepted', 'Accepted', 'Resource accepted', desde), cond('Programmed', 'Programmed', 'Resource programmed', desde)],
        listeners: gw.spec.listeners.map((l) => ({ attachedRoutes: rotas.length, name: l.name, supportedKinds: [{ group: 'gateway.networking.k8s.io', kind: 'HTTPRoute' }] })),
      }
      : { conditions: [cond('Accepted', 'NoResources', `GatewayClass "${gw.spec.gatewayClassName}" not found`, desde, 'False'), cond('Programmed', 'Pending', 'Waiting for controller', desde, 'False')] };
    c.trocarStatus(gw, status);
  }
  for (const r of c.listar('HTTPRoute')) {
    const desde = r.status?.parents?.[0]?.conditions?.[0]?.lastTransitionTime ?? iso(c.agora);
    const parents = (r.spec.parentRefs ?? []).map((p) => {
      const gw = c.obter('Gateway', p.namespace ?? r.metadata.namespace, p.name);
      const faltam = (r.spec.rules ?? []).flatMap((x) => x.backendRefs ?? []).filter((b) => !c.obter('Service', b.namespace ?? r.metadata.namespace, b.name)).map((b) => b.name);
      return {
        conditions: [
          gw ? cond('Accepted', 'Accepted', 'Route is accepted', desde) : cond('Accepted', 'NoMatchingParent', `Gateway "${p.name}" not found`, desde, 'False'),
          faltam.length ? cond('ResolvedRefs', 'BackendNotFound', `Service "${faltam[0]}" not found`, desde, 'False') : cond('ResolvedRefs', 'ResolvedRefs', 'Resolved all the Object references for the Route', desde),
        ],
        controllerName: 'kube-learn.dev/gateway-controller',
        parentRef: { group: 'gateway.networking.k8s.io', kind: 'Gateway', name: p.name },
      };
    });
    c.trocarStatus(r, { parents });
  }
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

// O hash e a forma canônica do template custam caro: guardados por objeto e geração (o template só muda com o spec).
const moldeDe = (c, d) => {
  const chave = `${d.metadata.uid}:${d.metadata.generation}`;
  if (!c.moldes.has(chave)) c.moldes.set(chave, { hash: hashTemplate(d.spec.template), canon: canonico(d.spec.template) });
  return c.moldes.get(chave);
};
const moldeSemHash = (c, rs) => {
  const chave = `rs:${rs.metadata.uid}:${rs.metadata.generation}`;
  if (!c.moldes.has(chave)) c.moldes.set(chave, semHash(rs.spec.template));
  return c.moldes.get(chave);
};

/**
 * O hash do template de um DaemonSet ou StatefulSet, guardado enquanto o objeto não muda de versão (todo template novo
 * passa por um salvar) nem de imagem (o kubectl set image troca a imagem antes de conferir os outros pares).
 */
const hashes = new WeakMap();
function hashDoTemplate(obj) {
  const t = obj.spec.template;
  const imagens = (t.spec?.containers ?? []).map((ct) => ct.image).join('\n');
  const m = hashes.get(obj);
  if (m && m.t === t && m.rv === obj.metadata.resourceVersion && m.imagens === imagens) return m.hash;
  const hash = hashTemplate(t);
  hashes.set(obj, { t, rv: obj.metadata.resourceVersion, imagens, hash });
  return hash;
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
    const { hash, canon } = moldeDe(c, d);
    let novo = meus.find((rs) => moldeSemHash(c, rs) === canon);
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
  c.trocarStatus(d, status);
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
        const pod = criarPodDe(c, rs, {
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
        }, 'replicaset-controller');
        if (!pod) break;
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
    // Pod recusado pelo apiserver (cota, PodSecurity...): a condição ReplicaFailure fica até uma criação dar certo.
    const falha = c.esperaCriacao.get(rs.metadata.uid)?.erro;
    if (falha) {
      const antes = rs.status?.conditions?.find((x) => x.type === 'ReplicaFailure');
      status.conditions = [{ lastTransitionTime: antes?.lastTransitionTime ?? iso(c.agora), message: falha, reason: 'FailedCreate', status: 'True', type: 'ReplicaFailure' }];
    }
    c.trocarStatus(rs, status);
  }
}

// ---------- StatefulSet ----------
const indice = (p) => Number(p.metadata.labels?.['apps.kubernetes.io/pod-index'] ?? p.metadata.name.split('-').pop());
const prontoERodando = (p) => p.status?.phase === 'Running' && estaPronto(p) && !p.metadata.deletionTimestamp;

/** Pods com identidade: nomes fixos (db-0, db-1...), um de cada vez, cada um com o seu PVC. */
function statefulsets(c) {
  for (const sts of c.listar('StatefulSet')) {
    if (sts.metadata.deletionTimestamp) continue;
    const ns = sts.metadata.namespace;
    const nome = sts.metadata.name;
    const revisao = `${nome}-${hashDoTemplate(sts)}`;
    const meus = c.listar('Pod', ns).filter((p) => controlador(p)?.uid === sts.metadata.uid);
    const porIndice = new Map(meus.map((p) => [indice(p), p]));
    const n = sts.spec.replicas;
    const emOrdem = sts.spec.podManagementPolicy !== 'Parallel';
    const evento = (motivo, msg) => c.evento(sts, 'Normal', motivo, msg, { componente: 'statefulset-controller' });

    // Sobe: cria o que falta, em ordem; o próximo só nasce quando o anterior está pronto (OrderedReady).
    for (let i = 0; i < n; i++) {
      const p = porIndice.get(i);
      if (p) {
        if (TERMINAIS.has(p.status?.phase) && !p.metadata.deletionTimestamp) c.remover(p, { graca: 0 });
        if (emOrdem && !prontoERodando(p)) break;
        continue;
      }
      const podNome = `${nome}-${i}`;
      const moldes = sts.spec.volumeClaimTemplates ?? [];
      for (const t of moldes) {
        const pvcNome = `${t.metadata.name}-${podNome}`;
        if (c.obter('PersistentVolumeClaim', ns, pvcNome)) continue;
        c.criar({
          apiVersion: 'v1', kind: 'PersistentVolumeClaim',
          metadata: { ...clone(t.metadata), name: pvcNome, namespace: ns, labels: { ...(t.metadata.labels ?? {}), ...sts.spec.selector.matchLabels } },
          spec: clone(t.spec),
        });
        evento('SuccessfulCreate', `Create Claim ${pvcNome} Pod ${podNome} in StatefulSet ${nome} success`);
      }
      const spec = clone(sts.spec.template.spec);
      const volumesDosMoldes = moldes.map((t) => ({ name: t.metadata.name, persistentVolumeClaim: { claimName: `${t.metadata.name}-${podNome}` } }));
      spec.volumes = [...volumesDosMoldes, ...(spec.volumes ?? []).filter((v) => !moldes.some((t) => t.metadata.name === v.name))];
      if (!spec.volumes.length) delete spec.volumes;
      spec.hostname = podNome;
      if (sts.spec.serviceName) spec.subdomain = sts.spec.serviceName;
      const criado = criarPodDe(c, sts, {
        apiVersion: 'v1', kind: 'Pod',
        metadata: {
          generateName: `${nome}-`,
          name: podNome,
          namespace: ns,
          labels: { ...clone(sts.spec.template.metadata?.labels ?? {}), 'apps.kubernetes.io/pod-index': String(i), 'controller-revision-hash': revisao, 'statefulset.kubernetes.io/pod-name': podNome },
          ...(sts.spec.template.metadata?.annotations ? { annotations: clone(sts.spec.template.metadata.annotations) } : {}),
          ownerReferences: [dono(sts)],
        },
        spec,
      }, 'statefulset-controller');
      if (!criado) break;
      evento('SuccessfulCreate', `Create Pod ${podNome} in StatefulSet ${nome} successful`);
      if (emOrdem) break;
    }

    // Desce: apaga do maior número para o menor, um de cada vez. Os PVCs ficam (os dados esperam a volta).
    const sobrando = meus.filter((p) => indice(p) >= n).sort((a, b) => indice(b) - indice(a));
    if (sobrando.length && (!emOrdem || !sobrando.some((p) => p.metadata.deletionTimestamp))) {
      const alvo = sobrando.find((p) => !p.metadata.deletionTimestamp);
      if (alvo) {
        c.remover(alvo);
        evento('SuccessfulDelete', `Delete Pod ${alvo.metadata.name} in StatefulSet ${nome} successful`);
      }
    }

    // Template novo (RollingUpdate): troca do maior número para o menor, um pod de cada vez, esperando o anterior.
    const atuais = [...porIndice.entries()].filter(([i]) => i < n).map(([, p]) => p);
    const particao = sts.spec.updateStrategy?.rollingUpdate?.partition ?? 0;
    if (sts.spec.updateStrategy?.type !== 'OnDelete' && atuais.length === n && atuais.every(prontoERodando)) {
      const velho = atuais.filter((p) => indice(p) >= particao && p.metadata.labels['controller-revision-hash'] !== revisao).sort((a, b) => indice(b) - indice(a))[0];
      if (velho) {
        c.remover(velho);
        evento('SuccessfulDelete', `Delete Pod ${velho.metadata.name} in StatefulSet ${nome} successful`);
      }
    }

    const vivos = c.listar('Pod', ns).filter((p) => controlador(p)?.uid === sts.metadata.uid && !p.metadata.deletionTimestamp);
    const novos = vivos.filter((p) => p.metadata.labels['controller-revision-hash'] === revisao);
    const prontos = vivos.filter((p) => estaPronto(p));
    const revisaoAtual = novos.length === vivos.length ? revisao : sts.status?.currentRevision ?? revisao;
    const status = {
      availableReplicas: prontos.length,
      collisionCount: 0,
      ...(vivos.length - (revisaoAtual === revisao ? 0 : novos.length) ? { currentReplicas: vivos.length - (revisaoAtual === revisao ? 0 : novos.length) } : {}),
      currentRevision: revisaoAtual,
      observedGeneration: sts.metadata.generation,
      ...(prontos.length ? { readyReplicas: prontos.length } : {}),
      replicas: vivos.length,
      updateRevision: revisao,
      ...(novos.length ? { updatedReplicas: novos.length } : {}),
    };
    c.trocarStatus(sts, status);
  }
}

// ---------- Job ----------
const ESPERA_JOB = 10_000; // depois de cada falha, a próxima tentativa espera 10s, 20s, 40s... (até 6 min)
const condJob = (tipo, motivo, msg, agora) => ({ lastProbeTime: iso(agora), lastTransitionTime: iso(agora), message: msg, reason: motivo, status: 'True', type: tipo });
const terminou = (job) => job.status?.conditions?.some((x) => (x.type === 'Complete' || x.type === 'Failed') && x.status === 'True');

/** Roda o trabalho até o fim: completions pods com sucesso, no máximo parallelism ao mesmo tempo, até backoffLimit falhas. */
function jobs(c) {
  for (const job of c.listar('Job')) {
    if (job.metadata.deletionTimestamp) continue;
    const s = job.spec;
    const pods = c.listar('Pod', job.metadata.namespace).filter((p) => controlador(p)?.uid === job.metadata.uid);
    const sucesso = pods.filter((p) => p.status?.phase === 'Succeeded');
    const falhos = pods.filter((p) => p.status?.phase === 'Failed');
    const ativos = pods.filter((p) => !TERMINAIS.has(p.status?.phase) && !p.metadata.deletionTimestamp);
    const saindo = pods.filter((p) => !TERMINAIS.has(p.status?.phase) && p.metadata.deletionTimestamp);
    // Com OnFailure o contêiner reinicia no mesmo pod: cada reinício também conta como falha.
    const reinicios = ativos.reduce((t, p) => t + (p.status?.containerStatuses ?? []).reduce((x, st) => x + st.restartCount, 0), 0);
    const falhas = falhos.length + reinicios;
    const evento = (tipo, motivo, msg) => c.evento(job, tipo, motivo, msg, { componente: 'job-controller' });
    const st = { ...(job.status ?? {}) };
    st.startTime ??= iso(c.agora);

    if (ttlVencido(c, job)) continue;
    const alvo = st.conditions?.find((x) => x.type === 'FailureTarget');
    if (alvo && !terminou(job)) {
      // Já falhou (FailureTarget): o Failed só vem quando os pods que ele mandou parar terminarem de sair.
      if (!saindo.length) {
        st.conditions = [alvo, condJob('Failed', alvo.reason, alvo.message, c.agora)];
        evento('Warning', alvo.reason, alvo.message);
      }
    } else if (!terminou(job) && !s.suspend) {
      const prazo = s.activeDeadlineSeconds !== undefined && c.agora - Date.parse(st.startTime) >= s.activeDeadlineSeconds * 1000;
      if (falhas > s.backoffLimit || prazo) {
        const [motivo, msg] = prazo ? ['DeadlineExceeded', 'Job was active longer than specified deadline'] : ['BackoffLimitExceeded', 'Job has reached the specified backoff limit'];
        for (const p of ativos) {
          c.remover(p);
          evento('Normal', 'SuccessfulDelete', `Deleted pod: ${p.metadata.name}`);
        }
        st.failed = falhos.length + ativos.length; // quem foi mandado parar já conta como falha
        // FailureTarget já; o Failed (e o evento) quando ninguém mais estiver saindo (agora mesmo, se ninguém ficou).
        st.conditions = [condJob('FailureTarget', motivo, msg, c.agora)];
        if (!saindo.length && !ativos.some((p) => c.obter('Pod', p.metadata.namespace, p.metadata.name) === p)) {
          st.conditions.push(condJob('Failed', motivo, msg, c.agora));
          evento('Warning', motivo, msg);
        }
      } else if (s.completions !== undefined && sucesso.length >= s.completions) {
        st.completionTime = iso(c.agora);
        st.conditions = [condJob('SuccessCriteriaMet', 'CompletionsReached', 'Reached expected number of succeeded pods', c.agora), condJob('Complete', 'CompletionsReached', 'Reached expected number of succeeded pods', c.agora)];
        evento('Normal', 'Completed', 'Job completed');
      } else {
        const faltam = (s.completions ?? Math.max(s.parallelism, 1)) - sucesso.length;
        const novos = Math.min(s.parallelism, faltam) - ativos.length;
        const ultimaFalha = Math.max(0, ...falhos.map((p) => Date.parse(p.status.containerStatuses?.[0]?.state?.terminated?.finishedAt ?? p.metadata.creationTimestamp)));
        const espera = falhos.length ? Math.min(ESPERA_JOB * 2 ** (falhos.length - 1), 360_000) : 0;
        if (novos > 0 && c.agora >= ultimaFalha + espera) {
          for (let i = 0; i < novos; i++) {
            const pod = criarPodDe(c, job, {
              apiVersion: 'v1', kind: 'Pod',
              metadata: {
                generateName: `${job.metadata.name}-`, namespace: job.metadata.namespace,
                labels: clone(s.template.metadata?.labels ?? {}),
                ...(s.template.metadata?.annotations ? { annotations: clone(s.template.metadata.annotations) } : {}),
                ownerReferences: [dono(job)],
              },
              spec: clone(s.template.spec),
            }, 'job-controller');
            if (!pod) break;
            evento('Normal', 'SuccessfulCreate', `Created pod: ${pod.metadata.name}`);
          }
        }
      }
    }
    const vivos = c.listar('Pod', job.metadata.namespace).filter((p) => controlador(p)?.uid === job.metadata.uid && !TERMINAIS.has(p.status?.phase));
    const agora = vivos.filter((p) => !p.metadata.deletionTimestamp);
    const status = {
      ...(agora.length ? { active: agora.length } : {}),
      ...(st.completionTime ? { completionTime: st.completionTime } : {}),
      ...(st.conditions ? { conditions: st.conditions } : {}),
      ...(Math.max(falhos.length, st.failed ?? 0) ? { failed: Math.max(falhos.length, st.failed ?? 0) } : {}),
      ready: agora.filter(estaPronto).length,
      startTime: st.startTime,
      ...(sucesso.length ? { succeeded: sucesso.length } : {}),
      terminating: vivos.length - agora.length,
      uncountedTerminatedPods: {},
    };
    c.trocarStatus(job, status);
  }
}

/** ttlSecondsAfterFinished: o Job terminado some (com os pods) depois do prazo. */
function ttlVencido(c, job) {
  const ttl = job.spec.ttlSecondsAfterFinished;
  const fim = job.status?.conditions?.find((x) => (x.type === 'Complete' || x.type === 'Failed') && x.status === 'True');
  if (ttl === undefined || !fim || c.agora - Date.parse(fim.lastTransitionTime) < ttl * 1000) return false;
  c.remover(job);
  return true;
}

// ---------- CronJob ----------
/**
 * O horário mais recente que ainda não rodou (o mostRecentScheduleTime do controlador): depois do último agendamento
 * (ou da criação) e dentro do startingDeadlineSeconds. Quem sai do suspend roda na hora o último horário perdido.
 * `c.cronVisto` guarda até onde já se olhou, para não varrer o passado a cada segundo. → ms do horário, ou null.
 */
function horarioPendente(c, cj, horario, ultimo, evento) {
  const prazo = cj.spec.startingDeadlineSeconds;
  const visto = c.cronVisto.get(cj.metadata.uid);
  const desde = Math.max(ultimo, prazo === undefined ? -Infinity : c.agora - prazo * 1000, visto?.horario === cj.spec.schedule ? visto.ate : -Infinity);
  const agora = Math.floor(c.agora / 60_000) * 60_000;
  c.cronVisto.set(cj.metadata.uid, { horario: cj.spec.schedule, ate: agora });
  let achado = null;
  let perdidos = 0;
  for (let m = agora; m > desde && perdidos <= 100; m -= 60_000) {
    if (!horario.casa(m)) continue;
    achado ??= m;
    perdidos++;
  }
  if (perdidos > 100) evento('Warning', 'TooManyMissedTimes', 'too many missed start times. Set or decrease .spec.startingDeadlineSeconds or check clock skew');
  return achado;
}

/** Cria um Job a cada horário marcado (a conferência é a cada segundo do relógio do cluster). */
function cronjobs(c) {
  for (const cj of c.listar('CronJob')) {
    if (cj.metadata.deletionTimestamp) continue;
    const ns = cj.metadata.namespace;
    const evento = (tipo, motivo, msg) => c.evento(cj, tipo, motivo, msg, { componente: 'cronjob-controller' });
    const meus = c.listar('Job', ns).filter((j) => controlador(j)?.uid === cj.metadata.uid).sort(porCriacao);
    const st = { ...(cj.status ?? {}) };
    // Jobs que terminaram desde a última olhada.
    for (const j of meus) {
      const fim = j.status?.conditions?.find((x) => (x.type === 'Complete' || x.type === 'Failed') && x.status === 'True');
      if (!fim || c.jobsVistos.has(j.metadata.uid)) continue;
      c.jobsVistos.add(j.metadata.uid);
      evento('Normal', 'SawCompletedJob', `Saw completed job: ${j.metadata.name}, condition: ${fim.type}`);
      if (fim.type === 'Complete') st.lastSuccessfulTime = j.status.completionTime;
    }
    // O horário: um Job por minuto marcado, sem repetir o mesmo minuto.
    const horario = lerCron(cj.spec.schedule, cj.spec.timeZone);
    const ultimo = st.lastScheduleTime ? Date.parse(st.lastScheduleTime) : Date.parse(cj.metadata.creationTimestamp);
    const ativos = () => c.listar('Job', ns).filter((j) => controlador(j)?.uid === cj.metadata.uid && !terminou(j));
    if (cj.spec.suspend) c.cronVisto.delete(cj.metadata.uid); // ao voltar, olha de novo desde o último horário
    const minuto = cj.spec.suspend || horario.erro ? null : horarioPendente(c, cj, horario, ultimo, evento);
    if (minuto !== null) {
      const pol = cj.spec.concurrencyPolicy;
      st.lastScheduleTime = iso(minuto);
      if (pol === 'Forbid' && ativos().length) {
        evento('Normal', 'JobAlreadyActive', 'Not starting job because prior execution is running and concurrency policy is Forbid');
      } else {
        if (pol === 'Replace') for (const j of ativos()) {
          c.remover(j);
          evento('Normal', 'SuccessfulDelete', `Deleted job ${j.metadata.name}`);
        }
        const molde = clone(cj.spec.jobTemplate);
        const spec = molde.spec;
        padroesJob(spec);
        const nome = `${cj.metadata.name}-${Math.floor(minuto / 60_000)}`;
        c.criar({
          apiVersion: 'batch/v1', kind: 'Job',
          metadata: { ...(molde.metadata ?? {}), name: nome, namespace: ns, annotations: { ...(molde.metadata?.annotations ?? {}), 'batch.kubernetes.io/cronjob-scheduled-timestamp': isoNoFuso(minuto, cj.spec.timeZone) }, ownerReferences: [dono(cj)] },
          spec,
        });
        evento('Normal', 'SuccessfulCreate', `Created job ${nome}`);
      }
    }
    // O histórico: guarda só os últimos (3 com sucesso, 1 com falha, por padrão).
    const guardar = (tipo, limite) => {
      const lista = c.listar('Job', ns).filter((j) => controlador(j)?.uid === cj.metadata.uid && j.status?.conditions?.some((x) => x.type === tipo && x.status === 'True')).sort(porCriacao);
      for (const j of lista.slice(0, Math.max(0, lista.length - limite))) {
        c.remover(j);
        evento('Normal', 'SuccessfulDelete', `Deleted job ${j.metadata.name}`);
      }
    };
    guardar('Complete', cj.spec.successfulJobsHistoryLimit);
    guardar('Failed', cj.spec.failedJobsHistoryLimit);
    const lista = ativos();
    const status = {
      ...(lista.length ? { active: lista.map((j) => ({ apiVersion: 'batch/v1', kind: 'Job', name: j.metadata.name, namespace: ns, resourceVersion: j.metadata.resourceVersion, uid: j.metadata.uid })) } : {}),
      ...(st.lastScheduleTime ? { lastScheduleTime: st.lastScheduleTime } : {}),
      ...(st.lastSuccessfulTime ? { lastSuccessfulTime: st.lastSuccessfulTime } : {}),
    };
    if (JSON.stringify(status) !== JSON.stringify(cj.status ?? {})) {
      cj.status = status;
      c.salvar(cj);
    }
  }
}

// ---------- DaemonSet ----------
// As tolerâncias que o controlador põe em todo pod de DaemonSet (o "extintor" vai até em prédio com problema).
const TOLERANCIAS_DS = [['not-ready', 'NoExecute'], ['unreachable', 'NoExecute'], ['disk-pressure', 'NoSchedule'], ['memory-pressure', 'NoSchedule'], ['pid-pressure', 'NoSchedule'], ['unschedulable', 'NoSchedule']];

/** O node pode receber o pod do DaemonSet? (seletor e taints) */
function nodeServe(ds, node) {
  const sel = ds.spec.template.spec.nodeSelector ?? {};
  if (Object.entries(sel).some(([k, v]) => node.metadata.labels?.[k] !== v)) return false;
  return (node.spec.taints ?? []).every((t) => !['NoSchedule', 'NoExecute'].includes(t.effect) || tolera({ spec: ds.spec.template.spec }, t));
}

/** Um pod em cada node que serve. Node novo ganha o pod; node que deixa de servir perde. */
function daemonsets(c) {
  for (const ds of c.listar('DaemonSet')) {
    if (ds.metadata.deletionTimestamp) continue;
    const ns = ds.metadata.namespace;
    const evento = (motivo, msg) => c.evento(ds, 'Normal', motivo, msg, { componente: 'daemonset-controller' });
    const geracao = String(ds.metadata.generation ?? 1);
    if (ds.metadata.annotations?.['deprecated.daemonset.template.generation'] !== geracao) {
      ds.metadata.annotations = { ...(ds.metadata.annotations ?? {}), 'deprecated.daemonset.template.generation': geracao };
      c.salvar(ds);
    }
    const revisao = hashDoTemplate(ds);
    const pods = c.listar('Pod', ns).filter((p) => controlador(p)?.uid === ds.metadata.uid && !p.metadata.deletionTimestamp);
    const noNode = (p) => p.spec.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms?.[0]?.matchFields?.[0]?.values?.[0] ?? p.spec.nodeName;
    const nodes = c.listar('Node');
    const servem = nodes.filter((n) => nodeServe(ds, n));
    for (const node of servem) {
      const nome = node.metadata.name;
      if (pods.some((p) => noNode(p) === nome)) continue;
      const spec = clone(ds.spec.template.spec);
      spec.affinity = { ...(spec.affinity ?? {}), nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [{ matchFields: [{ key: 'metadata.name', operator: 'In', values: [nome] }] }] } } };
      spec.tolerations = [...(spec.tolerations ?? [])];
      for (const [k, efeito] of [...TOLERANCIAS_DS, ...(spec.hostNetwork ? [['network-unavailable', 'NoSchedule']] : [])]) {
        spec.tolerations.push({ effect: efeito, key: `node.kubernetes.io/${k}`, operator: 'Exists' });
      }
      const pod = criarPodDe(c, ds, {
        apiVersion: 'v1', kind: 'Pod',
        metadata: {
          generateName: `${ds.metadata.name}-`, namespace: ns,
          labels: { ...clone(ds.spec.template.metadata?.labels ?? {}), 'controller-revision-hash': revisao, 'pod-template-generation': geracao },
          ...(ds.spec.template.metadata?.annotations ? { annotations: clone(ds.spec.template.metadata.annotations) } : {}),
          ownerReferences: [dono(ds)],
        },
        spec,
      }, 'daemonset-controller');
      if (!pod) continue;
      evento('SuccessfulCreate', `Created pod: ${pod.metadata.name}`);
    }
    // Node que não serve mais (ou saiu do cluster): o pod sai também.
    for (const p of pods) {
      if (servem.some((n) => n.metadata.name === noNode(p))) continue;
      c.remover(p);
      evento('SuccessfulDelete', `Deleted pod: ${p.metadata.name}`);
    }
    // Template novo: troca um node de cada vez (maxUnavailable 1), esperando o anterior ficar pronto.
    if (ds.spec.updateStrategy?.type !== 'OnDelete') {
      const vivos = c.listar('Pod', ns).filter((p) => controlador(p)?.uid === ds.metadata.uid);
      const velho = vivos.find((p) => p.metadata.labels['controller-revision-hash'] !== revisao && !p.metadata.deletionTimestamp);
      if (velho && vivos.every((p) => p.metadata.deletionTimestamp || p === velho || estaPronto(p)) && !vivos.some((p) => p.metadata.deletionTimestamp)) {
        c.remover(velho);
        evento('SuccessfulDelete', `Deleted pod: ${velho.metadata.name}`);
      }
    }
    const atuais = c.listar('Pod', ns).filter((p) => controlador(p)?.uid === ds.metadata.uid && !p.metadata.deletionTimestamp);
    const prontos = atuais.filter(estaPronto);
    const status = {
      currentNumberScheduled: atuais.length,
      desiredNumberScheduled: servem.length,
      ...(prontos.length ? { numberAvailable: prontos.length } : {}),
      numberMisscheduled: 0,
      numberReady: prontos.length,
      ...(servem.length - prontos.length > 0 ? { numberUnavailable: servem.length - prontos.length } : {}),
      observedGeneration: ds.metadata.generation,
      ...(atuais.filter((p) => p.metadata.labels['controller-revision-hash'] === revisao).length ? { updatedNumberScheduled: atuais.filter((p) => p.metadata.labels['controller-revision-hash'] === revisao).length } : {}),
    };
    c.trocarStatus(ds, status);
  }
}

// ---------- metrics-server ----------
const RASPAGEM = 15_000;

/** O metrics-server (quando instalado): a cada 15s, guarda o uso de cada contêiner rodando há pelo menos 10s. */
function servidorDeMetricas(c) {
  if (!c.metricasLigadas || c.agora - (c.ultimaRaspagem ?? -Infinity) < RASPAGEM) return;
  const ms = c.listar('Pod', 'kube-system').find((p) => p.metadata.labels?.['k8s-app'] === 'metrics-server' && estaPronto(p));
  if (!ms) return;
  c.ultimaRaspagem = c.agora;
  const metricas = new Map();
  for (const pod of c.listar('Pod')) {
    const e = c.kubelet.pods.get(pod.metadata.uid);
    if (!e || pod.status?.phase !== 'Running') continue;
    const conteineres = {};
    for (const ct of pod.spec.containers) {
      const est = e.conteineres.get(ct.name);
      if (est?.fase === 'rodando' && c.agora - est.inicio >= 10_000) conteineres[ct.name] = c.kubelet.uso(pod, ct, est);
    }
    if (Object.keys(conteineres).length) metricas.set(pod.metadata.uid, { t: c.agora, conteineres });
  }
  c.metricas = metricas;
}

/** A soma do uso dos contêineres de um pod, pela última raspagem. → { cpu, memoria } ou null. */
export function usoDoPod(c, pod) {
  const m = c.metricas?.get(pod.metadata.uid);
  if (!m) return null;
  return Object.values(m.conteineres).reduce((t, u) => ({ cpu: t.cpu + u.cpu, memoria: t.memoria + u.memoria }), { cpu: 0, memoria: 0 });
}

// ---------- HorizontalPodAutoscaler ----------
const SYNC_HPA = 15_000;
const ESTABILIZAR_DESCIDA = 300_000;

function autoscalers(c) {
  for (const hpa of c.listar('HorizontalPodAutoscaler')) {
    const marca = c.hpas.get(hpa.metadata.uid) ?? { ultima: -Infinity, recomendacoes: [] };
    c.hpas.set(hpa.metadata.uid, marca);
    if (c.agora - marca.ultima < SYNC_HPA) continue;
    marca.ultima = c.agora;
    escalarPeloUso(c, hpa, marca);
  }
}

function escalarPeloUso(c, hpa, marca) {
  const ns = hpa.metadata.namespace;
  const ref = hpa.spec?.scaleTargetRef;
  const evento = (tipo, motivo, msg) => c.evento(hpa, tipo, motivo, msg, { componente: 'horizontal-pod-autoscaler' });
  const anteriores = hpa.status?.conditions ?? [];
  const cond = (tipo, status, motivo, msg) => {
    const a = anteriores.find((x) => x.type === tipo);
    return { lastTransitionTime: a?.status === status ? a.lastTransitionTime : iso(c.agora), message: msg, reason: motivo, status, type: tipo };
  };
  const salvar = (status) => c.trocarStatus(hpa, status);
  if (!ref?.kind || !ref.name) return; // a validação recusa; um controlador nunca derruba o avancar
  const alvo = c.obter(ref.kind, ns, ref.name);
  if (!alvo) {
    const msg = `${ref.kind.toLowerCase()}s/scale.apps "${ref.name}" not found`;
    evento('Warning', 'FailedGetScale', msg);
    return salvar({ conditions: [cond('AbleToScale', 'False', 'FailedGetScale', `the HPA controller was unable to get the target's current scale: ${msg}`)], currentMetrics: null, currentReplicas: 0, desiredReplicas: 0, observedGeneration: hpa.metadata.generation });
  }
  const atual = alvo.spec.replicas;
  const sel = alvo.spec.selector?.matchLabels ?? {};
  const pods = c.listar('Pod', ns).filter((p) => casaSeletor(sel, p.metadata.labels) && !p.metadata.deletionTimestamp && !TERMINAIS.has(p.status?.phase));
  const metrica = hpa.spec.metrics?.[0] ?? {};
  const recurso = metrica.resource?.name ?? 'cpu';
  const alvoUtil = metrica.resource?.target?.averageUtilization;
  const medir = (u) => (recurso === 'cpu' ? u.cpu : u.memoria);
  const pedido = (p) => p.spec.containers.reduce((t, ct) => t + (recurso === 'cpu' ? cpuMili(ct.resources?.requests?.cpu) : bytes(ct.resources?.requests?.memory)), 0);

  let erro = null;
  let comMetrica = [];
  if (!c.metricasLigadas || !c.metricas) erro = `unable to get metrics for resource ${recurso}: no metrics returned from resource metrics API`;
  else {
    const sem = pods.flatMap((p) => p.spec.containers.filter((ct) => !ct.resources?.requests?.[recurso]).map((ct) => [p, ct]))[0];
    if (alvoUtil !== undefined && sem) erro = `missing request for ${recurso} in container ${sem[1].name} of Pod ${sem[0].metadata.name}`;
    else {
      comMetrica = pods.filter((p) => estaPronto(p) && usoDoPod(c, p));
      if (!comMetrica.length) erro = 'did not receive metrics for targeted pods (pods might be unready)';
    }
  }
  if (erro) {
    const msg = `failed to get ${recurso} utilization: ${erro}`;
    evento('Warning', 'FailedGetResourceMetric', msg);
    evento('Warning', 'FailedComputeMetricsReplicas', `invalid metrics (1 invalid out of 1), first error is: failed to get ${recurso} resource metric value: ${msg}`);
    return salvar({
      conditions: [cond('AbleToScale', 'True', 'SucceededGetScale', "the HPA controller was able to get the target's current scale"), cond('ScalingActive', 'False', 'FailedGetResourceMetric', `the HPA was unable to compute the replica count: ${msg}`)],
      currentMetrics: null, currentReplicas: atual, desiredReplicas: 0, observedGeneration: hpa.metadata.generation,
    });
  }

  const uso = comMetrica.reduce((t, p) => t + medir(usoDoPod(c, p)), 0);
  const media = uso / comMetrica.length;
  const util = Math.floor((uso * 100) / comMetrica.reduce((t, p) => t + pedido(p), 0)); // divisão inteira, como o controlador
  const razao = alvoUtil !== undefined ? util / alvoUtil : media / (recurso === 'cpu' ? cpuMili(metrica.resource.target.averageValue) : bytes(metrica.resource.target.averageValue));
  const desejado = Math.abs(razao - 1) <= 0.1 ? atual : Math.ceil(comMetrica.length * razao);
  // Descer espera 5 min (vale a maior recomendação recente); subir, no máximo dobra (ou +4) por vez.
  marca.recomendacoes = [...marca.recomendacoes.filter((r) => c.agora - r.t < ESTABILIZAR_DESCIDA), { t: c.agora, n: desejado }];
  let final = desejado < atual ? Math.min(atual, Math.max(...marca.recomendacoes.map((r) => r.n))) : Math.min(desejado, Math.max(atual * 2, atual + 4));
  const limitado = desejado > hpa.spec.maxReplicas ? ['True', 'TooManyReplicas', 'the desired replica count is more than the maximum replica count']
    : desejado < hpa.spec.minReplicas ? ['True', 'TooFewReplicas', 'the desired replica count is less than the minimum replica count']
      : ['False', 'DesiredWithinRange', 'the desired count is within the acceptable range'];
  final = Math.max(hpa.spec.minReplicas, Math.min(hpa.spec.maxReplicas, final));
  const st = { ...(hpa.status ?? {}) };
  if (final !== atual) {
    alvo.spec.replicas = final;
    c.salvar(alvo, { spec: true });
    evento('Normal', 'SuccessfulRescale', `New size: ${final}; reason: ${recurso} resource utilization (percentage of request) ${final > atual ? 'above' : 'below'} target`);
    st.lastScaleTime = iso(c.agora);
  }
  const podeEscalar = final !== atual ? ['SucceededRescale', `the HPA controller was able to update the target scale to ${final}`]
    : desejado < atual && final > desejado ? ['ScaleDownStabilized', 'recent recommendations were higher than current one, applying the highest recent recommendation']
      : ['ReadyForNewScale', 'recommended size matches current size'];
  salvar({
    conditions: [
      cond('AbleToScale', 'True', ...podeEscalar),
      cond('ScalingActive', 'True', 'ValidMetricFound', `the HPA was able to successfully calculate a replica count from ${recurso} resource utilization (percentage of request)`),
      cond('ScalingLimited', ...limitado),
      ...(st.lastScaleTime ? [cond('ScaledToZero', 'False', 'NotScaledToZero', 'the HPA controller did not scale the workload to zero')] : []),
    ],
    currentMetrics: [{ resource: { current: { ...(alvoUtil !== undefined ? { averageUtilization: util } : {}), averageValue: recurso === 'cpu' ? `${Math.round(media)}m` : textoMemoria(Math.round(media)) }, name: recurso }, type: 'Resource' }],
    currentReplicas: atual,
    desiredReplicas: final,
    ...(st.lastScaleTime ? { lastScaleTime: st.lastScaleTime } : {}),
    observedGeneration: hpa.metadata.generation,
  });
}

// ---------- Endpoints ----------
const semIp = (svc) => (svc.spec.clusterIP === 'None' ? { 'service.kubernetes.io/headless': '' } : {}); // Service headless
const porIp = new Intl.Collator(undefined, { numeric: true }).compare; // o mesmo que localeCompare(b, undefined, { numeric: true }), sem criar um Collator por comparação
function endpoints(c) {
  for (const svc of c.listar('Service')) {
    const sel = svc.spec.selector;
    if (!sel || !Object.keys(sel).length) continue;
    const ns = svc.metadata.namespace;
    const comIp = c.listar('Pod', ns)
      .filter((p) => casaSeletor(sel, p.metadata.labels) && p.status?.podIP && !TERMINAIS.has(p.status?.phase))
      .sort((a, b) => porIp(a.status.podIP, b.status.podIP));
    const endereco = (p) => ({ ip: p.status.podIP, nodeName: p.spec.nodeName, targetRef: { kind: 'Pod', name: p.metadata.name, namespace: ns, uid: p.metadata.uid } });
    const naFatia = comIp.filter((p) => svc.spec.ports.every((sp) => portaAlvo(p, sp.targetPort) !== null)); // o EndpointSlice mostra também quem está saindo
    const comPorta = naFatia.filter((p) => !p.metadata.deletionTimestamp);
    const modelo = comPorta[0] ?? naFatia[0];
    const portas = svc.spec.ports.map((sp) => ({
      ...(sp.name ? { name: sp.name } : {}),
      port: modelo ? portaAlvo(modelo, sp.targetPort) : Number(sp.targetPort) || sp.port,
      protocol: sp.protocol,
    }));
    const prontos = comPorta.filter(estaPronto);
    const naoProntos = comPorta.filter((p) => !estaPronto(p));
    const subsets = comPorta.length ? [{
      ...(prontos.length ? { addresses: prontos.map(endereco) } : {}),
      ...(naoProntos.length ? { notReadyAddresses: naoProntos.map(endereco) } : {}),
      ports: portas,
    }] : undefined;
    fatiaDoServico(c, svc, naFatia, naFatia.length ? portas.map((p) => ({ name: '', ...p })) : null);
    const atual = c.obter('Endpoints', ns, svc.metadata.name);
    if (!atual) {
      c.criar({
        apiVersion: 'v1',
        kind: 'Endpoints',
        metadata: { name: svc.metadata.name, namespace: ns, labels: { ...(svc.metadata.labels ?? {}), 'endpoints.kubernetes.io/managed-by': 'endpoint-controller', ...semIp(svc) } },
        ...(subsets ? { subsets } : {}),
      });
    } else if (c.jsonDe(atual, 'subsets') !== JSON.stringify(subsets)) {
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

/**
 * O EndpointSlice do Service, ao lado do Endpoints: o nome é o do Service com um sufixo (fixo, tirado do uid dele, para
 * não gastar o sorteio), e quem está saindo continua lá, com terminating: true. Sem endereço, nem as portas ficam.
 * ponytail: uma fatia só por Service; o real reparte de 100 em 100 endereços (e espelha o Endpoints feito à mão).
 */
function fatiaDoServico(c, svc, pods, ports) {
  const ns = svc.metadata.namespace;
  const endpoints = pods.length ? pods.map((p) => {
    const saindo = !!p.metadata.deletionTimestamp;
    const pronto = !!estaPronto(p);
    return { addresses: [p.status.podIP], conditions: { ready: pronto && !saindo, serving: pronto, terminating: saindo }, nodeName: p.spec.nodeName, targetRef: { kind: 'Pod', name: p.metadata.name, namespace: ns, uid: p.metadata.uid } };
  }) : null;
  const labels = { ...(svc.metadata.labels ?? {}), 'endpointslice.kubernetes.io/managed-by': 'endpointslice-controller.k8s.io', 'kubernetes.io/service-name': svc.metadata.name, ...semIp(svc) };
  const gatilho = { 'endpoints.kubernetes.io/last-change-trigger-time': iso(c.agora) };
  const hash = uuidDe(`endpointslice/${svc.metadata.uid}`).replaceAll('-', '');
  const nome = `${svc.metadata.name}-${Array.from({ length: 5 }, (_, i) => ALFABETO[parseInt(hash.slice(i * 2, i * 2 + 2), 16) % ALFABETO.length]).join('')}`;
  const atual = c.obter('EndpointSlice', ns, nome);
  if (!atual) {
    c.criar({
      apiVersion: 'discovery.k8s.io/v1', kind: 'EndpointSlice',
      metadata: { name: nome, generateName: `${svc.metadata.name}-`, namespace: ns, labels, annotations: gatilho, ownerReferences: [dono(svc)] },
      addressType: 'IPv4', endpoints, ports,
    }, { uid: uuidDe(`endpointslice/${svc.metadata.uid}/uid`) });
  } else if (c.jsonDe(atual, 'endpoints') !== JSON.stringify(endpoints) || c.jsonDe(atual, 'ports') !== JSON.stringify(ports) || JSON.stringify(atual.metadata.labels) !== JSON.stringify(labels)) {
    Object.assign(atual, { endpoints, ports });
    atual.metadata.labels = labels;
    atual.metadata.annotations = { ...atual.metadata.annotations, ...gatilho };
    c.salvar(atual, { spec: true });
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
