// Os clusters de partida dos exercícios: nodes e o que já estava aplicado antes do aluno chegar.
import { criarCluster } from '../k8s/cluster.js';
import { kubectl } from '../k8s/kubectl/index.js';
import { yaml } from './util.js';

const LOJA = (replicas, versao) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
    labels:
      app: loja
  spec:
    replicas: ${replicas}
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
          image: kubelearn/loja:${versao}
          ports:
          - containerPort: 8080
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: loja
  spec:
    selector:
      app: loja
    ports:
    - port: 80
      targetPort: 8080
`;

const pod = (nome, imagem, { labels = { app: nome }, ns, comando } = {}) => yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: ${nome}
${ns ? `    namespace: ${ns}\n` : ''}    labels:
${Object.entries(labels).map(([k, v]) => `      ${k}: ${v}`).join('\n')}
  spec:
    containers:
    - name: ${nome}
      image: ${imagem}
${comando ? `      command: ${JSON.stringify(comando)}\n` : ''}`;

/** O prédio de investigação do nível 1: um pouco de tudo para o aluno achar com o kubectl. */
const NIVEL1 = [
  'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: vendas\n',
  pod('caixa', 'busybox:1.36', { ns: 'vendas', comando: ['sleep', '3600'] }),
  pod('misterio', 'nginx:1.27'),
  pod('diario', 'kubelearn/diario:1.0'),
  pod('cofre', 'kubelearn/cofre:1.0'),
  ...['suporte-1', 'suporte-2', 'suporte-3'].map((n) => pod(n, 'busybox:1.36', { labels: { equipe: 'suporte' }, comando: ['sleep', '3600'] })),
  ...['vendas-1', 'vendas-2'].map((n) => pod(n, 'busybox:1.36', { labels: { equipe: 'vendas' }, comando: ['sleep', '3600'] })),
  pod('intruso', 'busybox:1.36', { comando: ['sleep', '3600'] }),
  pod('vitrine', 'ngnix:1.27'),
].join('---\n');

const LOJA_DEP = (replicas = 3, versao = '1.0', nome = 'loja', app = nome) => LOJA(replicas, versao).split('---')[0]
  .replaceAll('name: loja', `name: ${nome}`).replaceAll('app: loja', `app: ${app}`);
const SVC = (nome, porta, alvo, app = nome) => yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: ${nome}
  spec:
    selector:
      app: ${app}
    ports:
    - port: ${porta}
      targetPort: ${alvo}
`;
const DEP = (nome, imagem, replicas, porta) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: ${nome}
  spec:
    replicas: ${replicas}
    selector:
      matchLabels:
        app: ${nome}
    template:
      metadata:
        labels:
          app: ${nome}
      spec:
        containers:
        - name: ${nome}
          image: ${imagem}
          ports:
          - containerPort: ${porta}
`;
const INGRESS_CLASS = yaml`
  apiVersion: networking.k8s.io/v1
  kind: IngressClass
  metadata:
    name: traefik
    annotations:
      ingressclass.kubernetes.io/is-default-class: "true"
  spec:
    controller: traefik.io/ingress-controller
`;
const GATEWAY = yaml`
  apiVersion: gateway.networking.k8s.io/v1
  kind: GatewayClass
  metadata:
    name: kube-learn
  spec:
    controllerName: kube-learn.dev/gateway-controller
  ---
  apiVersion: gateway.networking.k8s.io/v1
  kind: Gateway
  metadata:
    name: portaria
  spec:
    gatewayClassName: kube-learn
    listeners:
    - name: http
      port: 80
      protocol: HTTP
`;
const juntar = (...docs) => docs.map((d) => d.trim()).join('\n---\n');

export const CLUSTERS = {
  vazio: {},
  'loja-3-replicas': { manifestos: LOJA(3, '1.0') },
  'loja-4-replicas': { manifestos: LOJA(4, '1.0') },
  relatorio: {
    manifestos: yaml`
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: relatorio
      spec:
        replicas: 2
        selector:
          matchLabels:
            app: relatorio
        template:
          metadata:
            labels:
              app: relatorio
          spec:
            containers:
            - name: relatorio
              image: nginx:1.27
    `,
  },
  // A loja foi para a 2.0, que cai na subida: o rollout travou (os 3 pods da 1.0 seguram as pontas).
  'loja-bugada': { manifestos: LOJA(3, '1.0'), comandos: ['kubectl set image deployment/loja loja=kubelearn/loja:2.0-bugada'] },
  // Três revisões, cada uma com o motivo anotado.
  'loja-historico': {
    manifestos: LOJA(3, '1.0'),
    comandos: [
      "kubectl annotate deployment loja kubernetes.io/change-cause='versao 1.0: abertura da loja'",
      'kubectl set image deployment/loja loja=kubelearn/loja:1.1',
      "kubectl annotate deployment loja kubernetes.io/change-cause='versao 1.1: carrinho novo' --overwrite",
      'kubectl set image deployment/loja loja=kubelearn/loja:2.0',
      "kubectl annotate deployment loja kubernetes.io/change-cause='versao 2.0: tudo novo (e o cliente reclamou)' --overwrite",
    ],
  },
  nivel1: { manifestos: NIVEL1 },
  // Nível 3
  'loja-sem-servico': { manifestos: LOJA_DEP() },
  estoque: {
    manifestos: juntar(
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: estoque',
      DEP('estoque', 'nginx:1.27', 2, 80).replace('metadata:\n  name: estoque', 'metadata:\n  name: estoque\n  namespace: estoque'),
      SVC('estoque', 80, 80).replace('metadata:\n  name: estoque', 'metadata:\n  name: estoque\n  namespace: estoque'),
      pod('cliente', 'busybox:1.36', { comando: ['sleep', '3600'] }),
    ),
  },
  banco: { manifestos: DEP('banco', 'redis:7', 3, 6379) },
  praca: { manifestos: juntar(INGRESS_CLASS, LOJA_DEP(2), SVC('loja', 80, 8080), DEP('blog', 'httpd:2.4', 2, 80), SVC('blog', 80, 80)) },
  'condominio-gateway': { manifestos: juntar(GATEWAY, LOJA_DEP(2), SVC('loja', 80, 8080)) },
  canario: { manifestos: juntar(GATEWAY, LOJA_DEP(3), SVC('loja', 80, 8080), LOJA_DEP(1, '1.1', 'loja-v2'), SVC('loja-v2', 80, 8080)) },
};

/** Monta o cluster de partida (sempre igual para a mesma semente). */
export function montarCluster(nome = 'vazio', semente = nome) {
  const def = CLUSTERS[nome];
  if (!def) throw new Error(`cluster de partida desconhecido: ${nome}`);
  const c = criarCluster({ nodes: def.nodes, semente });
  if (def.manifestos) {
    const r = kubectl(c, 'kubectl apply -f inicial.yaml', { arquivos: { 'inicial.yaml': def.manifestos } });
    if (r.codigo) throw new Error(`cluster ${nome}: ${r.saida}`);
    c.avancar('1m');
  }
  // Comandos que "alguém" rodou antes do aluno chegar (cada um seguido de 1 minuto).
  for (const linha of def.comandos ?? []) {
    const r = kubectl(c, linha);
    if (r.codigo) throw new Error(`cluster ${nome}: ${linha}: ${r.saida}`);
    c.avancar('1m');
  }
  return c;
}
