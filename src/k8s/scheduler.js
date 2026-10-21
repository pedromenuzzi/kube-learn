// O scheduler: escolhe um node para cada pod sem node. Filtra (interdição, taints, discos, seletor e afinidade
// com nodes, recursos, espalhamento e afinidade entre pods), pontua (preferências, espalha réplicas do mesmo dono e
// prefere nodes mais livres) e, se nada serve, tenta a preempção (tirar pods de prioridade menor). As mensagens são
// as do kube-scheduler.
import { cpuMili, bytes, iso } from './unidades.js';
import { pvcsDoPod } from './discos.js';

const TERMINAIS = new Set(['Succeeded', 'Failed']);
const REPETIR_EM = 300_000; // como o podMaxInUnschedulablePodsDuration do kube-scheduler
const INUTIL = 'Preemption is not helpful for scheduling';
const SEM_VITIMAS = 'No preemption victims found for incoming pod';

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

export function usoDoNode(c, nome, ignorar) {
  return podsNoNode(c, nome).filter((p) => !ignorar?.has(p.metadata.uid)).reduce((t, p) => {
    const r = pedidosDoPod(p);
    return { cpu: t.cpu + r.cpu, memoria: t.memoria + r.memoria, pods: t.pods + 1 };
  }, { cpu: 0, memoria: 0, pods: 0 });
}

// ---------- seletores ----------
const confere = (valor, e) => ({
  In: () => valor !== undefined && (e.values ?? []).includes(valor),
  NotIn: () => !(e.values ?? []).includes(valor),
  Exists: () => valor !== undefined,
  DoesNotExist: () => valor === undefined,
}[e.operator]?.() ?? false);

/** Um LabelSelector (matchLabels e matchExpressions). Vazio ({}) escolhe todos; ausente, nenhum. */
export const casaLabelSelector = (sel, labels = {}) => !!sel
  && Object.entries(sel.matchLabels ?? {}).every(([k, v]) => labels[k] === v)
  && (sel.matchExpressions ?? []).every((e) => confere(labels[e.key], e));

/** A afinidade obrigatória com nodes (requiredDuringScheduling): basta um dos termos casar. */
function casaAfinidade(pod, node) {
  const termos = pod.spec.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms;
  if (!termos?.length) return true;
  return termos.some((t) => casaTermoDeNode(t, node));
}

const casaTermoDeNode = (t, node) => (t.matchExpressions ?? []).every((e) => confere(node.metadata.labels?.[e.key], e))
  && (t.matchFields ?? []).every((e) => confere(e.key === 'metadata.name' ? node.metadata.name : undefined, e));

const casaSeletorENode = (pod, node) => Object.entries(pod.spec.nodeSelector ?? {}).every(([k, v]) => node.metadata.labels?.[k] === v) && casaAfinidade(pod, node);

// ---------- afinidade entre pods e espalhamento ----------
/** Os pods "vivos" do cluster (com node e sem estar saindo), menos os ignorados (as vítimas de uma preempção). */
const vivos = (c, ignorar) => c.listar('Pod').filter((p) => p.spec.nodeName && !p.metadata.deletionTimestamp && !TERMINAIS.has(p.status?.phase) && !ignorar?.has(p.metadata.uid));

const namespacesDoTermo = (pod, t) => t.namespaces?.length ? t.namespaces : [pod.metadata.namespace];
const casaTermoDePod = (pod, t, outro) => namespacesDoTermo(pod, t).includes(outro.metadata.namespace) && casaLabelSelector(t.labelSelector, outro.metadata.labels);
const mesmoDominio = (c, nomeNode, node, chave) => {
  const v = node.metadata.labels?.[chave];
  return v !== undefined && c.obter('Node', null, nomeNode)?.metadata.labels?.[chave] === v;
};
const obrigatorios = (pod, tipo) => pod.spec.affinity?.[tipo]?.requiredDuringSchedulingIgnoredDuringExecution ?? [];
const preferidos = (pod, tipo) => pod.spec.affinity?.[tipo]?.preferredDuringSchedulingIgnoredDuringExecution ?? [];

