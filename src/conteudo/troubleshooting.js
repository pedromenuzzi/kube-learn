// A seção Troubleshooting: clusters que chegam quebrados com mais de um defeito, um atrás do outro (cada conserto
// revela o próximo). Fica fora da trilha: abre desde o começo e não vale XP nem contêiner no navio.
import { yaml } from './util.js';
import { incidente } from './nivel9.js';

/** Os clusters de partida de cada incidente, em clusters.js. */
export const PARTIDA_TS = {};

// ---------- A loja fora do ar: a imagem, a sonda e o Service ----------
const loja = ({ tag, sonda }) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
  spec:
    replicas: 3
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
          image: kubelearn/loja:${tag}
          ports:
          - containerPort: 8080
          readinessProbe:
            httpGet:
              path: ${sonda}
              port: 8080
`;
const servicoDaLoja = (alvo) => yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: loja
  spec:
    selector:
      app: loja
    ports:
    - port: 80
      targetPort: ${alvo}
`;
const entrada = yaml`
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
              name: loja
              port:
                number: 80
`;
const classe = yaml`
  apiVersion: networking.k8s.io/v1
  kind: IngressClass
  metadata:
    name: traefik
    annotations:
      ingressclass.kubernetes.io/is-default-class: "true"
  spec:
    controller: traefik.io/ingress-controller
`;

// ---------- Ninguém acha ninguém: o CoreDNS desligado e a catraca sem DNS ----------
const estoque = yaml`
  apiVersion: v1
  kind: Namespace
  metadata:
    name: estoque
  ---
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: estoque
    namespace: estoque
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: estoque
    template:
      metadata:
        labels:
          app: estoque
      spec:
        containers:
        - name: estoque
          image: kubelearn/loja:1.0
          ports:
          - containerPort: 8080
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: estoque
    namespace: estoque
  spec:
    selector:
      app: estoque
    ports:
    - port: 80
      targetPort: 8080
`;
const vitrine = yaml`
  apiVersion: v1
  kind: Namespace
  metadata:
    name: loja
  ---
  apiVersion: v1
  kind: Pod
  metadata:
    name: vitrine
    namespace: loja
    labels:
      app: vitrine
  spec:
    containers:
    - name: vitrine
      image: busybox:1.36
      command: ["sleep", "3600"]
`;
const catraca = (comDns) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: so-o-estoque
    namespace: loja
  spec:
    podSelector: {}
    policyTypes:
    - Egress
    egress:
    - to:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: estoque
      ports:
      - protocol: TCP
        port: 8080
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
const zelador = yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: cliente
  spec:
    containers:
    - name: cliente
      image: busybox:1.36
      command: ["sleep", "3600"]
  ---
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: admin
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: admin
    template:
      metadata:
        labels:
          app: admin
      spec:
        containers:
        - name: admin
          image: nginx:1.27
          ports:
          - containerPort: 80
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: admin
  spec:
    selector:
      app: admin
    ports:
    - port: 80
      targetPort: 80
`;

// ---------- A fila que não anda: o node interditado, a placa da reforma e o pedido de memória ----------
const relatorio = (memoria) => yaml`
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
          image: kubelearn/relatorio:1.0
          resources:
            requests:
              cpu: 100m
              memory: ${memoria}
