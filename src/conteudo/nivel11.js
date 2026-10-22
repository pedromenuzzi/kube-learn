// Nível 11: os projetos finais. Cada projeto tem 5 etapas encadeadas: a etapa começa dos arquivos que o aluno deixou na
// anterior (ou da solução de referência) e acrescenta uma coisa. Os testes aplicam tudo num cluster novo.
import { licao, projeto, yaml } from './util.js';

const depois = (descricao, regras, { oculto = false, esperar = '1m', mais = [], vigiar } = {}) => ({ oculto, descricao, vigiar, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }, ...mais], regras });
const pede = (url, extra) => ({ requisicao: { de: 'pod/cliente', url, ...extra } });
const deFora = (url, extra) => ({ requisicao: { de: 'fora', url, ...extra } });

/** Um Deployment; `labels` a mais no pod, `pod` no spec do pod (recuo 6) e `ct` no contêiner (recuo 8). */
const dep = (nome, { replicas = 1, imagem = 'kubelearn/loja:1.0', porta = 8080, labels = {}, pod = '', ct = '', anotacoes = '', estrategia = '' } = {}) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${nome}
${anotacoes}spec:
  replicas: ${replicas}
${estrategia}  selector:
    matchLabels:
      app: ${labels.app ?? nome}
${Object.entries(labels).filter(([k]) => k !== 'app').map(([k, v]) => `      ${k}: ${v}\n`).join('')}  template:
    metadata:
      labels:
        app: ${labels.app ?? nome}
${Object.entries(labels).filter(([k]) => k !== 'app').map(([k, v]) => `        ${k}: ${v}\n`).join('')}    spec:
${pod}      containers:
      - name: ${nome}
        image: ${imagem}
        ports:
        - containerPort: ${porta}
${ct}`;
const svc = (nome, { porta = 80, alvo = 8080, seletor = { app: nome }, headless = false } = {}) => `apiVersion: v1
kind: Service
metadata:
  name: ${nome}
spec:
${headless ? '  clusterIP: None\n' : ''}  selector:
${Object.entries(seletor).map(([k, v]) => `    ${k}: ${v}\n`).join('')}  ports:
  - port: ${porta}
    targetPort: ${alvo}
`;
const juntar = (...docs) => docs.map((d) => d.trim()).join('\n---\n') + '\n';
const prontidao = (caminho = '/healthz', porta = 8080) => `        readinessProbe:\n          httpGet:\n            path: ${caminho}\n            port: ${porta}\n`;

// ---------- Projeto 1: a loja completa (frontend, API e Redis) ----------
const api = ({ replicas = 2, redis = false, pronta = false } = {}) => dep('api', {
  replicas,
  ct: `${redis ? '        env:\n        - name: REDIS_HOST\n          value: redis\n' : ''}${pronta ? `${prontidao()}        resources:\n          requests:\n            cpu: 100m\n            memory: 64Mi\n` : ''}`,
});
const redis = (comSvc) => juntar(dep('redis', { imagem: 'redis:7', porta: 6379 }), ...(comSvc ? [svc('redis', { porta: 6379, alvo: 6379 })] : []));
const HTML = yaml`
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: vitrine-html
  data:
    index.html: |
      <h1>Loja do kube-learn</h1>
`;
const vitrine = ({ completa = false, pronta = false } = {}) => juntar(...(completa ? [HTML] : []), dep('vitrine', {
  replicas: 2,
  imagem: 'nginx:1.27',
  porta: 80,
  pod: '      volumes:\n      - name: html\n        configMap:\n          name: vitrine-html\n',
  ct: `        volumeMounts:\n        - name: html\n          mountPath: /usr/share/nginx/html\n${pronta ? prontidao('/', 80) : ''}`,
}), ...(completa ? [svc('vitrine', { alvo: 80 })] : []));
const entrada = (comApi) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: loja
  spec:
    rules:
    - host: loja.local
      http:
        paths:
        - path: /
          pathType: Prefix
          backend:
            service:
              name: vitrine
              port:
                number: 80
${comApi ? `        - path: /api
          pathType: Prefix
          backend:
            service:
              name: api
              port:
                number: 80
` : ''}`;

// ---------- Projeto 2: o blog com banco (StatefulSet, Secret, PVC) ----------
const segredo = (completo) => (completo ? yaml`
  apiVersion: v1
  kind: Secret
  metadata:
    name: banco
  stringData:
    senha: tijolo-azul-42
` : yaml`
  apiVersion: v1
  kind: Secret
  metadata:
    name: banco
  stringData: {}
`);
const banco = ({ senha = false, servico = false, disco = false } = {}) => juntar(...(servico ? [svc('db', { porta: 5432, alvo: 5432, headless: true })] : []), `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db
  replicas: 1
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
      - name: db
        image: postgres:17
        ports:
        - containerPort: 5432
${senha ? `        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: banco
              key: senha
` : ''}${disco ? `        volumeMounts:
        - name: dados
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: dados
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 1Gi
` : ''}`);
const blog = (completo) => juntar(dep('blog', {
  replicas: 2,
  imagem: 'httpd:2.4',
  porta: 80,
  ct: completo ? '        env:\n        - name: DB_HOST\n          value: db-0.db\n        - name: DB_SENHA\n          valueFrom:\n            secretKeyRef:\n              name: banco\n              key: senha\n' : '',
}), ...(completo ? [svc('blog', { alvo: 80 })] : []));
const copia = (horario) => yaml`
  apiVersion: batch/v1
  kind: CronJob
  metadata:
    name: backup-db
  spec:
    schedule: "${horario}"
    jobTemplate:
      spec:
        template:
          spec:
            restartPolicy: OnFailure
            containers:
            - name: copia
              image: busybox:1.36
              env:
              - name: DB_HOST
                value: db-0.db
              command: ["sh", "-c", "echo copiando o banco de $DB_HOST"]
`;

// ---------- Projeto 3: deploy sem downtime ----------
const ESTRATEGIA = '  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxUnavailable: 0\n      maxSurge: 1\n';
const lojaZero = ({ servico = true, pronta = false, estrategia = false, versao = '1.0', causa = false } = {}) => juntar(dep('loja', {
  replicas: 4,
  imagem: `kubelearn/loja:${versao}`,
  anotacoes: causa ? `  annotations:\n    kubernetes.io/change-cause: "versão ${versao}"\n` : '',
  estrategia: estrategia ? ESTRATEGIA : '',
  ct: pronta ? prontidao() : '',
}), ...(servico ? [svc('loja')] : []));
const pdb = yaml`
  apiVersion: policy/v1
  kind: PodDisruptionBudget
  metadata:
    name: loja
  spec:
    minAvailable: 3
    selector:
      matchLabels:
        app: loja
`;

// ---------- Projeto 4: canário ----------
const versaoDaLoja = (n, { replicas, comSvc = true }) => juntar(dep(`loja-${n}`, { replicas, imagem: `kubelearn/loja:${n === 'v1' ? '1.0' : '1.1'}`, labels: { app: 'loja', versao: n } }), ...(comSvc ? [svc(`loja-${n}`, { seletor: { app: 'loja', versao: n } })] : []));
const rota = (pesos) => yaml`
  apiVersion: gateway.networking.k8s.io/v1
  kind: HTTPRoute
  metadata:
    name: loja
  spec:
    parentRefs:
    - name: portaria
    hostnames:
    - loja.local
    rules:
    - backendRefs:
${Object.entries(pesos).map(([n, w]) => `      - name: loja-${n}\n        port: 80\n        weight: ${w}`).join('\n')}
`;
const versao11 = (entre) => ({ distribuicao: { de: 'fora', url: 'http://loja.local', vezes: 100, corpo: '"versao":"1.1"', entre } });

// ---------- Projeto 5: Black Friday (HPA e cotas) ----------
const RECURSOS = '        resources:\n          requests:\n            cpu: 100m\n            memory: 64Mi\n          limits:\n            cpu: 500m\n            memory: 128Mi\n';
const lojaBf = (recursos) => juntar(dep('loja', { replicas: 2, ct: recursos ? RECURSOS : '' }), svc('loja'));
const hpa = (min, max, alvo) => yaml`
  apiVersion: autoscaling/v2
  kind: HorizontalPodAutoscaler
  metadata:
    name: loja
  spec:
    scaleTargetRef:
      apiVersion: apps/v1
      kind: Deployment
      name: loja
    minReplicas: ${min}
    maxReplicas: ${max}
    metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: ${alvo}
`;
const carga = (url, recursos) => yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: carga
    labels:
      app: carga
  spec:
    containers:
    - name: carga
      image: busybox:1.36
      command: ["sh", "-c", "while true; do wget -q -O- ${url} > /dev/null; done"]
