// O cluster simulado: a API (o "etcd" com os objetos), os eventos, o relógio e o laço de reconciliação
// (controladores → scheduler → kubelet) que roda até nada mais mudar.
import { criarAleatorio } from './aleatorio.js';
import { aplicarPadroes } from './esquema.js';
import { recursoDoKind, pluralQualificado } from './recursos.js';
import { rodarControladores } from './controladores.js';
import { agendar } from './scheduler.js';
import { Kubelet, qos } from './kubelet.js';
import { bytes, cpuMili, iso, parseDuracao } from './unidades.js';

export const INICIO = Date.UTC(2026, 9, 16, 12, 0, 0);
export const VERSAO_SERVIDOR = 'v1.37.0';

export const NODES_PADRAO = [
  { nome: 'control-plane', controlPlane: true },
  { nome: 'node-1' },
  { nome: 'node-2' },
];

const clone = (o) => structuredClone(o);

/** Erro da API, com o código que o kubectl mostra: Error from server (NotFound): ... */
export class ErroApi extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export class Cluster {
  /**
   * opções: nodes [{ nome, controlPlane, cpu ('2'), memoria ('4Gi'), labels, taints }], semente, inicio (ms),
   * nome (do cluster), contexto (do kubeconfig), uptime (há quanto tempo o cluster está de pé), kernel.
   */
  constructor({ nodes = NODES_PADRAO, semente = 'kube-learn', inicio = INICIO, nome = 'kube-learn', contexto = nome, uptime = '5m', kernel = '6.12.48-kube-learn' } = {}) {
    this.nome = nome;
    this.agora = inicio;
    this.aleatorio = criarAleatorio(semente);
    this.kernel = kernel;
    this.objetos = new Map();
    this.porUid = new Map();
    this.eventos = [];
    this.historico = [];
    this.rv = 1000;
    this.rodizio = new Map();
    this.agendamento = new Map();
    this.mudancasDeCapacidade = 0;
    this.ipsServico = new Set(['10.96.0.1', '10.96.0.10']);
    this.proximoIp = new Map();
    this.contexto = { nome: contexto, namespace: 'default' };
    this.kubelet = new Kubelet(this);
    // Como no kubeadm/kind: o control plane sobe primeiro (o DNS nasce nele) e os workers entram depois.
    const cp = nodes.filter((n) => n.controlPlane);
    this.criarNodes(cp.length ? cp : nodes.slice(0, 1), 0);
    this.criarSistema();
    this.reconciliar();
    this.avancar('15s');
    this.criarNodes(nodes.filter((n) => !cp.includes(n) && (cp.length || n !== nodes[0])), cp.length || 1);
    this.avancar(Math.max(0, parseDuracao(uptime) - 15_000));
  }

  // ---------- leitura ----------
  chave(kind, ns, nome) {
    return `${kind}/${recursoDoKind(kind)?.namespaced ? ns : ''}/${nome}`;
  }

  obter(kind, ns, nome) {
    if (kind === 'Event') return this.eventos.find((e) => e.metadata.namespace === ns && e.metadata.name === nome);
    return this.objetos.get(this.chave(kind, ns, nome));
  }

  /** Objetos de um kind (de um namespace, ou de todos), em ordem de namespace e nome, como a API devolve. */
  listar(kind, ns) {
    const lista = kind === 'Event' ? this.eventos : [...this.objetos.values()].filter((o) => o.kind === kind);
    return lista
      .filter((o) => ns === undefined || ns === null || o.metadata.namespace === ns)
      .sort((a, b) => (a.metadata.namespace ?? '').localeCompare(b.metadata.namespace ?? '') || a.metadata.name.localeCompare(b.metadata.name));
  }

  todos() {
    return [...this.objetos.values()];
  }

