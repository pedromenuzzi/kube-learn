// Esquema dos kinds que o simulador conhece: tipos dos campos (para a decodificação estrita, que recusa
// campo desconhecido como o apiserver), validação (os "is invalid"), padrões e os textos do `kubectl explain`.
// O motor só cresce com o conteúdo: um campo entra aqui quando algum exercício precisa dele. Subárvores
// que ainda não simulamos ficam como `qualquer` (aceitas sem conferir), para não recusar YAML válido.

// ---------- construtores ----------
const campo = (tipo, desc = '', extra = {}) => ({ tipo, desc, ...extra });
const texto = (desc, extra) => campo('string', desc, extra);
const inteiro = (desc, extra) => campo('integer', desc, extra);
const int64 = (desc, extra) => campo('integer', desc, { go: 'int64', ...extra });
const booleano = (desc, extra) => campo('boolean', desc, extra);
const intOuTexto = (desc) => campo('IntOrString', desc);
const qualquer = (desc, extra) => campo('any', desc, extra);
const mapa = (desc, extra) => campo('map', desc, extra);
const quantidades = (desc) => campo('map', desc, { quantidade: true, go: 'v1.ResourceList' });
const lista = (item, desc, extra) => campo('array', desc, { item, ...extra });
const objeto = (go, desc, campos, extra) => campo('object', desc, { go, campos, ...extra });

// ---------- tipos comuns ----------
const metadata = objeto('v1.ObjectMeta', 'Os dados de identificação do objeto: nome, namespace, labels e annotations.', {
  name: texto('O nome do objeto. É único dentro do namespace (para objetos com namespace) e não pode mudar depois de criado.'),
  generateName: texto('Prefixo para o servidor gerar um nome único, quando `name` não é informado.'),
  namespace: texto('O namespace do objeto. Sem ele, vale o namespace do contexto (normalmente `default`).'),
  labels: mapa('Etiquetas chave=valor usadas para organizar e selecionar objetos (é por elas que Services e Deployments acham os pods).'),
  annotations: mapa('Anotações chave=valor para guardar informação extra; não servem para seleção.'),
  uid: texto('Identificador único gerado pelo servidor.'),
  resourceVersion: texto('Versão interna do objeto, gerada pelo servidor a cada mudança.'),
  generation: inteiro('Quantas vezes a especificação (spec) mudou. Gerado pelo servidor.', { go: 'int64' }),
  creationTimestamp: qualquer('Quando o objeto foi criado. Gerado pelo servidor.'),
  deletionTimestamp: qualquer('Quando o objeto foi marcado para apagar. Gerado pelo servidor.'),
  deletionGracePeriodSeconds: int64('Segundos de espera antes de apagar de vez.'),
  ownerReferences: qualquer('Quem é o "dono" deste objeto (ex.: o ReplicaSet de um pod). Quando o dono é apagado, os filhos vão junto.'),
  finalizers: lista(texto(''), 'Tarefas que precisam terminar antes do objeto ser apagado.'),
  managedFields: qualquer('Quem gerencia cada campo (server-side apply).'),
});

const labelSelector = objeto('v1.LabelSelector', 'Um seletor de labels: escolhe objetos pelas etiquetas.', {
  matchLabels: mapa('Os pares chave=valor que o objeto precisa ter (todos).'),
  matchExpressions: qualquer('Regras mais elaboradas (In, NotIn, Exists, DoesNotExist).'),
});

const envVar = objeto('v1.EnvVar', 'Uma variável de ambiente do contêiner.', {
  name: texto('O nome da variável.', { obrigatorio: true }),
  value: texto('O valor da variável.'),
  valueFrom: objeto('v1.EnvVarSource', 'De onde vem o valor, quando ele não é escrito direto.', {
    configMapKeyRef: objeto('v1.ConfigMapKeySelector', 'Uma chave de um ConfigMap.', {
      name: texto('O nome do ConfigMap.'),
      key: texto('A chave dentro do ConfigMap.', { obrigatorio: true }),
      optional: booleano('Se pode faltar.'),
    }),
    secretKeyRef: objeto('v1.SecretKeySelector', 'Uma chave de um Secret.', {
      name: texto('O nome do Secret.'),
      key: texto('A chave dentro do Secret.', { obrigatorio: true }),
      optional: booleano('Se pode faltar.'),
    }),
    fieldRef: qualquer('Um campo do próprio pod (ex.: metadata.name).'),
    resourceFieldRef: qualquer('Um recurso do contêiner (ex.: limits.cpu).'),
  }),
});

