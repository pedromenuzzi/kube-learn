// @vitest-environment node
// YAML pela metade nunca derruba o simulador: o aluno clica em Aplicar com um `labels:` ou um `- ` ainda sem nada (null
// no YAML). Cada manifesto abaixo é aplicado com cada mapa e cada lista em null (e cada item de lista em null), primeiro
// num cluster limpo (create) e depois por cima do manifesto certo (o merge do apply); o relógio anda e get, describe,
// run, auth can-i e o tráfego entre pods continuam respondendo.
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { criarCluster } from '../src/k8s/cluster.js';
import { kubectl } from '../src/k8s/kubectl/index.js';
import { uidDaConta } from '../src/k8s/seguranca.js';

// O dono é a ServiceAccount default (o uid dela é fixo): o Pod não some no coletor de lixo e o kubelet roda ele.
const MOLDE_DE_POD = `
    metadata:
      labels:
        app: web
      annotations:
        nota: um
      ownerReferences:
      - apiVersion: v1
        kind: ServiceAccount
        name: default
        uid: ${uidDaConta('default', 'default')}
    spec:
      imagePullSecrets:
      - name: registro
      nodeSelector:
        kubernetes.io/os: linux
      tolerations:
      - key: dedicado
        operator: Exists
      securityContext:
        runAsNonRoot: false
      volumes:
      - name: dados
        emptyDir: {}
      - name: config
        configMap:
          name: cfg
          items:
          - key: a
            path: a.txt
      initContainers:
      - name: prepara
        image: busybox:1.36
        command: ["sh", "-c", "true"]
      containers:
      - name: web
        image: nginx:1.27
        command: ["nginx"]
        args: ["-g", "daemon off;"]
        ports:
        - containerPort: 80
          name: http
        env:
        - name: COR
          value: azul
        - name: SENHA
          valueFrom:
            secretKeyRef:
              name: segredo
              key: senha
              optional: true
        envFrom:
        - configMapRef:
            name: cfg
            optional: true
        volumeMounts:
        - name: dados
          mountPath: /dados
        resources:
          requests:
            cpu: 100m
            memory: 64Mi
          limits:
            cpu: 200m
            memory: 128Mi
        livenessProbe:
          httpGet:
            path: /
            port: 80
          periodSeconds: 5
        readinessProbe:
          tcpSocket:
            port: 80
        startupProbe:
          exec:
            command: ["sh", "-c", "true"]
        securityContext:
          capabilities:
            drop: ["ALL"]`;

const seletor = '\n  selector:\n    matchLabels:\n      app: web';
// O StatefulSet e o DaemonSet usam um molde enxuto: o molde completo já passa pelo Pod e pelo Deployment.
const MOLDE_ENXUTO = '\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: nginx:1.27';

