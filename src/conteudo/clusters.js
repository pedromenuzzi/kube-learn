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

export const CLUSTERS = {
  vazio: {},
  'loja-3-replicas': { manifestos: LOJA(3, '1.0') },
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
