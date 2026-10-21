// A segurança do condomínio: os crachás (RBAC: quem pode fazer o quê), as catracas internas (NetworkPolicy:
// quem fala com quem na rede) e as normas dos bombeiros (Pod Security Admission: o que um pod pode pedir).
import { casaLabelSelector } from './scheduler.js';
import { PAPEIS_PADRAO } from './papeis.js';
import { uuidDe } from './aleatorio.js';

// ---------- RBAC ----------
const RBAC = 'rbac.authorization.k8s.io/v1';

/** Os papéis padrão e quem é administrador (o grupo system:masters e o kubeadm:cluster-admins do kind). */
export function criarPapeisPadrao(c) {
  for (const [nome, rules] of Object.entries(PAPEIS_PADRAO)) {
    c.criar({ apiVersion: RBAC, kind: 'ClusterRole', metadata: { name: nome, annotations: { 'rbac.authorization.kubernetes.io/autoupdate': 'true' }, labels: { 'kubernetes.io/bootstrapping': 'rbac-defaults' } }, rules }, { uid: uuidDe(`clusterrole/${nome}`) });
  }
  for (const [nome, grupo] of [['cluster-admin', 'system:masters'], ['kubeadm:cluster-admins', 'kubeadm:cluster-admins']]) {
    c.criar({
      apiVersion: RBAC, kind: 'ClusterRoleBinding', metadata: { name: nome },
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'cluster-admin' },
      subjects: [{ apiGroup: 'rbac.authorization.k8s.io', kind: 'Group', name: grupo }],
    }, { uid: uuidDe(`clusterrolebinding/${nome}`) });
  }
}

/** Quem está pedindo (o --as do kubectl): uma ServiceAccount vira "system:serviceaccount:ns:nome", com os grupos dela. */
export function quemE(usuario, grupos = []) {
  const m = usuario.match(/^system:serviceaccount:([^:]+):([^:]+)$/);
  return {
    usuario,
    grupos: [...grupos, ...(m ? ['system:serviceaccounts', `system:serviceaccounts:${m[1]}`] : []), 'system:authenticated'],
    conta: m ? { ns: m[1], nome: m[2] } : null,
  };
}

const casaSujeito = (s, quem, nsDoVinculo) => (s.kind === 'User' ? s.name === quem.usuario
  : s.kind === 'Group' ? quem.grupos.includes(s.name)
    : s.kind === 'ServiceAccount' && !!quem.conta && s.name === quem.conta.nome && (s.namespace ?? nsDoVinculo) === quem.conta.ns);

/** A regra cobre o pedido? Recursos com subrecurso ("pods/log") só valem se a regra citar o subrecurso. */
const casaRegra = (r, p) => (r.verbs ?? []).some((v) => v === '*' || v === p.verbo)
  && (r.apiGroups ?? []).some((g) => g === '*' || g === p.grupo)
  && (r.resources ?? []).some((x) => x === '*' || x === (p.sub ? `${p.recurso}/${p.sub}` : p.recurso) || (p.sub && x === `*/${p.sub}`))
  && (!r.resourceNames?.length || (!!p.nome && r.resourceNames.includes(p.nome)));

const regrasDo = (c, ref, ns) => (ref.kind === 'ClusterRole' ? c.obter('ClusterRole', null, ref.name) : c.obter('Role', ns, ref.name))?.rules ?? [];

/**
 * O pedido é permitido? pedido: { verbo, recurso (plural), grupo (da API, "" para o core), sub, ns, nome }.
 * Vale qualquer ClusterRoleBinding e, no namespace do pedido, qualquer RoleBinding (com Role ou ClusterRole).
 */
export function pode(c, quem, p) {
  const vale = (b, ns) => (b.subjects ?? []).some((s) => casaSujeito(s, quem, ns)) && regrasDo(c, b.roleRef, ns).some((r) => casaRegra(r, p));
  if (c.listar('ClusterRoleBinding').some((b) => vale(b, null))) return true;
  return !!p.ns && c.listar('RoleBinding', p.ns).some((b) => vale(b, p.ns));
}

/** A ServiceAccount "default" de cada namespace (o controlador cria quando o namespace nasce). */
export const contaPadrao = (ns, nome = 'default') => ({ apiVersion: 'v1', kind: 'ServiceAccount', metadata: { name: nome, namespace: ns } });
export const uidDaConta = (ns, nome) => uuidDe(`serviceaccount/${ns}/${nome}`);