  // ---------- escrita ----------
  /** Cria o objeto (já validado), com os campos que o servidor preenche. Devolve o objeto guardado. */
  criar(entrada) {
    const obj = clone(entrada);
    const r = recursoDoKind(obj.kind);
    obj.metadata ??= {};
    const m = obj.metadata;
    if (r.namespaced) {
      m.namespace ??= 'default';
      const ns = this.obter('Namespace', null, m.namespace);
      if (!ns) throw new ErroApi('NotFound', `namespaces "${m.namespace}" not found`);
      if (ns.metadata.deletionTimestamp) {
        throw new ErroApi('Forbidden', `${pluralQualificado(r)} "${m.name ?? m.generateName}" is forbidden: unable to create new content in namespace ${m.namespace} because it is being terminated`);
      }
    } else delete m.namespace;
    if (!m.name && m.generateName) {
      do m.name = m.generateName + this.aleatorio.sufixo(5);
      while (this.obter(obj.kind, m.namespace, m.name));
    }
    if (this.obter(obj.kind, m.namespace, m.name)) throw new ErroApi('AlreadyExists', `${pluralQualificado(r)} "${m.name}" already exists`);
    delete m.creationTimestamp;
    obj.metadata = {
      ...m,
      creationTimestamp: iso(this.agora),
      ...(['Pod', 'Deployment', 'ReplicaSet'].includes(obj.kind) ? { generation: 1 } : {}),
      resourceVersion: String(++this.rv),
      uid: this.aleatorio.uuid(),
    };
    if (obj.status && !['Node', 'Namespace', 'Service'].includes(obj.kind)) delete obj.status;
    aplicarPadroes(obj);
    this.admitir(obj);
    this.objetos.set(this.chave(obj.kind, obj.metadata.namespace, obj.metadata.name), obj);
    this.porUid.set(obj.metadata.uid, obj);
    this.registrar('ADDED', obj);
    return obj;
  }

  /** O que os "admission controllers" acrescentam na criação. */
  admitir(obj) {
    if (obj.kind === 'Pod') {
      const s = obj.spec;
      if (s.automountServiceAccountToken !== false && !s.hostNetwork) {
        const nome = `kube-api-access-${this.aleatorio.sufixo(5)}`;
        s.volumes = [...(s.volumes ?? []), {
          name: nome,
          projected: {
            defaultMode: 420,
            sources: [
              { serviceAccountToken: { expirationSeconds: 3607, path: 'token' } },
              { configMap: { items: [{ key: 'ca.crt', path: 'ca.crt' }], name: 'kube-root-ca.crt' } },
              { downwardAPI: { items: [{ fieldRef: { apiVersion: 'v1', fieldPath: 'metadata.namespace' }, path: 'namespace' }] } },
            ],
          },
        }];
        for (const ct of s.containers) ct.volumeMounts = [...(ct.volumeMounts ?? []), { mountPath: '/var/run/secrets/kubernetes.io/serviceaccount', name: nome, readOnly: true }];
      }
      const padrao = ['node.kubernetes.io/not-ready', 'node.kubernetes.io/unreachable'];
      s.tolerations = [...(s.tolerations ?? [])];
      for (const key of padrao) {
        if (!s.tolerations.some((t) => t.key === key || (t.operator === 'Exists' && !t.key))) s.tolerations.push({ effect: 'NoExecute', key, operator: 'Exists', tolerationSeconds: 300 });
      }
      obj.status = { phase: 'Pending', qosClass: qos(obj) };
    }
    if (obj.kind === 'Service') {
      const s = obj.spec;
      if (s.type !== 'ExternalName' && !s.clusterIP) {
        let ip;
        do ip = `10.96.${this.aleatorio.inteiro(256)}.${1 + this.aleatorio.inteiro(254)}`;
        while (this.ipsServico.has(ip));
        s.clusterIP = ip;
      }
      if (s.clusterIP) {
        this.ipsServico.add(s.clusterIP);
        s.clusterIPs ??= [s.clusterIP];
      }
      if (s.type === 'NodePort' || s.type === 'LoadBalancer') {
        for (const p of s.ports) p.nodePort ??= 30000 + this.aleatorio.inteiro(2768);
        s.externalTrafficPolicy ??= 'Cluster';
      }
    }
  }

