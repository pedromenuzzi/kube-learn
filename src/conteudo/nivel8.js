// Nível 8: segurança (os crachás do RBAC, as catracas da NetworkPolicy e as normas dos bombeiros).
import { licao, problema, yaml } from './util.js';

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const depois = (descricao, regras, { oculto = false, esperar = '1m', mais = [] } = {}) => ({ oculto, descricao, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }, ...mais], regras });
const pode = (quem, verbo, recurso, resposta, extra = {}) => ({ pode: { quem, verbo, recurso, resposta, ...extra } });
const pede = (de, url, status, ns = 'rede') => ({ requisicao: { de: `pod/${de}`, ns, url, status } });

// ---------- RBAC ----------
const papelLeitor = yaml`
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata:
    name: leitor
    namespace: loja
  rules:
  - apiGroups:
    - ""
    resources:
    - pods
    - pods/log
    verbs:
    - get
    - list
    - watch
`;
const crachaDaAna = yaml`
  apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: ana-leitora
    namespace: loja
  subjects:
  - kind: User
    name: ana
    apiGroup: rbac.authorization.k8s.io
  roleRef:
    kind: Role
    name: leitor
    apiGroup: rbac.authorization.k8s.io
`;
const leituraComDelete = papelLeitor.replace('    - watch\n', '    - watch\n    - delete\n');

const painel = (completo) => `${completo ? `${yaml`
  apiVersion: v1
  kind: ServiceAccount
  metadata:
    name: painel
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata:
    name: ver-pods
  rules:
  - apiGroups:
    - ""
    resources:
    - pods
    verbs:
    - get
    - list
    - watch
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: painel-ver-pods
  subjects:
  - kind: ServiceAccount
    name: painel
    namespace: default
  roleRef:
    kind: Role
    name: ver-pods
    apiGroup: rbac.authorization.k8s.io
`}---\n` : ''}${yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: painel
  spec:
    serviceAccountName: painel
    containers:
    - name: painel
      image: busybox:1.36
      command: ["sleep", "3600"]
`}`;

const auditoria = (tipo) => yaml`
  apiVersion: rbac.authorization.k8s.io/v1
  kind: ${tipo}
  metadata:
    name: auditoria
${tipo === 'RoleBinding' ? '    namespace: default\n' : ''}  subjects:
  - kind: User
    name: auditoria
    apiGroup: rbac.authorization.k8s.io
  roleRef:
    kind: ClusterRole
    name: view
    apiGroup: rbac.authorization.k8s.io
`;

// ---------- NetworkPolicy ----------
const negaTudo = (ingressVazio) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: nega-tudo
    namespace: rede
  spec:
    podSelector: {}
    policyTypes:
    - Ingress
${ingressVazio ? '    ingress:\n    - {}\n' : ''}`;
const liberaVitrine = (porta) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: libera-vitrine
    namespace: rede
  spec:
    podSelector:
      matchLabels:
        app: api
    ingress:
    - from:
      - podSelector:
          matchLabels:
            app: vitrine
      ports:
      - protocol: TCP
        port: ${porta}
`;
const saidaDaVitrine = (comDns) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: saida-da-vitrine
    namespace: rede
  spec:
    podSelector:
      matchLabels:
        app: vitrine
    policyTypes:
    - Egress
    egress:
    - to:
      - podSelector:
          matchLabels:
            app: api
      ports:
      - protocol: TCP
        port: 80
${comDns ? `    - to:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: kube-system
        podSelector:
          matchLabels:
            k8s-app: kube-dns
      ports:
      - protocol: UDP
        port: 53
      - protocol: TCP
        port: 53
` : ''}`;
const doMonitoramento = (comNamespace) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: libera-monitoramento
    namespace: rede
  spec:
    podSelector:
      matchLabels:
        app: api
    ingress:
    - from:
      - ${comNamespace ? `namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: monitoramento` : `podSelector:
          matchLabels:
            app: coletor`}
`;

// ---------- securityContext e Pod Security ----------
const relatorio = (seguro) => yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: relatorio
  spec:
${seguro ? '    securityContext:\n      runAsUser: 1000\n      runAsNonRoot: true\n' : ''}    containers:
    - name: relatorio
      image: busybox:1.36
      command: ["sleep", "3600"]
`;
const vitrineBlindada = (comVolumes) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: vitrine
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: vitrine
    template:
      metadata:
        labels:
          app: vitrine
      spec:
        containers:
        - name: vitrine
          image: nginx:1.27
          securityContext:
            readOnlyRootFilesystem: true