// ---------- NetworkPolicy ----------
const tiposDa = (np) => np.spec.policyTypes ?? ['Ingress', ...(np.spec.egress ? ['Egress'] : [])];
const politicasDe = (c, pod, tipo) => c.listar('NetworkPolicy', pod.metadata.namespace).filter((np) => tiposDa(np).includes(tipo) && casaLabelSelector(np.spec.podSelector ?? {}, pod.metadata.labels));

const numeroIp = (ip) => ip.split('.').reduce((t, n) => t * 256 + Number(n), 0);
const dentroDe = (ip, cidr) => {
  const [base, bits] = cidr.split('/');
  const tam = 2 ** (32 - Number(bits ?? 32));
  return Math.floor(numeroIp(ip) / tam) === Math.floor(numeroIp(base) / tam);
};

function casaPar(c, np, par, outro) {
  const ip = outro?.status?.podIP;
  if (par.ipBlock) return !!ip && dentroDe(ip, par.ipBlock.cidr) && !(par.ipBlock.except ?? []).some((x) => dentroDe(ip, x));
  if (!outro) return false;
  const ns = c.obter('Namespace', null, outro.metadata.namespace);
  const nsOk = par.namespaceSelector ? casaLabelSelector(par.namespaceSelector, ns?.metadata.labels) : outro.metadata.namespace === np.metadata.namespace;
  return nsOk && (!par.podSelector || casaLabelSelector(par.podSelector, outro.metadata.labels));
}

const portaNomeada = (pod, porta) => (typeof porta === 'number' ? porta : pod.spec.containers.flatMap((ct) => ct.ports ?? []).find((p) => p.name === porta)?.containerPort);
const casaPorta = (portas, destino, porta, protocolo) => !portas?.length || portas.some((p) => (p.protocol ?? 'TCP') === protocolo
  && (p.port === undefined || portaNomeada(destino, p.port) === porta || (p.endPort !== undefined && porta >= p.port && porta <= p.endPort)));

/**
 * As catracas deixam o pod `origem` falar com o pod `destino` nesta porta? A saída da origem e a entrada do destino
 * precisam deixar (sem política que escolha o pod, tudo passa). Pods com hostNetwork não passam por catraca.
 */
export function catracaDeixa(c, origem, destino, porta, protocolo = 'TCP') {
  if (origem && !origem.spec.hostNetwork) {
    const saida = politicasDe(c, origem, 'Egress');
    if (saida.length && !saida.some((np) => (np.spec.egress ?? []).some((r) => (!r.to?.length || r.to.some((par) => casaPar(c, np, par, destino))) && casaPorta(r.ports, destino, porta, protocolo)))) return false;
  }
  if (!origem || destino.spec.hostNetwork) return true;
  const entrada = politicasDe(c, destino, 'Ingress');
  return !entrada.length || entrada.some((np) => (np.spec.ingress ?? []).some((r) => (!r.from?.length || r.from.some((par) => casaPar(c, np, par, origem))) && casaPorta(r.ports, destino, porta, protocolo)));
}

/** O DNS funciona para o pod? (a saída dele precisa deixar chegar ao kube-dns na porta 53/UDP) */
export const dnsDeixa = (c, origem) => !origem || c.listar('Pod', 'kube-system')
  .some((d) => d.metadata.labels?.['k8s-app'] === 'kube-dns' && d.status?.podIP && catracaDeixa(c, origem, d, 53, 'UDP'));