${recursos ? '      resources:\n        requests:\n          cpu: 50m\n          memory: 16Mi\n        limits:\n          cpu: 100m\n          memory: 32Mi\n' : ''}`;
const teto = yaml`
  apiVersion: v1
  kind: ResourceQuota
  metadata:
    name: teto
  spec:
    hard:
      pods: "12"
      requests.cpu: "2"
      limits.memory: 2Gi
`;
const tarefa = yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: tarefa
    labels:
      app: tarefa
  spec:
    containers:
    - name: tarefa
      image: busybox:1.36
      command: ["sleep", "3600"]
`;
const padrao = yaml`
  apiVersion: v1
  kind: LimitRange
  metadata:
    name: padrao
  spec:
    limits:
    - type: Container
      defaultRequest:
        cpu: 50m
        memory: 32Mi
      default:
        cpu: 100m
        memory: 64Mi
`;

// ---------- Projeto 6: multi-equipe (namespaces, RBAC, NetworkPolicy) ----------
// Os namespaces ficam no andares.yaml: o kubectl aplica os arquivos em ordem alfabética, e eles têm de vir primeiro.
const andares = juntar(...['time-a', 'time-b'].map((ns) => `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${ns}\n`));
const noAndar = (ns, doc) => doc.replace(/^( {2}name: .*\n)/m, `$1  namespace: ${ns}\n`);
const andar = (ns) => juntar(noAndar(ns, dep('api')), noAndar(ns, svc('api')));
const cracha = (ns, quem) => yaml`
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata:
    name: dev
    namespace: ${ns}
  rules:
  - apiGroups:
    - ""
    - apps
    resources:
    - pods
    - pods/log
    - services
    - deployments
    verbs:
    - get
    - list
    - watch
    - create
    - update
    - patch
    - delete
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: dev-${quem}
    namespace: ${ns}
  subjects:
  - kind: User
    name: ${quem}
    apiGroup: rbac.authorization.k8s.io
  roleRef:
    kind: Role
    name: dev
    apiGroup: rbac.authorization.k8s.io
`;
const cotaDoAndar = (ns) => `apiVersion: v1\nkind: ResourceQuota\nmetadata:\n  name: cota\n  namespace: ${ns}\nspec:\n  hard:\n    pods: "5"\n`;
const clientes = juntar(...['time-a', 'time-b'].map((ns) => `apiVersion: v1\nkind: Pod\nmetadata:\n  name: cliente\n  namespace: ${ns}\n  labels:\n    app: cliente\nspec:\n  containers:\n  - name: cliente\n    image: busybox:1.36\n    command: ["sleep", "3600"]\n`));
const catraca = (ns, { vizinho } = {}) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: so-o-andar
    namespace: ${ns}
  spec:
    podSelector: {}
    ingress:
    - from:
      - podSelector: {}
${vizinho ? `      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: ${vizinho}
` : ''}`;
const deAndar = (de, url, status) => ({ requisicao: { de: 'pod/cliente', ns: de, url, status } });

// ---------- Projeto 7: hardening ----------
const cofre = ({ usuario = false, poderes = false, lacrado = false, ns = false, cracha: comCracha = false } = {}) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cofre
${ns ? '  namespace: cofre\n' : ''}spec:
  replicas: 1
  selector:
    matchLabels:
      app: cofre
  template:
    metadata:
      labels:
        app: cofre
    spec:
${comCracha ? '      serviceAccountName: cofre\n      automountServiceAccountToken: false\n' : ''}${usuario || poderes ? `      securityContext:
${usuario ? '        runAsNonRoot: true\n        runAsUser: 1000\n' : ''}${poderes ? '        seccompProfile:\n          type: RuntimeDefault\n' : ''}` : ''}      containers:
      - name: cofre
        image: busybox:1.36
        command: ["sleep", "3600"]
${poderes || lacrado ? `        securityContext:
${poderes ? '          allowPrivilegeEscalation: false\n          capabilities:\n            drop:\n            - ALL\n' : ''}${lacrado ? '          readOnlyRootFilesystem: true\n' : ''}` : ''}${lacrado ? `        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
` : ''}`;
const blocoCofre = 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: cofre\n  labels:\n    pod-security.kubernetes.io/enforce: restricted\n';
const isolamento = yaml`
  apiVersion: v1
  kind: ServiceAccount
  metadata:
    name: cofre
    namespace: cofre
  automountServiceAccountToken: false
  ---
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: isola
    namespace: cofre
  spec:
    podSelector:
      matchLabels:
        app: cofre
    policyTypes:
    - Ingress
    - Egress
`;

// ---------- Projeto 8: Helm e Kustomize, dev e prod ----------
const valoresDev = 'replicaCount: 1\nimage:\n  tag: "1.0"\n';
const valoresProd = (completo) => (completo ? 'replicaCount: 3\nimage:\n  tag: "1.1"\ningress:\n  enabled: true\n  host: loja.prod\n' : 'replicaCount: 1\n');
const kbase = 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n- deployment.yaml\n- service.yaml\n';
const deployBase = (comCor) => dep('loja', { ct: comCor ? '        envFrom:\n        - configMapRef:\n            name: loja-config\n' : '' });
const overlay = (ns, { replicas, tag, cor } = {}) => `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base
- namespace.yaml
namespace: ${ns}
${replicas ? `replicas:\n- name: loja\n  count: ${replicas}\n` : ''}${tag ? `images:\n- name: kubelearn/loja\n  newTag: "${tag}"\n` : ''}${cor ? `configMapGenerator:\n- name: loja-config\n  literals:\n  - COR=${cor}\n` : ''}`;
const nsYaml = (ns) => `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${ns}\n`;
const kustomizacao = ({ prod = false, cores = false } = {}) => ({
  'base/kustomization.yaml': kbase,
  'base/deployment.yaml': deployBase(cores),
  'base/service.yaml': svc('loja'),
  'overlays/dev/kustomization.yaml': overlay('dev-k', { replicas: 1, cor: cores ? 'amarelo' : null }),
  'overlays/dev/namespace.yaml': nsYaml('dev-k'),
  ...(prod ? { 'overlays/prod/kustomization.yaml': overlay('prod-k', { replicas: 3, tag: '1.1', cor: cores ? 'azul' : null }), 'overlays/prod/namespace.yaml': nsYaml('prod-k') } : {}),
});
const comK = (pasta, descricao, regras, { oculto = false, esperar = '1m' } = {}) => ({ oculto, descricao, passos: [{ comando: `kubectl apply -k ${pasta}` }, { avancar: esperar }], regras });
const noCluster = (descricao, regras) => ({ noClusterDoAluno: true, descricao, regras });

/** Os clusters de partida dos projetos (em clusters.js). */
export const PARTIDA11 = {
  cliente: yaml`
    apiVersion: v1
    kind: Pod
    metadata:
      name: cliente
    spec:
      containers:
      - name: cliente
        image: busybox:1.36
        command: ["sleep", "3600"]
  `,
};