/** O filtro InterPodAffinity: → null (passa) ou { motivo, resolve }. */
function filtroEntrePods(c, pod, node, outros) {
  for (const t of obrigatorios(pod, 'podAffinity')) {
    const casam = outros.filter((o) => casaTermoDePod(pod, t, o));
    // O primeiro pod de um grupo que pede para ficar perto do próprio grupo pode ir para qualquer lugar.
    const primeiro = !casam.length && casaTermoDePod(pod, t, pod);
    if (!primeiro && !casam.some((o) => mesmoDominio(c, o.spec.nodeName, node, t.topologyKey))) return { motivo: "node(s) didn't match pod affinity rules", resolve: false };
  }
  for (const t of obrigatorios(pod, 'podAntiAffinity')) {
    if (outros.some((o) => casaTermoDePod(pod, t, o) && mesmoDominio(c, o.spec.nodeName, node, t.topologyKey))) return { motivo: "node(s) didn't match pod anti-affinity rules", resolve: true };
  }
  for (const o of outros) {
    for (const t of obrigatorios(o, 'podAntiAffinity')) {
      if (casaTermoDePod(o, t, pod) && mesmoDominio(c, o.spec.nodeName, node, t.topologyKey)) return { motivo: "node(s) didn't satisfy existing pods anti-affinity rules", resolve: true };
    }
  }
  return null;
}

/**
 * O filtro PodTopologySpread (whenUnsatisfiable: DoNotSchedule). Os domínios são os valores da topologyKey nos
 * nodes que casam com o seletor/afinidade do pod; os taints não contam (nodeTaintsPolicy: Ignore), por isso o
 * control plane entra como um domínio vazio quando a chave é kubernetes.io/hostname.
 */
function filtroEspalhamento(c, pod, node, outros, nodes) {
  for (const k of (pod.spec.topologySpreadConstraints ?? []).filter((x) => x.whenUnsatisfiable !== 'ScheduleAnyway')) {
    const meu = node.metadata.labels?.[k.topologyKey];
    if (meu === undefined) return { motivo: "node(s) didn't match pod topology spread constraints (missing required label)", resolve: false };
    const contagem = contarPorDominio(c, pod, k, outros, nodes);
    const menor = Math.min(...contagem.values());
    const proprio = casaLabelSelector(k.labelSelector, pod.metadata.labels) ? 1 : 0;
    if ((contagem.get(meu) ?? 0) + proprio - menor > k.maxSkew) return { motivo: "node(s) didn't match pod topology spread constraints", resolve: true };
  }
  return null;
}

function contarPorDominio(c, pod, k, outros, nodes) {
  const contagem = new Map();
  for (const n of nodes) {
    const v = n.metadata.labels?.[k.topologyKey];
    if (v !== undefined && casaSeletorENode(pod, n)) contagem.set(v, contagem.get(v) ?? 0);
  }
  for (const o of outros) {
    if (o.metadata.namespace !== pod.metadata.namespace || !casaLabelSelector(k.labelSelector, o.metadata.labels)) continue;
    const v = c.obter('Node', null, o.spec.nodeName)?.metadata.labels?.[k.topologyKey];
    if (contagem.has(v)) contagem.set(v, contagem.get(v) + 1);
  }
  return contagem;
}

/** Os filtros que dependem dos outros pods (recursos, espalhamento, afinidade): os que a preempção pode resolver. */
function filtrosDePods(c, pod, node, nodes, ignorar) {
  const uso = usoDoNode(c, node.metadata.name, ignorar);
  const cap = { cpu: cpuMili(node.status.allocatable.cpu), memoria: bytes(node.status.allocatable.memory), pods: Number(node.status.allocatable.pods) };
  const pedido = pedidosDoPod(pod);
  const faltas = [];
  if (uso.pods + 1 > cap.pods) faltas.push('Too many pods');
  if (uso.cpu + pedido.cpu > cap.cpu) faltas.push('Insufficient cpu');
  if (uso.memoria + pedido.memoria > cap.memoria) faltas.push('Insufficient memory');
  if (faltas.length) return { motivos: faltas, resolve: pedido.cpu <= cap.cpu && pedido.memoria <= cap.memoria, uso, cap };
  const outros = vivos(c, ignorar).filter((o) => o.metadata.uid !== pod.metadata.uid);
  const f = filtroEspalhamento(c, pod, node, outros, nodes) ?? filtroEntrePods(c, pod, node, outros);
  return f ? { motivos: [f.motivo], resolve: f.resolve, uso, cap } : { motivos: [], uso, cap, outros };
}