const container = objeto('v1.Container', 'Um contêiner: o programa que roda dentro do pod, a partir de uma imagem.', {
  name: texto('O nome do contêiner, único no pod.', { obrigatorio: true }),
  image: texto('A imagem do contêiner, no formato registry/repositório:tag (ex.: nginx:1.27).'),
  command: lista(texto(''), 'Substitui o ENTRYPOINT da imagem. Não roda num shell.'),
  args: lista(texto(''), 'Argumentos para o comando; substitui o CMD da imagem.'),
  workingDir: texto('A pasta de trabalho do contêiner.'),
  ports: lista(objeto('v1.ContainerPort', 'Uma porta do contêiner.', {
    containerPort: inteiro('O número da porta no IP do pod.', { obrigatorio: true }),
    name: texto('Um nome para a porta (pode ser usado no targetPort do Service).'),
    protocol: texto('TCP, UDP ou SCTP. Padrão: TCP.'),
    hostPort: inteiro('Porta no node (evite).'),
    hostIP: texto('IP do node para o hostPort.'),
  }), 'As portas que o contêiner expõe. É informativo: a porta funciona mesmo sem estar listada aqui.'),
  env: lista(envVar, 'Variáveis de ambiente do contêiner.'),
  envFrom: lista(objeto('v1.EnvFromSource', 'Uma fonte de variáveis.', {
    configMapRef: objeto('v1.ConfigMapEnvSource', 'O ConfigMap.', { name: texto('O nome.'), optional: booleano('Se pode faltar.') }),
    secretRef: objeto('v1.SecretEnvSource', 'O Secret.', { name: texto('O nome.'), optional: booleano('Se pode faltar.') }),
    prefix: texto('Prefixo para o nome das variáveis.'),
  }), 'Traz todas as chaves de um ConfigMap ou Secret como variáveis de ambiente.'),
  resources: objeto('v1.ResourceRequirements', 'Os recursos do contêiner: o que reserva (requests) e o máximo que pode usar (limits).', {
    requests: quantidades('O mínimo reservado: o scheduler só põe o pod num node onde isso cabe.'),
    limits: quantidades('O máximo: passou do limite de memória, o contêiner é morto (OOMKilled); de CPU, fica lento.'),
    claims: qualquer(''),
  }),
  volumeMounts: lista(qualquer('Um volume montado.', { go: 'VolumeMount' }), 'Volumes do pod montados neste contêiner.'),
  volumeDevices: lista(qualquer('', { go: 'VolumeDevice' }), ''),
  livenessProbe: qualquer('Teste periódico de "está vivo?". Se falhar, o contêiner é reiniciado.', { go: 'Probe' }),
  readinessProbe: qualquer('Teste periódico de "pode receber tráfego?". Se falhar, o pod sai dos endpoints do Service.', { go: 'Probe' }),
  startupProbe: qualquer('Teste de "já terminou de subir?". Enquanto não passa, os outros testes esperam.', { go: 'Probe' }),
  lifecycle: qualquer('Ganchos de início e de parada.', { go: 'Lifecycle' }),
  imagePullPolicy: texto('Quando baixar a imagem: Always, IfNotPresent ou Never. Padrão: Always se a tag for latest (ou não tiver tag), senão IfNotPresent.'),
  securityContext: qualquer('Opções de segurança do contêiner.', { go: 'SecurityContext' }),
  terminationMessagePath: texto(''),
  terminationMessagePolicy: texto(''),
  stdin: booleano(''),
  stdinOnce: booleano(''),
  tty: booleano(''),
  restartPolicy: texto('Só para init containers: Always faz dele um sidecar.'),
  resizePolicy: lista(qualquer('', { go: 'ContainerResizePolicy' }), ''),
  restartPolicyRules: lista(qualquer('', { go: 'ContainerRestartRule' }), ''),
});

const toleration = objeto('v1.Toleration', 'Uma tolerância a um taint.', {
  key: texto('A chave do taint.'),
  operator: texto('Equal (padrão) ou Exists.'),
  value: texto('O valor do taint.'),
  effect: texto('NoSchedule, PreferNoSchedule ou NoExecute.'),
  tolerationSeconds: int64('Quanto tempo tolera um taint NoExecute.'),
});

const podSpec = objeto('v1.PodSpec', 'A especificação do pod: os contêineres e como eles rodam.', {
  containers: lista(container, 'A lista de contêineres do pod. Precisa ter pelo menos um.', { obrigatorio: true }),
  initContainers: lista(container, 'Contêineres que rodam (em ordem, até terminar) antes dos principais.'),
  ephemeralContainers: qualquer(''),
  restartPolicy: texto('Always (padrão), OnFailure ou Never: o que fazer quando um contêiner termina.'),
  terminationGracePeriodSeconds: int64('Segundos que o pod tem para terminar depois do sinal de parada. Padrão: 30.'),
  activeDeadlineSeconds: int64('Tempo máximo de vida do pod.'),
  dnsPolicy: texto('ClusterFirst (padrão), Default, ClusterFirstWithHostNet ou None.'),
  dnsConfig: qualquer(''),
  nodeSelector: mapa('Labels que o node precisa ter para receber o pod.'),
  nodeName: texto('Põe o pod direto num node, sem passar pelo scheduler.'),
  serviceAccountName: texto('A ServiceAccount (o "crachá") do pod. Padrão: default.'),
  serviceAccount: texto('Nome antigo de serviceAccountName.'),
  automountServiceAccountToken: booleano('Se monta o token da ServiceAccount no pod.'),
  hostNetwork: booleano(''),
  hostPID: booleano(''),
  hostIPC: booleano(''),
  shareProcessNamespace: booleano(''),
  securityContext: qualquer('Opções de segurança do pod.'),
  imagePullSecrets: qualquer('Secrets para baixar imagens de registries privados.'),
  hostname: texto(''),
  subdomain: texto(''),
  affinity: qualquer('Regras de afinidade com nodes e com outros pods.'),
  schedulerName: texto(''),
  tolerations: lista(toleration, 'As tolerâncias do pod: deixam o pod ir para nodes com taints.'),
  hostAliases: qualquer(''),
  priorityClassName: texto(''),
  priority: inteiro(''),
  preemptionPolicy: texto(''),
  readinessGates: qualquer(''),
  runtimeClassName: texto(''),
  enableServiceLinks: booleano(''),
  overhead: qualquer(''),
  topologySpreadConstraints: qualquer('Como espalhar os pods entre zonas e nodes.'),
  setHostnameAsFQDN: booleano(''),
  os: qualquer(''),
  hostUsers: booleano(''),
  schedulingGates: qualquer(''),
  resourceClaims: qualquer(''),
  resources: qualquer(''),
  volumes: lista(qualquer('Um volume.'), 'Os volumes que os contêineres do pod podem montar.'),
});