// ---------- Pod Security Admission ----------
const NIVEIS = ['privileged', 'baseline', 'restricted'];
const ROTULO = 'pod-security.kubernetes.io/';
const PADRAO_CAPS = new Set(['AUDIT_WRITE', 'CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'FSETID', 'KILL', 'MKNOD', 'NET_BIND_SERVICE', 'SETFCAP', 'SETGID', 'SETPCAP', 'SETUID', 'SYS_CHROOT']);
const VOLUMES_OK = new Set(['configMap', 'csi', 'downwardAPI', 'emptyDir', 'ephemeral', 'persistentVolumeClaim', 'projected', 'secret']);

const quem = (nomes, sing = 'container', plur = 'containers') => `${nomes.length === 1 ? sing : plur} ${nomes.map((n) => JSON.stringify(n)).join(', ')}`;

/** As normas do namespace: { enforce, warn } (o nível e a versão de cada uma), ou nada. */
export function normasDe(c, ns) {
  const l = c.obter('Namespace', null, ns)?.metadata.labels ?? {};
  const norma = (modo) => (NIVEIS.includes(l[`${ROTULO}${modo}`]) ? { nivel: l[`${ROTULO}${modo}`], versao: l[`${ROTULO}${modo}-version`] ?? 'latest' } : null);
  return { enforce: norma('enforce'), warn: norma('warn') };
}

/** O que o pod viola no nível pedido, na ordem das checagens do Kubernetes (pelo nome de cada uma). */
export function violacoes(spec, nivel) {
  if (nivel === 'privileged') return [];
  const cts = [...(spec.initContainers ?? []), ...spec.containers];
  const sc = (ct) => ct.securityContext ?? {};
  const pod = spec.securityContext ?? {};
  const restrito = nivel === 'restricted';
  const lista = [];
  if (restrito) {
    const sem = cts.filter((ct) => sc(ct).allowPrivilegeEscalation !== false).map((ct) => ct.name);
    if (sem.length) lista.push(`allowPrivilegeEscalation != false (${quem(sem)} must set securityContext.allowPrivilegeEscalation=false)`);
    const semDrop = cts.filter((ct) => !(sc(ct).capabilities?.drop ?? []).includes('ALL')).map((ct) => ct.name);
    const mais = cts.flatMap((ct) => (sc(ct).capabilities?.add ?? []).filter((x) => x !== 'NET_BIND_SERVICE').map((x) => `container ${JSON.stringify(ct.name)} must not include ${JSON.stringify(x)} in securityContext.capabilities.add`));
    if (semDrop.length || mais.length) lista.push(`unrestricted capabilities (${[...(semDrop.length ? [`${quem(semDrop)} must set securityContext.capabilities.drop=["ALL"]`] : []), ...mais].join('; ')})`);
  } else {
    const fora = cts.flatMap((ct) => (sc(ct).capabilities?.add ?? []).filter((x) => !PADRAO_CAPS.has(x)).map((x) => `container ${JSON.stringify(ct.name)} must not include ${JSON.stringify(x)} in securityContext.capabilities.add`));
    if (fora.length) lista.push(`non-default capabilities (${fora.join('; ')})`);
  }
  const hosts = ['hostNetwork', 'hostPID', 'hostIPC'].filter((k) => spec[k]);
  if (hosts.length) lista.push(`host namespaces (${hosts.map((k) => `${k}=true`).join(', ')})`);
  const hostPath = (spec.volumes ?? []).filter((v) => v.hostPath).map((v) => v.name);
  if (hostPath.length) lista.push(`hostPath volumes (${quem(hostPath, 'volume', 'volumes')})`);
  const portas = cts.flatMap((ct) => (ct.ports ?? []).filter((p) => p.hostPort).map((p) => `container ${JSON.stringify(ct.name)} uses hostPort ${p.hostPort}`));
  if (portas.length) lista.push(`hostPort (${portas.join(', ')})`);
  const priv = cts.filter((ct) => sc(ct).privileged).map((ct) => ct.name);
  if (priv.length) lista.push(`privileged (${quem(priv)} must not set securityContext.privileged=true)`);
  if (restrito) {
    const tipos = (spec.volumes ?? []).map((v) => [v.name, Object.keys(v).find((k) => k !== 'name')]).filter(([, t]) => t && !VOLUMES_OK.has(t));
    if (tipos.length) lista.push(`restricted volume types (${tipos.map(([n, t]) => `volume ${JSON.stringify(n)} uses restricted volume type ${JSON.stringify(t)}`).join(', ')})`);
    const raiz = cts.filter((ct) => (sc(ct).runAsNonRoot ?? pod.runAsNonRoot) !== true).map((ct) => ct.name);
    if (pod.runAsNonRoot === false) lista.push('runAsNonRoot != true (pod must not set securityContext.runAsNonRoot=false)');
    else if (raiz.length) lista.push(`runAsNonRoot != true (pod or ${quem(raiz)} must set securityContext.runAsNonRoot=true)`);
    const zero = [...(pod.runAsUser === 0 ? ['pod must not set runAsUser=0'] : []), ...cts.filter((ct) => sc(ct).runAsUser === 0).map((ct) => `container ${JSON.stringify(ct.name)} must not set runAsUser=0`)];
    if (zero.length) lista.push(`runAsUser=0 (${zero.join('; ')})`);
    const bom = (p) => ['RuntimeDefault', 'Localhost'].includes(p?.type);
    const semPerfil = cts.filter((ct) => !bom(sc(ct).seccompProfile ?? pod.seccompProfile)).map((ct) => ct.name);
    if (semPerfil.length) lista.push(`seccompProfile (pod or ${quem(semPerfil)} must set securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")`);
  }
  return lista;
}

export const textoViolacao = (norma, lista) => `PodSecurity "${norma.nivel}:${norma.versao}": ${lista.join(', ')}`;