// ---------- pontuação ----------
function nota(c, pod, node, { uso, cap, outros }) {
  const pedido = pedidosDoPod(pod);
  const dono = pod.metadata.ownerReferences?.find((o) => o.controller)?.uid;
  const irmaos = dono ? podsNoNode(c, node.metadata.name).filter((p) => p.metadata.ownerReferences?.some((o) => o.uid === dono)).length : 0;
  const livre = (cap.cpu ? (cap.cpu - uso.cpu - pedido.cpu) / cap.cpu : 0) + (cap.memoria ? (cap.memoria - uso.memoria - pedido.memoria) / cap.memoria : 0);
  const preferencia = (pod.spec.affinity?.nodeAffinity?.preferredDuringSchedulingIgnoredDuringExecution ?? [])
    .reduce((t, p) => t + (casaTermoDeNode(p.preference ?? {}, node) ? p.weight : 0), 0);
  const perto = (tipo, sinal) => preferidos(pod, tipo).reduce((t, p) => t + sinal * (outros.some((o) => casaTermoDePod(pod, p.podAffinityTerm ?? {}, o) && mesmoDominio(c, o.spec.nodeName, node, p.podAffinityTerm?.topologyKey)) ? p.weight : 0), 0);
  const espalhar = (pod.spec.topologySpreadConstraints ?? []).filter((k) => k.whenUnsatisfiable === 'ScheduleAnyway')
    .reduce((t, k) => t - (contarPorDominio(c, pod, k, outros, [node]).get(node.metadata.labels?.[k.topologyKey]) ?? 0) * 50, 0);
  const evitar = (node.spec.taints ?? []).filter((t) => t.effect === 'PreferNoSchedule' && !tolera(pod, t)).length * 100;
  return preferencia * 2 + perto('podAffinity', 1) + perto('podAntiAffinity', -1) + espalhar - evitar - irmaos * 100 + livre * 10 + c.aleatorio.proximo();
}

// ---------- o laço ----------
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

    const motivos = {};
    const preempcao = {};
    const conta = (obj, k) => { obj[k] = (obj[k] ?? 0) + 1; };
    const candidatos = [];
    const resolviveis = [];
    for (const node of nodes) {
      const falha = (m) => { conta(motivos, m); conta(preempcao, INUTIL); };
      const interditado = (node.spec.taints ?? []).find((t) => t.key === 'node.kubernetes.io/unschedulable');
      if (node.spec.unschedulable && !(interditado && tolera(pod, interditado))) { falha('node(s) were unschedulable'); continue; }
      const taints = [...(node.spec.taints ?? []), ...(nodePronto(node) ? [] : [{ key: 'node.kubernetes.io/not-ready', effect: 'NoSchedule' }])];
      if (taints.some((t) => (t.effect === 'NoSchedule' || t.effect === 'NoExecute') && !tolera(pod, t))) { falha('node(s) had untolerated taint(s)'); continue; }
      if (nodesDosDiscos.some((lista) => !lista.includes(node.metadata.name))) { falha('node(s) had volume node affinity conflict'); continue; }
      if (!casaSeletorENode(pod, node)) { falha("node(s) didn't match Pod's node affinity/selector"); continue; }
      const r = filtrosDePods(c, pod, node, nodes);
      if (r.motivos.length) {
        r.motivos.forEach((m) => conta(motivos, m));
        if (r.resolve) resolviveis.push(node);
        else conta(preempcao, INUTIL);
        continue;
      }
      candidatos.push({ node, nota: nota(c, pod, node, r) });
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
    if (!nodes.length) {
      naoCabe(c, pod, 'no nodes available to schedule pods');
      continue;
    }
    const filtros = `0/${nodes.length} nodes are available: ${lista(motivos)}.`;
    // Já esperando as vítimas de uma preempção saírem: não escolhe outras.
    const indicado = pod.status?.nominatedNodeName;
    if (indicado && c.listar('Pod').some((p) => p.spec.nodeName === indicado && p.metadata.deletionTimestamp)) {
      naoCabe(c, pod, filtros);
      continue;
    }
    const escolha = pod.spec.preemptionPolicy === 'Never' ? null : preemptar(c, pod, resolviveis, nodes);
    if (escolha) {
      naoCabe(c, pod, filtros, escolha.node.metadata.name);
      continue;
    }
    for (let i = 0; i < resolviveis.length; i++) conta(preempcao, SEM_VITIMAS);
    naoCabe(c, pod, `${filtros} preemption: 0/${nodes.length} nodes are available: ${lista(preempcao)}.`);
  }
}