const podTemplate = objeto('v1.PodTemplateSpec', 'O molde dos pods que serão criados.', {
  metadata,
  spec: podSpec,
});

const status = (kind) => qualquer('O estado atual, preenchido pelo sistema. Não se escreve à mão.', { go: `${kind}Status` });

// ---------- os kinds ----------
const raiz = (go, desc, campos) => objeto(go, desc, {
  apiVersion: texto('A versão da API do objeto (ex.: v1, apps/v1).'),
  kind: texto('O tipo do objeto (ex.: Pod, Deployment).'),
  metadata,
  ...campos,
});

export const ESQUEMAS = {
  Pod: raiz('Pod', 'O Pod é a menor unidade do Kubernetes: um ou mais contêineres que dividem a mesma rede e os mesmos volumes, sempre no mesmo node.', {
    spec: podSpec,
    status: status('Pod'),
  }),
  Deployment: raiz('Deployment', 'O Deployment mantém um número de pods iguais rodando e troca a versão deles aos poucos (rolling update), com histórico para voltar atrás.', {
    spec: objeto('v1.DeploymentSpec', 'A especificação do Deployment.', {
      replicas: inteiro('Quantos pods manter rodando. Padrão: 1.'),
      selector: { ...labelSelector, desc: 'Como o Deployment acha os pods dele. Precisa bater com as labels do template e não muda depois de criado.', obrigatorio: true },
      template: { ...podTemplate, obrigatorio: true },
      strategy: objeto('v1.DeploymentStrategy', 'Como trocar os pods antigos pelos novos.', {
        type: texto('RollingUpdate (padrão: troca aos poucos) ou Recreate (apaga todos e cria de novo).'),
        rollingUpdate: objeto('v1.RollingUpdateDeployment', 'Os limites da troca aos poucos.', {
          maxSurge: intOuTexto('Quantos pods a mais (número ou %) podem existir durante a troca. Padrão: 25%.'),
          maxUnavailable: intOuTexto('Quantos pods (número ou %) podem ficar indisponíveis durante a troca. Padrão: 25%.'),
        }),
      }),
      minReadySeconds: inteiro('Segundos que um pod precisa ficar pronto para contar como disponível. Padrão: 0.'),
      revisionHistoryLimit: inteiro('Quantos ReplicaSets antigos guardar para o rollback. Padrão: 10.'),
      progressDeadlineSeconds: inteiro('Segundos sem progresso até o rollout ser considerado travado. Padrão: 600.'),
      paused: booleano('Pausa o rollout.'),
    }, { obrigatorio: true }),
    status: status('Deployment'),
  }),
  ReplicaSet: raiz('ReplicaSet', 'O ReplicaSet garante que um número de pods iguais esteja sempre rodando. Normalmente é criado e cuidado por um Deployment.', {
    spec: objeto('v1.ReplicaSetSpec', 'A especificação do ReplicaSet.', {
      replicas: inteiro('Quantos pods manter rodando. Padrão: 1.'),
      selector: { ...labelSelector, obrigatorio: true },
      template: podTemplate,
      minReadySeconds: inteiro(''),
    }),
    status: status('ReplicaSet'),
  }),
  Service: raiz('Service', 'O Service dá um endereço fixo (IP e nome no DNS) para um grupo de pods escolhidos por labels, e distribui as conexões entre eles.', {
    spec: objeto('v1.ServiceSpec', 'A especificação do Service.', {
      type: texto('ClusterIP (padrão: só dentro do cluster), NodePort, LoadBalancer ou ExternalName.'),
      selector: mapa('As labels dos pods que recebem o tráfego.'),
      ports: lista(objeto('v1.ServicePort', 'Uma porta do Service.', {
        name: texto('Nome da porta (obrigatório quando há mais de uma).'),
        protocol: texto('TCP (padrão), UDP ou SCTP.'),
        appProtocol: texto(''),
        port: inteiro('A porta do Service.', { obrigatorio: true }),
        targetPort: intOuTexto('A porta (número ou nome) nos pods. Padrão: igual a `port`.'),
        nodePort: inteiro('A porta em todos os nodes (para NodePort e LoadBalancer).'),
      }), 'As portas do Service.'),
      clusterIP: texto('O IP do Service. Gerado pelo sistema; "None" cria um Service headless.'),
      clusterIPs: lista(texto(''), ''),
      externalIPs: lista(texto(''), ''),
      externalName: texto(''),
      externalTrafficPolicy: texto(''),
      internalTrafficPolicy: texto(''),
      ipFamilies: lista(texto(''), ''),
      ipFamilyPolicy: texto(''),
      loadBalancerIP: texto(''),
      loadBalancerSourceRanges: lista(texto(''), ''),
      loadBalancerClass: texto(''),
      allocateLoadBalancerNodePorts: booleano(''),
      healthCheckNodePort: inteiro(''),
      publishNotReadyAddresses: booleano(''),
      sessionAffinity: texto('None (padrão) ou ClientIP.'),
      sessionAffinityConfig: qualquer(''),
      trafficDistribution: texto(''),
    }),
    status: status('Service'),
  }),
  Namespace: raiz('Namespace', 'O Namespace separa os objetos em grupos com nomes próprios, como empresas diferentes no mesmo prédio.', {
    spec: objeto('v1.NamespaceSpec', '', { finalizers: lista(texto(''), '') }),
    status: status('Namespace'),
  }),
  ConfigMap: raiz('ConfigMap', 'O ConfigMap guarda configurações (texto) para os pods usarem como variáveis de ambiente ou arquivos.', {
    data: mapa('Os dados: chave e valor em texto.'),
    binaryData: qualquer('Dados binários, em base64.'),
    immutable: booleano('Se true, os dados não podem mais mudar.'),
  }),
  Secret: raiz('Secret', 'O Secret guarda dados sensíveis (senhas, tokens). Atenção: base64 não é criptografia.', {
    data: mapa('Os dados, em base64.'),
    stringData: mapa('Os dados em texto puro; o servidor converte para base64 em `data`.'),
    type: texto('O tipo do Secret. Padrão: Opaque.'),
    immutable: booleano('Se true, os dados não podem mais mudar.'),
  }),
  Ingress: raiz('Ingress', 'O Ingress leva o tráfego HTTP de fora para os Services, por nome (host) e caminho (path). Quem faz o trabalho é um controlador de Ingress instalado no cluster.', {
    spec: objeto('v1.IngressSpec', 'A especificação do Ingress.', {
      ingressClassName: texto('Qual controlador de Ingress cuida deste (kubectl get ingressclass).'),
      defaultBackend: qualquer('O Service que recebe o que não casar com nenhuma regra.', { go: 'IngressBackend' }),
      tls: qualquer('Os certificados (HTTPS), guardados em Secrets.', { go: '[]IngressTLS' }),
      rules: lista(objeto('v1.IngressRule', 'Uma regra: um host e os caminhos dele.', {
        host: texto('O nome (ex.: loja.kube-learn.local). Sem host, vale para qualquer nome.'),
        http: objeto('v1.HTTPIngressRuleValue', 'Os caminhos.', {
          paths: lista(objeto('v1.HTTPIngressPath', 'Um caminho e para onde ele vai.', {
            path: texto('O caminho (ex.: /api).'),
            pathType: texto('Prefix (o caminho e tudo abaixo dele), Exact (só esse) ou ImplementationSpecific.', { obrigatorio: true }),
            backend: objeto('v1.IngressBackend', 'O destino.', {
              service: objeto('v1.IngressServiceBackend', 'O Service de destino.', {
                name: texto('O nome do Service.', { obrigatorio: true }),
                port: objeto('v1.ServiceBackendPort', 'A porta do Service.', { number: inteiro('O número da porta.'), name: texto('O nome da porta.') }),
              }),
              resource: qualquer(''),
            }, { obrigatorio: true }),
          }), 'Os caminhos deste host.', { obrigatorio: true }),
        }),
      }), 'As regras de roteamento.'),
    }),
    status: status('Ingress'),
  }),
  IngressClass: raiz('IngressClass', 'Uma classe de Ingress: diz qual controlador cuida dos Ingresses que a citam.', {
    spec: objeto('v1.IngressClassSpec', '', { controller: texto('O controlador (ex.: traefik.io/ingress-controller).'), parameters: qualquer('') }),
  }),
  GatewayClass: raiz('GatewayClass', 'O tipo de portaria disponível no cluster, oferecido por uma implementação do Gateway API.', {
    spec: objeto('v1.GatewayClassSpec', '', { controllerName: texto('A implementação que cuida desta classe.', { obrigatorio: true }), parametersRef: qualquer(''), description: texto('') }),
    status: status('GatewayClass'),
  }),
  Gateway: raiz('Gateway', 'A portaria: um ponto de entrada (endereço e portas), normalmente cuidado pelo time de plataforma.', {
    spec: objeto('v1.GatewaySpec', 'A especificação do Gateway.', {
      gatewayClassName: texto('Qual GatewayClass usar.', { obrigatorio: true }),
      listeners: lista(objeto('v1.Listener', 'Uma porta aberta na portaria.', {
        name: texto('Nome do listener.', { obrigatorio: true }),
        hostname: texto('Só aceita este nome (opcional).'),
        port: inteiro('A porta.', { obrigatorio: true }),
        protocol: texto('HTTP, HTTPS, TLS, TCP ou UDP.', { obrigatorio: true }),
        allowedRoutes: qualquer('Quais rotas (de quais namespaces) podem se pendurar aqui.', { go: 'AllowedRoutes' }),
        tls: qualquer(''),
      }), 'As portas abertas.', { obrigatorio: true }),
      addresses: qualquer(''),
      infrastructure: qualquer(''),
    }),
    status: status('Gateway'),
  }),
  HTTPRoute: raiz('HTTPRoute', 'A placa de cada empresa: regras HTTP (nome, caminho, pesos) penduradas num Gateway.', {
    spec: objeto('v1.HTTPRouteSpec', 'A especificação da rota.', {
      parentRefs: lista(objeto('v1.ParentReference', 'O Gateway onde a rota se pendura.', {
        name: texto('O nome do Gateway.', { obrigatorio: true }),
        namespace: texto('O namespace do Gateway (padrão: o da rota).'),
        sectionName: texto('O listener específico.'),
        group: texto(''), kind: texto(''), port: inteiro(''),
      }), 'Em quais Gateways a rota vale.', { obrigatorio: true }),
      hostnames: lista(texto(''), 'Os nomes que a rota atende.'),
      rules: lista(objeto('v1.HTTPRouteRule', 'Uma regra.', {
        matches: lista(objeto('v1.HTTPRouteMatch', 'Quando a regra vale.', {
          path: objeto('v1.HTTPPathMatch', 'O caminho.', { type: texto('PathPrefix (padrão), Exact ou RegularExpression.'), value: texto('O caminho.') }),
          headers: qualquer(''), queryParams: qualquer(''), method: texto(''),
        }), 'As condições (padrão: qualquer caminho).'),
        backendRefs: lista(objeto('v1.HTTPBackendRef', 'Um destino.', {
          name: texto('O nome do Service.', { obrigatorio: true }),
          port: inteiro('A porta do Service.'),
          weight: inteiro('O peso (padrão 1): com 90 e 10, 90% vai para um e 10% para o outro.'),
          namespace: texto(''), group: texto(''), kind: texto(''), filters: qualquer(''),
        }), 'Para onde vai o tráfego.'),
        filters: qualquer(''), timeouts: qualquer(''), name: texto(''),
      }), 'As regras da rota.'),
    }),
    status: status('HTTPRoute'),
  }),
  Node: raiz('Node', 'O Node é uma máquina do cluster, onde os pods rodam.', { spec: qualquer('', { go: 'NodeSpec' }), status: status('Node') }),
  Endpoints: raiz('Endpoints', 'A lista de IPs e portas dos pods atrás de um Service.', { subsets: qualquer('') }),
  Event: raiz('Event', 'Uma ocorrência registrada no cluster.', {}),
};

