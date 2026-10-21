// Os discos do cluster: o controlador de PersistentVolumes (liga cada pedido, o PVC, a um disco, o PV), o
// provisionador da StorageClass "standard" (o local-path do kind, que cria o disco no node do primeiro pod) e o
// sistema de arquivos de cada contêiner (a imagem, uma camada gravável e os volumes montados por cima).
import { iso, bytes } from './unidades.js';

const TERMINAIS = new Set(['Succeeded', 'Failed']);
export const PROVISIONADOR = 'rancher.io/local-path';
const PROVISIONAR_EM = 6000; // o local-path sobe um pod auxiliar para criar a pasta: leva uns segundos
const REPETIR_FALHA = 15_000;
const SIGLAS = { ReadWriteOnce: 'RWO', ReadOnlyMany: 'ROX', ReadWriteMany: 'RWX', ReadWriteOncePod: 'RWOP' };
export const siglasDeAcesso = (modos) => (modos ?? []).map((m) => SIGLAS[m] ?? m).join(',');

/** Os PVCs que o pod usa (pelos volumes). */
export const pvcsDoPod = (pod) => (pod.spec.volumes ?? []).filter((v) => v.persistentVolumeClaim).map((v) => v.persistentVolumeClaim.claimName);

/** A StorageClass padrão do cluster (a anotada como default). */
export const classePadrao = (c) => c.listar('StorageClass').find((sc) => sc.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true');

// Quem usa o PVC: pods já num node e ainda vivos (um pod Pending, sem node, não segura o PVC).
const usuarios = (c, pvc) => c.listar('Pod', pvc.metadata.namespace)
  .filter((p) => p.spec.nodeName && !TERMINAIS.has(p.status?.phase) && pvcsDoPod(p).includes(pvc.metadata.name));

const salvarSeMudou = (c, obj, antes) => {
  if (JSON.stringify(obj) !== antes) c.salvar(obj);
};

function ligar(c, pvc, pv) {
  pv.spec.claimRef = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', name: pvc.metadata.name, namespace: pvc.metadata.namespace, resourceVersion: pvc.metadata.resourceVersion, uid: pvc.metadata.uid };
  pv.status = { lastPhaseTransitionTime: iso(c.agora), phase: 'Bound' };
  c.salvar(pv);
  pvc.spec.volumeName = pv.metadata.name;
  pvc.metadata.annotations = { ...(pvc.metadata.annotations ?? {}), 'pv.kubernetes.io/bind-completed': 'yes', 'pv.kubernetes.io/bound-by-controller': 'yes' };
  pvc.status = { ...pvc.status, accessModes: [...pv.spec.accessModes], capacity: { ...pv.spec.capacity }, phase: 'Bound' };
  c.salvar(pvc);
  c.mudancasDeCapacidade++; // o scheduler tenta de novo os pods que esperavam este disco
}

/** Um PV livre que serve para o pedido (mesma classe, tamanho e modos de acesso), o menor que couber. */
function discoLivre(c, pvc) {
  const classe = pvc.spec.storageClassName ?? '';
  const pedido = bytes(pvc.spec.resources?.requests?.storage);
  return c.listar('PersistentVolume')
    .filter((pv) => pv.status?.phase === 'Available' && (pv.spec.storageClassName ?? '') === classe
      && (!pvc.spec.volumeName || pvc.spec.volumeName === pv.metadata.name)
      && bytes(pv.spec.capacity?.storage) >= pedido
      && (pvc.spec.accessModes ?? []).every((m) => pv.spec.accessModes.includes(m)))
    .sort((a, b) => bytes(a.spec.capacity.storage) - bytes(b.spec.capacity.storage))[0];
}

function provisionar(c, pvc, classe, node) {
  const nome = `pvc-${pvc.metadata.uid}`;
  const pv = c.criar({
    apiVersion: 'v1', kind: 'PersistentVolume',
    metadata: { annotations: { 'local.path.provisioner/selected-node': node, 'pv.kubernetes.io/provisioned-by': PROVISIONADOR }, finalizers: ['kubernetes.io/pv-protection'], name: nome },
    spec: {
      accessModes: [...pvc.spec.accessModes],
      capacity: { storage: pvc.spec.resources.requests.storage },
      hostPath: { path: `/var/local-path-provisioner/${nome}_${pvc.metadata.namespace}_${pvc.metadata.name}`, type: 'DirectoryOrCreate' },
      nodeAffinity: { required: { nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: [node] }] }] } },
      persistentVolumeReclaimPolicy: classe.reclaimPolicy ?? 'Delete',
      storageClassName: classe.metadata.name,
      volumeMode: 'Filesystem',
    },
  });
  c.evento(pvc, 'Normal', 'ProvisioningSucceeded', `Successfully provisioned volume ${nome}`, { componente: c.idProvisionador });
  ligar(c, pvc, pv);
}