/**
 * A preempção: num node onde o pod caberia sem alguns pods de prioridade menor, tira os menos importantes que
 * bastarem (as vítimas saem com o prazo normal) e reserva o node (nominatedNodeName). → { node } | null.
 */
function preemptar(c, pod, nodes, todos) {
  const prioridade = pod.spec.priority ?? 0;
  const opcoes = [];
  for (const node of nodes) {
    const menores = podsNoNode(c, node.metadata.name).filter((p) => !p.metadata.deletionTimestamp && (p.spec.priority ?? 0) < prioridade);
    if (!menores.length) continue;
    const ignorar = new Set(menores.map((p) => p.metadata.uid));
    if (filtrosDePods(c, pod, node, todos, ignorar).motivos.length) continue;
    // Devolve ao node os mais importantes enquanto o pod ainda couber: só sai quem precisa.
    for (const p of [...menores].sort((a, b) => (b.spec.priority ?? 0) - (a.spec.priority ?? 0))) {
      ignorar.delete(p.metadata.uid);
      if (filtrosDePods(c, pod, node, todos, ignorar).motivos.length) ignorar.add(p.metadata.uid);
    }
    const vitimas = menores.filter((p) => ignorar.has(p.metadata.uid));
    opcoes.push({ node, vitimas, maior: Math.max(...vitimas.map((p) => p.spec.priority ?? 0)) });
  }
  if (!opcoes.length) return null;
  const escolha = opcoes.sort((a, b) => a.maior - b.maior || a.vitimas.length - b.vitimas.length)[0];
  for (const v of escolha.vitimas) {
    c.evento(v, 'Normal', 'Preempted', `Preempted by pod ${pod.metadata.uid} on node ${escolha.node.metadata.name}`, { componente: 'default-scheduler' });
    v.status = {
      ...v.status,
      conditions: [...(v.status?.conditions ?? []), { lastProbeTime: null, lastTransitionTime: iso(c.agora), message: 'default-scheduler: preempting to accommodate a higher priority pod', reason: 'PreemptionByScheduler', status: 'True', type: 'DisruptionTarget' }],
    };
    c.remover(v);
  }
  return escolha;
}

/** O pod não coube em nenhum node: condição PodScheduled=False, evento FailedScheduling e nova tentativa mais tarde. */
function naoCabe(c, pod, msg, indicado = pod.status?.nominatedNodeName) {
  const anterior = pod.status?.conditions?.find((x) => x.type === 'PodScheduled');
  const status = {
    ...pod.status,
    conditions: [{ lastProbeTime: null, lastTransitionTime: anterior?.status === 'False' ? anterior.lastTransitionTime : iso(c.agora), message: msg, reason: 'Unschedulable', status: 'False', type: 'PodScheduled' }],
    ...(indicado ? { nominatedNodeName: indicado } : {}),
    phase: 'Pending',
  };
  c.agendamento.set(pod.metadata.uid, { proxima: c.agora + REPETIR_EM, mudancas: c.mudancasDeCapacidade });
  if (JSON.stringify(status) !== JSON.stringify(pod.status)) {
    pod.status = status;
    c.salvar(pod);
  }
  c.evento(pod, 'Warning', 'FailedScheduling', msg, { componente: 'default-scheduler' });
}