// ---------- decodificação estrita ----------
const GO = { string: 'string', integer: 'int32', boolean: 'bool', map: 'map[string]string', IntOrString: 'intstr.IntOrString' };
const jsonTipo = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : typeof v);
const tipoGo = (c) => c.go ?? (c.tipo === 'object' ? c.go : c.tipo === 'array' ? `[]${tipoGo(c.item)}` : GO[c.tipo]);
const nomeStruct = (c) => (c.go ?? '').replace(/^v1\./, '');

/**
 * Confere os tipos e os campos desconhecidos, como o apiserver (strict decoding).
 * Devolve { desconhecidos: ['spec.replica', ...], tipo: 'json: cannot unmarshal ...' | null }.
 */
export function decodificar(obj) {
  const esquema = ESQUEMAS[obj.kind];
  const desconhecidos = [];
  let erroTipo = null;

  const visitar = (valor, c, caminho, caminhoSemIndice, pai) => {
    if (erroTipo || valor === null || valor === undefined || c.tipo === 'any') return;
    const t = jsonTipo(valor);
    const falha = () => {
      erroTipo = `json: cannot unmarshal ${t} into Go struct field ${nomeStruct(pai)}.${caminhoSemIndice} of type ${tipoGo(c)}`;
    };
    switch (c.tipo) {
      case 'string': if (t !== 'string') falha(); return;
      case 'integer': if (t !== 'number' || !Number.isInteger(valor)) falha(); return;
      case 'boolean': if (t !== 'bool') falha(); return;
      case 'IntOrString': if (t !== 'number' && t !== 'string') falha(); return;
      case 'map':
        if (t !== 'object') return falha();
        for (const v of Object.values(valor)) {
          const tv = jsonTipo(v);
          const ok = c.quantidade ? tv === 'string' || tv === 'number' : tv === 'string';
          if (!ok && v !== null) {
            erroTipo = `json: cannot unmarshal ${tv} into Go struct field ${nomeStruct(pai)}.${caminhoSemIndice} of type ${c.quantidade ? 'resource.Quantity' : 'string'}`;
            return;
          }
        }
        return;
      case 'array':
        if (t !== 'array') return falha();
        valor.forEach((v, i) => visitar(v, c.item, `${caminho}[${i}]`, caminhoSemIndice, pai));
        return;
      case 'object':
        if (t !== 'object') return falha();
        for (const [k, v] of Object.entries(valor)) {
          const filho = c.campos[k];
          const cam = caminho ? `${caminho}.${k}` : k;
          const camSem = caminhoSemIndice ? `${caminhoSemIndice}.${k}` : k;
          if (!filho) desconhecidos.push(cam);
          else visitar(v, filho, cam, camSem, c);
        }
    }
  };
  visitar(obj, esquema, '', '', esquema);
  return { desconhecidos, tipo: erroTipo };
}