${comVolumes ? `          volumeMounts:
          - name: cache
            mountPath: /var/cache/nginx
          - name: run
            mountPath: /var/run
        volumes:
        - name: cache
          emptyDir: {}
        - name: run
          emptyDir: {}
` : ''}`;
const guarda = (seguro) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: guarda
    namespace: cofre
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: guarda
    template:
      metadata:
        labels:
          app: guarda
      spec:
${seguro ? `        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          seccompProfile:
            type: RuntimeDefault
` : ''}        containers:
        - name: guarda
          image: busybox:1.36
          command: ["sleep", "3600"]
${seguro ? `          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
              - ALL
` : ''}`;

/** Os clusters de partida deste nível (em clusters.js). */
export const PARTIDA8 = {
  lojaNs: yaml`
    apiVersion: v1
    kind: Namespace
    metadata:
      name: loja
    ---
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: loja
      namespace: loja
    spec:
      replicas: 2
      selector:
        matchLabels:
          app: loja
      template:
        metadata:
          labels:
            app: loja
        spec:
          containers:
          - name: loja
            image: kubelearn/loja:1.0
            ports:
            - containerPort: 8080
  `,
  // Três crachás na loja: a ana lê, a carla cuida dos Deployments e o bruno tem o "edit" (que apaga pods).
  crachas: `${papelLeitor}---\n${crachaDaAna}---\n${yaml`
    apiVersion: rbac.authorization.k8s.io/v1
    kind: Role
    metadata:
      name: deployer
      namespace: loja
    rules:
    - apiGroups:
      - apps
      resources:
      - deployments
      verbs:
      - get
      - list
      - create
      - update
      - patch
      - delete
    ---
    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      name: carla-deployer
      namespace: loja
    subjects:
    - kind: User
      name: carla
      apiGroup: rbac.authorization.k8s.io
    roleRef:
      kind: Role
      name: deployer
      apiGroup: rbac.authorization.k8s.io
    ---
    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      name: bruno-editor
      namespace: loja
    subjects:
    - kind: User
      name: bruno
      apiGroup: rbac.authorization.k8s.io
    roleRef:
      kind: ClusterRole
      name: edit
      apiGroup: rbac.authorization.k8s.io
  `}`,
  cofre: yaml`
    apiVersion: v1
    kind: Namespace
    metadata:
      name: cofre
      labels:
        pod-security.kubernetes.io/enforce: restricted
  `,
  rede: yaml`
    apiVersion: v1
    kind: Namespace
    metadata:
      name: rede
    ---
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: api
      namespace: rede
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: api
      template:
        metadata:
          labels:
            app: api
        spec:
          containers:
          - name: api
            image: nginx:1.27
            ports:
            - containerPort: 80
    ---
    apiVersion: v1
    kind: Service
    metadata:
      name: api
      namespace: rede
    spec:
      selector:
        app: api
      ports:
      - port: 80
    ---
    apiVersion: v1
    kind: Pod
    metadata:
      name: vitrine
      namespace: rede
      labels:
        app: vitrine
    spec:
      containers:
      - name: vitrine
        image: busybox:1.36
        command: ["sleep", "3600"]
    ---
    apiVersion: v1
    kind: Pod
    metadata:
      name: curioso
      namespace: rede
      labels:
        app: curioso
    spec:
      containers:
      - name: curioso
        image: busybox:1.36
        command: ["sleep", "3600"]
  `,
  negaTudo: negaTudo(false),
  saidaSemDns: saidaDaVitrine(false),
  monitoramento: yaml`
    apiVersion: v1
    kind: Namespace
    metadata:
      name: monitoramento
    ---
    apiVersion: v1
    kind: Pod
    metadata:
      name: coletor
      namespace: monitoramento
      labels:
        app: coletor
    spec:
      containers:
      - name: coletor
        image: busybox:1.36
        command: ["sleep", "3600"]
  `,
};

