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
  { kind: 'Secret', plural: 'secrets', singular: 'secret', curtos: [], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Service', plural: 'services', singular: 'service', curtos: ['svc'], grupo: '', versao: 'v1', namespaced: true },
  { kind: 'Deployment', plural: 'deployments', singular: 'deployment', curtos: ['deploy'], grupo: 'apps', versao: 'v1', namespaced: true },
  { kind: 'ReplicaSet', plural: 'replicasets', singular: 'replicaset', curtos: ['rs'], grupo: 'apps', versao: 'v1', namespaced: true },
  { kind: 'StatefulSet', plural: 'statefulsets', singular: 'statefulset', curtos: ['sts'], grupo: 'apps', versao: 'v1', namespaced: true },
  { kind: 'Ingress', plural: 'ingresses', singular: 'ingress', curtos: ['ing'], grupo: 'networking.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'IngressClass', plural: 'ingressclasses', singular: 'ingressclass', curtos: [], grupo: 'networking.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'GatewayClass', plural: 'gatewayclasses', singular: 'gatewayclass', curtos: ['gc'], grupo: 'gateway.networking.k8s.io', versao: 'v1', namespaced: false },
  { kind: 'Gateway', plural: 'gateways', singular: 'gateway', curtos: ['gtw'], grupo: 'gateway.networking.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'HTTPRoute', plural: 'httproutes', singular: 'httproute', curtos: [], grupo: 'gateway.networking.k8s.io', versao: 'v1', namespaced: true },
  { kind: 'StorageClass', plural: 'storageclasses', singular: 'storageclass', curtos: ['sc'], grupo: 'storage.k8s.io', versao: 'v1', namespaced: false },
];

const POR_KIND = Object.fromEntries(RECURSOS.map((r) => [r.kind, r]));

export const recursoDoKind = (kind) => POR_KIND[kind];

/** 'po', 'pods', 'Pod', 'deployments.apps', 'deploy' → recurso (ou undefined). */
export function acharRecurso(nome) {
  const n = nome.toLowerCase();
  return RECURSOS.find((r) => {
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
