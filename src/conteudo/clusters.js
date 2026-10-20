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

export const CLUSTERS = {
  vazio: {},
  'loja-3-replicas': { manifestos: LOJA(3, '1.0') },
  nivel1: { manifestos: NIVEL1 },
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
  return c;
}