const MANIFESTOS = {
  Deployment: `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  labels:\n    app: web\nspec:\n  replicas: 2\n  strategy:\n    rollingUpdate:\n      maxSurge: 1${seletor}\n  template:${MOLDE_DE_POD}`,
  StatefulSet: `apiVersion: apps/v1\nkind: StatefulSet\nmetadata:\n  name: web\nspec:\n  serviceName: web\n  replicas: 1${seletor}\n  volumeClaimTemplates:\n  - metadata:\n      name: disco\n    spec:\n      accessModes: ["ReadWriteOnce"]\n      resources:\n        requests:\n          storage: 1Gi\n  template:${MOLDE_ENXUTO}`,
  DaemonSet: `apiVersion: apps/v1\nkind: DaemonSet\nmetadata:\n  name: web\nspec:${seletor}\n  template:${MOLDE_ENXUTO}`,
  Service: `apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - name: http
    port: 80
    targetPort: 80
  - name: outra
    port: 81
`,
  LimitRange: `apiVersion: v1
kind: LimitRange
metadata:
  name: padrao
spec:
  limits:
  - type: Container
    default:
      cpu: 200m
      memory: 128Mi
    defaultRequest:
      cpu: 100m
    max:
      memory: 1Gi
`,
  Namespace: `apiVersion: v1
kind: Namespace
metadata:
  name: loja
  labels:
    pod-security.kubernetes.io/enforce: baseline
  annotations:
    nota: um
`,
  RoleBinding: `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ana-le
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view
`,
  ClusterRoleBinding: `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ana-ve
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
- kind: ServiceAccount
  name: robo
  namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view
`,
  ServiceAccount: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: robo
secrets:
- name: robo-token
imagePullSecrets:
- name: registro
`,
  NetworkPolicy: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: catraca
spec:
  podSelector:
    matchExpressions:
    - key: run
      operator: Exists
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchExpressions:
        - key: run
          operator: In
          values: ["y"]
      namespaceSelector:
        matchExpressions:
        - key: kubernetes.io/metadata.name
          operator: In
          values: ["default"]
    ports:
    - protocol: TCP
      port: 80
  egress:
  - to:
    - ipBlock:
        cidr: 10.0.0.0/8
        except:
        - 10.96.0.0/12
    - namespaceSelector: {}
    ports:
    - protocol: UDP
      port: 53
    - port: 80
`,
  CustomResourceDefinition: `apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.exemplo.com
spec:
  group: exemplo.com
  names:
    kind: Backup
    plural: backups
    shortNames:
    - bk
  scope: Namespaced
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              horario:
                type: string
    additionalPrinterColumns:
    - name: Horario
      type: string
      jsonPath: .spec.horario
`,
  HorizontalPodAutoscaler: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 1
  maxReplicas: 3
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
`,
};

const molde = parse(MANIFESTOS.Deployment).spec.template;
MANIFESTOS.Pod = stringify({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'web', ...molde.metadata }, spec: molde.spec });

/** Cada mapa e cada lista (e cada item de lista, o `- ` sem nada): o objeto com aquele ponto trocado por null. */
function* variantes(obj) {
  const caminhos = [];
  const andar = (v, cam) => {
    if (!v || typeof v !== 'object') return;
    if (cam.length) caminhos.push(cam);
    for (const [k, filho] of Object.entries(v)) {
      const c = [...cam, Array.isArray(v) ? Number(k) : k];
      if (Array.isArray(v) && typeof filho !== 'object') caminhos.push(c); // o item de uma lista de textos (except, args...)
      else andar(filho, c);
    }
  };
  andar(obj, []);
  for (const c of caminhos) {
    const copia = structuredClone(obj);
    let alvo = copia;
    for (const p of c.slice(0, -1)) alvo = alvo[p];
    alvo[c.at(-1)] = null;
    yield [c.join('.'), copia];
  }
}

// Uns segundos sozinho; com a suíte inteira em paralelo, a máquina cheia multiplica isso (o Deployment chegou a 45 s).
const LONGO = 120_000;

// Com o ConfigMap que o molde monta: sem ele, o pod para no FailedMount e o kubelet nunca chega ao pull nem às sondas.
const novoCluster = () => {
  const c = criarCluster({ metricas: true });
  kubectl(c, 'kubectl create configmap cfg --from-literal=a=um');
  c.avancar('1m');
  return c;
};

// O que cada kind ainda precisa para o defeito aparecer: a catraca só é conferida num tráfego entre pods.
const DEPOIS = {
  NetworkPolicy: ['kubectl run x --image=nginx:1.27', 'kubectl expose pod x --port=80', 'kubectl run y --image=busybox:1.36 --rm -it --restart=Never -- wget -qO- -T 2 x'],
  CustomResourceDefinition: ['kubectl api-resources', 'kubectl get backups -A', 'kubectl explain backup.spec'],
};

/** Os comandos que a tela da missão roda depois (e o relógio andando): nada pode lançar. */
function usar(c, kind, nome) {
  const k = (linha) => kubectl(c, linha, { arquivos: {} });
  c.avancar('30s');
  k(`kubectl get ${kind} -A`);
  k(`kubectl describe ${kind} ${nome}`);
  k('kubectl get pods -A');
  k('kubectl run solto --image=nginx:1.27');
  c.avancar('10s');
  for (const linha of DEPOIS[kind] ?? []) {
    k(linha);
    c.avancar('10s');
  }
  k('kubectl describe pods');
  k('kubectl auth can-i list pods --as ana');
  k('kubectl auth can-i --list --as ana');
}

describe('YAML pela metade nunca derruba o simulador', () => {
  for (const [kind, texto] of Object.entries(MANIFESTOS)) {
    it(`${kind}: cada mapa e cada lista em null, criando e por cima do certo`, { timeout: LONGO }, () => {
      const certo = parse(texto);
      const nome = certo.metadata.name;
      expect(kubectl(novoCluster(), 'kubectl apply -f certo.yaml', { arquivos: { 'certo.yaml': texto } }).stderr, 'o certo é aceito').toBe('');
      for (const [onde, variante] of variantes(certo)) {
        const arquivos = { 'a.yaml': stringify(variante), 'certo.yaml': texto };
        expect(() => {
          const c = novoCluster();
          kubectl(c, 'kubectl apply -f a.yaml', { arquivos });
          usar(c, kind, nome);
          const d = novoCluster();
          kubectl(d, 'kubectl apply -f certo.yaml', { arquivos });
          d.avancar('10s');
          kubectl(d, 'kubectl apply -f a.yaml', { arquivos });
          usar(d, kind, nome);
        }, `${kind} com ${onde}: null`).not.toThrow();
      }
    });
  }

  it('kustomization: cada campo e cada item em null, e o recurso que ele lê também', { timeout: LONGO }, () => {
    const k = parse(`resources:
- web.yaml
namespace: loja
namePrefix: dev-
commonLabels:
  time: a
labels:
- pairs:
    camada: web
  includeSelectors: false
commonAnnotations:
  nota: um
images:
- name: nginx
  newTag: "1.28"
replicas:
- name: web
  count: 2
configMapGenerator:
- name: cfg
  literals:
  - COR=azul
  files:
  - nota.txt
  options:
    disableNameSuffixHash: true
secretGenerator:
- name: segredo
  literals:
  - SENHA=x
generatorOptions:
  disableNameSuffixHash: false
patches:
- target:
    kind: Deployment
    name: web
  patch: |-
    - op: replace
      path: /spec/replicas
      value: 3
- path: menos.yaml
`);
    const base = { 'k/kustomization.yaml': stringify(k), 'k/web.yaml': MANIFESTOS.Deployment, 'k/nota.txt': 'oi', 'k/menos.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 1\n', 'ns.yaml': 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: loja\n' };
    // O kustomization pela metade e, com ele inteiro, o recurso que ele lê pela metade.
    const casos = [
      ...[...variantes(k)].map(([onde, v]) => [`kustomization com ${onde}: null`, { 'k/kustomization.yaml': stringify(v) }]),
      ...[...variantes(parse(MANIFESTOS.Deployment))].map(([onde, v]) => [`web.yaml com ${onde}: null`, { 'k/web.yaml': stringify(v) }]),
    ];
    for (const [rotulo, troca] of casos) {
      const arquivos = { ...base, ...troca };
      expect(() => {
        const c = novoCluster();
        kubectl(c, 'kubectl apply -f ns.yaml', { arquivos });
        kubectl(c, 'kubectl kustomize k', { arquivos });
        kubectl(c, 'kubectl apply -k k', { arquivos });
        c.avancar('1m');
        kubectl(c, 'kubectl get all -n loja', { arquivos });
      }, rotulo).not.toThrow();
    }
  });
});

describe('o que a validação recusa e o que os controladores aguentam', () => {
  const aplicar = (c, yaml) => kubectl(c, 'kubectl apply -f a.yaml', { arquivos: { 'a.yaml': yaml } });

  it('`containers:` com um `-` sem nada: Required value no nome e na imagem, sem exceção', () => {
    const r = aplicar(novoCluster(), 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: vazio\nspec:\n  containers:\n  -\n');
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('spec.containers[0].name: Required value');
    expect(r.saida).toContain('spec.containers[0].image: Required value');
  });

  it('um `labels:` vazio no molde: o seletor não bate (sem TypeError), e a anotação guarda o null do arquivo', () => {
    const c = novoCluster();
    const r = aplicar(c, MANIFESTOS.Deployment.replace(/ {4}metadata:\n {6}labels:\n {8}app: web\n {6}annotations:\n {8}nota: um\n/, '    metadata:\n      labels:\n'));
    expect(r.saida).toContain('`selector` does not match template `labels`');
    aplicar(c, 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: p\n  labels:\nspec:\n  containers:\n  - name: c\n    image: nginx:1.27\n');
    const p = c.obter('Pod', 'default', 'p');
    expect(p.metadata.labels).toBeUndefined();
    expect(p.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']).toContain('"labels":null');
  });

  it('um pod guardado com envFrom sem fonte: o relógio anda e o get responde', () => {
    const c = novoCluster();
    c.criar({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'p', namespace: 'default' }, spec: { containers: [{ name: 'c', image: 'nginx:1.27', envFrom: [{}] }] } });
    expect(() => c.avancar('1m')).not.toThrow();
    expect(kubectl(c, 'kubectl get pods').saida).toMatch(/^p\s+1\/1\s+Running/m);
  });

  it('um HPA guardado sem o kind do alvo e um RoleBinding sem roleRef não derrubam o avancar nem o auth can-i', () => {
    const c = novoCluster();
    c.criar({ apiVersion: 'autoscaling/v2', kind: 'HorizontalPodAutoscaler', metadata: { name: 'h', namespace: 'default' }, spec: { scaleTargetRef: { name: 'web' }, maxReplicas: 3 } });
    // O roleRef sem kind não entra pela criação (a checagem de escalada recusa); guardado por baixo, o can-i aguenta.
    expect(() => c.criar({ apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata: { name: 'rb', namespace: 'default' }, subjects: [{ kind: 'User', name: 'ana' }] })).toThrow('unsupported role reference kind: ""');
    const rb = c.criar({ apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata: { name: 'rb', namespace: 'default' }, subjects: [{ kind: 'User', name: 'ana' }], roleRef: { kind: 'ClusterRole', name: 'view' } });
    c.substituir(rb, { ...structuredClone(rb), roleRef: undefined });
    c.criar({ apiVersion: 'v1', kind: 'LimitRange', metadata: { name: 'lr', namespace: 'default' }, spec: {} });
    expect(() => c.avancar('1m')).not.toThrow();
    expect(kubectl(c, 'kubectl auth can-i list pods --as ana').saida).toBe('no\n');
    expect(kubectl(c, 'kubectl run x --image=nginx:1.27').saida).toBe('pod/x created\n');
  });
});
