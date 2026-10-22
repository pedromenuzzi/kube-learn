// Todos os itens da trilha, na ordem dos níveis.
import { NIVEIS } from './niveis.js';
import { TROUBLESHOOTING } from './troubleshooting.js';
import { OFICINA } from './oficina.js';
import { plantaoDoDia } from '../jogo/plantao.js';

export { NIVEIS, TROUBLESHOOTING, OFICINA };
export const ITENS = NIVEIS.flatMap((n) => n.itens);

const POR_ID = new Map([...ITENS, ...TROUBLESHOOTING, ...OFICINA].map((i) => [i.id, i]));
/** O item pelo id; 'plantao-AAAA-MM-DD' é o Plantão daquele dia, montado na hora. */
export const acharItem = (id) => POR_ID.get(id) ?? (id?.startsWith('plantao-') ? plantaoDoDia(id.slice(8)) : undefined);

/** O item que vem depois deste: na trilha, o seguinte da ordem dos níveis; nas seções, o próximo da seção. */
export function proximoDe(item) {
  if (item.secao === 'plantao') return null; // um por dia
  const lista = item.secao === 'oficina' ? OFICINA : item.secao ? TROUBLESHOOTING : ITENS;
  return lista[lista.indexOf(item) + 1] ?? null;
}

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