/** O controlador de PersistentVolumes e o provisionador. Roda junto com os outros controladores. */
export function controladorDeDiscos(c) {
  for (const pvc of c.listar('PersistentVolumeClaim')) {
    const antes = JSON.stringify(pvc);
    const usando = usuarios(c, pvc);
    if (pvc.metadata.deletionTimestamp) { // a proteção (pvc-protection) segura o PVC enquanto algum pod usa
      if (!usando.length) c.finalizarRemocao(pvc);
      continue;
    }
    if (pvc.status?.phase === 'Bound' && (usando.length || pvc.status?.conditions)) { // só o PVC ligado ganha a condição Unused
      const anterior = pvc.status?.conditions?.[0];
      const status = usando.length ? 'False' : 'True';
      if (anterior?.status !== status) {
        pvc.status = {
          ...pvc.status,
          conditions: [{ lastProbeTime: null, lastTransitionTime: iso(c.agora), message: usando.length ? 'A pod is currently referencing this PVC' : 'No pods are currently referencing this PVC', reason: usando.length ? 'PodUsingPVC' : 'NoPodsUsingPVC', status, type: 'Unused' }],
        };
      }
    }
    salvarSeMudou(c, pvc, antes);
    if (pvc.status?.phase === 'Bound') continue;

    const livre = discoLivre(c, pvc);
    if (livre) {
      ligar(c, pvc, livre);
      continue;
    }
    const nomeClasse = pvc.spec.storageClassName ?? '';
    const marca = c.provisionamentos.get(pvc.metadata.uid) ?? {};
    c.provisionamentos.set(pvc.metadata.uid, marca);
    if (!nomeClasse) {
      if (!marca.avisado || c.agora - marca.avisado >= REPETIR_FALHA) {
        marca.avisado = c.agora;
        c.evento(pvc, 'Normal', 'FailedBinding', 'no persistent volumes available for this claim and no storage class is set', { componente: 'persistentvolume-controller' });
      }
      continue;
    }
    const classe = c.obter('StorageClass', null, nomeClasse);
    if (!classe) {
      if (!marca.avisado || c.agora - marca.avisado >= REPETIR_FALHA) {
        marca.avisado = c.agora;
        c.evento(pvc, 'Warning', 'ProvisioningFailed', `storageclass.storage.k8s.io "${nomeClasse}" not found`, { componente: 'persistentvolume-controller' });
      }
      continue;
    }
    const noh = pvc.metadata.annotations?.['volume.kubernetes.io/selected-node'];
    if (classe.volumeBindingMode === 'WaitForFirstConsumer' && !noh) {
      if (!marca.esperando) {
        marca.esperando = true;
        c.evento(pvc, 'Normal', 'WaitForFirstConsumer', 'waiting for first consumer to be created before binding', { componente: 'persistentvolume-controller' });
      }
      continue;
    }
    if (classe.provisioner !== PROVISIONADOR) continue; // ninguém instalado para criar este tipo de disco
    if (!marca.inicio) {
      marca.inicio = c.agora;
      pvc.metadata.annotations = { ...(pvc.metadata.annotations ?? {}), 'volume.beta.kubernetes.io/storage-provisioner': PROVISIONADOR, 'volume.kubernetes.io/storage-provisioner': PROVISIONADOR };
      c.salvar(pvc);
      c.evento(pvc, 'Normal', 'ExternalProvisioning', `Waiting for a volume to be created either by the external provisioner '${PROVISIONADOR}' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered.`, { componente: 'persistentvolume-controller' });
      c.evento(pvc, 'Normal', 'Provisioning', `External provisioner is provisioning volume for claim "${pvc.metadata.namespace}/${pvc.metadata.name}"`, { componente: c.idProvisionador });
    }
    if (!marca.repetiu && c.agora - marca.inicio >= 1000) { // o controlador confere de novo enquanto o disco não vem
      marca.repetiu = true;
      c.evento(pvc, 'Normal', 'ExternalProvisioning', `Waiting for a volume to be created either by the external provisioner '${PROVISIONADOR}' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered.`, { componente: 'persistentvolume-controller' });
    }
    if (c.agora - marca.inicio >= PROVISIONAR_EM) {
      const nodes = c.listar('Node').filter((n) => !n.spec.taints?.length);
      provisionar(c, pvc, classe, noh ?? (nodes[0] ?? c.listar('Node')[0]).metadata.name);
    }
  }

  for (const pv of c.listar('PersistentVolume')) {
    if (pv.metadata.deletionTimestamp) {
      if (pv.status?.phase !== 'Bound') c.finalizarRemocao(pv);
      continue;
    }
    if (!pv.status?.phase || pv.status.phase === 'Pending') {
      pv.status = { lastPhaseTransitionTime: iso(c.agora), phase: 'Available' };
      c.salvar(pv);
      continue;
    }
    // O pedido foi apagado: Delete apaga o disco (e os dados); Retain guarda o disco como Released.
    const ref = pv.spec.claimRef;
    if (pv.status.phase === 'Bound' && ref && !c.porUid.has(ref.uid)) {
      if (pv.spec.persistentVolumeReclaimPolicy === 'Delete') {
        c.discos.delete(pv.metadata.name);
        c.finalizarRemocao(pv);
      } else {
        pv.status = { lastPhaseTransitionTime: iso(c.agora), phase: 'Released' };
        c.salvar(pv);
      }
    }
  }
}

