// kubectl auth can-i --list: tudo o que o crachá deixa fazer no namespace (o SelfSubjectRulesReview), como o kubectl
// mostra: as regras quebradas em pedaços, juntadas de novo por recurso e ordenadas pelo texto da regra (o String() do Go).
import { quemE } from '../seguranca.js';
import { tabela } from '../tabwriter.js';

// Os ClusterRoleBindings padrão que todo cluster tem (copiados de um kind v1.37) e que o simulador não guarda como objeto.
const PADRAO = [
  { nome: 'system:basic-user', grupos: ['system:authenticated'], regras: [{ apiGroups: ['authorization.k8s.io'], resources: ['selfsubjectaccessreviews', 'selfsubjectrulesreviews'], verbs: ['create'] }, { apiGroups: ['authentication.k8s.io'], resources: ['selfsubjectreviews'], verbs: ['create'] }] },
  { nome: 'system:cluster-trust-bundle-discovery', grupos: ['system:serviceaccounts'], regras: [{ apiGroups: ['certificates.k8s.io'], resources: ['clustertrustbundles'], verbs: ['get', 'list', 'watch'] }] },
  { nome: 'system:discovery', grupos: ['system:authenticated'], regras: [{ nonResourceURLs: ['/api', '/api/*', '/apis', '/apis/*', '/healthz', '/livez', '/openapi', '/openapi/*', '/readyz', '/version', '/version/'], verbs: ['get'] }] },
  { nome: 'system:public-info-viewer', grupos: ['system:authenticated', 'system:unauthenticated'], regras: [{ nonResourceURLs: ['/healthz', '/livez', '/readyz', '/version', '/version/'], verbs: ['get'] }] },
  { nome: 'system:service-account-issuer-discovery', grupos: ['system:serviceaccounts'], regras: [{ nonResourceURLs: ['/.well-known/openid-configuration', '/.well-known/openid-configuration/', '/openid/v1/jwks', '/openid/v1/jwks/'], verbs: ['get'] }] },
];

const casaSujeito = (s, quem, nsDoVinculo) => (s.kind === 'User' ? s.name === quem.usuario
  : s.kind === 'Group' ? quem.grupos.includes(s.name)
    : s.kind === 'ServiceAccount' && !!quem.conta && s.name === quem.conta.nome && (s.namespace ?? nsDoVinculo) === quem.conta.ns);

/** As regras de quem pede, na ordem em que o apiserver as visita: os ClusterRoleBindings e, no namespace, os RoleBindings. */
function regrasDe(cluster, quem, ns) {
  const doPapel = (ref, nsDoVinculo) => (ref.kind === 'ClusterRole' ? cluster.obter('ClusterRole', null, ref.name) : cluster.obter('Role', nsDoVinculo, ref.name))?.rules ?? [];
  const globais = [
    ...cluster.listar('ClusterRoleBinding').map((b) => ({ nome: b.metadata.name, casa: (b.subjects ?? []).some((x) => casaSujeito(x, quem, null)), regras: () => doPapel(b.roleRef, null) })),
    ...PADRAO.map((p) => ({ nome: p.nome, casa: p.grupos.some((g) => quem.grupos.includes(g)), regras: () => p.regras })),
  ].sort((x, y) => (x.nome < y.nome ? -1 : x.nome > y.nome ? 1 : 0));
  const locais = ns ? cluster.listar('RoleBinding', ns).filter((b) => (b.subjects ?? []).some((x) => casaSujeito(x, quem, ns))).map((b) => doPapel(b.roleRef, ns)) : [];
  return [...globais.filter((g) => g.casa).flatMap((g) => g.regras()), ...locais.flat()];
}

/** O BreakdownRule do kubectl: uma regra por grupo, recurso, verbo e nome; as de URL, uma por URL e verbo. */
const quebrar = (r) => [
  ...(r.apiGroups ?? []).flatMap((g) => (r.resources ?? []).flatMap((x) => (r.verbs ?? []).flatMap((v) => (r.resourceNames?.length
    ? r.resourceNames.map((n) => ({ apiGroups: [g], resources: [x], verbs: [v], resourceNames: [n] }))
    : [{ apiGroups: [g], resources: [x], verbs: [v] }])))),
  ...(r.nonResourceURLs ?? []).flatMap((u) => (r.verbs ?? []).map((v) => ({ nonResourceURLs: [u], verbs: [v] }))),
];

const lista = (v) => `[${(v ?? []).join(' ')}]`;
const comoTexto = (r) => `&PolicyRule{Verbs:${lista(r.verbs)},APIGroups:${lista(r.apiGroups)},Resources:${lista(r.resources)},ResourceNames:${lista(r.resourceNames)},NonResourceURLs:${lista(r.nonResourceURLs)},}`;

/** "pods/log" do grupo "" → pods/log; "deployments" do apps → deployments.apps; "*" do "*" → *.* */
function recursoComGrupo(r) {
  if (!r.resources?.length) return '';
  const [base, sub] = r.resources[0].split(/\/(.*)/s);
  return `${base}${r.apiGroups?.[0] ? `.${r.apiGroups[0]}` : ''}${sub !== undefined ? `/${sub}` : ''}`;
}

export function listarPermissoes(cluster, a, s, ns) {
  if (a.posicionais.length > 1) return s.falha('error: list option must be specified with no arguments');
  const quem = a.flags.as ? quemE(a.flags.as, a.flags['as-group'] ?? []) : quemE('kubernetes-admin', ['kubeadm:cluster-admins']);
  // CompactRules: as de recurso com o mesmo grupo, recurso e nome juntam os verbos; as de URL ficam como estão.
  const urls = [];
  const simples = new Map();
  for (const r of regrasDe(cluster, quem, ns).flatMap(quebrar)) {
    if (r.nonResourceURLs) {
      urls.push(r);
      continue;
    }
    const chave = `${r.apiGroups[0]}\u0000${r.resources[0]}\u0000${r.resourceNames?.[0] ?? ''}`;
    if (simples.has(chave)) simples.get(chave).verbs.push(...r.verbs);
    else simples.set(chave, { ...r, verbs: [...r.verbs] });
  }
  const regras = [...urls, ...simples.values()].map((r) => ({ r, texto: comoTexto(r) })).sort((x, y) => (x.texto < y.texto ? -1 : x.texto > y.texto ? 1 : 0));
  const linhas = regras.map(({ r }) => [recursoComGrupo(r), lista(r.nonResourceURLs), lista(r.resourceNames), lista(r.verbs)]);
  s.out(tabela([...(a.flags['no-headers'] ? [] : [['Resources', 'Non-Resource URLs', 'Resource Names', 'Verbs']]), ...linhas]));
}
