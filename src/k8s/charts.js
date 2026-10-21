// Os charts do repositório kube-learn, já montados: sem template Go, cada arquivo do chart é uma função dos valores
// que devolve o mesmo texto que o Helm renderizaria (o chart de verdade, com os templates Go, fica no script do
// golden, e os dois são comparados).
import { stringify } from 'yaml';

/** O toYaml do Helm (chaves em ordem, como o sigs.k8s.io/yaml) com o nindent: cada linha recuada, depois de uma quebra. */
const toYaml = (v) => stringify(ordenar(v), { indentSeq: false, lineWidth: 0 }).replace(/\n$/, '');
const ordenar = (v) => (Array.isArray(v) ? v.map(ordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v);
const nindent = (n, texto) => `\n${texto.split('\n').map((l) => `${' '.repeat(n)}${l}`).join('\n')}`;
/** Um valor como o Go imprime num template ({{ .Values.x }}). */
const go = (v) => (v === null || v === undefined ? '<no value>' : typeof v === 'object' ? `map[${Object.keys(v).sort().map((k) => `${k}:${go(v[k])}`).join(' ')}]` : String(v));
const vazio = (v) => v === undefined || v === null || v === '' || v === false || v === 0 || (typeof v === 'object' && !Object.keys(v).length);
const padrao = (v, p) => (vazio(v) ? p : v);

const LOJA_VALORES = `# Quantos atendentes (pods) a loja tem.
replicaCount: 2

image:
  repository: kubelearn/loja
  # Vazio: usa a appVersion do chart.
  tag: ""

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  host: loja.local

resources: {}
`;

const rotulos = (r, c, comVersao, v) => `  labels:
    app.kubernetes.io/name: ${c.nome}
    app.kubernetes.io/instance: ${r.nome}
${comVersao ? `    app.kubernetes.io/version: ${JSON.stringify(go(padrao(v.image?.tag, c.appVersion)))}\n` : ''}    app.kubernetes.io/managed-by: Helm
    helm.sh/chart: ${c.nome}-${c.versao}`;

export const CHARTS = {
  loja: {
    nome: 'loja',
    versao: '1.0.0',
    appVersion: '1.0',
    descricao: 'A loja do kube-learn (Deployment, Service e, se quiser, um Ingress).',
    chartYaml: 'apiVersion: v2\nname: loja\ndescription: A loja do kube-learn (Deployment, Service e, se quiser, um Ingress).\ntype: application\nversion: 1.0.0\nappVersion: "1.0"\n',
    valoresTexto: LOJA_VALORES,
    modelos: [
      ['templates/deployment.yaml', (r, c, v) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${r.nome}
${rotulos(r, c, true, v)}
spec:
  replicas: ${go(v.replicaCount)}
  selector:
    matchLabels:
      app.kubernetes.io/name: ${c.nome}
      app.kubernetes.io/instance: ${r.nome}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ${c.nome}
        app.kubernetes.io/instance: ${r.nome}
    spec:
      containers:
      - name: loja
        image: "${go(v.image?.repository)}:${go(padrao(v.image?.tag, c.appVersion))}"
        ports:
        - name: http
          containerPort: 8080
        readinessProbe:
          httpGet:
            path: /healthz
            port: http${vazio(v.resources) ? '' : `
        resources:${nindent(10, toYaml(v.resources))}`}
`],
      ['templates/ingress.yaml', (r, c, v) => (vazio(v.ingress?.enabled) ? '\n' : `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${r.nome}
${rotulos(r, c, false, v)}
spec:
  rules:
  - host: ${go(v.ingress?.host)}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${r.nome}
            port:
              number: ${go(v.service?.port)}
`)],
      ['templates/service.yaml', (r, c, v) => `apiVersion: v1
kind: Service
metadata:
  name: ${r.nome}
${rotulos(r, c, false, v)}
spec:
  type: ${go(v.service?.type)}
  selector:
    app.kubernetes.io/name: ${c.nome}
    app.kubernetes.io/instance: ${r.nome}
  ports:
  - name: http
    port: ${go(v.service?.port)}
    targetPort: http
`],
    ],
    notas: (r, c, v) => `A loja ${r.nome} está no ar, com ${go(v.replicaCount)} atendentes (versão ${go(padrao(v.image?.tag, c.appVersion))}).

Para testar do seu computador:
  kubectl port-forward svc/${r.nome} 8080:${go(v.service?.port)}
  curl http://localhost:8080
`,
  },
};