  /** Grava a mudança de um objeto já guardado. `spec: true` conta uma nova geração. */
  salvar(obj, { spec = false } = {}) {
    obj.metadata.resourceVersion = String(++this.rv);
    if (spec && obj.metadata.generation !== undefined) obj.metadata.generation += 1;
    this.registrar('MODIFIED', obj);
  }

  /** Substitui um objeto pela versão nova (kubectl apply/replace/edit). */
  substituir(antigo, novo) {
    const obj = clone(novo);
    obj.metadata = {
      ...obj.metadata,
      creationTimestamp: antigo.metadata.creationTimestamp,
      uid: antigo.metadata.uid,
      namespace: antigo.metadata.namespace,
      ...(antigo.metadata.ownerReferences && !obj.metadata.ownerReferences ? { ownerReferences: antigo.metadata.ownerReferences } : {}),
      ...(antigo.metadata.generation !== undefined ? { generation: antigo.metadata.generation } : {}),
    };
    if (!recursoDoKind(obj.kind).namespaced) delete obj.metadata.namespace;
    obj.status = antigo.status;
    if (obj.status === undefined) delete obj.status;
    aplicarPadroes(obj);
    const mudouSpec = JSON.stringify(obj.spec) !== JSON.stringify(antigo.spec);
    Object.keys(antigo).forEach((k) => delete antigo[k]);
    Object.assign(antigo, obj);
    this.salvar(antigo, { spec: mudouSpec });
    if (obj.kind === 'Node') this.mudancasDeCapacidade++;
    return antigo;
  }

  /** Apaga. Pods em execução recebem o prazo para terminar; o resto sai na hora (os filhos, pelo coletor de lixo). */
  remover(obj, { graca, propagacao = 'Background' } = {}) {
    if (obj.metadata.deletionTimestamp && graca !== 0) return obj;
    if (propagacao === 'Orphan') {
      for (const filho of this.todos()) {
        if (filho.metadata.ownerReferences?.some((o) => o.uid === obj.metadata.uid)) {
          filho.metadata.ownerReferences = filho.metadata.ownerReferences.filter((o) => o.uid !== obj.metadata.uid);
          if (!filho.metadata.ownerReferences.length) delete filho.metadata.ownerReferences;
          this.salvar(filho);
        }
      }
    }
    if (obj.kind === 'Pod' && obj.spec.nodeName && graca !== 0) {
      const prazo = graca ?? obj.spec.terminationGracePeriodSeconds ?? 30;
      obj.metadata.deletionTimestamp = iso(this.agora + prazo * 1000);
      obj.metadata.deletionGracePeriodSeconds = prazo;
      this.salvar(obj);
      return obj;
    }
    if (obj.kind === 'Namespace') {
      obj.metadata.deletionTimestamp = iso(this.agora);
      obj.status = { ...obj.status, phase: 'Terminating' };
      this.salvar(obj);
      return obj;
    }
    this.finalizarRemocao(obj);
    return obj;
  }

  finalizarRemocao(obj) {
    const chave = this.chave(obj.kind, obj.metadata.namespace, obj.metadata.name);
    if (this.objetos.get(chave) !== obj) return;
    this.objetos.delete(chave);
    this.porUid.delete(obj.metadata.uid);
    this.rv++;
    this.registrar('DELETED', obj);
    if (obj.kind === 'Pod') {
      this.kubelet.pods.delete(obj.metadata.uid);
      this.agendamento.delete(obj.metadata.uid);
      this.mudancasDeCapacidade++;
    }
    if (obj.kind === 'Service') this.ipsServico.delete(obj.spec.clusterIP);
    if (obj.kind === 'Namespace') this.eventos = this.eventos.filter((e) => e.metadata.namespace !== obj.metadata.name);
  }