// ---------- validação (os "is invalid") ----------
const RE_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const RE_SUBDOMINIO = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const RE_1035 = /^[a-z]([-a-z0-9]*[a-z0-9])?$/;
const MSG_SUBDOMINIO = `a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character (e.g. 'example.com', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*')`;
const MSG_LABEL = `a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name',  or '123-abc', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?')`;
const MSG_1035 = `a DNS-1035 label must consist of lower case alphanumeric characters or '-', start with an alphabetic character, and end with an alphanumeric character (e.g. 'my-name',  or 'abc-123', regex used for validation is '[a-z]([-a-z0-9]*[a-z0-9])?')`;

const invalido = (campoNome, valor, msg) => `${campoNome}: Invalid value: ${JSON.stringify(valor)}: ${msg}`;
const obrigatorio = (campoNome) => `${campoNome}: Required value`;

function validarNome(obj, erros) {
  const nome = obj.metadata?.name;
  if (!nome) return;
  if (obj.kind === 'Service' && !RE_1035.test(nome)) erros.push(invalido('metadata.name', nome, MSG_1035));
  else if (obj.kind === 'Namespace' && !RE_LABEL.test(nome)) erros.push(invalido('metadata.name', nome, MSG_LABEL));
  else if (!RE_SUBDOMINIO.test(nome) || nome.length > 253) erros.push(invalido('metadata.name', nome, MSG_SUBDOMINIO));
}