export const NIVEL11 = [
  licao({
    id: 'n11-licao-projetos',
    titulo: 'Os projetos: tudo junto',
    vidaReal: 'Até aqui, cada missão era um cômodo. Agora é a obra inteira: fundação, paredes, instalações e acabamento, uma etapa depois da outra.',
    limite: 'Na obra de verdade, ninguém refaz a fundação a cada etapa. Aqui, os testes montam tudo de novo num cluster limpo: o que você esqueceu numa etapa aparece na próxima.',
    conteudo: `
      <p>Cada projeto tem <b>5 etapas</b>. Cada etapa <b>começa dos seus arquivos da etapa anterior</b> (se você fez; senão,
         da solução de referência) e pede uma coisa nova. Os testes aplicam todos os arquivos num cluster novo, então
         tudo o que você construiu precisa continuar funcionando.</p>
      <ul>
        <li><b>A loja completa</b>: API, Redis, vitrine e a entrada pelo Ingress.</li>
        <li><b>O blog com banco</b>: Secret, StatefulSet com disco e a cópia de segurança.</li>
        <li><b>Deploy sem downtime</b>: readiness, estratégia de rolling update e PDB.</li>
        <li><b>Canário</b>: duas versões e a divisão do tráfego pelo Gateway API.</li>
        <li><b>Black Friday</b>: requests e limits, o HPA sob carga, a cota e o LimitRange.</li>
        <li><b>Multi-equipe</b>: um namespace por equipe, RBAC, cotas e NetworkPolicy.</li>
        <li><b>Hardening</b>: sem root, sem privilégios, disco só leitura, Pod Security e o mínimo de acesso.</li>
        <li><b>Dev e prod</b>: a mesma loja em dois ambientes, pelo Helm e pelo Kustomize.</li>
      </ul>
      <p>Dica de quem faz isso todo dia: <code>kubectl apply -f .</code>, <code>kubectl get all</code> e
         <code>kubectl describe</code> resolvem quase tudo. Quando travar, a aba Solução tem a referência de cada etapa.</p>`,
  }),

  ...projeto({
    id: 'n11-loja',
    titulo: 'A loja completa',
    cluster: 'projeto-loja',
    etapas: [
      {
        titulo: 'A API e o ramal dela',
        dificuldade: 'facil',
        vidaReal: 'Primeiro, o balcão de atendimento (a API) e o ramal fixo para falar com ele.',
        limite: 'O ramal só existe para quem está dentro do condomínio: de fora, ainda ninguém chega.',
        enunciado: `<p>O <code>api.yaml</code> tem o Deployment da API com 1 réplica. Suba para <b>2 réplicas</b> e acrescente o
                    Service <code>api</code> (porta 80, para a 8080 dos pods).</p>`,
        dica: 'replicas: 2 e, no mesmo arquivo depois de um ---, o Service com selector app: api, port 80 e targetPort 8080.',
        novos: { 'api.yaml': dep('api') },
        solucao: { 'api.yaml': juntar(api(), svc('api')) },
        testes: [depois('a API atende pelo ramal', [{ semErros: true }, { pods: 'app=api', prontos: 2 }, pede('http://api', { corpo: '"app":"loja"' })])],
      },
      {
        titulo: 'O cache',
        dificuldade: 'facil',
        vidaReal: 'A API ganha uma geladeira (o Redis) para não buscar tudo no estoque toda vez.',
        limite: 'O endereço da geladeira está escrito na API (REDIS_HOST): trocar o nome do Service quebra a ligação.',
        enunciado: `<p>O <code>redis.yaml</code> tem o Deployment do Redis. Acrescente o Service <code>redis</code> (porta 6379) e,
                    no <code>api.yaml</code>, a variável <code>REDIS_HOST=redis</code> na API.</p>`,
        dica: 'Service redis: port 6379, targetPort 6379. Na API: env: [{ name: REDIS_HOST, value: redis }].',
        novos: { 'redis.yaml': redis(false) },
        solucao: { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis(true) },
        testes: [depois('a API sabe onde está o cache', [
          { semErros: true },
          { endpoints: 'svc/redis', quantidade: 1 },
          { env: { pods: 'app=api', nome: 'REDIS_HOST', igual: 'redis' } },
        ])],
      },
      {
        titulo: 'A vitrine',
        dificuldade: 'medio',
        vidaReal: 'A vitrine (o nginx) mostra a página que está no quadro de avisos (o ConfigMap).',
        limite: 'O nginx lê o arquivo do volume a cada pedido: trocar o ConfigMap muda a página uns segundos depois, sem reiniciar.',
        enunciado: `<p>O <code>vitrine.yaml</code> tem o nginx montando o ConfigMap <code>vitrine-html</code>, que não existe. Crie o
                    ConfigMap com um <code>index.html</code> que tenha <code>Loja do kube-learn</code>, e o Service
                    <code>vitrine</code> (porta 80).</p>`,
        dica: 'ConfigMap vitrine-html com data: { index.html: "<h1>Loja do kube-learn</h1>" } e o Service vitrine (port 80, targetPort 80).',
        novos: { 'vitrine.yaml': vitrine() },
        solucao: { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis(true), 'vitrine.yaml': vitrine({ completa: true }) },
        testes: [depois('a vitrine mostra a página', [{ semErros: true }, { pods: 'app=vitrine', prontos: 2 }, pede('http://vitrine', { corpo: 'Loja do kube-learn' })])],
      },
      {
        titulo: 'A porta da rua',
        dificuldade: 'medio',
        vidaReal: 'O balcão de informações da portaria: quem pede "loja.local" vai à vitrine; quem pede "/api", ao balcão da API.',
        limite: 'O Ingress escolhe pelo caminho mais longo: /api vence o / para quem pede /api/qualquer-coisa.',
        enunciado: `<p>O <code>entrada.yaml</code> leva <code>loja.local</code> à vitrine. Acrescente o caminho <code>/api</code> para o
                    Service <code>api</code>.</p>`,
        dica: 'Mais um item em paths: path /api, pathType Prefix, backend service api, port 80.',
        novos: { 'entrada.yaml': entrada(false) },
        solucao: { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis(true), 'vitrine.yaml': vitrine({ completa: true }), 'entrada.yaml': entrada(true) },
        testes: [depois('a loja abre de fora', [
          { semErros: true },
          deFora('http://loja.local/', { corpo: 'Loja do kube-learn' }),
          deFora('http://loja.local/api', { corpo: '"app":"loja"' }),
        ])],
      },
      {
        titulo: 'Pronta para o público',
        dificuldade: 'dificil',
        vidaReal: 'Antes de abrir as portas: o síndico confere quem está pronto, e cada atendente diz quanto de energia precisa.',
        limite: 'A readinessProbe só protege se a resposta for honesta: um /healthz que sempre diz ok não protege de nada.',
        enunciado: `<p>Na API: uma <b>readinessProbe</b> em <code>/healthz</code> (porta 8080) e <b>requests</b> de 100m de CPU e 64Mi de
                    memória. Na vitrine: uma readinessProbe em <code>/</code> (porta 80). Uma atualização da API não pode
                    derrubar ninguém.</p>`,
        dica: 'readinessProbe: { httpGet: { path: /healthz, port: 8080 } } e resources: { requests: { cpu: 100m, memory: 64Mi } }.',
        solucao: { 'api.yaml': juntar(api({ redis: true, pronta: true }), svc('api')), 'redis.yaml': redis(true), 'vitrine.yaml': vitrine({ completa: true, pronta: true }), 'entrada.yaml': entrada(true) },
        testes: [
          depois('as sondas e os pedidos estão no lugar', [
            { semErros: true },
            { objeto: 'deployment/api', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/healthz' },
            { objeto: 'deployment/api', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '100m' },
            { objeto: 'deployment/vitrine', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/' },
          ]),
          depois('a API troca de versão sem ninguém ficar sem resposta', [{ vigia: { maxFalhas: 0 } }], {
            oculto: true,
            vigiar: 'http://api',
            mais: [{ zerar: true }, { comando: 'kubectl set image deployment/api api=kubelearn/loja:2.1-aquece' }, { avancar: '2m' }],
          }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-blog',
    titulo: 'O blog com banco',
    etapas: [
      {
        titulo: 'O envelope da senha',
        dificuldade: 'facil',
        vidaReal: 'Antes de chamar o banco, o envelope lacrado com a senha.',
        limite: 'Lacrado não é cofre: quem pode ler Secrets no namespace lê a senha (é só base64).',
        enunciado: '<p>O <code>segredo.yaml</code> tem o Secret <code>banco</code> vazio. Ponha nele a chave <code>senha</code> (o valor que você quiser).</p>',
        dica: 'stringData: { senha: tijolo-azul-42 }',
        novos: { 'segredo.yaml': segredo(false) },
        solucao: { 'segredo.yaml': segredo(true) },
        testes: [depois('o envelope tem a senha', [{ semErros: true }, { objeto: 'secret/banco', campo: 'data.senha', existe: true }], { esperar: '5s' })],
      },
      {
        titulo: 'O banco de dados',
        dificuldade: 'medio',
        vidaReal: 'O apartamento 0 do banco, com número fixo, e a lista com o ramal direto de cada apartamento (o Service headless), que chama pelo nome.',
        limite: 'O headless não reparte as ligações: ele só dá o endereço de cada apartamento (db-0.db).',
        enunciado: `<p>O <code>banco.yaml</code> tem o StatefulSet <code>db</code> (postgres), que cai sem senha. Dê a ele a
                    <code>POSTGRES_PASSWORD</code> lida do Secret <code>banco</code> e crie o Service <b>headless</b>
                    <code>db</code> (porta 5432).</p>`,
        dica: 'env com valueFrom.secretKeyRef (name: banco, key: senha) e um Service com clusterIP: None.',
        novos: { 'banco.yaml': banco() },
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true }) },
        testes: [depois('o banco está de pé', [{ semErros: true }, { pods: 'app=db', prontos: 1 }, { objeto: 'svc/db', campo: 'spec.clusterIP', igual: 'None' }])],
      },
      {
        titulo: 'O disco do banco',
        dificuldade: 'medio',
        vidaReal: 'O apartamento 0 ganha o box dele na garagem: se o morador trocar, o box continua com as coisas.',
        limite: 'Apagar o StatefulSet não apaga o box (o PVC): o dado fica até alguém apagar o PVC.',
        enunciado: `<p>Dê ao banco um disco próprio: um <code>volumeClaimTemplates</code> <code>dados</code> de 1Gi, montado em
                    <code>/var/lib/postgresql/data</code>.</p>`,
        dica: 'volumeClaimTemplates no spec do StatefulSet e o volumeMount com o mesmo nome (dados).',
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true, disco: true }) },
        testes: [
          depois('o banco tem disco próprio', [{ semErros: true }, { objeto: 'pvc/dados-db-0', campo: 'status.phase', igual: 'Bound' }, { pods: 'app=db', prontos: 1 }], { esperar: '2m' }),
          depois('o db-0 volta com o mesmo disco (e os dados)', [{ saida: '^guardado', msg: 'o arquivo gravado antes continua lá' }, { pods: 'app=db', prontos: 1 }], {
            oculto: true,
            esperar: '2m',
            mais: [
              { comando: "kubectl exec db-0 -- sh -c 'echo guardado > /var/lib/postgresql/data/marca'" },
              { comando: 'kubectl delete pod db-0' }, { avancar: '1m' },
              { comando: 'kubectl exec db-0 -- cat /var/lib/postgresql/data/marca' },
            ],
          }),
        ],
      },
      {
        titulo: 'O blog',
        dificuldade: 'medio',
        vidaReal: 'O blog mora em outro apartamento e liga para o banco pelo endereço fixo do apartamento 0, com a senha do envelope.',
        limite: 'O endereço db-0.db aponta sempre para o mesmo pod: se o banco ganhasse réplicas, o blog não falaria com elas.',
        enunciado: `<p>O <code>blog.yaml</code> tem o Deployment do blog. Dê a ele as variáveis <code>DB_HOST=db-0.db</code> e
                    <code>DB_SENHA</code> (do Secret <code>banco</code>), e crie o Service <code>blog</code> (porta 80).</p>`,
        dica: 'env: DB_HOST com value e DB_SENHA com valueFrom.secretKeyRef; Service blog: port 80, targetPort 80.',
        novos: { 'blog.yaml': blog(false) },
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true, disco: true }), 'blog.yaml': blog(true) },
        testes: [depois('o blog acha o banco', [
          { semErros: true },
          { endpoints: 'svc/blog', quantidade: 2 },
          { env: { pods: 'app=blog', nome: 'DB_HOST', igual: 'db-0.db' } },
          { objeto: 'deployment/blog', campo: 'spec.template.spec.containers[0].env[1].valueFrom.secretKeyRef.name', igual: 'banco', msg: 'a DB_SENHA vem do Secret banco' },
        ], { esperar: '2m' })],
      },
      {
        titulo: 'A cópia de segurança',
        dificuldade: 'medio',
        vidaReal: 'Toda madrugada, às 2h, alguém copia o banco para o cofre.',
        limite: 'Cópia que nunca foi testada não é cópia: rode o Job na mão de vez em quando.',
        enunciado: `<p>O <code>backup.yaml</code> tem o CronJob <code>backup-db</code> rodando a cada minuto (para testar). Mude para
                    <b>todo dia às 2h</b>.</p>`,
        dica: 'schedule: "0 2 * * *" (minuto hora dia mês dia-da-semana).',
        novos: { 'backup.yaml': copia('* * * * *') },
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true, disco: true }), 'blog.yaml': blog(true), 'backup.yaml': copia('0 2 * * *') },
        testes: [
          depois('a cópia roda todo dia às 2h', [{ semErros: true }, { objeto: 'cronjob/backup-db', campo: 'spec.schedule', igual: '0 2 * * *' }], { esperar: '10s' }),
          depois('rodar na mão funciona', [{ objeto: 'job/teste', campo: 'status.succeeded', igual: 1 }], {
            oculto: true, esperar: '10s', mais: [{ comando: 'kubectl create job teste --from=cronjob/backup-db' }, { avancar: '1m' }],
          }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-zero',
    titulo: 'Deploy sem downtime',
    etapas: [
      {
        titulo: 'A loja e o ramal',
        dificuldade: 'facil',
        vidaReal: 'Quatro atendentes e o ramal fixo da loja.',
        limite: 'Por enquanto, o ramal manda clientes para qualquer atendente que estiver de pé, pronto ou não.',
        enunciado: '<p>O <code>loja.yaml</code> tem o Deployment da loja (4 réplicas). Acrescente o Service <code>loja</code> (porta 80 → 8080).</p>',
        dica: 'Service com selector app: loja, port 80 e targetPort 8080.',
        novos: { 'loja.yaml': lojaZero({ servico: false }) },
        solucao: { 'loja.yaml': lojaZero() },
        testes: [depois('o ramal tem 4 atendentes', [{ semErros: true }, { endpoints: 'svc/loja', quantidade: 4 }])],
      },
      {
        titulo: 'Só atende quem está pronto',
        dificuldade: 'medio',
        vidaReal: 'A versão nova da loja demora 20 segundos aquecendo. Sem perguntar se está pronta, o ramal manda clientes para quem ainda está de avental.',
        limite: 'A readiness não acelera nada: o atendente continua demorando, só não recebe ninguém antes da hora.',
        enunciado: '<p>Acrescente uma <b>readinessProbe</b> em <code>/healthz</code> (porta 8080). Os testes ocultos trocam a loja por uma versão que demora a aquecer.</p>',
        dica: 'readinessProbe: { httpGet: { path: /healthz, port: 8080 } }',
        solucao: { 'loja.yaml': lojaZero({ pronta: true }) },
        testes: [
          depois('a sonda está no lugar', [{ semErros: true }, { pods: 'app=loja', prontos: 4 }, { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/healthz' }]),
          depois('a versão que aquece não derruba ninguém', [{ vigia: { maxFalhas: 0 } }], {
            oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, { comando: 'kubectl set image deployment/loja loja=kubelearn/loja:2.1-aquece' }, { avancar: '2m' }],
          }),
        ],
      },
      {
        titulo: 'Reforma sem fechar nenhum',
        dificuldade: 'medio',
        vidaReal: 'Na reforma por etapas, abre-se um apartamento novo antes de fechar um antigo: nunca menos de 4 abertos.',
        limite: 'Sem espaço para o apartamento extra (o maxSurge), a reforma para: maxUnavailable 0 exige folga no cluster.',
        enunciado: '<p>Configure o rolling update para <b>nunca</b> ficar com menos de 4 pods prontos: <code>maxUnavailable: 0</code> e <code>maxSurge: 1</code>.</p>',
        dica: 'spec.strategy: { type: RollingUpdate, rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true }) },
        testes: [
          depois('a estratégia está no lugar', [{ semErros: true }, { objeto: 'deployment/loja', campo: 'spec.strategy.rollingUpdate.maxUnavailable', igual: 0 }]),
          depois('a atualização nunca fica abaixo de 4', [{ rollout: 'deployment/loja', minDisponivel: 4 }], {
            oculto: true, mais: [{ zerar: true }, { comando: 'kubectl set image deployment/loja loja=kubelearn/loja:1.1' }, { avancar: '2m' }],
          }),
        ],
      },
      {
        titulo: 'Elevadores garantidos',
        dificuldade: 'medio',
        vidaReal: 'Na manutenção dos prédios (o drain), pelo menos 3 atendentes continuam atendendo.',
        limite: 'O PDB não segura uma queda de energia: só as saídas planejadas (drain).',
        enunciado: '<p>Crie um <code>pdb.yaml</code> com um PodDisruptionBudget <code>loja</code> que garanta <b>pelo menos 3</b> pods prontos.</p>',
        dica: 'policy/v1, kind PodDisruptionBudget, spec: { minAvailable: 3, selector: { matchLabels: { app: loja } } }',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true }), 'pdb.yaml': pdb },
        testes: [depois('o PDB deixa sair um por vez', [{ semErros: true }, { objeto: 'pdb/loja', campo: 'status.disruptionsAllowed', igual: 1 }])],
      },
      {
        titulo: 'A versão nova, com nome',
        dificuldade: 'dificil',
        vidaReal: 'A reforma ganha uma placa ("versão 1.1") para que todo mundo saiba o que mudou, e pode ser desfeita.',
        limite: 'O change-cause é só uma anotação: escreva a verdade, porque o histórico mostra o que estiver lá.',
        enunciado: `<p>Atualize a loja para a versão <b>1.1</b> e anote o motivo no Deployment
                    (<code>kubernetes.io/change-cause: "versão 1.1"</code>), para aparecer no <code>kubectl rollout history</code>.
                    Tudo o que você fez antes continua valendo.</p>`,
        dica: 'metadata.annotations do Deployment e image: kubelearn/loja:1.1.',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true, versao: '1.1', causa: true }), 'pdb.yaml': pdb },
        testes: [
          depois('a versão 1.1, com a placa', [
            { semErros: true },
            { pods: 'app=loja', prontos: 4, imagem: 'kubelearn/loja:1.1' },
            { objeto: 'deployment/loja', campo: 'metadata.annotations["kubernetes.io/change-cause"]', regex: '1\\.1' },
          ]),
          depois('a próxima atualização também não derruba ninguém', [{ vigia: { maxFalhas: 0 } }, { rollout: 'deployment/loja', minDisponivel: 4 }], {
            oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, { comando: 'kubectl set image deployment/loja loja=kubelearn/loja:2.1-aquece' }, { avancar: '2m' }],
          }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-canario',
    titulo: 'Canário',
    cluster: 'projeto-canario',
    etapas: [
      {
        titulo: 'A versão estável',
        dificuldade: 'facil',
        vidaReal: 'A loja de sempre, com a etiqueta da versão na porta de cada apartamento.',
        limite: 'A label versao é só uma etiqueta: o Kubernetes não sabe o que é uma versão; quem usa são os seletores.',
        enunciado: `<p>O <code>v1.yaml</code> tem a <code>loja-v1</code> (3 réplicas, labels <code>app: loja</code> e
                    <code>versao: v1</code>). Crie o Service <code>loja-v1</code> que escolha só os pods da v1.</p>`,
        dica: 'selector: { app: loja, versao: v1 }',
        novos: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3, comSvc: false }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }) },
        testes: [depois('a v1 atende pelo ramal dela', [{ semErros: true }, { endpoints: 'svc/loja-v1', quantidade: 3 }])],
      },
      {
        titulo: 'O canário',
        dificuldade: 'medio',
        vidaReal: 'Um único apartamento com a reforma nova, para ver se alguém reclama antes de reformar o prédio todo.',
        limite: 'Um canário com poucas visitas demora a mostrar defeito: dê tempo (e tráfego) antes de decidir.',
        enunciado: `<p>O <code>v2.yaml</code> tem a <code>loja-v2</code> (versão 1.1, 1 réplica, <code>versao: v2</code>). Crie o
                    Service <code>loja-v2</code>, que escolha só a v2.</p>`,
        dica: 'O mesmo Service da v1, com versao: v2.',
        novos: { 'v2.yaml': versaoDaLoja('v2', { replicas: 1, comSvc: false }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 1 }) },
        testes: [depois('cada versão com o seu ramal', [{ semErros: true }, { endpoints: 'svc/loja-v2', quantidade: 1 }, { endpoints: 'svc/loja-v1', quantidade: 3 }])],
      },
      {
        titulo: '10% para o canário',
        dificuldade: 'medio',
        vidaReal: 'A placa da portaria manda 1 em cada 10 visitantes para o apartamento reformado.',
        limite: 'O peso é por conexão, não por pessoa: o mesmo cliente pode cair ora numa versão, ora na outra.',
        enunciado: `<p>O <code>rota.yaml</code> manda tudo de <code>loja.local</code> para a v1. Divida: <b>90</b> para a
                    <code>loja-v1</code> e <b>10</b> para a <code>loja-v2</code>.</p>`,
        dica: 'backendRefs: [{ name: loja-v1, port: 80, weight: 90 }, { name: loja-v2, port: 80, weight: 10 }]',
        novos: { 'rota.yaml': rota({ v1: 100 }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 1 }), 'rota.yaml': rota({ v1: 90, v2: 10 }) },
        testes: [depois('uns 10% chegam na versão 1.1', [{ semErros: true }, versao11([5, 15])])],
      },
      {
        titulo: 'Meio a meio',
        dificuldade: 'medio',
        vidaReal: 'Ninguém reclamou: metade dos visitantes já vai para a reforma.',
        limite: 'Meio a meio com 3 pods de um lado e 1 do outro: o pod da v2 recebe a mesma carga que os 3 da v1 juntos.',
        enunciado: '<p>Passe para <b>50/50</b> e, como a v2 vai receber muito mais visitas, suba a <code>loja-v2</code> para <b>3 réplicas</b>.</p>',
        dica: 'weight: 50 nos dois e replicas: 3 no v2.yaml.',
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 3 }), 'rota.yaml': rota({ v1: 50, v2: 50 }) },
        testes: [depois('metade na versão 1.1', [{ semErros: true }, versao11([40, 60]), { pods: 'versao=v2', prontos: 3 }])],
      },
      {
        titulo: 'A promoção',
        dificuldade: 'medio',
        vidaReal: 'A reforma foi aprovada: todo mundo para os apartamentos novos, e os antigos fecham.',
        limite: 'Depois de apagar a v1, voltar atrás é subir a v1 de novo: guarde o YAML dela até ter certeza.',
        enunciado: '<p>Mande <b>todo</b> o tráfego para a v2 e desligue a v1 (tire o <code>v1.yaml</code> e a v1 da rota).</p>',
        dica: 'Uma regra só com a loja-v2 (weight 100, ou sem weight) e apague o arquivo v1.yaml.',
        solucao: { 'v2.yaml': versaoDaLoja('v2', { replicas: 3 }), 'rota.yaml': rota({ v2: 100 }) },
        testes: [depois('todo mundo na versão 1.1', [{ semErros: true }, versao11([100, 100]), { pods: 'versao=v1', quantidade: 0 }])],
      },
    ],
  }),

  ...projeto({
    id: 'n11-bf',
    titulo: 'Black Friday',
    cluster: 'projeto-black-friday',
    etapas: [
      {
        titulo: 'O consumo declarado',
        dificuldade: 'facil',
        vidaReal: 'Antes da Black Friday, cada atendente diz quanta energia precisa (request) e o máximo que pode puxar (limit).',
        limite: 'O request é uma reserva, não uma medida: o pod pode gastar menos (desperdício) ou mais (até o limit).',
        enunciado: '<p>Dê à loja <b>requests</b> de 100m de CPU e 64Mi de memória e <b>limits</b> de 500m e 128Mi.</p>',
        dica: 'resources: { requests: { cpu: 100m, memory: 64Mi }, limits: { cpu: 500m, memory: 128Mi } }',
        novos: { 'loja.yaml': lojaBf(false) },
        solucao: { 'loja.yaml': lojaBf(true) },
        testes: [depois('o consumo está declarado', [
          { semErros: true },
          { pods: 'app=loja', prontos: 2 },
          { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '100m' },
          { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].resources.limits.memory', igual: '128Mi' },
        ])],
      },
      {
        titulo: 'As regras do gerente',
        dificuldade: 'medio',
        vidaReal: 'O gerente contrata temporários quando os atendentes passam de metade da capacidade, e dispensa depois.',
        limite: 'Ele só olha a CPU: se o gargalo for o banco, contratar atendentes não ajuda.',
        enunciado: '<p>O <code>hpa.yaml</code> tem um HPA tímido. Ajuste: mínimo <b>2</b>, máximo <b>8</b>, alvo de <b>50%</b> de CPU.</p>',
        dica: 'minReplicas: 2, maxReplicas: 8, averageUtilization: 50',
        novos: { 'hpa.yaml': hpa(1, 3, 80) },
        solucao: { 'loja.yaml': lojaBf(true), 'hpa.yaml': hpa(2, 8, 50) },
        testes: [depois('o gerente sabe as regras', [
          { semErros: true },
          { objeto: 'hpa/loja', campo: 'spec.minReplicas', igual: 2 },
          { objeto: 'hpa/loja', campo: 'spec.maxReplicas', igual: 8 },
          { objeto: 'hpa/loja', campo: 'spec.metrics[0].resource.target.averageUtilization', igual: 50 },
        ])],
      },
      {
        titulo: 'A promoção começou',
        dificuldade: 'medio',
        vidaReal: 'Os clientes chegam aos montes: o gerente vê os atendentes no limite e chama os temporários.',
        limite: 'O HPA reage, não prevê: os primeiros minutos da promoção ainda pegam a loja pequena.',
        enunciado: `<p>O <code>trafego.yaml</code> tem o pod <code>carga</code>, um cliente que pede a loja sem parar, mas o endereço está errado (veja os logs dele).
                    Conserte e veja o HPA crescer (<code>kubectl get hpa -w</code>, com uns <b>+30s</b>).</p>`,
        dica: 'kubectl logs carga (bad address). O Service se chama loja: http://loja',
        novos: { 'trafego.yaml': carga('http://lojas', false) },
        solucao: { 'loja.yaml': lojaBf(true), 'hpa.yaml': hpa(2, 8, 50), 'trafego.yaml': carga('http://loja', false) },
        testes: [depois('o gerente contratou temporários', [
          { semErros: true },
          { objeto: 'hpa/loja', campo: 'status.desiredReplicas', regex: '^[3-8]$', msg: 'o HPA pediu mais de 2 réplicas' },
        ], { esperar: '3m' })],
      },
      {
        titulo: 'O teto da empresa',
        dificuldade: 'medio',
        vidaReal: 'A administração pôs um teto na energia da empresa: e, com teto, todo aparelho que entra precisa da etiqueta de consumo.',
        limite: 'A cota recusa quem chega sem etiqueta, inclusive o cliente de teste: é por isso que ela vem junto do LimitRange.',
        enunciado: `<p>Aplique a cota <code>teto</code> do <code>cota.yaml</code>. Com cota de CPU e memória, todo contêiner precisa de
                    requests e limits: dê ao pod <code>carga</code> requests de 50m e 16Mi e limits de 100m e 32Mi.</p>`,
        dica: 'O trafego.yaml ganha resources; a cota já está pronta. O kubectl aplica os arquivos em ordem alfabética: a cota (cota.yaml) chega antes do pod.',
        novos: { 'cota.yaml': teto },
        solucao: { 'loja.yaml': lojaBf(true), 'hpa.yaml': hpa(2, 8, 50), 'trafego.yaml': carga('http://loja', true), 'cota.yaml': teto },
        testes: [depois('tudo dentro do teto', [
          { semErros: true },
          { pods: 'app=carga', prontos: 1 },
          { objeto: 'quota/teto', campo: 'spec.hard.pods', igual: '12' },
        ])],
      },
      {
        titulo: 'O padrão da administração',
        dificuldade: 'medio',
        vidaReal: 'Para não barrar quem esquece a etiqueta, a administração cola uma etiqueta padrão em quem chega sem.',
        limite: 'O padrão vale só para os pods novos: quem já estava rodando não ganha a etiqueta.',
        enunciado: `<p>O <code>tarefa.yaml</code> é um pod sem resources, recusado pela cota. Em vez de mexer nele, crie um
                    <b>LimitRange</b> <code>padrao</code> com <code>defaultRequest</code> de 50m e 32Mi e <code>default</code>
                    (limits) de 100m e 64Mi.</p>`,
        dica: 'kind: LimitRange, spec.limits: [{ type: Container, defaultRequest: {...}, default: {...} }]. O LimitRange tem de existir antes do pod: ponha-o no cota.yaml.',
        novos: { 'tarefa.yaml': tarefa },
        solucao: { 'loja.yaml': lojaBf(true), 'hpa.yaml': hpa(2, 8, 50), 'trafego.yaml': carga('http://loja', true), 'cota.yaml': `${padrao}---\n${teto}`, 'tarefa.yaml': tarefa },
        testes: [depois('a tarefa ganhou o padrão e entrou', [
          { pods: 'app=tarefa', prontos: 1 },
          { objeto: 'pod/tarefa', campo: 'spec.containers[0].resources.requests.cpu', igual: '50m' },
        ])],
      },
    ],
  }),

  ...projeto({
    id: 'n11-equipes',
    titulo: 'Multi-equipe',
    etapas: [
      {
        titulo: 'Os andares das equipes',
        dificuldade: 'facil',
        vidaReal: 'Cada equipe aluga um andar (o namespace), com a sua API e o seu ramal.',
        limite: 'O andar sozinho não isola nada: sem crachás e catracas, qualquer um anda por todos.',
        enunciado: `<p>O <code>andares.yaml</code> cria os namespaces <code>time-a</code> e <code>time-b</code>, e o
                    <code>time-a.yaml</code> põe a API da equipe A (Deployment e Service) no andar dela. O <code>time-b.yaml</code>
                    está vazio: escreva a API e o Service da equipe B, iguais aos da A.</p>`,
        dica: 'Copie o time-a.yaml trocando o namespace para time-b.',
        novos: { 'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': '# A API e o Service da equipe B (como no time-a.yaml).\n' },
        solucao: { 'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': andar('time-b') },
        testes: [depois('as duas equipes no ar', [{ semErros: true }, { pods: 'app=api', ns: 'time-a', prontos: 1 }, { pods: 'app=api', ns: 'time-b', prontos: 1 }])],
      },
      {
        titulo: 'Os crachás',
        dificuldade: 'medio',
        vidaReal: 'A ana tem o crachá do andar A; o bruno, do andar B. Nenhum abre a porta do outro.',
        limite: 'O crachá dev deixa apagar tudo no andar: para quem só olha, um crachá de leitura.',
        enunciado: '<p>O <code>crachas.yaml</code> dá à <b>ana</b> o papel <code>dev</code> no <code>time-a</code>. Faça o mesmo para o <b>bruno</b> no <code>time-b</code>.</p>',
        dica: 'Uma Role dev e um RoleBinding dev-bruno no namespace time-b.',
        novos: { 'crachas.yaml': cracha('time-a', 'ana') },
        solucao: { 'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': andar('time-b'), 'crachas.yaml': juntar(cracha('time-a', 'ana'), cracha('time-b', 'bruno')) },
        testes: [depois('cada um no seu andar', [
          { semErros: true },
          { pode: { quem: 'ana', verbo: 'update', recurso: 'deployments', ns: 'time-a', resposta: true } },
          { pode: { quem: 'ana', verbo: 'update', recurso: 'deployments', ns: 'time-b', resposta: false } },
          { pode: { quem: 'bruno', verbo: 'update', recurso: 'deployments', ns: 'time-b', resposta: true } },
          { pode: { quem: 'bruno', verbo: 'list', recurso: 'pods', ns: 'time-a', resposta: false } },
        ], { esperar: '10s' })],
      },
      {
        titulo: 'As cotas',
        dificuldade: 'medio',
        vidaReal: 'Cada equipe pode ter até 5 apartamentos no condomínio.',
        limite: 'A cota conta os pods que existem: um rollout com maxSurge precisa de folga para o pod extra.',
        enunciado: '<p>O <code>cotas.yaml</code> limita o <code>time-a</code> a 5 pods. Faça o mesmo no <code>time-b</code>.</p>',
        dica: 'Outra ResourceQuota cota, no namespace time-b, com hard.pods: "5".',
        novos: { 'cotas.yaml': cotaDoAndar('time-a') },
        solucao: { 'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': andar('time-b'), 'crachas.yaml': juntar(cracha('time-a', 'ana'), cracha('time-b', 'bruno')), 'cotas.yaml': juntar(cotaDoAndar('time-a'), cotaDoAndar('time-b')) },
        testes: [depois('as duas cotas', [{ semErros: true }, { objeto: 'quota/cota', ns: 'time-a', campo: 'spec.hard.pods', igual: '5' }, { objeto: 'quota/cota', ns: 'time-b', campo: 'spec.hard.pods', igual: '5' }], { esperar: '10s' })],
      },
      {
        titulo: 'Cada um no seu andar',
        dificuldade: 'medio',
        vidaReal: 'As catracas de cada andar só deixam entrar quem é do próprio andar.',
        limite: 'Quem tem o crachá do andar (RBAC) pode mudar as catracas dele: catraca é rede, crachá é API.',
        enunciado: `<p>O <code>catracas.yaml</code> fecha o <code>time-a</code> para quem não é de lá (só passam pods do próprio
                    namespace). Faça o mesmo no <code>time-b</code>. O <code>clientes.yaml</code> põe um cliente em cada andar para
                    os testes.</p>`,
        dica: 'A mesma NetworkPolicy so-o-andar no namespace time-b.',
        novos: { 'catracas.yaml': catraca('time-a'), 'clientes.yaml': clientes },
        solucao: {
          'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': andar('time-b'), 'crachas.yaml': juntar(cracha('time-a', 'ana'), cracha('time-b', 'bruno')),
          'cotas.yaml': juntar(cotaDoAndar('time-a'), cotaDoAndar('time-b')), 'catracas.yaml': juntar(catraca('time-a'), catraca('time-b')), 'clientes.yaml': clientes,
        },
        testes: [depois('cada um no seu andar', [
          { semErros: true },
          deAndar('time-a', 'http://api', 200),
          deAndar('time-a', 'http://api.time-b', 'timeout'),
          deAndar('time-b', 'http://api.time-a', 'timeout'),
        ])],
      },
      {
        titulo: 'A API compartilhada',
        dificuldade: 'dificil',
        vidaReal: 'A equipe B abre a porta da API dela para a equipe A (e só para ela).',
        limite: 'Liberar o andar inteiro libera qualquer pod que a equipe A criar lá: aperte com um podSelector se precisar.',
        enunciado: '<p>Deixe os pods do <code>time-a</code> chamarem a API do <code>time-b</code> (um <code>namespaceSelector</code> na catraca do time-b). O contrário continua fechado.</p>',
        dica: 'Na so-o-andar do time-b: mais um item no from, com namespaceSelector { kubernetes.io/metadata.name: time-a }.',
        solucao: {
          'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': andar('time-b'), 'crachas.yaml': juntar(cracha('time-a', 'ana'), cracha('time-b', 'bruno')),
          'cotas.yaml': juntar(cotaDoAndar('time-a'), cotaDoAndar('time-b')), 'catracas.yaml': juntar(catraca('time-a'), catraca('time-b', { vizinho: 'time-a' })), 'clientes.yaml': clientes,
        },
        testes: [depois('a A chama a B; a B não chama a A', [
          { semErros: true },
          deAndar('time-a', 'http://api.time-b', 200),
          deAndar('time-b', 'http://api.time-a', 'timeout'),
        ])],
      },
    ],
  }),

  ...projeto({
    id: 'n11-cofre',
    titulo: 'Hardening',
    etapas: [
      {
        titulo: 'O cofre sem a chave mestra',
        dificuldade: 'facil',
        vidaReal: 'O programa do cofre roda com a chave de um morador comum, nunca com a mestra.',
        limite: 'Rodar sem root limita o estrago, mas não substitui atualizar a imagem com as correções de segurança.',
        enunciado: '<p>Faça o <code>cofre</code> rodar como o usuário <b>1000</b> e recusar root (<code>runAsNonRoot</code>), no securityContext do pod.</p>',
        dica: 'spec.template.spec.securityContext: { runAsNonRoot: true, runAsUser: 1000 }',
        novos: { 'cofre.yaml': cofre() },
        solucao: { 'cofre.yaml': cofre({ usuario: true }) },
        testes: [depois('o cofre roda como 1000', [{ saida: 'uid=1000 ' }], { mais: [{ comando: 'kubectl exec deploy/cofre -- id' }] })],
      },
      {
        titulo: 'Sem superpoderes',
        dificuldade: 'medio',
        vidaReal: 'Além de não ter a chave mestra, o morador não pode pedir uma emprestada (escalar privilégios), e abre mão das ferramentas especiais.',
        limite: 'O seccomp RuntimeDefault bloqueia chamadas raras ao sistema: um programa esquisito pode precisar de um perfil próprio.',
        enunciado: '<p>No contêiner: <code>allowPrivilegeEscalation: false</code> e <code>capabilities.drop: ["ALL"]</code>. No pod: <code>seccompProfile.type: RuntimeDefault</code>.</p>',
        dica: 'Veja o projeto das normas do cofre (nível 8): são exatamente os campos do restricted.',
        solucao: { 'cofre.yaml': cofre({ usuario: true, poderes: true }) },
        testes: [depois('sem superpoderes', [
          { semErros: true },
          { objeto: 'deployment/cofre', campo: 'spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation', igual: false },
          { objeto: 'deployment/cofre', campo: 'spec.template.spec.containers[0].securityContext.capabilities.drop', igual: ['ALL'] },
          { objeto: 'deployment/cofre', campo: 'spec.template.spec.securityContext.seccompProfile.type', igual: 'RuntimeDefault' },
        ])],
      },
      {
        titulo: 'Paredes lacradas',
        dificuldade: 'medio',
        vidaReal: 'As paredes do cofre ficam lacradas; o programa só escreve na mesa de trabalho (o /tmp).',
        limite: 'O /tmp é um emptyDir: o que fica lá some quando o pod sai.',
        enunciado: '<p>Disco do contêiner só leitura (<code>readOnlyRootFilesystem</code>) e um <code>emptyDir</code> em <code>/tmp</code>.</p>',
        dica: 'readOnlyRootFilesystem: true no securityContext do contêiner; volumes: [{ name: tmp, emptyDir: {} }] e o volumeMount em /tmp.',
        solucao: { 'cofre.yaml': cofre({ usuario: true, poderes: true, lacrado: true }) },
        testes: [
          depois('a mesa aceita escrita', [{ semErros: true, msg: 'escrever em /tmp funciona' }], { mais: [{ comando: 'kubectl exec deploy/cofre -- touch /tmp/ok' }] }),
          depois('as paredes não aceitam', [
            { saida: 'Read-only file system', msg: 'escrever em / é recusado' },
            { objeto: 'deployment/cofre', campo: 'spec.template.spec.containers[0].securityContext.readOnlyRootFilesystem', igual: true },
          ], { mais: [{ comando: 'kubectl exec deploy/cofre -- touch /x' }] }),
        ],
      },
      {
        titulo: 'As normas do bloco',
        dificuldade: 'medio',
        vidaReal: 'O cofre muda para o bloco com a norma mais dura dos bombeiros: como já está em dia, entra sem problema.',
        limite: 'A norma só confere os pods novos: um pod antigo, criado antes do rótulo, continua rodando.',
        enunciado: '<p>O <code>bloco.yaml</code> cria o namespace <code>cofre</code> com <code>enforce=restricted</code>. Mude o Deployment para esse namespace.</p>',
        dica: 'metadata.namespace: cofre no Deployment.',
        novos: { 'bloco.yaml': blocoCofre },
        solucao: { 'bloco.yaml': blocoCofre, 'cofre.yaml': cofre({ usuario: true, poderes: true, lacrado: true, ns: true }) },
        testes: [depois('o cofre passou pelos bombeiros', [{ semErros: true }, { pods: 'app=cofre', ns: 'cofre', prontos: 1 }])],
      },
      {
        titulo: 'O crachá mínimo',
        dificuldade: 'dificil',
        vidaReal: 'O cofre não precisa falar com a administração: fica sem crachá de máquina, e as catracas fecham a entrada e a saída dele.',
        limite: 'Sem saída nenhuma, nem o DNS funciona: se o programa precisar de algo de fora, libere só aquilo.',
        enunciado: `<p>O <code>isola.yaml</code> cria a ServiceAccount <code>cofre</code> (sem token) e uma NetworkPolicy que fecha
                    entrada e saída. Faça o Deployment usar essa ServiceAccount, sem montar o token
                    (<code>automountServiceAccountToken: false</code>).</p>`,
        dica: 'No spec do pod: serviceAccountName: cofre e automountServiceAccountToken: false.',
        novos: { 'isola.yaml': isolamento },
        solucao: { 'bloco.yaml': blocoCofre, 'cofre.yaml': cofre({ usuario: true, poderes: true, lacrado: true, ns: true, cracha: true }), 'isola.yaml': isolamento },
        testes: [depois('o cofre isolado', [
          { semErros: true },
          { pods: 'app=cofre', ns: 'cofre', prontos: 1 },
          { objeto: 'deployment/cofre', ns: 'cofre', campo: 'spec.template.spec.serviceAccountName', igual: 'cofre' },
          { objeto: 'deployment/cofre', ns: 'cofre', campo: 'spec.template.spec.automountServiceAccountToken', igual: false },
        ])],
      },
    ],
  }),

  ...projeto({
    id: 'n11-ambientes',
    titulo: 'Helm e Kustomize, dev e prod',
    cluster: 'helm-repo',
    etapas: [
      {
        titulo: 'A loja de dev pelo Helm',
        dificuldade: 'facil',
        terminal: true,
        vidaReal: 'O mesmo projeto padrão da construtora, com os acabamentos de cada cidade num arquivo.',
        limite: 'O values.yaml de cada ambiente é código: guarde no git, junto com o resto.',
        enunciado: '<p>O <code>dev.yaml</code> tem os valores de dev. <b>Pelo terminal</b>, instale a release <code>loja-dev</code> do <code>kube-learn/loja</code> com eles, no namespace <code>dev</code> (que ainda não existe).</p>',
        dica: 'helm install loja-dev kube-learn/loja -f dev.yaml -n dev --create-namespace',
        novos: { 'dev.yaml': valoresDev },
        solucao: { 'dev.yaml': valoresDev },
        solucaoTerminal: ['helm install loja-dev kube-learn/loja -f dev.yaml -n dev --create-namespace'],
        testes: [noCluster('a loja de dev', [{ release: { nome: 'loja-dev', ns: 'dev', status: 'deployed' } }, { pods: 'app.kubernetes.io/instance=loja-dev', ns: 'dev', prontos: 1 }])],
      },
      {
        titulo: 'A loja de prod pelo Helm',
        dificuldade: 'medio',
        terminal: true,
        vidaReal: 'A filial grande: mais atendentes, a versão nova e um balcão na rua.',
        limite: 'Dois arquivos de valores divergem com o tempo: o que não precisa ser diferente, deixe nos padrões do chart.',
        enunciado: '<p>Complete o <code>prod.yaml</code>: 3 réplicas, tag <code>"1.1"</code> e o Ingress ligado com o host <code>loja.prod</code>. Instale a release <code>loja-prod</code> no namespace <code>prod</code>.</p>',
        dica: 'replicaCount, image.tag e ingress: { enabled: true, host: loja.prod }. helm install loja-prod kube-learn/loja -f prod.yaml -n prod --create-namespace',
        novos: { 'prod.yaml': valoresProd(false) },
        solucao: { 'dev.yaml': valoresDev, 'prod.yaml': valoresProd(true) },
        solucaoTerminal: ['helm install loja-prod kube-learn/loja -f prod.yaml -n prod --create-namespace'],
        testes: [noCluster('a loja de prod', [
          { release: { nome: 'loja-prod', ns: 'prod', status: 'deployed' } },
          { pods: 'app.kubernetes.io/instance=loja-prod', ns: 'prod', prontos: 3, imagem: 'kubelearn/loja:1.1' },
          { objeto: 'ingress/loja-prod', ns: 'prod', campo: 'spec.rules[0].host', igual: 'loja.prod' },
        ])],
      },
      {
        titulo: 'A mesma loja, com Kustomize',
        dificuldade: 'medio',
        vidaReal: 'Outra equipe prefere a planta comum com folhas de ajuste: a base é YAML puro.',
        limite: 'Helm e Kustomize juntos no mesmo objeto brigam: escolha um por aplicação.',
        enunciado: '<p>A pasta <code>base/</code> tem o Deployment e o Service da loja, mas o <code>base/kustomization.yaml</code> ainda não lista nada. Liste os dois em <code>resources</code>. O overlay <code>overlays/dev</code> já usa a base.</p>',
        dica: 'resources: [deployment.yaml, service.yaml]',
        novos: { ...kustomizacao(), 'base/kustomization.yaml': 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: []\n' },
        solucao: { 'dev.yaml': valoresDev, 'prod.yaml': valoresProd(true), ...kustomizacao() },
        testes: [comK('overlays/dev', 'o overlay de dev monta a base', [{ semErros: true }, { pods: 'app=loja', ns: 'dev-k', prontos: 1 }, { objeto: 'svc/loja', ns: 'dev-k', existe: true }])],
      },
      {
        titulo: 'O overlay de prod',
        dificuldade: 'medio',
        vidaReal: 'A folha de ajustes da filial grande: o bairro dela, mais atendentes e a versão nova.',
        limite: 'Os overlays só enxergam a base: um ajuste que todos querem vai na base, não copiado em cada folha.',
        enunciado: '<p>O overlay <code>overlays/prod</code> só junta a base e o namespace <code>prod-k</code>. Complete o <code>kustomization.yaml</code> dele: tudo no namespace <code>prod-k</code>, 3 réplicas e a imagem na tag <code>1.1</code>. Use o de dev como modelo.</p>',
        novos: { 'overlays/prod/kustomization.yaml': 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n- ../../base\n- namespace.yaml\n', 'overlays/prod/namespace.yaml': nsYaml('prod-k') },
        dica: 'resources: [../../base, namespace.yaml], namespace: prod-k, replicas: [{ name: loja, count: 3 }], images: [{ name: kubelearn/loja, newTag: "1.1" }]',
        solucao: { 'dev.yaml': valoresDev, 'prod.yaml': valoresProd(true), ...kustomizacao({ prod: true }) },
        testes: [comK('overlays/prod', 'prod com 3 réplicas da 1.1', [{ semErros: true }, { pods: 'app=loja', ns: 'prod-k', prontos: 3, imagem: 'kubelearn/loja:1.1' }])],
      },
      {
        titulo: 'A cor de cada cidade',
        dificuldade: 'medio',
        vidaReal: 'Cada filial pinta a vitrine de uma cor: o quadro de avisos de cada uma é gerado na folha dela.',
        limite: 'O hash muda o nome do ConfigMap a cada mudança: quem usa o nome fixo em outro lugar (um script) se perde.',
        enunciado: `<p>Faça a base ler o ConfigMap <code>loja-config</code> (um <code>envFrom</code> no Deployment) e gere esse ConfigMap
                    em cada overlay: <code>COR=amarelo</code> em dev e <code>COR=azul</code> em prod.</p>`,
        dica: 'Na base: envFrom: [{ configMapRef: { name: loja-config } }]. Em cada overlay: configMapGenerator: [{ name: loja-config, literals: [COR=...] }].',
        solucao: { 'dev.yaml': valoresDev, 'prod.yaml': valoresProd(true), ...kustomizacao({ prod: true, cores: true }) },
        testes: [
          comK('overlays/dev', 'dev é amarelo', [{ semErros: true }, { env: { pods: 'app=loja', ns: 'dev-k', nome: 'COR', igual: 'amarelo' } }]),
          comK('overlays/prod', 'prod é azul', [{ semErros: true }, { env: { pods: 'app=loja', ns: 'prod-k', nome: 'COR', igual: 'azul' } }]),
        ],
      },
    ],
  }),

  licao({
    id: 'n11-licao-proximos-passos',
    titulo: 'E agora? Um cluster de verdade',
    vidaReal: 'Você treinou no condomínio-modelo. Agora é visitar uma obra de verdade: o mesmo kubectl, os mesmos YAMLs, só que com contêineres de verdade rodando.',
    limite: 'O simulador imitou a saída do kubectl contra um kind de verdade, mas é um simulador: no cluster real, imagens demoram, redes falham de jeitos novos e os erros não vêm com explicação em português.',
    conteudo: `
      <p>Tudo o que você fez aqui funciona num cluster de verdade: os comandos e os YAMLs são os mesmos. Três jeitos de
         começar, do mais simples ao mais completo:</p>
      <h2>Killercoda (no navegador)</h2>
      <p>Um cluster de verdade, de graça, por uma hora, sem instalar nada: <a href="https://killercoda.com/playgrounds" target="_blank" rel="noopener">killercoda.com/playgrounds</a>.
         Bom para repetir as missões daqui com contêineres reais.</p>
      <h2>kind (no seu computador)</h2>
      <p>O mesmo que conferiu as saídas deste site: um cluster dentro do Docker.</p>
      <pre><code># com o Docker instalado
kind create cluster --name estudo
kubectl get nodes
kubectl apply -f loja.yaml
kind delete cluster --name estudo</code></pre>
      <p>Para 3 nodes como aqui, um arquivo de configuração com um <code>control-plane</code> e dois <code>worker</code>.</p>
      <h2>minikube</h2>
      <p>Outro cluster local, com extras prontos (<code>minikube addons enable metrics-server</code>,
         <code>minikube dashboard</code>). Cuidado com o addon <code>ingress</code>: ele instala o ingress-nginx, aposentado
         em 2026 (nível 3). Para a portaria, prefira o <b>Gateway API</b>: instale as CRDs dele e uma implementação, como o
         Envoy Gateway ou o Traefik.</p>
      <h2>Para onde ir</h2>
      <ul>
        <li>A documentação oficial, em português: <a href="https://kubernetes.io/pt-br/docs/home/" target="_blank" rel="noopener">kubernetes.io/pt-br</a>.</li>
        <li>Se quiser uma certificação, a <b>CKAD</b> cobre quase tudo desta trilha (a prova é prática, num terminal, com
            acesso à documentação).</li>
        <li>Monte o seu projeto: pegue uma aplicação sua e escreva os manifestos do zero. É lá que você vê o que aprendeu.</li>
      </ul>
      <p>Obrigado por embarcar. O navio está carregado. 🚢</p>`,
  }),
];