export const NIVEL8 = [
  licao({
    id: 'n8-licao-rbac',
    titulo: 'Crachás: quem pode fazer o quê',
    vidaReal: 'Cada pessoa do condomínio tem um crachá. O tipo de crachá (Role) diz que portas ele abre; a entrega (RoleBinding) diz quem recebeu qual crachá.',
    limite: 'O crachá só soma: não existe "pode tudo, menos apagar". Para negar, simplesmente não dê.',
    conteudo: `
      <p>Toda ação no cluster é um <b>pedido à API</b> ("listar pods no namespace loja"), e o <b>RBAC</b> decide se quem pediu
         pode. São quatro peças:</p>
      <ul>
        <li><b>Role</b>: um tipo de crachá dentro de um namespace. Uma lista de regras: <i>estes verbos</i> (get, list, watch,
            create, update, patch, delete) <i>nestes recursos</i> (pods, pods/log, deployments...).</li>
        <li><b>ClusterRole</b>: o mesmo, valendo no cluster inteiro (ou reaproveitado em vários namespaces). Já vêm prontos:
            <code>view</code> (só ler, menos Secrets), <code>edit</code>, <code>admin</code> e <code>cluster-admin</code>.</li>
        <li><b>RoleBinding</b>: entrega um crachá (Role ou ClusterRole) a alguém, <b>dentro de um namespace</b>.</li>
        <li><b>ClusterRoleBinding</b>: entrega uma ClusterRole no cluster inteiro.</li>
      </ul>
      <p>"Alguém" é um <b>usuário</b> (User), um <b>grupo</b> (Group) ou uma <b>ServiceAccount</b>: o crachá de máquina que
         os pods usam para falar com a API (<code>spec.serviceAccountName</code>; sem dizer, é a <code>default</code>).</p>
      <h2>Perguntar antes de tentar</h2>
      <pre><code>kubectl auth can-i delete pods --as=ana -n loja          # no
kubectl auth can-i list pods --as=system:serviceaccount:loja:painel -n loja</code></pre>
      <p>O <code>--as</code> pede "como se fosse" outra pessoa (você, o administrador, pode). Sem permissão, a resposta é um
         <code>Forbidden</code> que diz exatamente o que faltou:</p>
      <pre><code>Error from server (Forbidden): pods is forbidden: User "ana" cannot list resource "pods"
in API group "" in the namespace "default"</code></pre>
      <p><b>A pegadinha</b>: um RoleBinding que aponta para uma ClusterRole vale só no namespace do RoleBinding. Para valer em
         todos, é ClusterRoleBinding.</p>`,
  }),

  problema({
    id: 'n8-quem-apaga',
    titulo: 'Quem pode apagar?',
    dificuldade: 'facil',
    cluster: 'crachas-da-loja',
    terminal: true,
    vidaReal: 'Três funcionários, três crachás. Antes de mandar alguém resolver o problema, descubra quem tem a chave certa.',
    limite: 'O can-i responde pela regra, não pela intenção: se alguém ganhou mais do que devia, ele diz "yes" do mesmo jeito.',
    enunciado: `
      <p>No namespace <code>loja</code>, a <b>ana</b>, o <b>bruno</b> e a <b>carla</b> têm crachás diferentes. Só um deles pode
         <b>apagar pods</b> lá. Quem?</p>`,
    rotuloResposta: 'O nome (ana, bruno ou carla)',
    dica: 'kubectl auth can-i delete pods --as=NOME -n loja, para cada um.',
    respostaCerta: 'bruno',
    solucaoTerminal: ['kubectl auth can-i delete pods --as=ana -n loja', 'kubectl auth can-i delete pods --as=bruno -n loja'],
    testes: noCluster('você achou quem tem a chave', [
      { comando: '^kubectl\\s+auth\\s+can-i\\s', msg: 'você perguntou ao kubectl auth can-i' },
      { resposta: 'bruno' },
    ]),
  }),

  problema({
    id: 'n8-cracha-de-leitura',
    titulo: 'Crachá de leitura',
    dificuldade: 'facil',
    cluster: 'loja-ns',
    vidaReal: 'A ana vai acompanhar a loja: precisa ver os apartamentos e ler o diário de cada um, sem mexer em nada.',
    limite: 'Ler logs pode mostrar dados sensíveis: crachá de leitura também precisa de cuidado.',
    enunciado: `
      <p>Dê à <b>ana</b>, só no namespace <code>loja</code>, permissão de <b>ler pods e os logs</b> deles (get, list e watch em
         <code>pods</code> e <code>pods/log</code>). Nada de apagar.</p>
      <p>O arquivo já tem a Role <code>leitor</code>, mas com um verbo a mais. Conserte e entregue o crachá (RoleBinding).</p>`,
    comoSaber: '<code>kubectl auth can-i list pods --as=ana -n loja</code> responde yes; com <code>delete</code>, no.',
    dica: 'Tire o delete da Role e acrescente um RoleBinding (subjects: kind User, name ana; roleRef: kind Role, name leitor).',
    manual: ['role.rules', 'rolebinding'],
    inicial: { 'ana.yaml': leituraComDelete },
    solucao: { 'ana.yaml': `${papelLeitor}---\n${crachaDaAna}` },
    testes: [depois('a ana lê, mas não apaga', [
      { semErros: true },
      pode('ana', 'list', 'pods', true, { ns: 'loja' }),
      pode('ana', 'get', 'pods', true, { ns: 'loja', sub: 'log' }),
      pode('ana', 'delete', 'pods', false, { ns: 'loja' }),
      pode('ana', 'list', 'pods', false, { ns: 'default' }),
    ], { esperar: '5s' })],
  }),

  problema({
    id: 'n8-cracha-pelo-terminal',
    titulo: 'Crachá pelo terminal',
    dificuldade: 'facil',
    cluster: 'loja-ns',
    terminal: true,
    vidaReal: 'O bruno cuida das atualizações da loja: ver, criar e atualizar Deployments. A administração emite o crachá na hora, no balcão.',
    limite: 'O create role não confere se o recurso faz sentido para a tarefa: é você quem escolhe o mínimo necessário.',
    enunciado: `
      <p><b>Pelo terminal</b>, no namespace <code>loja</code>: crie a Role <code>atualizador</code> (get, list, create e update
         em <code>deployments</code>) e entregue-a ao <b>bruno</b> com o RoleBinding <code>bruno-atualizador</code>.</p>`,
    comoSaber: '<code>kubectl auth can-i update deployments --as=bruno -n loja</code> responde yes.',
    dica: 'kubectl create role atualizador --verb=get,list,create,update --resource=deployments -n loja e kubectl create rolebinding bruno-atualizador --role=atualizador --user=bruno -n loja',
    solucaoTerminal: [
      'kubectl create role atualizador --verb=get,list,create,update --resource=deployments -n loja',
      'kubectl create rolebinding bruno-atualizador --role=atualizador --user=bruno -n loja',
    ],
    testes: noCluster('o bruno atualiza Deployments na loja', [
      pode('bruno', 'update', 'deployments', true, { ns: 'loja' }),
      pode('bruno', 'create', 'deployments', true, { ns: 'loja' }),
      pode('bruno', 'delete', 'deployments', false, { ns: 'loja' }),
      { objeto: 'rolebinding/bruno-atualizador', ns: 'loja', campo: 'roleRef.name', igual: 'atualizador' },
    ]),
  }),

  problema({
    id: 'n8-conta-do-painel',
    titulo: 'O crachá de máquina',
    dificuldade: 'medio',
    cluster: 'vazio',
    vidaReal: 'O painel da portaria é uma máquina: precisa de um crachá próprio (o do elevador, o das câmeras), que só abre o que ele usa.',
    limite: 'Todo pod tem um crachá, nem que seja o "default". Dar permissão ao default é dar a todos os pods do namespace.',
    enunciado: `
      <p>O pod <code>painel</code> usa a ServiceAccount <code>painel</code>, que não existe: o apply é recusado.</p>
      <p>No mesmo arquivo, <b>antes</b> do pod, crie a ServiceAccount <code>painel</code>, uma Role <code>ver-pods</code>
         (get, list e watch em pods) e um RoleBinding <code>painel-ver-pods</code> que entrega a Role à ServiceAccount.</p>`,
    comoSaber: 'O pod sobe, e <code>kubectl auth can-i list pods --as=system:serviceaccount:default:painel</code> responde yes.',
    dica: 'No subjects do RoleBinding: kind: ServiceAccount, name: painel, namespace: default.',
    manual: ['serviceaccount', 'rolebinding.subjects'],
    inicial: { 'painel.yaml': painel(false) },
    solucao: { 'painel.yaml': painel(true) },
    testes: [depois('o painel sobe e só enxerga pods', [
      { semErros: true },
      { objeto: 'pod/painel', campo: 'status.phase', igual: 'Running' },
      { objeto: 'pod/painel', campo: 'spec.serviceAccountName', igual: 'painel' },
      pode('system:serviceaccount:default:painel', 'list', 'pods', true),
      pode('system:serviceaccount:default:painel', 'delete', 'pods', false),
      pode('system:serviceaccount:default:painel', 'list', 'secrets', false),
    ], { esperar: '30s' })],
  }),

  problema({
    id: 'n8-auditoria',
    titulo: 'A auditoria olha tudo',
    dificuldade: 'medio',
    cluster: 'vazio',
    vidaReal: 'A auditoria precisa olhar todos os blocos do condomínio, sem mexer em nada. O crachá foi entregue só na portaria de um bloco.',
    limite: 'O view não mostra Secrets: até a auditoria precisa de um crachá à parte para ler senhas (e quase nunca deve ter).',
    enunciado: `
      <p>A usuária <b>auditoria</b> deveria ler (a ClusterRole <code>view</code>) em <b>todos</b> os namespaces, mas o crachá
         foi entregue com um RoleBinding no <code>default</code>: no <code>kube-system</code> ela não vê nada.</p>
      <p>Troque por um <b>ClusterRoleBinding</b>.</p>`,
    comoSaber: '<code>kubectl auth can-i list pods --as=auditoria -n kube-system</code> responde yes.',
    dica: 'kind: ClusterRoleBinding, sem namespace no metadata.',
    manual: ['clusterrolebinding'],
    inicial: { 'auditoria.yaml': auditoria('RoleBinding') },
    solucao: { 'auditoria.yaml': auditoria('ClusterRoleBinding') },
    testes: [depois('a auditoria lê em todos os namespaces, sem mexer', [
      { semErros: true },
      pode('auditoria', 'list', 'pods', true, { ns: 'kube-system' }),
      pode('auditoria', 'list', 'deployments', true, { ns: 'default' }),
      pode('auditoria', 'delete', 'pods', false, { ns: 'default' }),
      pode('auditoria', 'get', 'secrets', false, { ns: 'kube-system' }),
    ], { esperar: '5s' })],
  }),

  licao({
    id: 'n8-licao-netpol',
    titulo: 'Catracas: quem fala com quem',
    vidaReal: 'Sem catracas internas, qualquer visitante que entrou no condomínio anda por todos os blocos. A NetworkPolicy põe catracas e diz quem passa.',
    limite: 'Sem nenhuma política, tudo fica aberto: é preciso uma regra de "nega tudo" para fechar e, depois, abrir o que precisa.',
    conteudo: `
      <p>Por padrão, todo pod fala com todo pod, de qualquer namespace. Uma <b>NetworkPolicy</b> escolhe pods
         (<code>podSelector</code>) e, a partir daí, <b>só passa o que ela libera</b>:</p>
      <ul>
        <li><code>ingress</code>: de quem eles aceitam conexão (<code>from</code>) e em que portas.</li>
        <li><code>egress</code>: com quem eles podem falar (<code>to</code>).</li>
        <li>Os pares do <code>from</code>/<code>to</code>: <code>podSelector</code> (pods do mesmo namespace),
            <code>namespaceSelector</code> (pods de outros namespaces, pela label do namespace, como
            <code>kubernetes.io/metadata.name</code>) ou <code>ipBlock</code>.</li>
      </ul>
      <pre><code># nega tudo que entra nos pods do namespace
spec:
  podSelector: {}
  policyTypes:
  - Ingress</code></pre>
      <p>As regras <b>somam</b>: um pod escolhido por duas políticas aceita o que qualquer uma delas liberar. Cuidado com o
         <code>ingress: [{}]</code>: uma regra vazia libera tudo.</p>
      <h2>A pegadinha do DNS</h2>
      <p>Fechou a <b>saída</b> (egress) de um pod? Ele deixa de falar com o DNS (o <code>kube-dns</code>, porta 53, UDP e TCP)
         e nenhum nome resolve: <code>wget: bad address 'api'</code>. Libere a porta 53 para o kube-dns junto.</p>
      <p>Quem obedece às políticas é o plugin de rede (CNI). O kindnet obedece; alguns plugins não, e aí a política
         vira enfeite.</p>`,
  }),

  problema({
    id: 'n8-nega-tudo',
    titulo: 'Nega tudo',
    dificuldade: 'facil',
    cluster: 'rede',
    vidaReal: 'A primeira catraca de um bloco é a que fecha tudo: depois, abre-se o que precisa.',
    limite: 'Fecha só a entrada: os pods de lá continuam saindo para onde quiserem (para isso, uma política de Egress).',
    enunciado: `
      <p>No namespace <code>rede</code>, hoje qualquer pod chama a <code>api</code>. O arquivo tem uma política
         <code>nega-tudo</code> que deveria fechar a entrada de <b>todos</b> os pods do namespace, mas não fecha nada.</p>
      <p>Conserte.</p>`,
    comoSaber: 'De dentro do curioso, <code>kubectl exec curioso -n rede -- wget -q -O- -T 3 http://api</code> dá <i>download timed out</i>.',
    dica: 'O "ingress: [{}]" é uma regra que libera tudo. Sem nenhuma regra de ingress, nada entra.',
    manual: ['networkpolicy.spec'],
    inicial: { 'nega-tudo.yaml': negaTudo(true) },
    solucao: { 'nega-tudo.yaml': negaTudo(false) },
    testes: [depois('ninguém chega na api', [{ semErros: true }, pede('curioso', 'http://api', 'timeout'), pede('vitrine', 'http://api', 'timeout')], { esperar: '5s' })],
  }),

  problema({
    id: 'n8-so-a-vitrine',
    titulo: 'Só a vitrine passa',
    dificuldade: 'medio',
    cluster: 'rede-fechada',
    vidaReal: 'O bloco da api está fechado. A vitrine precisa de um passe na catraca; o curioso, não.',
    limite: 'A catraca confia na etiqueta: um pod qualquer com a label app=vitrine passa também. Quem pode pôr labels é questão de RBAC.',
    enunciado: `
      <p>O namespace <code>rede</code> está com a <code>nega-tudo</code>. Libere a entrada na <code>api</code> só para os pods
         <code>app=vitrine</code>. O arquivo já tem a política, mas a vitrine continua barrada.</p>`,
    comoSaber: 'A vitrine recebe a página do nginx; o curioso, <i>download timed out</i>.',
    dica: 'A porta da regra é a do contêiner que recebe (o nginx ouve na 80), não a de outro lugar.',
    manual: ['networkpolicy.spec.ingress'],
    inicial: { 'libera-vitrine.yaml': liberaVitrine(8080) },
    solucao: { 'libera-vitrine.yaml': liberaVitrine(80) },
    testes: [depois('a vitrine passa, o curioso não', [{ semErros: true }, pede('vitrine', 'http://api', 200), pede('curioso', 'http://api', 'timeout')], { esperar: '5s' })],
  }),

  problema({
    id: 'n8-dns',
    titulo: 'Sem DNS, sem nome',
    dificuldade: 'medio',
    cluster: 'rede-sem-dns',
    vidaReal: 'Liberaram a vitrine para falar só com a api, e esqueceram que, para achar a api, ela pergunta o endereço à telefonista (o DNS).',
    limite: 'Com o IP direto, a vitrine chegaria na api: o que travou foi só a pergunta do nome.',
    enunciado: `
      <p>A política <code>saida-da-vitrine</code> deixa a vitrine falar só com a api, na porta 80. Mas, de dentro dela,
         <code>wget http://api</code> dá <code>bad address 'api'</code>.</p>
      <p>Acrescente uma regra de saída para o <b>DNS</b>: os pods <code>k8s-app=kube-dns</code> do namespace
         <code>kube-system</code>, porta 53, UDP e TCP.</p>`,
    comoSaber: '<code>kubectl exec vitrine -n rede -- wget -q -O- -T 3 http://api</code> mostra a página do nginx.',
    dica: 'Um segundo item em egress, com to: [{ namespaceSelector: {...kube-system}, podSelector: {...kube-dns} }] e as duas portas 53.',
    manual: ['networkpolicy.spec.egress'],
    inicial: { 'saida-da-vitrine.yaml': saidaDaVitrine(false) },
    solucao: { 'saida-da-vitrine.yaml': saidaDaVitrine(true) },
    testes: [depois('a vitrine acha a api pelo nome', [
      { semErros: true },
      pede('vitrine', 'http://api', 200),
      { ...pede('vitrine', 'http://kube-dns.kube-system:9153', 'timeout'), msg: 'o resto da saída continua fechado (a porta 9153 do kube-dns dá timeout)' },
    ], { esperar: '5s' })],
  }),

  problema({
    id: 'n8-outro-bloco',
    titulo: 'O vizinho do outro bloco',
    dificuldade: 'medio',
    cluster: 'rede-e-monitoramento',
    vidaReal: 'O coletor de métricas mora em outro bloco (o namespace monitoramento). A catraca da api precisa reconhecer quem vem de lá.',
    limite: 'Liberar um namespace inteiro libera qualquer pod que for criado lá depois. Junte com um podSelector para apertar.',
    enunciado: `
      <p>O namespace <code>rede</code> está fechado (<code>nega-tudo</code>). O pod <code>coletor</code>, do namespace
         <code>monitoramento</code>, precisa chamar a api. A política do arquivo usa só um <code>podSelector</code>, que procura
         pods no <b>próprio</b> namespace <code>rede</code>.</p>
      <p>Troque por um <b>namespaceSelector</b> para o namespace <code>monitoramento</code>.</p>`,
    comoSaber: '<code>kubectl exec coletor -n monitoramento -- wget -q -O- -T 3 http://api.rede</code> mostra a página do nginx.',
    dica: 'namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: monitoramento } }',
    manual: ['networkpolicy.spec.ingress'],
    inicial: { 'libera-monitoramento.yaml': doMonitoramento(false) },
    solucao: { 'libera-monitoramento.yaml': doMonitoramento(true) },
    testes: [depois('o coletor chega, o curioso não', [
      { semErros: true },
      pede('coletor', 'http://api.rede', 200, 'monitoramento'),
      pede('curioso', 'http://api', 'timeout'),
    ], { esperar: '5s' })],
  }),

  licao({
    id: 'n8-licao-seguranca',
    titulo: 'As normas dos bombeiros',
    vidaReal: 'Ninguém recebe a chave mestra: cada morador roda com a chave do próprio apartamento. E os bombeiros (Pod Security) não deixam entrar quem pede mais do que devia.',
    limite: 'As normas olham o que o pod pede, não o que o programa faz: um programa com falha continua com falha, só que com menos poder.',
    conteudo: `
      <p>Por padrão, o programa da maioria das imagens roda como <b>root</b> dentro do contêiner. Se ele for invadido, o
         invasor começa com a chave mestra. O <code>securityContext</code> (no pod ou em cada contêiner) aperta isso:</p>
      <ul>
        <li><code>runAsUser: 1000</code>: roda como um usuário comum. <code>runAsNonRoot: true</code>: recusa subir como root
            (<code>CreateContainerConfigError</code>: <i>container has runAsNonRoot and image will run as root</i>).</li>
        <li><code>readOnlyRootFilesystem: true</code>: o disco do contêiner vira só leitura; o programa grava só em volumes
            (um <code>emptyDir</code> onde ele precisa).</li>
        <li><code>allowPrivilegeEscalation: false</code> e <code>capabilities: { drop: ["ALL"] }</code>: nada de ganhar
            poder depois de subir.</li>
        <li><code>seccompProfile: { type: RuntimeDefault }</code>: o filtro padrão de chamadas ao sistema.</li>
      </ul>
      <h2>Pod Security Admission</h2>
      <p>Os bombeiros de cada bloco: uma label no namespace escolhe a norma e o modo.</p>
      <pre><code>kubectl label ns cofre pod-security.kubernetes.io/enforce=restricted</code></pre>
      <ul>
        <li>Normas: <code>privileged</code> (sem regra), <code>baseline</code> (nada de privileged, hostNetwork, hostPath...)
            e <code>restricted</code> (o baseline mais o securityContext acima).</li>
        <li>Modos: <code>enforce</code> recusa o pod, <code>warn</code> só avisa.</li>
      </ul>
      <p>A pegadinha: um <b>Deployment</b> num namespace restrito é criado com um <i>Warning</i>, mas os pods são recusados.
         O sintoma é <code>READY 0/1</code>, e o motivo está no <code>kubectl describe rs</code> (<i>FailedCreate</i>).</p>`,
  }),

  problema({
    id: 'n8-sem-root',
    titulo: 'Sem a chave mestra',
    dificuldade: 'facil',
    cluster: 'vazio',
    vidaReal: 'O relatório roda com a chave mestra do condomínio sem precisar. Dê a ele a chave de um morador comum.',
    limite: 'Rodar como usuário comum não protege dos dados que o programa já lê: só limita o estrago se ele for invadido.',
    enunciado: `
      <p>Faça o pod <code>relatorio</code> rodar como o usuário <b>1000</b> (<code>runAsUser</code>) e recusar subir como root
         (<code>runAsNonRoot</code>), no <code>securityContext</code> do pod.</p>`,
    comoSaber: '<code>kubectl exec relatorio -- id</code> mostra <code>uid=1000</code>.',
    dica: 'spec.securityContext: { runAsUser: 1000, runAsNonRoot: true }',
    manual: ['pod.spec.securityContext'],
    inicial: { 'relatorio.yaml': relatorio(false) },
    solucao: { 'relatorio.yaml': relatorio(true) },
    testes: [depois('o relatório roda como o usuário 1000', [
      { semErros: true },
      { saida: 'uid=1000 ', msg: 'o id dentro do contêiner é 1000' },
      { objeto: 'pod/relatorio', campo: 'spec.securityContext.runAsNonRoot', igual: true },
    ], { esperar: '30s', mais: [{ comando: 'kubectl exec relatorio -- id' }] })],
  }),

  problema({
    id: 'n8-somente-leitura',
    titulo: 'Disco só de leitura',
    dificuldade: 'medio',
    cluster: 'vazio',
    vidaReal: 'Lacraram as paredes do apartamento (ninguém escreve nelas), mas o nginx precisa de uma mesa para trabalhar e de um lugar para o crachá do dia.',
    limite: 'O que o programa grava no emptyDir some quando o pod sai: é só a mesa de trabalho.',
    enunciado: `
      <p>A <code>vitrine</code> (nginx) ganhou <code>readOnlyRootFilesystem: true</code> e entrou em CrashLoopBackOff.
         Veja o motivo nos logs (<code>kubectl logs deploy/vitrine</code>).</p>
      <p>Sem tirar o só leitura, dê ao nginx dois <code>emptyDir</code>: em <code>/var/cache/nginx</code> e em
         <code>/var/run</code>.</p>`,
    comoSaber: 'O pod da vitrine fica pronto, com o disco ainda só leitura.',
    dica: 'volumes: [{ name: cache, emptyDir: {} }, { name: run, emptyDir: {} }] e os volumeMounts no contêiner.',
    manual: ['pod.spec.containers.securityContext', 'pod.spec.volumes.emptyDir'],
    inicial: { 'vitrine.yaml': vitrineBlindada(false) },
    solucao: { 'vitrine.yaml': vitrineBlindada(true) },
    testes: [depois('a vitrine sobe com o disco só leitura', [
      { semErros: true },
      { pods: 'app=vitrine', prontos: 1 },
      { objeto: 'deployment/vitrine', campo: 'spec.template.spec.containers[0].securityContext.readOnlyRootFilesystem', igual: true },
    ])],
  }),

  problema({
    id: 'n8-normas-dos-bombeiros',
    titulo: 'As normas do cofre',
    dificuldade: 'dificil',
    cluster: 'cofre-restrito',
    vidaReal: 'O bloco do cofre segue a norma mais dura dos bombeiros. O guarda foi contratado, mas a portaria não deixa ele entrar do jeito que veio.',
    limite: 'Passar na norma não torna o programa seguro: só garante que ele começa sem poderes que não precisa.',
    enunciado: `
      <p>O namespace <code>cofre</code> tem <code>pod-security.kubernetes.io/enforce=restricted</code>. O Deployment
         <code>guarda</code> é criado, mas fica em <code>0/1</code>: os pods são recusados
         (<code>kubectl describe rs -n cofre</code> diz o que falta).</p>
      <p>Ajuste o <code>securityContext</code> do pod e do contêiner até o guarda subir.</p>`,
    comoSaber: '<code>kubectl get deploy -n cofre</code> mostra <code>1/1</code>.',
    dica: 'No pod: runAsNonRoot: true, runAsUser: 1000, seccompProfile.type: RuntimeDefault. No contêiner: allowPrivilegeEscalation: false e capabilities.drop: ["ALL"].',
    manual: ['pod.spec.securityContext', 'pod.spec.containers.securityContext'],
    inicial: { 'guarda.yaml': guarda(false) },
    solucao: { 'guarda.yaml': guarda(true) },
    testes: [depois('o guarda entrou no cofre', [{ semErros: true }, { pods: 'app=guarda', ns: 'cofre', prontos: 1 }])],
  }),
];
