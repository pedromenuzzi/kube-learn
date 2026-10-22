// Nível 11: os projetos finais. Cada projeto tem 5 etapas encadeadas: a etapa começa dos arquivos que o aluno deixou na
// anterior (ou da solução de referência) e acrescenta uma coisa. Os testes aplicam tudo num cluster novo.
// Cada etapa pede algo novo para pensar (um conceito, um defeito diferente para achar, uma decisão), e a última de cada
// projeto é um ticket: só o pedido e os critérios de aceite, sem o passo a passo.
import { licao, projeto, yaml } from './util.js';

const depois = (descricao, regras, { oculto = false, esperar = '1m', mais = [], vigiar } = {}) => ({ oculto, descricao, vigiar, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }, ...mais], regras });
const pede = (url, extra) => ({ requisicao: { de: 'pod/cliente', url, ...extra } });
const deFora = (url, extra) => ({ requisicao: { de: 'fora', url, ...extra } });

/** O enunciado de um ticket: o pedido de quem abriu e os critérios de aceite (o que precisa ser verdade no fim). */
const ticket = (quem, pedido, criterios) => `<blockquote class="relato"><p>${pedido}</p><footer>${quem}</footer></blockquote>
                    <p><b>Critérios de aceite.</b> O como é com você; parte dos critérios é conferida por testes ocultos.</p>
                    <ul>${criterios.map((c) => `<li>${c}</li>`).join('')}</ul>`;

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
const NS = (ns) => `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${ns}\n`;
/** Um PodDisruptionBudget loja: o mínimo de pods prontos durante uma manutenção. */
const pdb = (minimo, labels = { app: 'loja' }) => `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: loja
spec:
  minAvailable: ${minimo}
  selector:
    matchLabels:
${Object.entries(labels).map(([k, v]) => `      ${k}: ${v}\n`).join('')}`;
const drenar = { comando: 'kubectl drain node-1 --ignore-daemonsets --timeout=2m' };

// ---------- Projeto 1: a loja completa (frontend, API e Redis) ----------
const api = ({ replicas = 2, redis = false, pronta = false } = {}) => dep('api', {
  replicas,
  ct: `${redis ? '        env:\n        - name: REDIS_HOST\n          value: redis\n' : ''}${pronta ? `${prontidao()}        resources:\n          requests:\n            cpu: 100m\n            memory: 64Mi\n` : ''}`,
});
/** O Redis e o ramal dele; `seletor` é o app que o Service procura (o colega escreveu "cache"). */
const redis = (seletor = 'redis') => juntar(dep('redis', { imagem: 'redis:7', porta: 6379 }), svc('redis', { porta: 6379, alvo: 6379, seletor: { app: seletor } }));
const HTML = yaml`
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: vitrine-html
  data:
    index.html: |
      <h1>Loja do kube-learn</h1>
`;
const vitrine = ({ html = false, pronta = false } = {}) => juntar(...(html ? [HTML] : []), dep('vitrine', {
  replicas: 2,
  imagem: 'nginx:1.27',
  porta: 80,
  pod: '      volumes:\n      - name: html\n        configMap:\n          name: vitrine-html\n',
  ct: `        volumeMounts:\n        - name: html\n          mountPath: /usr/share/nginx/html\n${pronta ? prontidao('/', 80) : ''}`,
}), svc('vitrine', { alvo: 80 }));
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
const LOJA_PRONTA = { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis(), 'vitrine.yaml': vitrine({ html: true }) };

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
/** O blog: o DB_SENHA vem da `chave` do Secret banco (o colega pediu "password", que o Secret não tem). */
const blog = (chave = 'senha') => juntar(dep('blog', {
  replicas: 2,
  imagem: 'httpd:2.4',
  porta: 80,
  ct: `        env:\n        - name: DB_HOST\n          value: db-0.db\n        - name: DB_SENHA\n          valueFrom:\n            secretKeyRef:\n              name: banco\n              key: ${chave}\n`,
}), svc('blog', { alvo: 80 }));
/** A cópia de segurança: o rascunho do estagiário (a cada minuto, sem a senha) ou a pronta. */
const copia = (pronta) => `apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-db
spec:
  schedule: "${pronta ? '0 2 * * *' : '* * * * *'}"
${pronta ? '  timeZone: America/Sao_Paulo\n  concurrencyPolicy: Forbid\n' : ''}  jobTemplate:
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
${pronta ? '            - name: DB_SENHA\n              valueFrom:\n                secretKeyRef:\n                  name: banco\n                  key: senha\n' : ''}            command: ["sh", "-c", "printenv DB_SENHA > /dev/null || echo 'erro: sem a senha do banco (DB_SENHA)'; printenv DB_SENHA > /dev/null || exit 1; echo copiando o banco de $DB_HOST"]
`;
const BLOG_PRONTO = { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true, disco: true }), 'blog.yaml': blog() };

// ---------- Projeto 3: deploy sem downtime ----------
const ESTRATEGIA = '  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxUnavailable: 0\n      maxSurge: 1\n';
const PRAZO = '  progressDeadlineSeconds: 60\n';
/** A liveness (reinicia quem trava) e a startup (dá até 150s para a partida, antes de a liveness começar). */
const SONDAS_DE_VIDA = '        livenessProbe:\n          httpGet:\n            path: /healthz\n            port: 8080\n        startupProbe:\n          httpGet:\n            path: /healthz\n            port: 8080\n          periodSeconds: 5\n          failureThreshold: 30\n';
const lojaZero = ({ pronta = false, estrategia = false, prazo = false, vida = false, versao = '1.0', causa = false } = {}) => juntar(dep('loja', {
  replicas: 4,
  imagem: `kubelearn/loja:${versao}`,
  anotacoes: causa ? `  annotations:\n    kubernetes.io/change-cause: "versão ${versao}"\n` : '',
  estrategia: `${prazo ? PRAZO : ''}${estrategia ? ESTRATEGIA : ''}`,
  ct: `${pronta ? prontidao() : ''}${vida ? SONDAS_DE_VIDA : ''}`,
}), svc('loja'));
const trocar = (imagem) => ({ comando: `kubectl set image deployment/loja loja=kubelearn/loja:${imagem}` });

// ---------- Projeto 4: canário ----------
const versaoDaLoja = (n, { replicas, comSvc = true, seletor = { app: 'loja', versao: n } }) => juntar(dep(`loja-${n}`, { replicas, imagem: `kubelearn/loja:${n === 'v1' ? '1.0' : '1.1'}`, labels: { app: 'loja', versao: n } }), ...(comSvc ? [svc(`loja-${n}`, { seletor })] : []));
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
const replicasNoMinimo = (nome, n) => ({ objeto: `deployment/${nome}`, campo: 'spec.replicas', regex: `^([${n}-9]|[1-9]\\d+)$`, msg: `${nome} tem pelo menos ${n} réplicas` });

// ---------- Projeto 5: Black Friday (HPA, cotas, OOMKilled e LimitRange) ----------
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
/** O relatório: carrega 300Mi na memória; com 128Mi de limit, o disjuntor desarma (OOMKilled). */
const relatorio = (memoria) => `apiVersion: v1
kind: Pod
metadata:
  name: relatorio
  labels:
    app: relatorio
spec:
  containers:
  - name: relatorio
    image: kubelearn/relatorio:1.0
    resources:
      requests:
        cpu: 50m
        memory: 64Mi
      limits:
        cpu: 100m
        memory: ${memoria}
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
      max:
        memory: 512Mi
`;
const BF_ATE_A_COTA = { 'loja.yaml': lojaBf(true), 'hpa.yaml': hpa(2, 8, 50), 'trafego.yaml': carga('http://loja', true), 'cota.yaml': teto };
const GRANDE = '{"spec":{"containers":[{"name":"grande","image":"busybox:1.36","resources":{"limits":{"memory":"1Gi"}}}]}}';

// ---------- Projeto 6: multi-equipe (namespaces, RBAC, NetworkPolicy) ----------
// Os namespaces ficam no andares.yaml: o kubectl aplica os arquivos em ordem alfabética, e eles têm de vir primeiro.
const andares = juntar(NS('time-a'), NS('time-b'));
const noAndar = (ns, doc) => doc.replace(/^( {2}name: .*\n)/m, `$1  namespace: ${ns}\n`);
const andar = (ns) => juntar(noAndar(ns, dep('api')), noAndar(ns, svc('api')));
const REGRAS_DEV = `rules:
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
`;
/** Um RoleBinding: `quem` ganha o `papel` (uma ClusterRole, ou uma Role do andar) só no namespace `ns`. */
const ligacao = (ns, quem, { tipo = 'ClusterRole', papel = 'dev', nome = `${papel}-${quem}` } = {}) => `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${nome}
  namespace: ${ns}
subjects:
- kind: User
  name: ${quem}
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ${tipo}
  name: ${papel}
  apiGroup: rbac.authorization.k8s.io
`;
const cracha = (ns, quem) => juntar(`apiVersion: rbac.authorization.k8s.io/v1\nkind: Role\nmetadata:\n  name: dev\n  namespace: ${ns}\n${REGRAS_DEV}`, ligacao(ns, quem, { tipo: 'Role' }));
const papelDev = `apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: dev\n${REGRAS_DEV}`;
const crachas = (plantao) => juntar(papelDev, ligacao('time-a', 'ana'), ligacao('time-b', 'bruno'),
  ...(plantao ? ['time-a', 'time-b'].map((ns) => ligacao(ns, 'carla', { papel: 'view', nome: 'plantao-carla' })) : []));