`;

const daSecao = (dados) => ({ ...incidente({ partidas: PARTIDA_TS, ...dados }), secao: 'troubleshooting', morador: dados.morador, relato: dados.relato });

export const TROUBLESHOOTING = [
  daSecao({
    id: 'ts-loja-fora-do-ar',
    titulo: 'A loja fora do ar',
    dificuldade: 'medio',
    morador: 'Seu Jorge, dono da loja do térreo',
    relato: 'Atualizamos a loja ontem à noite e desde então o site não abre. O estagiário já reiniciou tudo duas vezes e nada.',
    tarefa: `<p>Faça <code>curl http://loja.local</code> (do seu computador, pela entrada do Ingress) responder. Há mais de um
             defeito: cada conserto revela o próximo.</p>`,
    vidaReal: 'A loja não abre, e o problema pode estar na mercadoria (a imagem), no atendente (a sonda) ou no ramal (o Service): o síndico confere um por um, do depósito até o balcão.',
    limite: 'Na loja de verdade, você vê o balcão fechado. No cluster, cada camada falha em silêncio: só os eventos, os endpoints e o describe contam o que está acontecendo.',
    dica: 'kubectl get pods; kubectl describe pod NOME (Events); kubectl get endpoints loja; kubectl describe svc loja. Um defeito por vez.',
    comoSaber: '<code>curl http://loja.local</code> devolve o JSON da loja, com as 3 réplicas prontas.',
    extras: [classe],
    arquivos: { 'loja.yaml': loja({ tag: '1.0.1', sonda: '/health' }), 'servico.yaml': servicoDaLoja(80), 'entrada.yaml': entrada },
    correcao: { 'loja.yaml': loja({ tag: '1.0', sonda: '/healthz' }), 'servico.yaml': servicoDaLoja(8080), 'entrada.yaml': entrada },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.0' },
      { requisicao: { de: 'fora', url: 'http://loja.local', status: 200, corpo: '"app":"loja"' } },
    ],
  }),

  daSecao({
    id: 'ts-ninguem-se-acha',
    titulo: 'Ninguém acha ninguém',
    dificuldade: 'dificil',
    morador: 'Dona Célia, do estoque',
    relato: `Desde a faxina de ontem à noite, nada acha nada: a vitrine não acha o estoque, e até o pod de teste do zelador diz
             "bad address". O pessoal da faxina jura que só desligou o que não estava sendo usado.`,
    tarefa: `<p>Faça os pods voltarem a achar os Services pelo nome: o <code>cliente</code> (no <code>default</code>) e a
             <code>vitrine</code> (no namespace <code>loja</code>) precisam chamar <code>http://estoque.estoque</code>. A catraca
             da loja tem de continuar fechando o resto.</p>`,
    vidaReal: 'A telefonista do condomínio (o CoreDNS) foi dispensada na faxina: ninguém consegue o número de ninguém. E, no bloco da loja, a catraca só deixa ir ao estoque, e esqueceu de deixar ligar para a telefonista.',
    limite: 'Sem a telefonista, quem sabe o IP de cor ainda consegue ligar: o DNS não é a rede, é só a lista de nomes.',
    dica: 'Quando tudo falha junto, olhe o que todos usam: kubectl get deploy -n kube-system. Depois, se a vitrine ainda não acha: kubectl get networkpolicy -n loja.',
    comoSaber: 'Dos dois pods, <code>wget -qO- http://estoque.estoque</code> responde; da vitrine, <code>http://admin.default</code> continua bloqueado.',
    extras: [estoque, vitrine, zelador],
    arquivos: { 'catraca.yaml': catraca(false) },
    correcao: { 'catraca.yaml': catraca(true) },
    partida: { comandos: ['kubectl scale deployment coredns -n kube-system --replicas=0'] },
    solucaoTerminal: ['kubectl scale deployment coredns -n kube-system --replicas=2', 'kubectl apply -f .'],
    regras: [
      { objeto: 'deployment/coredns', ns: 'kube-system', campo: 'status.readyReplicas', regex: '^[1-9]', msg: 'o CoreDNS voltou' },
      { requisicao: { de: 'pod/cliente', url: 'http://estoque.estoque', status: 200 } },
      { requisicao: { de: 'pod/vitrine', ns: 'loja', url: 'http://estoque.estoque', status: 200 } },
      { requisicao: { de: 'pod/vitrine', ns: 'loja', url: 'http://admin.default', status: 'timeout' }, msg: 'a catraca da loja continua fechando o resto' },
    ],
  }),

  daSecao({
    id: 'ts-fila-parada',
    titulo: 'A fila que não anda',
    dificuldade: 'dificil',
    morador: 'Seu Lima, do financeiro',
    relato: `O relatório do mês não roda desde a manutenção de ontem. A equipe da manutenção disse que terminou e foi embora.
             Ah, e por garantia eu aumentei a memória que o relatório pede.`,
    tarefa: `<p>Faça as 2 réplicas do <code>relatorio</code> rodarem. A manutenção dos nodes acabou: devolva os nodes ao serviço
             (sem contornar com tolerations).</p>`,
    vidaReal: 'Os relatórios esperam na portaria: um prédio ainda está com a fita na porta, o outro com a placa de reforma, e o pedido diz que cada relatório precisa de um andar inteiro (300Gi) em vez de uma sala (300Mi).',
    limite: 'O porteiro explica tudo de uma vez. O scheduler também lista o motivo de cada node, mas um node barrado pela fita nem chega a ser medido: o motivo seguinte só aparece depois do primeiro conserto.',
    dica: 'kubectl describe pod NOME (a mensagem do scheduler muda a cada conserto); kubectl get nodes; kubectl describe node node-2 (Taints). Para tirar um taint: kubectl taint nodes NODE chave=valor:Efeito- (com o hífen no fim).',
    comoSaber: 'As 2 réplicas do <code>relatorio</code> rodando, e nenhum node interditado ou com a placa da manutenção.',
    arquivos: { 'relatorio.yaml': relatorio('300Gi') },
    correcao: { 'relatorio.yaml': relatorio('300Mi') },
    partida: { antes: ['kubectl cordon node-1', 'kubectl taint nodes node-2 manutencao=sim:NoSchedule'] },
    solucaoTerminal: ['kubectl uncordon node-1', 'kubectl taint nodes node-2 manutencao=sim:NoSchedule-', 'kubectl apply -f .'],
    regras: [
      { pods: 'app=relatorio', prontos: 2 },
      { objeto: 'node/node-1', campo: 'spec.unschedulable', regex: '^(false)?$', msg: 'o node-1 voltou ao serviço' },
      { objeto: 'node/node-2', campo: 'spec.taints', regex: '^(?!.*manutencao)', msg: 'o node-2 está sem a placa da manutenção' },
    ],
  }),
];