function validarPodSpec(spec, base, erros) {
  if (!spec?.containers?.length) {
    erros.push(obrigatorio(`${base}.containers`));
    return;
  }
  const nomes = new Set();
  spec.containers.forEach((c, i) => {
    const cam = `${base}.containers[${i}]`;
    if (!c.name) erros.push(obrigatorio(`${cam}.name`));
    else if (!RE_LABEL.test(c.name)) erros.push(invalido(`${cam}.name`, c.name, MSG_LABEL));
    else if (nomes.has(c.name)) erros.push(`${cam}.name: Duplicate value: ${JSON.stringify(c.name)}`);
    nomes.add(c.name);
    if (!c.image) erros.push(obrigatorio(`${cam}.image`));
    (c.ports ?? []).forEach((p, j) => {
      if (p.containerPort === undefined) erros.push(obrigatorio(`${cam}.ports[${j}].containerPort`));
      else if (p.containerPort < 1 || p.containerPort > 65535) erros.push(invalido(`${cam}.ports[${j}].containerPort`, p.containerPort, 'must be between 1 and 65535, inclusive'));
    });
    (c.env ?? []).forEach((e, j) => {
      if (!e.name) erros.push(obrigatorio(`${cam}.env[${j}].name`));
    });
  });
  const politica = spec.restartPolicy;
  if (politica && !['Always', 'OnFailure', 'Never'].includes(politica)) {
    erros.push(`${base}.restartPolicy: Unsupported value: ${JSON.stringify(politica)}: supported values: "Always", "OnFailure", "Never"`);
  }
}

const casaSeletor = (matchLabels = {}, labels = {}) => Object.entries(matchLabels).every(([k, v]) => labels[k] === v);

