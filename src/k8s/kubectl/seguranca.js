// kubectl e os crachás: --as (pedir como outra pessoa), auth can-i e create role/clusterrole/rolebinding/
// clusterrolebinding/serviceaccount.
import { acharRecurso, pluralQualificado, apiVersion } from '../recursos.js';
import { pode, quemE } from '../seguranca.js';

const VERBOS = ['*', 'get', 'list', 'watch', 'create', 'update', 'patch', 'delete', 'deletecollection', 'use', 'bind', 'escalate', 'impersonate'];
const RBAC = 'rbac.authorization.k8s.io';

const quemPede = (a) => quemE(a.flags.as, a.flags['as-group'] ?? []);

/** "Error from server (Forbidden): pods "x" is forbidden: User "ana" cannot get resource "pods" in API group "" in the namespace "loja"". */
function proibido(quem, p, r) {
  const alvo = p.nome ? `${pluralQualificado(r)} "${p.nome}"` : pluralQualificado(r);
  const escopo = p.ns ? `in the namespace "${p.ns}"` : 'at the cluster scope';
  return `${alvo} is forbidden: User "${quem.usuario}" cannot ${p.verbo} resource "${p.sub ? `${p.recurso}/${p.sub}` : p.recurso}" in API group "${p.grupo}" ${escopo}`;
}

const pedido = (r, verbo, ns, nome, sub) => ({ verbo, recurso: r.plural, grupo: r.grupo, sub, ns: r.namespaced ? ns : undefined, nome });

/** "pods", "pod x", "pod/x", "deploy,svc" → [{ r, nome }]. */
function alvos(posicionais) {
  const [primeiro, ...nomes] = posicionais;
  if (!primeiro) return [];
  if (primeiro.includes('/')) return posicionais.map((x) => x.split('/')).map(([t, n]) => ({ r: acharRecurso(t), nome: n }));
  const tipos = primeiro.split(',').map((t) => acharRecurso(t === 'all' ? 'pods' : t));
  return nomes.length ? tipos.flatMap((r) => nomes.map((nome) => ({ r, nome }))) : tipos.map((r) => ({ r }));
}

/** Os pedidos que o comando faria à API (para conferir com o --as antes de rodar). → [pedido] | null (não conferido). */
function pedidosDoComando(nome, a, ns, docs) {
  const p = a.posicionais;
  switch (nome) {
    case 'get':
    case 'describe':
      return alvos(p).filter((x) => x.r).map(({ r, nome: n }) => ({ r, ...pedido(r, n ? 'get' : 'list', ns, n) }));
    case 'delete':
      return alvos(p).filter((x) => x.r).map(({ r, nome: n }) => ({ r, ...pedido(r, n ? 'delete' : 'deletecollection', ns, n) }));
    case 'run': {
      const r = acharRecurso('pods');
      return [{ r, ...pedido(r, 'create', ns) }];
    }
    case 'create': {
      if (!p[0]) return docs.map(({ r, nome: n }) => ({ r, ...pedido(r, 'create', ns, undefined), nomeDoc: n }));
      const r = acharRecurso({ deploy: 'deployments', cm: 'configmaps', ns: 'namespaces', sa: 'serviceaccounts' }[p[0]] ?? p[0]);
      return r ? [{ r, ...pedido(r, 'create', ns) }] : null;
    }
    case 'apply':
      return docs.map(({ r, nome: n, arquivo }) => ({ r, ...pedido(r, 'get', ns, n), aplicar: true, arquivo }));
    case 'logs':
    case 'exec': {
      // O kubectl primeiro lê o pod (get pods) e só então pede o log ou a conexão do exec (o subrecurso).
      const r = acharRecurso('pods');
      const n = p[0]?.replace(/^(po|pod|pods)\//, '');
      const ehPod = !!n && !n.includes('/'); // deploy/web e afins: só o subrecurso, como antes
      const sub = { r, ...pedido(r, nome === 'exec' ? 'create' : 'get', ns, n, nome === 'exec' ? 'exec' : 'log'), depoisDoPod: ehPod };
      return ehPod ? [{ r, ...pedido(r, 'get', ns, n) }, sub] : [sub];
    }
    case 'scale':
      return alvos(p).filter((x) => x.r).map(({ r, nome: n }) => ({ r, ...pedido(r, 'patch', ns, n, 'scale') }));
    default:
      return null;
  }
}

/**
 * Confere o --as antes do comando rodar. `docs`: os objetos dos arquivos (-f), para create e apply.
 * → true (pode seguir) ou false (o erro já foi escrito).
 */
export function autorizar(cluster, nome, a, s, ns, docs = []) {
  if (!a.flags.as || nome === 'auth') return true;
  const pedidos = pedidosDoComando(nome, a, ns, docs);
  if (!pedidos) {
    s.falha(`error: o simulador só confere o --as em get, describe, create, apply, run, delete, logs, exec, scale e auth can-i (o comando "${nome}" ainda não).`);
    return false;
  }
  const quem = quemPede(a);
  for (const p of pedidos) {
    if (pode(cluster, quem, p)) continue;
    if (p.depoisDoPod && !cluster.obter('Pod', p.ns, p.nome)) return true; // o comando é que diz NotFound
    const msg = proibido(quem, p, p.r);
    if (p.sub === 'exec') s.falha(`error: unable to upgrade connection: ${msg}`); // o "não" vem na troca de protocolo
    else if (p.aplicar) {
      const gv = apiVersion(p.r);
      s.falha(`Error from server (Forbidden): error when retrieving current configuration of:\nResource: "${gv.includes('/') ? gv : `/${gv}`}, Resource=${p.r.plural}", GroupVersionKind: "${gv.includes('/') ? gv : `/${gv}`}, Kind=${p.r.kind}"\nName: "${p.nome}", Namespace: "${p.ns ?? ''}"\nfrom server for: "${p.arquivo}": ${msg}`);
    } else s.falha(`Error from server (Forbidden): ${msg}`);
    return false;
  }
  return true;
}

/** kubectl auth can-i VERBO RECURSO [NOME]: "yes" ou "no" (com código 1). */
export function auth(cluster, a, s, ns) {
  const [sub, verbo, alvo, nomeExtra] = a.posicionais;
  if (sub !== 'can-i') return s.falha(`error: unknown command "${sub ?? ''}" for "kubectl auth"`);
  if (!verbo || !alvo) return s.falha("error: you must specify two arguments: verb resource or verb resource/resourceName.\nSee 'kubectl auth can-i -h' for help and examples");
  const [tipo, nomeAlvo] = alvo.split('/');
  const r = acharRecurso(tipo);
  if (!r) return s.falha(`error: the server doesn't have a resource type "${tipo}"`);
  if (!a.flags.as) return s.out('yes\n');
  const p = pedido(r, verbo, a.flags['all-namespaces'] ? undefined : ns, nomeAlvo ?? nomeExtra, a.flags.subresource);
  if (pode(cluster, quemPede(a), p)) return s.out('yes\n');
  s.out('no\n');
  s.codigo = 1;
}

// ---------- create role / rolebinding / serviceaccount ----------
const juntarListas = (v) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(',')).filter(Boolean);

