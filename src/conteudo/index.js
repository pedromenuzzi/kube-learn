// Todos os itens da trilha. Na Fase 3/4 vira a lista de níveis (andares).
import { EXEMPLOS } from './exemplos.js';

export const ITENS = [...EXEMPLOS];

const POR_ID = new Map(ITENS.map((i) => [i.id, i]));
export const acharItem = (id) => POR_ID.get(id);

/** O "exercício" do playground: sem testes, com um arquivo de exemplo. */
export const PLAYGROUND = {
  id: 'livre',
  tipo: 'livre',
  titulo: 'Playground livre',
  cluster: 'vazio',
  enunciado: '<p>Um cluster só seu, com 1 control plane e 2 workers. Escreva YAML, aplique e explore com o <code>kubectl</code>. Nada aqui vale nota.</p>',
  inicial: {
    'nginx.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
`,
  },
  testes: [],
};