/** Lista de erros de validação (vazia = válido). `antigo` é a versão em vigor, para os campos imutáveis. */
export function validar(obj, antigo) {
  const erros = [];
  validarNome(obj, erros);
  const s = obj.spec;
  switch (obj.kind) {
    case 'Pod':
      validarPodSpec(s, 'spec', erros);
      if (antigo && !erros.length) {
        // Num pod, só a imagem (e poucos campos mais) pode mudar.
        const semImagem = (spec) => JSON.stringify({ ...spec, containers: spec.containers.map((c) => ({ ...c, image: undefined })) });
        if (semImagem(s) !== semImagem(antigo.spec)) {
          erros.push('spec: Forbidden: pod updates may not change fields other than `spec.containers[*].image`,`spec.initContainers[*].image`,`spec.activeDeadlineSeconds`,`spec.tolerations` (only additions to existing tolerations),`spec.terminationGracePeriodSeconds` (allow it to be set to 1 if it was previously negative)');
        }
      }
      break;
    case 'Deployment':
    case 'ReplicaSet': {
      const ml = s?.selector?.matchLabels;
      if (!s?.selector || (!ml && !s.selector.matchExpressions)) erros.push(obrigatorio('spec.selector'));
      else if (ml && !Object.keys(ml).length && !s.selector.matchExpressions) erros.push(invalido('spec.selector', s.selector, 'empty selector is invalid for deployment'));
      const labels = s?.template?.metadata?.labels;
      if (ml && !casaSeletor(ml, labels)) erros.push(invalido('spec.template.metadata.labels', labels ?? {}, '`selector` does not match template `labels`'));
      validarPodSpec(s?.template?.spec, 'spec.template.spec', erros);
      if (s?.replicas < 0) erros.push(invalido('spec.replicas', s.replicas, 'must be greater than or equal to 0'));
      if (s?.template?.spec?.restartPolicy && s.template.spec.restartPolicy !== 'Always') {
        erros.push(`spec.template.spec.restartPolicy: Unsupported value: ${JSON.stringify(s.template.spec.restartPolicy)}: supported values: "Always"`);
      }
      if (antigo && JSON.stringify(antigo.spec.selector) !== JSON.stringify(s.selector)) {
        erros.push(invalido('spec.selector', s.selector, 'field is immutable'));
      }
      break;
    }
    case 'Service': {
      const tipo = s?.type ?? 'ClusterIP';
      if (!['ClusterIP', 'NodePort', 'LoadBalancer', 'ExternalName'].includes(tipo)) {
        erros.push(`spec.type: Unsupported value: ${JSON.stringify(tipo)}: supported values: "ClusterIP", "ExternalName", "LoadBalancer", "NodePort"`);
      }
      if (tipo !== 'ExternalName' && !s?.ports?.length) erros.push(obrigatorio('spec.ports'));
      (s?.ports ?? []).forEach((p, i) => {
        if (p.port === undefined) erros.push(obrigatorio(`spec.ports[${i}].port`));
        else if (p.port < 1 || p.port > 65535) erros.push(invalido(`spec.ports[${i}].port`, p.port, 'must be between 1 and 65535, inclusive'));
        if (s.ports.length > 1 && !p.name) erros.push(obrigatorio(`spec.ports[${i}].name`));
      });
      break;
    }
    case 'Ingress':
      (s?.rules ?? []).forEach((r, i) => (r.http?.paths ?? []).forEach((pa, j) => {
        const cam = `spec.rules[${i}].http.paths[${j}]`;
        if (!pa.pathType) erros.push(obrigatorio(`${cam}.pathType`));
        else if (!['Prefix', 'Exact', 'ImplementationSpecific'].includes(pa.pathType)) erros.push(`${cam}.pathType: Unsupported value: ${JSON.stringify(pa.pathType)}: supported values: "Exact", "ImplementationSpecific", "Prefix"`);
        if (pa.path && !pa.path.startsWith('/')) erros.push(invalido(`${cam}.path`, pa.path, 'must be an absolute path'));
        if (!pa.backend?.service?.name) erros.push(obrigatorio(`${cam}.backend`));
        else if (pa.backend.service.port?.number === undefined && !pa.backend.service.port?.name) erros.push(obrigatorio(`${cam}.backend.service.port`));
      }));
      if (!s?.rules?.length && !s?.defaultBackend) erros.push('spec: Invalid value: "": either `defaultBackend` or `rules` must be specified');
      break;
    case 'HTTPRoute':
      if (!s?.parentRefs?.length) erros.push(obrigatorio('spec.parentRefs'));
      break;
    case 'ConfigMap':
    case 'Secret':
      if (antigo?.immutable && JSON.stringify(antigo.data) !== JSON.stringify(obj.data)) {
        erros.push('data: Forbidden: field is immutable when `immutable` is set');
      }
      break;
  }
  return erros;
}

// ---------- padrões ----------
const ehLatest = (imagem) => !/:[^/]+$/.test(imagem.split('@')[0]) || imagem.endsWith(':latest');

function padroesPodSpec(spec) {
  for (const c of [...(spec.initContainers ?? []), ...(spec.containers ?? [])]) {
    c.imagePullPolicy ??= c.image && ehLatest(c.image) ? 'Always' : 'IfNotPresent';
    for (const p of c.ports ?? []) p.protocol ??= 'TCP';
    c.resources ??= {};
    c.terminationMessagePath ??= '/dev/termination-log';
    c.terminationMessagePolicy ??= 'File';
  }
  spec.dnsPolicy ??= 'ClusterFirst';
  spec.restartPolicy ??= 'Always';
  spec.schedulerName ??= 'default-scheduler';
  spec.securityContext ??= {};
  spec.terminationGracePeriodSeconds ??= 30;
}

