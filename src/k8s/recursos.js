// Os tipos de recurso que a API simulada conhece (o que o `kubectl api-resources` lista).

export const RECURSOS = [
  { kind: 'ConfigMap', plural: 'configmaps', singular: 'configmap', curtos: ['cm'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Endpoints', plural: 'endpoints', singular: 'endpoints', curtos: ['ep'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Event', plural: 'events', singular: 'event', curtos: ['ev'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Namespace', plural: 'namespaces', singular: 'namespace', curtos: ['ns'], grupo: '', versao: 'v1', namespaced: false },
  { kind: 'Node', plural: 'nodes', singular: 'node', curtos: ['no'], grupo: '', versao: 'v1', namespaced: false },
  { kind: 'PersistentVolumeClaim', plural: 'persistentvolumeclaims', singular: 'persistentvolumeclaim', curtos: ['pvc'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'PersistentVolume', plural: 'persistentvolumes', singular: 'persistentvolume', curtos: ['pv'], grupo: '', versao: 'v1', namespaced: false },
  { kind: 'Pod', plural: 'pods', singular: 'pod', curtos: ['po'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'ResourceQuota', plural: 'resourcequotas', singular: 'resourcequota', curtos: ['quota'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'LimitRange', plural: 'limitranges', singular: 'limitrange', curtos: ['limits'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Secret', plural: 'secrets', singular: 'secret', curtos: [], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'ServiceAccount', plural: 'serviceaccounts', singular: 'serviceaccount', curtos: ['sa'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Service', plural: 'services', singular: 'service', curtos: ['svc'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Deployment', plural: 'deployments', singular: 'deployment', curtos: ['deploy'], grupo: 'apps', versao: 'v1', namespaced: true },
  { kind: 'ReplicaSet', plural: 'replicasets', singular: 'replicaset', curtos: ['rs'], grupo: 'apps', versao: 'v1', namespaced: true },
  { kind: 'StatefulSet', plural: 'statefulsets', singular: 'statefulset', curtos: ['sts'], grupo: 'apps', versao: 'v1', namespaced: true },
  { kind: 'DaemonSet', plural: 'daemonsets', singular: 'daemonset', curtos: ['ds'], grupo: 'apps', versao: 'v1', namespaced: true },
  { kind: 'Job', plural: 'jobs', singular: 'job', curtos: [], grupo: 'batch', versao: 'v1', namespaced: true },
  { kind: 'CronJob', plural: 'cronjobs', singular: 'cronjob', curtos: ['cj'], grupo: 'batch', versao: 'v1', namespaced: true },
  { kind: 'HorizontalPodAutoscaler', plural: 'horizontalpodautoscalers', singular: 'horizontalpodautoscaler', curtos: ['hpa'], grupo: 'autoscaling', versao: 'v2', namespaced: true },
  { kind: 'Ingress', plural: 'ingresses', singular: 'ingress', curtos: ['ing'], grupo: 'networking.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'IngressClass', plural: 'ingressclasses', singular: 'ingressclass', curtos: [], grupo: 'networking.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'GatewayClass', plural: 'gatewayclasses', singular: 'gatewayclass', curtos: ['gc'], grupo: 'gateway.networking.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'Gateway', plural: 'gateways', singular: 'gateway', curtos: ['gtw'], grupo: 'gateway.networking.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'HTTPRoute', plural: 'httproutes', singular: 'httproute', curtos: [], grupo: 'gateway.networking.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'NetworkPolicy', plural: 'networkpolicies', singular: 'networkpolicy', curtos: ['netpol'], grupo: 'networking.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'Role', plural: 'roles', singular: 'role', curtos: [], grupo: 'rbac.authorization.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'RoleBinding', plural: 'rolebindings', singular: 'rolebinding', curtos: [], grupo: 'rbac.authorization.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'ClusterRole', plural: 'clusterroles', singular: 'clusterrole', curtos: [], grupo: 'rbac.authorization.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'ClusterRoleBinding', plural: 'clusterrolebindings', singular: 'clusterrolebinding', curtos: [], grupo: 'rbac.authorization.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'PodDisruptionBudget', plural: 'poddisruptionbudgets', singular: 'poddisruptionbudget', curtos: ['pdb'], grupo: 'policy', versao: 'v1', namespaced: true },
  { kind: 'PriorityClass', plural: 'priorityclasses', singular: 'priorityclass', curtos: ['pc'], grupo: 'scheduling.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'CustomResourceDefinition', plural: 'customresourcedefinitions', singular: 'customresourcedefinition', curtos: ['crd', 'crds'], grupo: 'apiextensions.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'StorageClass', plural: 'storageclasses', singular: 'storageclass', curtos: ['sc'], grupo: 'storage.k8s.io', versao: 'v1', namespaced: false },
];

const POR_KIND = Object.fromEntries(RECURSOS.map((r) => [r.kind, r]));

// Os tipos que os CRDs do cluster em uso acrescentaram (cada cluster tem os seus; quem usa o cluster ativa a lista).
let extras = [];
export const usarRecursosExtras = (lista) => {
  extras = lista;
};
export const todosOsRecursos = () => [...RECURSOS, ...extras];

export const recursoDoKind = (kind) => POR_KIND[kind] ?? extras.find((r) => r.kind === kind);

/** 'po', 'pods', 'Pod', 'deployments.apps', 'deploy' → recurso (ou undefined). */
export function acharRecurso(nome) {
  const n = nome.toLowerCase();
  return todosOsRecursos().find((r) => {
    const nomes = [r.plural, r.singular, r.kind.toLowerCase(), ...r.curtos];
    if (r.grupo) nomes.push(`${r.plural}.${r.grupo}`, `${r.singular}.${r.grupo}`, `${r.plural}.${r.grupo}.${r.versao}`);
    return nomes.includes(n);
  });
}

export const apiVersion = (r) => (r.grupo ? `${r.grupo}/${r.versao}` : r.versao);
/** 'deployment.apps', 'pod': o nome que aparece em `deployment.apps/web created`. */
export const nomeQualificado = (r) => (r.grupo ? `${r.singular}.${r.grupo}` : r.singular);
/** 'deployments.apps', 'pods': o nome que aparece em `deployments.apps "web" not found`. */
export const pluralQualificado = (r) => (r.grupo ? `${r.plural}.${r.grupo}` : r.plural);