  registrar(tipo, obj) {
    this.historico.push({ rv: this.rv, tipo, obj: clone(obj) });
    if (this.historico.length > 5000) this.historico.splice(0, 1000);
  }

  // ---------- eventos ----------
  /** Registra (ou soma, se repetido) um evento sobre o objeto. */
  evento(obj, tipo, motivo, mensagem, { componente, campo, host } = {}) {
    const ns = obj.metadata.namespace ?? 'default';
    const existente = this.eventos.find((e) => e.involvedObject.uid === obj.metadata.uid && e.reason === motivo && e.message === mensagem && e.involvedObject.fieldPath === campo);
    const agora = iso(this.agora);
    if (existente) {
      existente.count += 1;
      existente.lastTimestamp = agora;
      existente.metadata.resourceVersion = String(++this.rv);
      return existente;
    }
    const e = {
      apiVersion: 'v1',
      count: 1,
      eventTime: null,
      firstTimestamp: agora,
      involvedObject: {
        apiVersion: obj.apiVersion,
        ...(campo ? { fieldPath: campo } : {}),
        kind: obj.kind,
        name: obj.metadata.name,
        ...(obj.metadata.namespace ? { namespace: obj.metadata.namespace } : {}),
        resourceVersion: obj.metadata.resourceVersion,
        uid: obj.metadata.uid,
      },
      kind: 'Event',
      lastTimestamp: agora,
      message: mensagem,
      // O sufixo é o instante em hexadecimal, como no Kubernetes: os eventos ficam em ordem de tempo.
      metadata: { creationTimestamp: agora, name: `${obj.metadata.name}.${(BigInt(this.agora) * 1_000_000n + BigInt(this.eventos.length)).toString(16).padStart(16, '0')}`, namespace: ns, resourceVersion: String(++this.rv), uid: this.aleatorio.uuid() },
      reason: motivo,
      reportingComponent: componente,
      reportingInstance: host ?? '',
      source: { component: componente, ...(host ? { host } : {}) },
      type: tipo,
    };
    this.eventos.push(e);
    return e;
  }

  // ---------- tempo ----------
  /** Avança o relógio ('30s', '2m' ou ms), de segundo em segundo, reconciliando a cada passo. */
  avancar(duracao) {
    const alvo = this.agora + parseDuracao(duracao);
    while (this.agora < alvo) {
      this.agora = Math.min(this.agora + 1000, alvo);
      this.reconciliar();
    }
  }

  /** Avança até a condição valer (ou até o limite). Devolve se ela valeu. */
  avancarAte(condicao, limite = '10m') {
    const alvo = this.agora + parseDuracao(limite);
    while (!condicao()) {
      if (this.agora >= alvo) return false;
      this.avancar(1000);
    }
    return true;
  }

  reconciliar() {
    for (let i = 0; i < 50; i++) {
      const antes = this.rv;
      rodarControladores(this);
      agendar(this);
      this.kubelet.rodar();
      if (this.rv === antes) return;
    }
  }

  // ---------- nodes e rede ----------
  ipDoNode(node) {
    return node.status.addresses.find((a) => a.type === 'InternalIP').address;
  }

  cpuDoNode(node) {
    return cpuMili(node.status.capacity.cpu);
  }

  alocarIpPod(node) {
    const base = node.spec.podCIDR.replace(/\.0\/24$/, '');
    const n = this.proximoIp.get(base) ?? 2;
    this.proximoIp.set(base, n + 1);
    return `${base}.${n}`;
  }