/** Aplica os valores padrão que o apiserver preenche (o que aparece no `-o yaml`). */
export function aplicarPadroes(obj) {
  const s = obj.spec;
  switch (obj.kind) {
    case 'Pod':
      padroesPodSpec(s);
      s.enableServiceLinks ??= true;
      s.preemptionPolicy ??= 'PreemptLowerPriority';
      s.priority ??= 0;
      s.serviceAccountName ??= s.serviceAccount ?? 'default';
      s.serviceAccount ??= s.serviceAccountName;
      break;
    case 'Deployment':
      s.replicas ??= 1;
      s.revisionHistoryLimit ??= 10;
      s.progressDeadlineSeconds ??= 600;
      s.strategy ??= {};
      s.strategy.type ??= 'RollingUpdate';
      if (s.strategy.type === 'RollingUpdate') {
        s.strategy.rollingUpdate ??= {};
        s.strategy.rollingUpdate.maxSurge ??= '25%';
        s.strategy.rollingUpdate.maxUnavailable ??= '25%';
      }
      s.template.metadata ??= {};
      padroesPodSpec(s.template.spec);
      break;
    case 'ReplicaSet':
      s.replicas ??= 1;
      padroesPodSpec(s.template.spec);
      break;
    case 'Service':
      s.type ??= 'ClusterIP';
      for (const p of s.ports ?? []) {
        p.protocol ??= 'TCP';
        p.targetPort ??= p.port;
      }
      s.sessionAffinity ??= 'None';
      if (s.type !== 'ExternalName') {
        s.internalTrafficPolicy ??= 'Cluster';
        s.ipFamilies ??= ['IPv4'];
        s.ipFamilyPolicy ??= 'SingleStack';
      }
      obj.status ??= { loadBalancer: {} };
      break;
    case 'Namespace':
      obj.spec = { finalizers: ['kubernetes'], ...(s ?? {}) };
      obj.metadata.labels = { ...(obj.metadata.labels ?? {}), 'kubernetes.io/metadata.name': obj.metadata.name };
      obj.status = { phase: 'Active' };
      break;
    case 'Secret':
      obj.type ??= 'Opaque';
      if (obj.stringData) {
        obj.data = { ...(obj.data ?? {}) };
        for (const [k, v] of Object.entries(obj.stringData)) obj.data[k] = btoaUtf8(v);
        delete obj.stringData;
      }
      break;
  }
  return obj;
}

export const btoaUtf8 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(String(s))));
export const atobUtf8 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

// ---------- explain ----------
const nomeTipoExplain = (c) => {
  if (c.tipo === 'object') return nomeStruct(c);
  if (c.tipo === 'array') return `[]${nomeTipoExplain(c.item)}`;
  if (c.tipo === 'map') return 'map[string]string';
  if (c.tipo === 'any') return (c.go ?? 'Object').replace(/^v1\./, '');
  return c.tipo;
};

/** Quebra o texto em linhas de até 80 colunas, com o recuo dado. */
function quebrar(textoLongo, recuo) {
  const linhas = [];
  let atual = '';
  for (const palavra of textoLongo.split(/\s+/).filter(Boolean)) {
    if (atual && recuo.length + atual.length + 1 + palavra.length > 80) {
      linhas.push(recuo + atual);
      atual = palavra;
    } else atual = atual ? `${atual} ${palavra}` : palavra;
  }
  if (atual) linhas.push(recuo + atual);
  return linhas;
}

/** Saída do `kubectl explain` para kind e caminho ('spec.replicas'). Erro → { erro }. */
export function explicar(recurso, caminho = []) {
  let c = ESQUEMAS[recurso.kind];
  const percorridos = [];
  for (const parte of caminho) {
    if (c.tipo === 'array') c = c.item;
    const filho = c.campos?.[parte];
    if (!filho) return { erro: `error: field "${parte}" does not exist` };
    percorridos.push(parte);
    c = filho;
  }
  const alvo = c.tipo === 'array' ? c.item : c;
  const linhas = [];
  if (recurso.grupo) linhas.push(`GROUP:      ${recurso.grupo}`);
  linhas.push(`KIND:       ${recurso.kind}`, `VERSION:    ${recurso.versao}`, '');
  if (caminho.length) linhas.push(`FIELD: ${percorridos.at(-1)} <${nomeTipoExplain(c)}>`, '', '');
  linhas.push('DESCRIPTION:', ...quebrar(c.desc || alvo.desc || '<sem descrição>', '    '));
  if (c !== alvo && alvo.desc && alvo.desc !== c.desc) linhas.push(...quebrar(alvo.desc, '    '));
  linhas.push('    ');
  if (alvo.campos) {
    linhas.push('FIELDS:');
    for (const [nome, f] of Object.entries(alvo.campos).sort(([a], [b]) => a.localeCompare(b))) {
      linhas.push(`  ${nome}\t<${nomeTipoExplain(f)}>${f.obrigatorio ? ' -required-' : ''}`);
      if (f.desc) linhas.push(...quebrar(f.desc, '    '));
      linhas.push('');
    }
  }
  linhas.push('');
  return { saida: linhas.join('\n') };
}