// ---------- o sistema de arquivos de um contêiner ----------

const normalizar = (caminho) => `/${caminho.split('/').filter(Boolean).join('/')}`;

/**
 * O que o contêiner enxerga: os arquivos da imagem (`base`, só leitura de fato, mas com uma camada gravável
 * por cima que some quando o contêiner reinicia) e os volumes montados (`montagens`: { caminho, loja: Map,
 * somenteLeitura }), que valem por cima de tudo no caminho deles.
 */
export class SistemaDeArquivos {
  constructor(base, camada, montagens = [], { raizSomenteLeitura = false } = {}) {
    this.base = base;
    this.camada = camada;
    this.raizSomenteLeitura = raizSomenteLeitura; // securityContext.readOnlyRootFilesystem: só os volumes aceitam escrita
    this.montagens = [...montagens].sort((a, b) => b.caminho.length - a.caminho.length);
  }

  montagem(caminho) {
    const c = normalizar(caminho);
    return this.montagens.find((m) => c === m.caminho || c.startsWith(`${m.caminho}/`));
  }

  ler(caminho) {
    const c = normalizar(caminho);
    const m = this.montagem(c);
    if (m) return m.loja.get(c.slice(m.caminho.length).replace(/^\//, ''));
    return this.camada.has(c) ? this.camada.get(c) : this.base[c];
  }

  /** Grava (ou acrescenta, com `anexar`). → null, ou o motivo da falha: 'somente-leitura', 'sem-pasta' ou 'pasta'. */
  escrever(caminho, texto, anexar = false) {
    const c = normalizar(caminho);
    if (c === '/dev/null') return null;
    const pai = c.replace(/\/[^/]*$/, '') || '/';
    if (pai !== '/' && this.listar(pai) === null) return 'sem-pasta';
    const m = this.montagem(c);
    if (m) {
      if (m.somenteLeitura) return 'somente-leitura';
      const rel = c.slice(m.caminho.length).replace(/^\//, '');
      if (!rel) return 'pasta';
      m.loja.set(rel, (anexar ? m.loja.get(rel) ?? '' : '') + texto);
      return null;
    }
    if (this.raizSomenteLeitura) return 'somente-leitura';
    this.camada.set(c, (anexar ? this.ler(c) ?? '' : '') + texto);
    return null;
  }

  /** Dá para gravar neste caminho? (um volume que aceita escrita, ou a raiz, se ela não for só leitura) */
  podeGravar(caminho) {
    const m = this.montagem(caminho);
    return m ? !m.somenteLeitura : !this.raizSomenteLeitura;
  }

  /** Apaga um arquivo. → null, ou o motivo da falha. */
  remover(caminho) {
    const c = normalizar(caminho);
    const m = this.montagem(c);
    if (m) {
      if (m.somenteLeitura) return 'somente-leitura';
      return m.loja.delete(c.slice(m.caminho.length).replace(/^\//, '')) ? null : 'nao-existe';
    }
    if (this.raizSomenteLeitura && (this.camada.has(c) || this.base[c] !== undefined)) return 'somente-leitura';
    if (this.camada.has(c)) {
      this.camada.delete(c);
      return null;
    }
    return 'nao-existe';
  }

  /** Os nomes dentro da pasta (null se a pasta não existe). */
  listar(pasta) {
    const dir = normalizar(pasta);
    const prefixo = dir === '/' ? '/' : `${dir}/`;
    const nomes = new Set();
    const m = this.montagem(dir);
    if (m) {
      const rel = dir.slice(m.caminho.length).replace(/^\//, '');
      const pre = rel ? `${rel}/` : '';
      for (const k of m.loja.keys()) if (k.startsWith(pre)) nomes.add(k.slice(pre.length).split('/')[0]);
      if (!nomes.size && rel) return null;
    } else {
      for (const k of [...Object.keys(this.base), ...this.camada.keys()]) if (k.startsWith(prefixo)) nomes.add(k.slice(prefixo.length).split('/')[0]);
    }
    for (const mt of this.montagens) if (mt.caminho.startsWith(prefixo)) nomes.add(mt.caminho.slice(prefixo.length).split('/')[0]);
    if (dir === '/') ['bin', 'dev', 'etc', 'home', 'proc', 'root', 'sys', 'tmp', 'usr', 'var'].forEach((d) => nomes.add(d));
    if (!nomes.size && !m) return this.ehPasta(dir) ? [] : null;
    return [...nomes].filter(Boolean).sort();
  }

  ehPasta(caminho) {
    const c = normalizar(caminho);
    return this.montagens.some((m) => m.caminho === c) || ['/tmp', '/root', '/home', '/var', '/etc', '/usr', '/bin'].includes(c);
  }
}