const podDeTeste = (nome, ns) => `apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${nome}\n  namespace: ${ns}\n  labels:\n    app: ${nome}\nspec:\n  containers:\n  - name: ${nome}\n    image: busybox:1.36\n    command: ["sleep", "3600"]\n`;
const clientes = juntar(podDeTeste('cliente', 'time-a'), podDeTeste('cliente', 'time-b'));
/** A catraca do andar: só os pods do próprio andar (a furada deixa todos os namespaces); `vizinho` abre para o cliente de lá. */
const catraca = (ns, { furada = false, vizinho } = {}) => `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: so-o-andar
  namespace: ${ns}
spec:
  podSelector: {}
  ingress:
  - from:
${furada ? '    - namespaceSelector: {}\n' : '    - podSelector: {}\n'}${vizinho ? `    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: ${vizinho}
      podSelector:
        matchLabels:
          app: cliente
` : ''}`;
const deAndar = (de, url, status, pod = 'cliente') => ({ requisicao: { de: `pod/${pod}`, ns: de, url, status } });
const EQUIPES_BASE = { 'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': andar('time-b') };

// ---------- Projeto 7: hardening ----------
// O cofre grava o estado em /tmp ao começar: com o disco só leitura, ele precisa de uma mesa de trabalho (o emptyDir).
const cofre = ({ uid = false, poderes = false, lacrado = false, ns = false, semToken = false } = {}) => `apiVersion: apps/v1
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
${semToken ? '      automountServiceAccountToken: false\n' : ''}      securityContext:
        runAsNonRoot: true
${uid ? '        runAsUser: 1000\n' : ''}${poderes ? '        seccompProfile:\n          type: RuntimeDefault\n' : ''}      containers:
      - name: cofre
        image: busybox:1.36
        command: ["sh", "-c", "echo aberto > /tmp/estado && sleep 3600"]
${poderes || lacrado ? `        securityContext:
${poderes ? '          allowPrivilegeEscalation: false\n          capabilities:\n            drop:\n            - ALL\n' : ''}${lacrado ? '          readOnlyRootFilesystem: true\n' : ''}` : ''}${lacrado ? `        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
` : ''}`;
const blocoCofre = 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: cofre\n  labels:\n    pod-security.kubernetes.io/enforce: restricted\n';
const combinacao = yaml`
  apiVersion: v1
  kind: Secret
  metadata:
    name: combinacao
    namespace: cofre
  stringData:
    combinacao: 7-3-9
`;
const robo = yaml`
  apiVersion: v1
  kind: ServiceAccount
  metadata:
    name: auditor
    namespace: cofre
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata:
    name: le-a-combinacao
    namespace: cofre
  rules:
  - apiGroups:
    - ""
    resources:
    - secrets
    resourceNames:
    - combinacao
    verbs:
    - get
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: auditor
    namespace: cofre
  subjects:
  - kind: ServiceAccount
    name: auditor
    namespace: cofre
  roleRef:
    kind: Role
    name: le-a-combinacao
    apiGroup: rbac.authorization.k8s.io
`;
/** O vizinho da auditoria: um nginx no default e um ramal de teste para o cofre (que não ouve porta nenhuma). */
const vizinho = juntar(yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: vizinho
    labels:
      app: vizinho
  spec:
    containers:
    - name: vizinho
      image: nginx:1.27
`, svc('vizinho', { alvo: 80 }), svc('cofre', { alvo: 8080 }).replace('  name: cofre\n', '  name: cofre\n  namespace: cofre\n'));
const isola = yaml`
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
    egress:
    - to:
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
`;
const noCofre = (comando) => ({ comando: `kubectl exec -n cofre deploy/cofre -- ${comando}` });
const podeAuditor = (verbo, nome, resposta) => ({ pode: { quem: 'system:serviceaccount:cofre:auditor', verbo, recurso: 'secrets', ns: 'cofre', nome, resposta } });

// ---------- Projeto 8: Helm e Kustomize, dev e prod ----------
const valoresDev = 'replicaCount: 1\nimage:\n  tag: "1.0"\n';
const valoresProd = (completo) => (completo ? 'replicaCount: 3\nimage:\n  tag: "1.1"\ningress:\n  enabled: true\n  host: loja.prod\nresources:\n  requests:\n    cpu: 100m\n' : 'replicaCount: 1\n');
const kbase = (lista) => `apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:${lista ? '\n- deployment.yaml\n- service.yaml\n' : ' []\n'}`;
const deployBase = dep('loja', { ct: '        envFrom:\n        - configMapRef:\n            name: loja-config\n' });
const overlay = (ns, { replicas, tag, cor, patch } = {}) => `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base
- namespace.yaml
namespace: ${ns}
${replicas ? `replicas:\n- name: loja\n  count: ${replicas}\n` : ''}${tag ? `images:\n- name: kubelearn/loja\n  newTag: "${tag}"\n` : ''}${cor ? `configMapGenerator:\n- name: loja-config\n  literals:\n  - COR=${cor}\n` : ''}${patch ? `patches:\n- path: ${patch}\n` : ''}`;
const reserva = yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
  spec:
    template:
      spec:
        containers:
        - name: loja
          resources:
            requests:
              cpu: 100m
              memory: 64Mi
`;
const VALORES = { 'dev.yaml': valoresDev, 'prod.yaml': valoresProd(true) };
const kustomizacao = ({ pronta = true, prod = false } = {}) => ({
  'base/kustomization.yaml': kbase(pronta),
  'base/deployment.yaml': deployBase,
  'base/service.yaml': svc('loja'),
  'overlays/dev/kustomization.yaml': overlay('dev-k', { replicas: 1, cor: pronta ? 'amarelo' : null }),
  'overlays/dev/namespace.yaml': NS('dev-k'),
  ...(prod ? { 'overlays/prod/kustomization.yaml': overlay('prod-k', { replicas: 3, tag: '1.1', cor: 'azul', patch: 'reserva.yaml' }), 'overlays/prod/namespace.yaml': NS('prod-k'), 'overlays/prod/reserva.yaml': reserva } : {}),
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
         da solução de referência) e pede uma coisa nova: um conceito, um defeito que um colega deixou para você achar, uma
         decisão. A última etapa de cada projeto é um <b>ticket</b>: só o pedido e os critérios de aceite, sem o passo a passo.
         Os testes aplicam todos os arquivos num cluster novo, então tudo o que você construiu precisa continuar funcionando.</p>
      <ul>
        <li><b>A loja completa</b>: API, Redis, vitrine e a entrada pelo Ingress.</li>
        <li><b>O blog com banco</b>: Secret, StatefulSet com disco e a cópia de segurança.</li>
        <li><b>Deploy sem downtime</b>: readiness, rolling update, o prazo do rollout, PDB e as sondas de vida e de partida.</li>
        <li><b>Canário</b>: duas versões, a divisão do tráfego pelo Gateway API e a promoção.</li>
        <li><b>Black Friday</b>: requests e limits, o HPA sob carga, a cota, o OOMKilled e o LimitRange.</li>
        <li><b>Multi-equipe</b>: um namespace por equipe, RBAC (ClusterRole e o papel view) e NetworkPolicy.</li>
        <li><b>Hardening</b>: sem root, Pod Security, disco só leitura, o mínimo de acesso e a rede fechada.</li>
        <li><b>Dev e prod</b>: a mesma loja em dois ambientes, pelo Helm (com rollback) e pelo Kustomize.</li>
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
        titulo: 'O ramal que não toca',
        dificuldade: 'medio',
        vidaReal: 'A API ganha uma geladeira (o Redis) para não buscar tudo no estoque toda vez. Só que o ramal da geladeira toca numa sala vazia.',
        limite: 'O Service não confere se o seletor faz sentido: um seletor que não casa com pod nenhum é aceito sem erro, e o ramal fica mudo.',
        enunciado: `<p>Um colega escreveu o <code>redis.yaml</code> (o Deployment e o Service do Redis). O Redis está de pé, mas o ramal
                    <code>redis</code> não leva a ninguém. Descubra por quê e conserte. Depois, diga à API onde está o cache: a variável
                    <code>REDIS_HOST=redis</code>.</p>`,
        dica: 'kubectl get endpoints redis mostra <none>: compare o selector do Service com as labels dos pods (kubectl get pods --show-labels). Na API: env: [{ name: REDIS_HOST, value: redis }].',
        novos: { 'redis.yaml': redis('cache') },
        solucao: { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis() },
        testes: [depois('a API sabe onde está o cache, e o ramal leva até ele', [
          { semErros: true },
          { endpoints: 'svc/redis', quantidade: 1 },
          { env: { pods: 'app=api', nome: 'REDIS_HOST', igual: 'redis' } },
        ])],
      },
      {
        titulo: 'A vitrine que não abre',
        dificuldade: 'medio',
        vidaReal: 'A vitrine (o nginx) mostra a página que está no quadro de avisos (o ConfigMap). Sem o quadro, ela nem abre a porta.',
        limite: 'O kubelet espera o ConfigMap aparecer e tenta de novo sozinho: assim que você o cria, o pod sobe, sem precisar apagar nada.',
        enunciado: `<p>O <code>vitrine.yaml</code> tem o nginx e o Service <code>vitrine</code>, mas os pods não saem de
                    <code>ContainerCreating</code>. Descubra o que falta (o <code>kubectl describe pod</code> conta) e conserte: a página
                    da vitrine tem de dizer <code>Loja do kube-learn</code>.</p>`,
        dica: 'Os eventos do pod dizem: configmap "vitrine-html" not found. Crie esse ConfigMap com a chave index.html: o volume vira a pasta /usr/share/nginx/html, e cada chave vira um arquivo.',
        novos: { 'vitrine.yaml': vitrine() },
        solucao: LOJA_PRONTA,
        testes: [depois('a vitrine mostra a página', [{ semErros: true }, { pods: 'app=vitrine', prontos: 2 }, pede('http://vitrine', { corpo: 'Loja do kube-learn' })])],
      },
      {
        titulo: 'A porta da rua',
        dificuldade: 'medio',
        vidaReal: 'O balcão de informações da portaria: quem pede "loja.local" vai à vitrine; quem pede "/api", ao balcão da API.',
        limite: 'O Ingress escolhe pelo caminho mais longo: /api vence o / para quem pede /api/qualquer-coisa.',
        enunciado: `<p>O <code>entrada.yaml</code> leva <code>loja.local</code> à vitrine. Acrescente a entrada da API: tudo o que começa
                    com <code>/api</code> (<code>/api</code>, <code>/api/carrinho</code>...) vai para o Service <code>api</code>; o resto
                    continua na vitrine.</p>`,
        dica: 'Mais um item em paths: path /api, backend service api, port 80. O pathType decide o "tudo o que começa com": Prefix casa /api e /api/carrinho; Exact, só /api.',
        novos: { 'entrada.yaml': entrada(false) },
        solucao: { ...LOJA_PRONTA, 'entrada.yaml': entrada(true) },
        testes: [depois('a loja abre de fora', [
          { semErros: true },
          deFora('http://loja.local/', { corpo: 'Loja do kube-learn' }),
          deFora('http://loja.local/api', { corpo: '"app":"loja"' }),
          { ...deFora('http://loja.local/api/carrinho', { status: 404, corpo: '^404 page not found' }), msg: 'loja.local/api/carrinho chega na API (o 404 é dela, não do nginx)' },
        ])],
      },
      {
        titulo: 'Ticket: pronta para o público',
        dificuldade: 'dificil',
        vidaReal: 'Antes de abrir as portas: o síndico confere quem está pronto, e cada atendente diz quanto de energia precisa.',
        limite: 'A readinessProbe só protege se a resposta for honesta: um /healthz que sempre diz ok não protege de nada.',
        enunciado: ticket('Marta, dona da loja', 'Amanhã a loja abre para o público. Não quero cliente vendo erro quando a gente trocar a versão da API, e a administração quer saber quanto cada atendente da API gasta.', [
          'Uma troca de versão da API (para a <code>kubelearn/loja:2.1-aquece</code>, que passa 20 segundos aquecendo antes de atender) não deixa nenhum pedido sem resposta.',
          'Cada pod da API reserva (<b>requests</b>) 100m de CPU e 64Mi de memória.',
          'A vitrine só recebe visitas quando o nginx já responde em <code>/</code>.',
          'Tudo o que já funcionava continua: <code>loja.local</code> e <code>loja.local/api</code> abrem de fora.',
        ]),
        dica: 'Quem decide se um pod recebe clientes é a readinessProbe; o que ele reserva fica em resources.requests. Teste a troca você mesmo: kubectl set image deployment/api api=kubelearn/loja:2.1-aquece e kubectl get pods -w.',
        solucao: { ...LOJA_PRONTA, 'api.yaml': juntar(api({ redis: true, pronta: true }), svc('api')), 'vitrine.yaml': vitrine({ html: true, pronta: true }), 'entrada.yaml': entrada(true) },
        testes: [
          depois('a loja continua abrindo de fora', [
            { semErros: true },
            deFora('http://loja.local/', { corpo: 'Loja do kube-learn' }),
            deFora('http://loja.local/api', { corpo: '"app":"loja"' }),
          ]),
          depois('a API reserva CPU e memória', [
            { objeto: 'deployment/api', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '100m' },
            { objeto: 'deployment/api', campo: 'spec.template.spec.containers[0].resources.requests.memory', igual: '64Mi' },
          ]),
          depois('a vitrine só atende quando está pronta', [{ objeto: 'deployment/vitrine', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/' }], { oculto: true }),
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
        titulo: 'O banco que não sobe',
        dificuldade: 'medio',
        vidaReal: 'O apartamento 0 do banco, com número fixo, e a lista com o ramal direto de cada apartamento (o Service headless), que chama pelo nome.',
        limite: 'O headless não reparte as ligações: ele só dá o endereço de cada apartamento (db-0.db).',
        enunciado: `<p>O <code>banco.yaml</code> tem o StatefulSet <code>db</code> (postgres), mas o <code>db-0</code> cai e reinicia sem
                    parar. Os logs dele dizem o que falta: dê isso a ele <b>lendo do Secret <code>banco</code></b> (nada de senha escrita no
                    YAML). Crie também o Service <b>headless</b> <code>db</code> (porta 5432), que dá a cada apartamento um endereço fixo
                    (<code>db-0.db</code>).</p>`,
        dica: 'kubectl logs db-0: falta a POSTGRES_PASSWORD. env com valueFrom.secretKeyRef (name: banco, key: senha) e um Service com clusterIP: None.',
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
        titulo: 'O blog que não nasce',
        dificuldade: 'medio',
        vidaReal: 'O blog liga para o banco pelo endereço fixo do apartamento 0, com a senha do envelope. Só que pediram o envelope pelo nome errado.',
        limite: 'Sem a chave no Secret, o contêiner nem chega a nascer: não há log para ler, só os eventos do pod.',
        enunciado: `<p>Um colega escreveu o <code>blog.yaml</code>: o Deployment do blog (com <code>DB_HOST</code> e <code>DB_SENHA</code>)
                    e o Service <code>blog</code>. Mas os pods ficam em <code>CreateContainerConfigError</code>, e o
                    <code>kubectl logs</code> não mostra nada. Descubra por quê e conserte.</p>`,
        dica: 'Sem contêiner, sem log: o motivo está nos eventos (kubectl describe pod). Compare a key que o blog pede com as chaves que o Secret banco tem (kubectl describe secret banco).',
        novos: { 'blog.yaml': blog('password') },
        solucao: BLOG_PRONTO,
        testes: [depois('o blog acha o banco', [
          { semErros: true },
          { endpoints: 'svc/blog', quantidade: 2 },
          { env: { pods: 'app=blog', nome: 'DB_HOST', igual: 'db-0.db' } },
          { env: { pods: 'app=blog', nome: 'DB_SENHA', regex: '.' } },
          { objeto: 'deployment/blog', campo: 'spec.template.spec.containers[0].env[1].valueFrom.secretKeyRef.name', igual: 'banco', msg: 'a DB_SENHA vem do Secret banco' },
        ], { esperar: '2m' })],
      },
      {
        titulo: 'Ticket: a cópia de segurança',
        dificuldade: 'dificil',
        vidaReal: 'Toda madrugada, às 2h, alguém copia o banco para o cofre: uma cópia de cada vez, com a senha do envelope.',
        limite: 'Cópia que nunca foi testada não é cópia: rode o Job na mão de vez em quando.',
        enunciado: ticket('Rui, do financeiro', 'O blog virou o coração da empresa, e ninguém dorme tranquilo sem backup. O estagiário deixou um rascunho no <code>backup.yaml</code>, mas ele roda a cada minuto e, pelo que eu vi, nem funciona.', [
          'A cópia roda <b>todo dia às 2h da manhã, no horário de São Paulo</b> (o relógio do cluster está em UTC).',
          'Uma cópia nunca começa enquanto a anterior ainda está rodando.',
          'Uma cópia disparada na mão (<code>kubectl create job teste --from=cronjob/backup-db</code>) termina com sucesso.',
          'A senha do banco vem do Secret <code>banco</code>: nada de senha escrita no YAML.',
        ]),
        dica: 'Os campos estão em kubectl explain cronjob.spec (schedule, timeZone, concurrencyPolicy). Para ver o rascunho falhar: kubectl create job teste --from=cronjob/backup-db e kubectl logs job/teste.',
        novos: { 'backup.yaml': copia(false) },
        solucao: { ...BLOG_PRONTO, 'backup.yaml': copia(true) },
        testes: [
          depois('a agenda: todo dia às 2h de São Paulo, uma cópia por vez', [
            { semErros: true },
            { objeto: 'cronjob/backup-db', campo: 'spec.schedule', igual: '0 2 * * *' },
            { objeto: 'cronjob/backup-db', campo: 'spec.timeZone', igual: 'America/Sao_Paulo' },
            { objeto: 'cronjob/backup-db', campo: 'spec.concurrencyPolicy', igual: 'Forbid' },
          ], { esperar: '10s' }),
          depois('a cópia disparada na mão termina com sucesso', [{ objeto: 'job/teste', campo: 'status.succeeded', igual: 1 }], {
            oculto: true, esperar: '10s', mais: [{ comando: 'kubectl create job teste --from=cronjob/backup-db' }, { avancar: '1m' }],
          }),
          depois('a senha vem do Secret banco', [{
            objeto: 'cronjob/backup-db', campo: 'spec.jobTemplate.spec.template.spec.containers[0].env', regex: '"secretKeyRef":\\{[^}]*"name":"banco"', msg: 'a cópia lê a senha do Secret banco',
          }], { oculto: true, esperar: '10s' }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-zero',
    titulo: 'Deploy sem downtime',
    etapas: [
      {
        titulo: 'Só atende quem está pronto',
        dificuldade: 'facil',
        vidaReal: 'A versão nova da loja demora 20 segundos aquecendo. Sem perguntar se está pronta, o ramal manda clientes para quem ainda está de avental.',
        limite: 'A readiness não acelera nada: o atendente continua demorando, só não recebe ninguém antes da hora.',
        enunciado: `<p>O <code>loja.yaml</code> tem a loja (4 réplicas) e o ramal dela. A próxima versão, a
                    <code>kubelearn/loja:2.1-aquece</code>, passa 20 segundos aquecendo antes de atender, e o ramal manda clientes para ela
                    mesmo assim. Faça o ramal só mandar clientes para quem já responde em <code>/healthz</code> (porta 8080). Os testes
                    ocultos fazem essa troca de versão com um cliente pedindo a loja a cada segundo.</p>`,
        dica: 'readinessProbe: { httpGet: { path: /healthz, port: 8080 } }',
        novos: { 'loja.yaml': lojaZero() },
        solucao: { 'loja.yaml': lojaZero({ pronta: true }) },
        testes: [
          depois('a sonda está no lugar', [{ semErros: true }, { pods: 'app=loja', prontos: 4 }, { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/healthz' }]),
          depois('a versão que aquece não derruba ninguém', [{ vigia: { maxFalhas: 0 } }], {
            oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, trocar('2.1-aquece'), { avancar: '2m' }],
          }),
        ],
      },
      {
        titulo: 'Reforma sem fechar nenhum',
        dificuldade: 'medio',
        vidaReal: 'Na reforma por etapas, abre-se um apartamento novo antes de fechar um antigo: nunca menos de 4 abertos.',
        limite: 'Sem espaço para o apartamento extra (o maxSurge), a reforma para: maxUnavailable 0 exige folga no cluster.',
        enunciado: `<p>Com o padrão do Deployment (25% podem sair antes de o novo ficar pronto), uma troca de versão deixa a loja com 3
                    pods prontos por um tempo. A loja precisa de 4 o tempo todo: configure o rolling update para <b>nunca</b> ficar
                    abaixo de 4 prontos, trocando um de cada vez.</p>`,
        dica: 'spec.strategy: { type: RollingUpdate, rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }: abre um novo antes de fechar um antigo.',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true }) },
        testes: [
          depois('a estratégia está no lugar', [{ semErros: true }, { objeto: 'deployment/loja', campo: 'spec.strategy.rollingUpdate.maxUnavailable', igual: 0 }]),
          depois('a atualização nunca fica abaixo de 4', [{ rollout: 'deployment/loja', minDisponivel: 4 }], {
            oculto: true, mais: [{ zerar: true }, trocar('1.1'), { avancar: '2m' }],
          }),
        ],
      },
      {
        titulo: 'A versão com defeito',
        dificuldade: 'medio',
        vidaReal: 'A versão 2.0 veio com defeito de fábrica: o primeiro apartamento novo não abre. Os antigos seguram as pontas, mas alguém precisa avisar que a obra empacou.',
        limite: 'O prazo só marca o rollout como falho (o kubectl rollout status sai com erro); ele não desfaz nada. Voltar é com você: kubectl rollout undo.',
        enunciado: `<p>A <code>kubelearn/loja:2.0-bugada</code> quebra assim que sobe. Com a sua estratégia, a loja não cai (os antigos
                    continuam atendendo), mas o rollout fica pendurado, e o <code>kubectl rollout status</code> só desiste depois de
                    <b>10 minutos</b>. Faça o Deployment declarar o rollout como falho depois de <b>60 segundos</b> sem progresso.</p>`,
        dica: 'O campo é spec.progressDeadlineSeconds (o padrão é 600). Para ver: kubectl set image deployment/loja loja=kubelearn/loja:2.0-bugada, kubectl rollout status deployment/loja e, para voltar, kubectl rollout undo deployment/loja.',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true, prazo: true }) },
        testes: [
          depois('o prazo está no lugar', [{ semErros: true }, { objeto: 'deployment/loja', campo: 'spec.progressDeadlineSeconds', igual: 60 }]),
          depois('a versão com defeito é declarada falha, e ninguém fica sem resposta', [
            { objeto: 'deployment/loja', campo: 'status.conditions', regex: 'ProgressDeadlineExceeded', msg: 'o Deployment marca o rollout como falho (ProgressDeadlineExceeded)' },
            { vigia: { maxFalhas: 0 } },
          ], { oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, trocar('2.0-bugada'), { avancar: '2m' }] }),
        ],
      },
      {
        titulo: 'A manutenção travada',
        dificuldade: 'medio',
        vidaReal: 'A administração vai reformar o prédio node-1 e pediu para os moradores saírem (o drain). Um colega prometeu que nunca sairia ninguém, e a reforma não começa.',
        limite: 'O PDB só vale para as saídas planejadas (drain, eviction): uma queda de energia no prédio não pede licença.',
        enunciado: `<p>Um colega criou o <code>pdb.yaml</code> para proteger a loja, e agora o <code>kubectl drain node-1</code> não termina
                    nunca. Descubra por quê e ajuste o PodDisruptionBudget: a manutenção tem de andar, sem a loja ficar com menos de
                    <b>3</b> pods prontos.</p>`,
        dica: 'kubectl get pdb: ALLOWED DISRUPTIONS 0 trava qualquer drain. Com 4 réplicas, minAvailable: 3 (ou maxUnavailable: 1) deixa sair um por vez. Para testar: kubectl drain node-1 --ignore-daemonsets e, depois, kubectl uncordon node-1.',
        novos: { 'pdb.yaml': pdb(4) },
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true, prazo: true }), 'pdb.yaml': pdb(3) },
        testes: [depois('o drain do node-1 termina, sem a loja ficar com menos de 3', [
          { saida: 'node/node-1 drained', msg: 'o kubectl drain node-1 termina' },
          { objeto: 'pdb/loja', campo: 'status.desiredHealthy', regex: '^([3-9]|[1-9]\\d+)$', msg: 'o PDB garante pelo menos 3 pods prontos' },
        ], { mais: [drenar] })],
      },
      {
        titulo: 'Ticket: a versão 1.1',
        dificuldade: 'dificil',
        vidaReal: 'A reforma ganha uma placa ("versão 1.1") para todo mundo saber o que mudou. E o síndico quer dormir: quem trava é reiniciado sozinho, e quem demora para abrir não é despejado no meio da mudança.',
        limite: 'A livenessProbe reinicia, não conserta: uma versão que sempre trava vai reiniciar sempre. O conserto é voltar a versão.',
        enunciado: ticket('Marta, dona da loja', 'Vamos lançar a 1.1. E, depois do susto da semana passada (uma versão travou de madrugada e ficou de pé, sem atender ninguém, até alguém acordar), quero que a loja se cuide sozinha.', [
          'Os 4 atendentes rodam a <code>kubelearn/loja:1.1</code>, e o <code>kubectl rollout history deployment/loja</code> conta o motivo da mudança (com "1.1" no texto).',
          'Um atendente que trava (a porta aberta, sem responder; a <code>kubelearn/loja:2.2-trava</code> faz isso depois de 40 segundos) é reiniciado sozinho.',
          'A <code>kubelearn/loja:3.0-lenta</code>, que passa 45 segundos migrando o banco antes de atender, consegue subir sem ser morta no meio.',
          'Tudo o que já valia continua: nenhuma troca de versão deixa pedido sem resposta, nem fica com menos de 4 pods prontos.',
        ]),
        dica: 'O motivo vai na anotação kubernetes.io/change-cause do Deployment. Quem reinicia o travado é a livenessProbe; quem dá tempo para a partida lenta é a startupProbe (enquanto ela não passa, a liveness nem começa).',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true, prazo: true, vida: true, versao: '1.1', causa: true }), 'pdb.yaml': pdb(3) },
        testes: [
          depois('a versão 1.1, com o motivo no histórico', [
            { semErros: true },
            { pods: 'app=loja', prontos: 4, imagem: 'kubelearn/loja:1.1' },
            { saida: 'CHANGE-CAUSE[\\s\\S]*1\\.1', msg: 'o rollout history mostra o motivo, com 1.1' },
          ], { mais: [{ comando: 'kubectl rollout history deployment/loja' }] }),
          depois('quem trava é reiniciado sozinho', [{ status: 'app=loja', motivo: 'Completed', msg: 'o kubelet reiniciou os atendentes travados' }], {
            oculto: true, mais: [{ zerar: true }, trocar('2.2-trava'), { avancar: '3m' }],
          }),
          depois('a versão lenta sobe inteira, sem ninguém ficar sem resposta', [{ pods: 'app=loja', prontos: 4, imagem: 'kubelearn/loja:3.0-lenta' }, { vigia: { maxFalhas: 0 } }], {
            oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, trocar('3.0-lenta'), { avancar: '5m' }],
          }),
          depois('a versão que aquece também não derruba ninguém', [{ vigia: { maxFalhas: 0 } }, { rollout: 'deployment/loja', minDisponivel: 4 }], {
            oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, trocar('2.1-aquece'), { avancar: '2m' }],
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
        titulo: 'O ramal que mistura',
        dificuldade: 'medio',
        vidaReal: 'Um único apartamento com a reforma nova, para ver se alguém reclama antes de reformar o prédio todo. Mas o ramal dele toca em todos os apartamentos da loja.',
        limite: 'Label é etiqueta, não dono: um Service escolhe qualquer pod cujas labels casem com o seletor, venha de que Deployment vier.',
        enunciado: `<p>O <code>v2.yaml</code> tem a <code>loja-v2</code> (versão 1.1, 1 réplica, <code>versao: v2</code>) e o ramal dela,
                    o Service <code>loja-v2</code>. Só que quem liga para <code>loja-v2</code> às vezes cai na versão 1.0. Descubra por quê e
                    conserte, sem mexer na v1.</p>`,
        dica: 'kubectl get endpoints loja-v2 mostra 4 pods: o selector app: loja casa com a v1 também. Acrescente versao: v2 ao selector.',
        novos: { 'v2.yaml': versaoDaLoja('v2', { replicas: 1, seletor: { app: 'loja' } }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 1 }) },
        testes: [depois('cada versão com o seu ramal', [
          { semErros: true },
          { endpoints: 'svc/loja-v2', quantidade: 1 },
          { endpoints: 'svc/loja-v1', quantidade: 3 },
          { distribuicao: { url: 'http://loja-v2', vezes: 20, corpo: '"versao":"1.1"', entre: [20, 20] } },
        ])],
      },
      {
        titulo: '10% para o canário',
        dificuldade: 'medio',
        vidaReal: 'A placa da portaria manda 1 em cada 10 visitantes para o apartamento reformado.',
        limite: 'O peso é por conexão, não por pessoa: o mesmo cliente pode cair ora numa versão, ora na outra.',
        enunciado: `<p>O <code>rota.yaml</code> manda tudo de <code>loja.local</code> para a v1. Mande <b>uns 10%</b> dos visitantes
                    para a <code>loja-v2</code>, e o resto continua na <code>loja-v1</code>.</p>`,
        dica: 'Cada backendRef ganha um weight, e os pesos são relativos (não precisam somar 100): 9 e 1 dá o mesmo que 90 e 10. backendRefs: [{ name: loja-v1, port: 80, weight: 90 }, { name: loja-v2, port: 80, weight: 10 }]',
        novos: { 'rota.yaml': rota({ v1: 100 }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 1 }), 'rota.yaml': rota({ v1: 90, v2: 10 }) },
        testes: [depois('uns 10% chegam na versão 1.1', [{ semErros: true }, versao11([5, 15])])],
      },
      {
        titulo: 'Meio a meio, sem sobrecarga',
        dificuldade: 'medio',
        vidaReal: 'Ninguém reclamou: metade dos visitantes já vai para a reforma. Mas um apartamento sozinho não dá conta de metade do condomínio.',
        limite: 'O peso reparte as visitas entre os Services, não entre os pods: quantos pods cada lado tem é decisão sua.',
        enunciado: `<p>Passe a divisão para <b>50/50</b>. Cada atendente aguenta no máximo <b>20%</b> das visitas da loja: deixe as duas
                    versões com atendentes suficientes para ninguém passar disso.</p>`,
        dica: 'Com 50/50, cada lado recebe metade das visitas e divide entre os pods dele. 50% ÷ 20% = 2,5: arredonde para cima.',
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 3 }), 'rota.yaml': rota({ v1: 50, v2: 50 }) },
        testes: [depois('metade em cada versão, sem atendente sobrecarregado', [
          { semErros: true },
          versao11([40, 60]),
          replicasNoMinimo('loja-v2', 3),
          replicasNoMinimo('loja-v1', 3),
        ])],
      },
      {
        titulo: 'Ticket: a promoção',
        dificuldade: 'dificil',
        vidaReal: 'A reforma foi aprovada: todo mundo para os apartamentos novos, os antigos fecham, e a manutenção dos prédios não pode pegar a loja desprevenida.',
        limite: 'Depois de apagar a v1, voltar atrás é subir a v1 de novo: guarde o YAML dela até ter certeza.',
        enunciado: ticket('Marta, dona da loja', 'A 1.1 passou no teste: pode virar a loja oficial. A 1.0 sai de cena, e eu não quero susto na próxima manutenção dos prédios.', [
          'Todo mundo que visita <code>loja.local</code> cai na versão 1.1.',
          'Nada da v1 sobra no cluster: nem pods, nem o ramal <code>loja-v1</code>.',
          'Sozinha, a v2 aguenta a loja inteira, com cada atendente recebendo no máximo 20% das visitas.',
          'Uma manutenção (o <code>kubectl drain</code> de um prédio) nunca deixa a loja com menos de 4 atendentes prontos.',
        ]),
        dica: 'Apague o v1.yaml e tire a v1 da rota. 100% ÷ 20% = 5 réplicas. Para a manutenção, um PodDisruptionBudget com o seletor da v2 (como no projeto Deploy sem downtime).',
        solucao: { 'v2.yaml': versaoDaLoja('v2', { replicas: 5 }), 'rota.yaml': rota({ v2: 100 }), 'pdb.yaml': pdb(4, { app: 'loja', versao: 'v2' }) },
        testes: [
          depois('todo mundo na versão 1.1, e nada da v1', [
            { semErros: true },
            versao11([100, 100]),
            { pods: 'versao=v1', quantidade: 0 },
            { objeto: 'svc/loja-v1', existe: false },
          ]),
          depois('a v2 aguenta a loja sozinha', [replicasNoMinimo('loja-v2', 5)]),
          depois('a manutenção não derruba a loja', [
            { saida: 'node/node-1 drained', msg: 'o kubectl drain node-1 termina' },
            { saida: '^([4-9]|[1-9]\\d+)\\s*$', msg: 'um PodDisruptionBudget garante pelo menos 4 prontos' },
            { rollout: 'deployment/loja-v2', minDisponivel: 4 },
          ], { oculto: true, mais: [{ comando: 'kubectl get pdb -o jsonpath={.items[*].status.desiredHealthy}' }, { zerar: true }, drenar] }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-bf',
    titulo: 'Black Friday',
    cluster: 'projeto-black-friday',
    etapas: [
      {
        titulo: 'O gerente não enxerga',
        dificuldade: 'facil',
        vidaReal: 'O gerente de temporários (o HPA) chama reforço quando os atendentes passam de metade da capacidade. Só que ninguém disse a ele qual é a capacidade de cada um.',
        limite: 'A porcentagem do HPA é sobre o request, não sobre a máquina: um request inventado dá uma porcentagem inventada.',
        enunciado: `<p>O <code>hpa.yaml</code> já tem as regras do gerente (de 2 a 8 atendentes, alvo de 50% de CPU), mas o
                    <code>kubectl get hpa</code> mostra <code>cpu: &lt;unknown&gt;/50%</code>. Descubra por quê
                    (<code>kubectl describe hpa loja</code>) e conserte: a loja reserva (<b>requests</b>) 100m de CPU e 64Mi de memória, e
                    pode puxar no máximo (<b>limits</b>) 500m e 128Mi.</p>`,
        dica: 'O describe diz: missing request for cpu. resources: { requests: { cpu: 100m, memory: 64Mi }, limits: { cpu: 500m, memory: 128Mi } }',
        novos: { 'loja.yaml': lojaBf(false), 'hpa.yaml': hpa(2, 8, 50) },
        solucao: { 'loja.yaml': lojaBf(true), 'hpa.yaml': hpa(2, 8, 50) },
        testes: [depois('o gerente enxerga a CPU', [
          { semErros: true },
          { pods: 'app=loja', prontos: 2 },
          { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '100m' },
          { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].resources.limits.memory', igual: '128Mi' },
          { objeto: 'hpa/loja', campo: 'status.currentMetrics[0].resource.current.averageUtilization', existe: true, msg: 'o HPA mede a CPU (nada de <unknown>)' },
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
        limite: 'A cota recusa quem chega sem etiqueta, inclusive o cliente de teste: é por isso que ela costuma vir junto de um LimitRange.',
        enunciado: `<p>A administração pôs um teto no consumo da empresa: aplique a cota <code>teto</code> do <code>cota.yaml</code>, sem
                    mexer nela. Com ela, o <code>kubectl apply</code> passa a recusar um dos seus pods. Leia o erro e conserte o pod (os
                    valores são com você, desde que caibam no teto).</p>`,
        dica: 'O erro diz o que falta (must specify ...): com cota de CPU e memória, todo contêiner precisa dizer quanto pede. Para o carga, 50m e 16Mi de request e 100m e 32Mi de limit bastam. O kubectl aplica os arquivos em ordem alfabética: a cota (cota.yaml) chega antes do pod.',
        novos: { 'cota.yaml': teto },
        solucao: BF_ATE_A_COTA,
        testes: [depois('tudo dentro do teto', [
          { semErros: true },
          { pods: 'app=carga', prontos: 1 },
          { objeto: 'quota/teto', campo: 'spec.hard.pods', igual: '12' },
        ])],
      },
      {
        titulo: 'O disjuntor do relatório',
        dificuldade: 'medio',
        vidaReal: 'O relatório da Black Friday carrega a planilha inteira na memória. O disjuntor dele foi dimensionado para uma lâmpada, e desarma toda vez.',
        limite: 'Memória não estica: passou do limit, o contêiner morre na hora (OOMKilled). CPU acima do limit só deixa o contêiner mais lento.',
        enunciado: `<p>O <code>relatorio.yaml</code> sobe o pod <code>relatorio</code>, que cai e reinicia sem parar. Descubra o motivo e
                    conserte, dando a ele o que ele precisa, sem estourar o teto da empresa.</p>`,
        dica: 'kubectl describe pod relatorio: Last State: Terminated, Reason: OOMKilled. Os logs dizem quanto ele carrega (300Mi): o limits.memory precisa passar disso, com folga (384Mi ou 512Mi).',
        novos: { 'relatorio.yaml': relatorio('128Mi') },
        solucao: { ...BF_ATE_A_COTA, 'relatorio.yaml': relatorio('512Mi') },
        testes: [depois('o relatório roda sem cair', [{ semErros: true }, { pods: 'app=relatorio', prontos: 1, reinicios: { max: 0 } }], { esperar: '2m' })],
      },
      {
        titulo: 'Ticket: o padrão da administração',
        dificuldade: 'dificil',
        vidaReal: 'Para não barrar quem esquece a etiqueta, a administração cola uma etiqueta padrão em quem chega sem, e proíbe aparelho grande demais.',
        limite: 'O padrão vale só para os pods novos: quem já estava rodando não ganha a etiqueta.',
        enunciado: ticket('Sônia, da administração', 'Toda equipe que chega aqui esquece de dizer quanto consome, e a cota recusa. Quero um padrão para quem chega sem etiqueta, e um limite para ninguém ligar um aparelho grande demais.', [
          'O pod <code>tarefa</code> (o <code>tarefa.yaml</code>, que você <b>não</b> pode mudar) entra e roda.',
          'Todo contêiner que chega sem resources ganha <b>50m</b> de CPU e <b>32Mi</b> de memória de request, e <b>100m</b> e <b>64Mi</b> de limit.',
          'Nenhum contêiner pode ter mais de <b>512Mi</b> de limit de memória: um pedido maior é recusado na hora.',
          'Tudo continua rodando: a loja cresce sob a carga, e o relatório não cai.',
        ]),
        dica: 'Um LimitRange (type: Container) faz as três coisas: defaultRequest, default e max. Ele precisa existir antes do pod, e o kubectl aplica os arquivos em ordem alfabética.',
        novos: { 'tarefa.yaml': tarefa },
        solucao: { ...BF_ATE_A_COTA, 'relatorio.yaml': relatorio('512Mi'), 'cota.yaml': `${padrao}---\n${teto}`, 'tarefa.yaml': tarefa },
        testes: [
          depois('a tarefa ganhou o padrão e entrou', [
            { pods: 'app=tarefa', prontos: 1 },
            { objeto: 'pod/tarefa', campo: 'spec.containers[0].resources.requests.cpu', igual: '50m' },
            { objeto: 'pod/tarefa', campo: 'spec.containers[0].resources.limits.memory', igual: '64Mi' },
          ]),
          depois('um contêiner grande demais é recusado', [{ erro: 'maximum memory usage per Container is 512Mi', msg: 'um pod com 1Gi de limit de memória é recusado' }], {
            oculto: true, mais: [{ comando: `kubectl run grande --image=busybox:1.36 --overrides='${GRANDE}'` }],
          }),
          depois('a loja cresce e o relatório roda', [
            { objeto: 'hpa/loja', campo: 'status.desiredReplicas', regex: '^[3-8]$', msg: 'o HPA pediu mais de 2 réplicas' },
            { pods: 'app=relatorio', prontos: 1 },
          ], { oculto: true, esperar: '3m' }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-equipes',
    titulo: 'Multi-equipe',
    etapas: [
      {
        titulo: 'O andar errado',
        dificuldade: 'facil',
        vidaReal: 'Cada equipe aluga um andar (o namespace), com a sua API e o seu ramal. A mudança da equipe B foi parar no térreo.',
        limite: 'O andar sozinho não isola nada: sem crachás e catracas, qualquer um anda por todos.',
        enunciado: `<p>O <code>andares.yaml</code> cria os namespaces <code>time-a</code> e <code>time-b</code>, e o
                    <code>time-a.yaml</code> põe a API da equipe A no andar dela. O <code>time-b.yaml</code> tem a API da equipe B, mas ela
                    não aparece no <code>time-b</code>. Descubra onde ela foi parar e conserte.</p>`,
        dica: 'kubectl get deploy -A mostra todos os andares. Sem metadata.namespace (e sem -n), tudo vai para o namespace default.',
        novos: { 'andares.yaml': andares, 'time-a.yaml': andar('time-a'), 'time-b.yaml': juntar(dep('api'), svc('api')) },
        solucao: EQUIPES_BASE,
        testes: [depois('cada equipe no seu andar', [
          { semErros: true },
          { pods: 'app=api', ns: 'time-a', prontos: 1 },
          { pods: 'app=api', ns: 'time-b', prontos: 1 },
          { pods: 'app=api', quantidade: 0, msg: 'nada da equipe B sobrou no default' },
        ])],
      },
      {
        titulo: 'Um papel, dois crachás',
        dificuldade: 'medio',
        vidaReal: 'A ana tem o crachá de dev do andar A; o bruno precisa do mesmo no andar B. Em vez de copiar a descrição do cargo em cada andar, a administração escreve o cargo uma vez e entrega crachás por andar.',
        limite: 'Quem limita o crachá é a ligação: um RoleBinding vale só no andar dele, mesmo apontando para uma ClusterRole. Um ClusterRoleBinding abriria todos os andares.',
        enunciado: `<p>O <code>crachas.yaml</code> tem a Role <code>dev</code> e o RoleBinding da <b>ana</b>, no <code>time-a</code>. O
                    <b>bruno</b> precisa do mesmo papel no <code>time-b</code>. Em vez de copiar a Role para cada andar, transforme-a numa
                    <b>ClusterRole</b> <code>dev</code> e dê a cada um o papel só no próprio andar.</p>`,
        dica: 'kind: ClusterRole (sem namespace) com as mesmas rules; os RoleBindings dev-ana (time-a) e dev-bruno (time-b) com roleRef { kind: ClusterRole, name: dev }. ClusterRoleBinding, não: ele vale no cluster todo.',
        novos: { 'crachas.yaml': cracha('time-a', 'ana') },
        solucao: { ...EQUIPES_BASE, 'crachas.yaml': crachas(false) },
        testes: [depois('um papel só, e cada um no seu andar', [
          { semErros: true },
          { objeto: 'clusterrole/dev', existe: true },
          { pode: { quem: 'ana', verbo: 'update', recurso: 'deployments', ns: 'time-a', resposta: true } },
          { pode: { quem: 'ana', verbo: 'update', recurso: 'deployments', ns: 'time-b', resposta: false } },
          { pode: { quem: 'ana', verbo: 'list', recurso: 'pods', ns: 'default', resposta: false } },
          { pode: { quem: 'bruno', verbo: 'update', recurso: 'deployments', ns: 'time-b', resposta: true } },
          { pode: { quem: 'bruno', verbo: 'list', recurso: 'pods', ns: 'time-a', resposta: false } },
        ], { esperar: '10s' })],
      },
      {
        titulo: 'O plantão só olha',
        dificuldade: 'medio',
        vidaReal: 'A carla, do plantão da madrugada, precisa olhar tudo nos dois andares (pods, logs, eventos) para acordar a pessoa certa. Mexer, não.',
        limite: 'O papel pronto view não lê Secrets (senha não é coisa de plantão): se ela precisar de um Secret, é outro crachá.',
        enunciado: `<p>A <b>carla</b>, do plantão, precisa ver pods, logs e o resto nos dois andares, sem poder mudar nada e sem ver os
                    Secrets. Não escreva papel nenhum: o Kubernetes já vem com a ClusterRole <code>view</code>, que faz exatamente isso. Dê a
                    ela esse papel nos dois andares, e só neles.</p>`,
        dica: 'Um RoleBinding em cada andar, com roleRef { kind: ClusterRole, name: view }. Confira: kubectl auth can-i get pods --subresource=log -n time-b --as carla.',
        solucao: { ...EQUIPES_BASE, 'crachas.yaml': crachas(true) },
        testes: [depois('a carla olha os dois andares e não mexe em nada', [
          { semErros: true },
          { pode: { quem: 'carla', verbo: 'list', recurso: 'pods', ns: 'time-a', resposta: true } },
          { pode: { quem: 'carla', verbo: 'get', recurso: 'pods', sub: 'log', ns: 'time-b', resposta: true } },
          { pode: { quem: 'carla', verbo: 'delete', recurso: 'pods', ns: 'time-a', resposta: false } },
          { pode: { quem: 'carla', verbo: 'get', recurso: 'secrets', ns: 'time-b', resposta: false } },
          { pode: { quem: 'carla', verbo: 'list', recurso: 'pods', ns: 'default', resposta: false } },
        ], { esperar: '10s' })],
      },
      {
        titulo: 'A catraca furada',
        dificuldade: 'medio',
        vidaReal: 'As catracas de cada andar deviam deixar entrar só quem é do próprio andar. A do andar B tem um furo.',
        limite: 'Quem tem o crachá do andar (RBAC) pode mudar as catracas dele: catraca é rede, crachá é API.',
        enunciado: `<p>O <code>catracas.yaml</code> fecha cada andar para quem não é de lá, e o <code>clientes.yaml</code> põe um cliente
                    em cada andar para testar. Mas o teste de invasão mostrou que o cliente do <code>time-a</code> ainda chega na
                    <code>api</code> do <code>time-b</code>. Ache o furo e feche, sem fechar o andar para os próprios moradores.</p>`,
        dica: 'Compare as duas so-o-andar (kubectl describe netpol -A). namespaceSelector: {} escolhe todos os namespaces; podSelector: {} sozinho escolhe os pods do namespace da própria política.',
        novos: { 'catracas.yaml': juntar(catraca('time-a'), catraca('time-b', { furada: true })), 'clientes.yaml': clientes },
        solucao: { ...EQUIPES_BASE, 'crachas.yaml': crachas(true), 'catracas.yaml': juntar(catraca('time-a'), catraca('time-b')), 'clientes.yaml': clientes },
        testes: [depois('cada um no seu andar', [
          { semErros: true },
          deAndar('time-a', 'http://api', 200),
          deAndar('time-b', 'http://api', 200),
          deAndar('time-a', 'http://api.time-b', 'timeout'),
          deAndar('time-b', 'http://api.time-a', 'timeout'),
        ])],
      },
      {
        titulo: 'Ticket: a API compartilhada',
        dificuldade: 'dificil',
        vidaReal: 'A equipe B abre a porta da API dela para o programa cliente da equipe A, e só para ele.',
        limite: 'A catraca confia nas labels: quem pode criar pods no andar A com app: cliente passa também. Por isso o crachá (RBAC) e a catraca andam juntos.',
        enunciado: ticket('Bruno, da equipe B', 'A equipe A vai usar a nossa API. Mas só o cliente deles, que é o programa que conhece o contrato: nada de qualquer pod do andar A batendo aqui.', [
          'O <code>cliente</code> do <code>time-a</code> (label <code>app: cliente</code>) chama a <code>api</code> do <code>time-b</code>.',
          'Nenhum outro pod do <code>time-a</code> chega na <code>api</code> do <code>time-b</code> (o <code>curioso</code>, do <code>visitas.yaml</code>, por exemplo).',
          'O <code>time-b</code> continua sem chegar na <code>api</code> do <code>time-a</code>, e dentro de cada andar tudo continua funcionando.',
        ]),
        dica: 'Numa regra from, dois itens (- namespaceSelector e - podSelector) valem como OU; namespaceSelector e podSelector no mesmo item valem como E. Para o namespace, a label kubernetes.io/metadata.name: time-a vem de graça.',
        novos: { 'visitas.yaml': podDeTeste('curioso', 'time-a') },
        solucao: {
          ...EQUIPES_BASE, 'crachas.yaml': crachas(true), 'catracas.yaml': juntar(catraca('time-a'), catraca('time-b', { vizinho: 'time-a' })), 'clientes.yaml': clientes,
          'visitas.yaml': podDeTeste('curioso', 'time-a'),
        },
        testes: [
          depois('só o cliente do time-a chega na API do time-b', [
            { semErros: true },
            deAndar('time-a', 'http://api.time-b', 200),
            deAndar('time-a', 'http://api.time-b', 'timeout', 'curioso'),
          ]),
          depois('o resto continua como estava', [
            deAndar('time-b', 'http://api.time-a', 'timeout'),
            deAndar('time-b', 'http://api', 200),
            deAndar('time-a', 'http://api', 200),
          ], { oculto: true }),
        ],
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
        enunciado: `<p>Pediram para o <code>cofre</code> nunca rodar como root, e alguém pôs <code>runAsNonRoot: true</code> no pod. Desde
                    então, ele não sobe. Descubra por quê e faça o cofre rodar como o usuário <b>1000</b>, sem tirar a trava.</p>`,
        dica: 'Os eventos do pod (kubectl describe pod) dizem: container has runAsNonRoot and image will run as root. A imagem do busybox roda como root: diga qual usuário usar (runAsUser: 1000, no securityContext do pod).',
        novos: { 'cofre.yaml': cofre() },
        solucao: { 'cofre.yaml': cofre({ uid: true }) },
        testes: [depois('o cofre roda como 1000', [{ saida: 'uid=1000 ' }], { mais: [{ comando: 'kubectl exec deploy/cofre -- id' }] })],
      },
      {
        titulo: 'As normas do bloco',
        dificuldade: 'medio',
        vidaReal: 'O cofre muda para o bloco com a norma mais dura dos bombeiros: na portaria, o fiscal lê a lista de exigências e barra quem não cumpre.',
        limite: 'A norma só confere os pods novos: um pod antigo, criado antes do rótulo, continua rodando.',
        enunciado: `<p>O <code>bloco.yaml</code> cria o namespace <code>cofre</code>, com a norma <code>restricted</code> dos bombeiros. Mude
                    o cofre para esse namespace. Ele vai ser barrado: descubra o que a norma exige e cumpra tudo.</p>`,
        dica: 'O apply avisa (Warning: would violate PodSecurity), e os eventos do ReplicaSet dizem o que falta: kubectl get events -n cofre. São três campos: allowPrivilegeEscalation, capabilities e seccompProfile.',
        novos: { 'bloco.yaml': blocoCofre },
        solucao: { 'bloco.yaml': blocoCofre, 'cofre.yaml': cofre({ uid: true, poderes: true, ns: true }) },
        testes: [depois('o cofre passou pelos bombeiros', [{ semErros: true }, { pods: 'app=cofre', ns: 'cofre', prontos: 1 }])],
      },
      {
        titulo: 'Paredes lacradas',
        dificuldade: 'medio',
        vidaReal: 'As paredes do cofre ficam lacradas; o programa só escreve na mesa de trabalho (o /tmp).',
        limite: 'O /tmp é um emptyDir: o que fica lá some quando o pod sai.',
        enunciado: `<p>A auditoria pede o disco do contêiner só leitura (<code>readOnlyRootFilesystem: true</code>). Ligue a trava, e o
                    cofre vai passar a cair. Descubra por quê e conserte sem desligar a trava.</p>`,
        dica: 'kubectl logs -n cofre deploy/cofre: o programa grava em /tmp quando começa. Dê a ele uma mesa de trabalho: um volume emptyDir montado em /tmp.',
        solucao: { 'bloco.yaml': blocoCofre, 'cofre.yaml': cofre({ uid: true, poderes: true, lacrado: true, ns: true }) },
        testes: [
          depois('o cofre roda, e a mesa aceita escrita', [{ semErros: true, msg: 'escrever em /tmp funciona' }, { pods: 'app=cofre', ns: 'cofre', prontos: 1 }], { mais: [noCofre('touch /tmp/ok')] }),
          depois('as paredes não aceitam', [
            { saida: 'Read-only file system', msg: 'escrever em / é recusado' },
            { objeto: 'deployment/cofre', ns: 'cofre', campo: 'spec.template.spec.containers[0].securityContext.readOnlyRootFilesystem', igual: true },
          ], { mais: [noCofre('touch /x')] }),
        ],
      },
      {
        titulo: 'O crachá do auditor',
        dificuldade: 'medio',
        vidaReal: 'O auditor recebe um crachá que abre uma única gaveta do cofre, a da combinação. As outras gavetas, e a lista delas, continuam fechadas para ele.',
        limite: 'resourceNames não serve para list nem watch: a lista mostra todos os nomes, então quem só pode ver uma gaveta não pode listar.',
        enunciado: `<p>O <code>segredo.yaml</code> guarda a <code>combinacao</code> do cofre (um Secret no namespace <code>cofre</code>). O robô
                    de auditoria, a ServiceAccount <code>auditor</code> do namespace <code>cofre</code> (que ainda não existe), precisa
                    <b>ler esse Secret, e só ele</b>: nenhum outro Secret, nem a lista deles, nem mudar nada.</p>`,
        dica: 'A ServiceAccount auditor, uma Role com verbs: [get], resources: [secrets] e resourceNames: [combinacao], e o RoleBinding ligando as duas. O namespace cofre vem do bloco.yaml, e o kubectl aplica os arquivos em ordem alfabética. Confira: kubectl auth can-i get secret/combinacao -n cofre --as system:serviceaccount:cofre:auditor.',
        novos: { 'segredo.yaml': combinacao },
        solucao: { 'bloco.yaml': blocoCofre, 'cofre.yaml': cofre({ uid: true, poderes: true, lacrado: true, ns: true }), 'segredo.yaml': combinacao, 'robo.yaml': robo },
        testes: [depois('o auditor lê a combinação, e só ela', [
          { semErros: true },
          { objeto: 'serviceaccount/auditor', ns: 'cofre', existe: true },
          podeAuditor('get', 'combinacao', true),
          podeAuditor('get', 'banco', false),
          podeAuditor('list', undefined, false),
          podeAuditor('update', 'combinacao', false),
        ], { esperar: '10s' })],
      },
      {
        titulo: 'Ticket: a auditoria',
        dificuldade: 'dificil',
        vidaReal: 'O cofre fica numa sala sem janela: ninguém entra, ele não sai, e o único fio ligado é o da lista telefônica (o DNS).',
        limite: 'A catraca só olha a rede: quem tem crachá para o kubectl exec ainda entra no cofre pela administração.',
        enunciado: ticket('Ivo, da auditoria', 'Último item do relatório: o cofre está ligado na rede do condomínio como qualquer apartamento. Deixei um vizinho para conferir (o <code>vizinho.yaml</code>, com um ramal de teste para o cofre).', [
          'Ninguém de fora do namespace <code>cofre</code> abre conexão com o cofre (o <code>vizinho</code> tenta pelo ramal de teste, <code>cofre.cofre</code>).',
          'O cofre não abre conexão com ninguém (nem com o <code>vizinho</code>, no <code>default</code>), mas continua achando nomes no DNS.',
          'O cofre não carrega o token da API: ele nunca fala com a administração.',
          'Tudo o que a auditoria já aprovou continua: a norma <code>restricted</code>, o usuário 1000 e o disco só leitura.',
        ]),
        dica: 'Uma NetworkPolicy com policyTypes [Ingress, Egress] e nenhuma regra fecha as duas portas; a saída para o DNS se abre com uma regra egress para a porta 53 (UDP e TCP) do kube-dns, no kube-system. O token: automountServiceAccountToken: false no pod. Para o nslookup do busybox, use o nome completo (vizinho.default.svc.cluster.local).',
        novos: { 'vizinho.yaml': vizinho },
        solucao: { 'bloco.yaml': blocoCofre, 'cofre.yaml': cofre({ uid: true, poderes: true, lacrado: true, ns: true, semToken: true }), 'segredo.yaml': combinacao, 'robo.yaml': robo, 'vizinho.yaml': vizinho, 'isola.yaml': isola },
        testes: [
          depois('ninguém entra no cofre', [{ semErros: true }, { requisicao: { de: 'pod/vizinho', url: 'http://cofre.cofre', status: 'timeout' }, msg: 'o vizinho não consegue abrir conexão com o cofre' }]),
          depois('o cofre não sai, mas acha nomes', [
            { saida: 'download timed out', msg: 'o wget do cofre para o vizinho não completa' },
            { saida: 'Name:\\s+vizinho', msg: 'o nslookup do cofre acha o vizinho' },
          ], { mais: [noCofre('wget -qO- -T 2 http://vizinho.default'), noCofre('nslookup vizinho.default.svc.cluster.local')] }),
          depois('o cofre não carrega o token da API', [{ saida: '^(?![\\s\\S]*kube-api-access)[a-z0-9-]+( [a-z0-9-]+)*\\s*$', msg: 'o pod do cofre não monta o token (nada de kube-api-access nos volumes)' }], {
            oculto: true, mais: [{ comando: 'kubectl get pods -n cofre -l app=cofre -o jsonpath={.items[0].spec.volumes[*].name}' }],
          }),
          depois('o que já estava aprovado continua', [
            { pods: 'app=cofre', ns: 'cofre', prontos: 1 },
            { saida: 'uid=1000 ', msg: 'o cofre roda como 1000' },
            { saida: 'Read-only file system', msg: 'escrever em / é recusado' },
          ], { oculto: true, mais: [noCofre('id'), noCofre('touch /x')] }),
        ],
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
        vidaReal: 'A filial grande: mais atendentes, a versão nova, um balcão na rua e energia reservada.',
        limite: 'Dois arquivos de valores divergem com o tempo: o que não precisa ser diferente, deixe nos padrões do chart.',
        enunciado: `<p>Agora prod. Os nomes dos valores estão no próprio chart (<code>helm show values kube-learn/loja</code>): complete o
                    <code>prod.yaml</code> com 3 réplicas, a tag <code>"1.1"</code>, o Ingress ligado com o host <code>loja.prod</code> e
                    cada pod reservando <b>100m</b> de CPU. Instale a release <code>loja-prod</code> no namespace <code>prod</code>.</p>`,
        dica: 'replicaCount, image.tag, ingress: { enabled: true, host: loja.prod } e resources: { requests: { cpu: 100m } }. helm install loja-prod kube-learn/loja -f prod.yaml -n prod --create-namespace',
        novos: { 'prod.yaml': valoresProd(false) },
        solucao: VALORES,
        solucaoTerminal: ['helm install loja-prod kube-learn/loja -f prod.yaml -n prod --create-namespace'],
        testes: [noCluster('a loja de prod', [
          { release: { nome: 'loja-prod', ns: 'prod', status: 'deployed' } },
          { pods: 'app.kubernetes.io/instance=loja-prod', ns: 'prod', prontos: 3, imagem: 'kubelearn/loja:1.1' },
          { objeto: 'ingress/loja-prod', ns: 'prod', campo: 'spec.rules[0].host', igual: 'loja.prod' },
          { objeto: 'deployment/loja-prod', ns: 'prod', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '100m' },
        ])],
      },
      {
        titulo: 'A homologação quebrada',
        dificuldade: 'medio',
        terminal: true,
        cluster: 'helm-quebrado',
        vidaReal: 'Na filial de testes, alguém trocou o acabamento por um lote com defeito. A construtora guarda cada versão do projeto: dá para voltar à anterior.',
        limite: 'O rollback cria uma revisão nova com os valores antigos; ele não apaga o histórico, e a revisão com defeito continua lá para quem quiser investigar.',
        enunciado: `<p>Na homologação (a release <code>loja</code>, no namespace <code>default</code>), alguém fez um upgrade, e a loja nova
                    não para de cair. <b>Pelo terminal</b>, descubra o que mudou e volte a release para a última revisão que funcionava, sem
                    desinstalar nada.</p>`,
        dica: 'helm history loja mostra as revisões; helm get values loja --revision 2 mostra o que mudou. Para voltar: helm rollback loja 1.',
        solucao: VALORES,
        solucaoTerminal: ['helm rollback loja 1'],
        testes: [noCluster('a homologação de volta', [
          { release: { nome: 'loja', status: 'deployed', descricao: 'Rollback to 1' } },
          { pods: 'app.kubernetes.io/instance=loja', prontos: 2, imagem: 'kubelearn/loja:1.0' },
        ])],
      },
      {
        titulo: 'A mesma loja, com Kustomize',
        dificuldade: 'medio',
        vidaReal: 'Outra equipe prefere a planta comum com folhas de ajuste: a base é YAML puro, e cada folha gera o quadro de avisos do ambiente dela.',
        limite: 'O gerador põe um hash no nome do ConfigMap (loja-config-abc123) e troca a referência no Deployment: mudou a cor, muda o nome, e os pods são recriados.',
        enunciado: `<p>A pasta <code>base/</code> tem o Deployment e o Service da loja, e o overlay <code>overlays/dev</code> usa a base. Mas o
                    <code>kubectl apply -k overlays/dev</code> só cria o namespace. Faça a loja de dev subir de verdade: a base lê as
                    variáveis do ConfigMap <code>loja-config</code>, que o overlay de dev precisa gerar com <code>COR=amarelo</code>.</p>`,
        dica: 'O base/kustomization.yaml não lista nada em resources: liste deployment.yaml e service.yaml. No overlay: configMapGenerator: [{ name: loja-config, literals: [COR=amarelo] }]. Veja o resultado antes de aplicar: kubectl kustomize overlays/dev.',
        novos: kustomizacao({ pronta: false }),
        solucao: { ...VALORES, ...kustomizacao() },
        testes: [comK('overlays/dev', 'o dev sobe, amarelo', [
          { semErros: true },
          { pods: 'app=loja', ns: 'dev-k', prontos: 1 },
          { objeto: 'svc/loja', ns: 'dev-k', existe: true },
          { env: { pods: 'app=loja', ns: 'dev-k', nome: 'COR', igual: 'amarelo' } },
        ])],
      },
      {
        titulo: 'Ticket: prod com Kustomize',
        dificuldade: 'dificil',
        vidaReal: 'A folha de ajustes da filial grande: o bairro dela, mais atendentes, a versão nova, a cor dela e energia reservada.',
        limite: 'Os overlays só enxergam a base: um ajuste que todos querem vai na base, não copiado em cada folha.',
        enunciado: ticket('Léo, da equipe de plataforma', 'A equipe do Kustomize quer o ambiente de prod também. Mesma base, nada de copiar YAML: o que muda em prod fica na folha de prod.', [
          '<code>kubectl apply -k overlays/prod</code> põe tudo no namespace <code>prod-k</code>.',
          'Prod roda <b>3</b> pods da <code>kubelearn/loja:1.1</code>, com <code>COR=azul</code>.',
          'Cada pod de prod reserva <b>100m</b> de CPU e <b>64Mi</b> de memória.',
          'A base não muda: o dev continua com 1 pod da 1.0, amarelo, sem reserva nenhuma.',
        ]),
        dica: 'No overlay de prod: namespace, replicas, images (newTag) e configMapGenerator, como no dev; a reserva entra por um patch (patches) que só o prod aplica.',
        novos: { 'overlays/prod/kustomization.yaml': 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n- ../../base\n- namespace.yaml\n', 'overlays/prod/namespace.yaml': NS('prod-k') },
        solucao: { ...VALORES, ...kustomizacao({ prod: true }) },
        testes: [
          comK('overlays/prod', 'prod: 3 pods da 1.1, azuis', [
            { semErros: true },
            { pods: 'app=loja', ns: 'prod-k', prontos: 3, imagem: 'kubelearn/loja:1.1' },
            { env: { pods: 'app=loja', ns: 'prod-k', nome: 'COR', igual: 'azul' } },
          ]),
          comK('overlays/prod', 'prod reserva CPU e memória', [
            { objeto: 'deployment/loja', ns: 'prod-k', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '100m' },
            { objeto: 'deployment/loja', ns: 'prod-k', campo: 'spec.template.spec.containers[0].resources.requests.memory', igual: '64Mi' },
          ]),
          comK('overlays/dev', 'o dev continua como estava', [
            { pods: 'app=loja', ns: 'dev-k', prontos: 1, imagem: 'kubelearn/loja:1.0' },
            { env: { pods: 'app=loja', ns: 'dev-k', nome: 'COR', igual: 'amarelo' } },
            { objeto: 'deployment/loja', ns: 'dev-k', campo: 'spec.template.spec.containers[0].resources.requests', existe: false },
          ], { oculto: true }),
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