  criarNodes(lista, inicio = 0) {
    lista.forEach((cfg, j) => {
      const i = inicio + j;
      const ip = `172.18.0.${2 + i}`;
      const memoria = `${Math.floor(bytes(cfg.memoria ?? '4Gi') / 1024)}Ki`;
      const recursos = { cpu: String(cfg.cpu ?? '2'), 'ephemeral-storage': String(cfg.disco ?? '107374182400'), 'hugepages-1Gi': '0', 'hugepages-2Mi': '0', memory: memoria, pods: String(cfg.pods ?? 110) };
      const id = this.aleatorio.hex(32);
      const taints = [...(cfg.controlPlane ? [{ effect: 'NoSchedule', key: 'node-role.kubernetes.io/control-plane' }] : []), ...(cfg.taints ?? [])];
      const node = this.criar({
        apiVersion: 'v1',
        kind: 'Node',
        metadata: {
          name: cfg.nome,
          labels: {
            'beta.kubernetes.io/arch': 'amd64',
            'beta.kubernetes.io/os': 'linux',
            'kubernetes.io/arch': 'amd64',
            'kubernetes.io/hostname': cfg.nome,
            'kubernetes.io/os': 'linux',
            ...(cfg.controlPlane ? { 'node-role.kubernetes.io/control-plane': '', 'node.kubernetes.io/exclude-from-external-load-balancers': '' } : {}),
            ...(cfg.labels ?? {}),
          },
          annotations: { 'node.alpha.kubernetes.io/ttl': '0', 'volumes.kubernetes.io/controller-managed-attach-detach': 'true' },
        },
        spec: {
          podCIDR: `10.244.${i}.0/24`,
          podCIDRs: [`10.244.${i}.0/24`],
          providerID: `kind://docker/${this.nome}/${cfg.nome}`,
          ...(taints.length ? { taints } : {}),
        },
        status: {
          addresses: [{ address: ip, type: 'InternalIP' }, { address: cfg.nome, type: 'Hostname' }],
          allocatable: recursos,
          capacity: { ...recursos },
          conditions: [
            ['MemoryPressure', 'False', 'KubeletHasSufficientMemory', 'kubelet has sufficient memory available'],
            ['DiskPressure', 'False', 'KubeletHasNoDiskPressure', 'kubelet has no disk pressure'],
            ['PIDPressure', 'False', 'KubeletHasSufficientPID', 'kubelet has sufficient PID available'],
            ['Ready', 'True', 'KubeletReady', 'kubelet is posting ready status'],
          ].map(([type, status, reason, message]) => ({ lastHeartbeatTime: iso(this.agora), lastTransitionTime: iso(this.agora), message, reason, status, type })),
          daemonEndpoints: { kubeletEndpoint: { Port: 10250 } },
          nodeInfo: {
            architecture: 'amd64', bootID: this.aleatorio.uuid(), containerRuntimeVersion: 'containerd://2.3.4', kernelVersion: this.kernel,
            kubeProxyVersion: '', kubeletVersion: VERSAO_SERVIDOR, machineID: id, operatingSystem: 'linux', osImage: 'Debian GNU/Linux 13 (trixie)', systemUUID: id,
          },
        },
      });
      this.evento(node, 'Normal', 'RegisteredNode', `Node ${cfg.nome} event: Registered Node ${cfg.nome} in Controller`, { componente: 'node-controller' });
      this.evento(node, 'Normal', 'NodeReady', `Node ${cfg.nome} status is now: NodeReady`, { componente: 'kubelet', host: cfg.nome });
    });
  }

  /** Namespaces do sistema, o Service `kubernetes`, o DNS e os pods do control plane. */
  criarSistema() {
    for (const nome of ['default', 'kube-node-lease', 'kube-public', 'kube-system']) this.criar({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: nome } });
    const nodes = this.listar('Node');
    const cp = nodes.find((n) => n.metadata.labels['node-role.kubernetes.io/control-plane'] !== undefined) ?? nodes[0];
    const imagens = ['registry.k8s.io/etcd:3.6.4-0', 'registry.k8s.io/kube-apiserver:v1.37.0', 'registry.k8s.io/kube-controller-manager:v1.37.0', 'registry.k8s.io/kube-scheduler:v1.37.0', 'registry.k8s.io/coredns/coredns:v1.12.4'];
    for (const n of nodes) for (const img of imagens) this.kubelet.guardarImagem(n.metadata.name, img);