/** O objeto que o `kubectl create <sub>` geraria (ou o erro, em texto). */
export function moldeDeSeguranca(sub, nome, a, ns) {
  const meta = { name: nome, ...(a.flags.namespace && !['clusterrole', 'clusterrolebinding'].includes(sub) ? { namespace: ns } : {}) };
  if (sub === 'serviceaccount' || sub === 'sa') return { apiVersion: 'v1', kind: 'ServiceAccount', metadata: meta };
  if (sub === 'role' || sub === 'clusterrole') {
    const verbos = juntarListas(a.flags.verb);
    if (!verbos.length) return 'error: at least one verb must be specified';
    const ruim = verbos.find((v) => !VERBOS.includes(v));
    if (ruim) return `error: invalid verb: '${ruim}'`;
    const recursos = juntarListas(a.flags.resource);
    if (!recursos.length) return 'error: at least one resource must be specified';
    const porGrupo = new Map();
    for (const x of recursos) {
      const [tipo, subr] = x.split('/');
      const r = acharRecurso(tipo);
      if (!r) return `error: the server doesn't have a resource type "${tipo}"`;
      porGrupo.set(r.grupo, [...(porGrupo.get(r.grupo) ?? []), subr ? `${r.plural}/${subr}` : r.plural]);
    }
    const nomes = juntarListas(a.flags['resource-name']);
    return {
      apiVersion: `${RBAC}/v1`, kind: sub === 'role' ? 'Role' : 'ClusterRole', metadata: meta,
      rules: [...porGrupo].map(([g, rs]) => ({ apiGroups: [g], resources: rs, ...(nomes.length ? { resourceNames: nomes } : {}), verbs: verbos })),
    };
  }
  if (sub === 'rolebinding' || sub === 'clusterrolebinding') {
    const papel = a.flags.role;
    const papelDoCluster = a.flags.clusterrole;
    if (sub === 'clusterrolebinding' && !papelDoCluster) return 'error: required flag(s) "clusterrole" not set';
    if (sub === 'rolebinding' && !!papel === !!papelDoCluster) return 'error: exactly one of clusterrole or role must be specified';
    const contas = juntarListas(a.flags.serviceaccount);
    const errada = contas.find((x) => x.split(':').length !== 2);
    if (errada) return `error: serviceaccount must be <namespace>:<name>`;
    return {
      apiVersion: `${RBAC}/v1`, kind: sub === 'rolebinding' ? 'RoleBinding' : 'ClusterRoleBinding', metadata: meta,
      roleRef: { apiGroup: RBAC, kind: papel ? 'Role' : 'ClusterRole', name: papel ?? papelDoCluster },
      subjects: [
        ...juntarListas(a.flags.user).map((x) => ({ apiGroup: RBAC, kind: 'User', name: x })),
        ...juntarListas(a.flags.group).map((x) => ({ apiGroup: RBAC, kind: 'Group', name: x })),
        ...contas.map((x) => ({ kind: 'ServiceAccount', name: x.split(':')[1], namespace: x.split(':')[0] })),
      ],
    };
  }
  return null;
}

export const FLAGS_DE_SEGURANCA = {
  verb: { tipo: 'lista' }, resource: { tipo: 'lista' }, 'resource-name': { tipo: 'lista' },
  role: { tipo: 'string' }, clusterrole: { tipo: 'string' }, user: { tipo: 'lista' }, group: { tipo: 'lista' }, serviceaccount: { tipo: 'lista' },
};