    this.criar({
      apiVersion: 'v1', kind: 'Service',
      metadata: { name: 'kubernetes', namespace: 'default', labels: { component: 'apiserver', provider: 'kubernetes' } },
      spec: { clusterIP: '10.96.0.1', ports: [{ name: 'https', port: 443, protocol: 'TCP', targetPort: 6443 }] },
    });
    this.criar({
      apiVersion: 'v1', kind: 'Endpoints',
      metadata: { name: 'kubernetes', namespace: 'default', labels: { 'endpointslice.kubernetes.io/skip-mirror': 'true' } },
      subsets: [{ addresses: [{ ip: this.ipDoNode(cp) }], ports: [{ name: 'https', port: 6443, protocol: 'TCP' }] }],
    });
    this.criar({
      apiVersion: 'v1', kind: 'Service',
      metadata: { name: 'kube-dns', namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns', 'kubernetes.io/cluster-service': 'true', 'kubernetes.io/name': 'CoreDNS' } },
      spec: {
        clusterIP: '10.96.0.10',
        ports: [{ name: 'dns', port: 53, protocol: 'UDP', targetPort: 53 }, { name: 'dns-tcp', port: 53, protocol: 'TCP', targetPort: 53 }, { name: 'metrics', port: 9153, protocol: 'TCP', targetPort: 9153 }],
        selector: { 'k8s-app': 'kube-dns' },
      },
    });
    const criticos = [{ effect: 'NoExecute', operator: 'Exists' }];
    for (const [componente, imagem, cpu] of [['etcd', imagens[0], '100m'], ['kube-apiserver', imagens[1], '250m'], ['kube-controller-manager', imagens[2], '200m'], ['kube-scheduler', imagens[3], '100m']]) {
      this.criar({
        apiVersion: 'v1', kind: 'Pod',
        metadata: {
          name: `${componente}-${cp.metadata.name}`, namespace: 'kube-system',
          labels: { component: componente, tier: 'control-plane' },
          annotations: { 'kubernetes.io/config.source': 'file' },
          ownerReferences: [{ apiVersion: 'v1', controller: true, kind: 'Node', name: cp.metadata.name, uid: cp.metadata.uid }],
        },
        spec: {
          containers: [{ name: componente, image: imagem, command: [componente], resources: { requests: { cpu } } }],
          hostNetwork: true, nodeName: cp.metadata.name, priorityClassName: 'system-node-critical', priority: 2000001000, tolerations: criticos,
        },
      });
    }
    const ct = {
      name: 'coredns', image: imagens[4], args: ['-conf', '/etc/coredns/Corefile'],
      ports: [{ containerPort: 53, name: 'dns', protocol: 'UDP' }, { containerPort: 53, name: 'dns-tcp', protocol: 'TCP' }, { containerPort: 9153, name: 'metrics', protocol: 'TCP' }],
      resources: { limits: { memory: '170Mi' }, requests: { cpu: '100m', memory: '70Mi' } },
    };
    this.criar({
      apiVersion: 'apps/v1', kind: 'Deployment',
      metadata: { name: 'coredns', namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns' } },
      spec: {
        replicas: 2,
        selector: { matchLabels: { 'k8s-app': 'kube-dns' } },
        strategy: { rollingUpdate: { maxSurge: '25%', maxUnavailable: 1 }, type: 'RollingUpdate' },
        template: {
          metadata: { labels: { 'k8s-app': 'kube-dns' } },
          spec: {
            containers: [ct], priorityClassName: 'system-cluster-critical', priority: 2000000000, dnsPolicy: 'Default',
            tolerations: [{ key: 'CriticalAddonsOnly', operator: 'Exists' }, { effect: 'NoSchedule', key: 'node-role.kubernetes.io/control-plane' }],
          },
        },
      },
    });
  }
}

export const criarCluster = (opcoes) => new Cluster(opcoes);
