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

// ---------- O caixa que não chega: a imagem particular e o cofre no bloco errado ----------
const ns = (nome) => `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${nome}\n`;
// O crachá do registro, como o `kubectl create secret docker-registry` faz (o servidor padrão é o do Docker Hub).
const credencial = btoa(JSON.stringify({ auths: { 'https://index.docker.io/v1/': { username: 'condominio', password: 'tijolo-azul-42', auth: btoa('condominio:tijolo-azul-42') } } }));
const registro = (namespace) => yaml`
  apiVersion: v1
  kind: Secret
  metadata:
    name: registro
${namespace ? `    namespace: ${namespace}\n` : ''}  type: kubernetes.io/dockerconfigjson
  data:
    .dockerconfigjson: ${credencial}
`;
const caixa = (comCracha) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: caixa
    namespace: padaria
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: caixa
    template:
      metadata:
        labels:
          app: caixa
      spec:
${comCracha ? '        imagePullSecrets:\n        - name: registro\n' : ''}        containers:
        - name: caixa
          image: kubelearn/caixa:1.0
          ports:
          - containerPort: 8080
`;

// ---------- O cardápio de ontem: o site antigo no mesmo ramal e o quadro preso no subPath ----------
const PRATO_NOVO = '<h1>Prato do dia: moqueca</h1>\n';
const cardapio = (subPath) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: cardapio
    namespace: restaurante
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: cardapio
    template:
      metadata:
        labels:
          app: cardapio
      spec:
        volumes:
        - name: quadro
          configMap:
            name: cardapio
        containers:
        - name: nginx
          image: nginx:1.27
          ports:
          - containerPort: 80
          volumeMounts:
          - name: quadro
${subPath ? '            mountPath: /usr/share/nginx/html/index.html\n            subPath: index.html\n' : '            mountPath: /usr/share/nginx/html\n'}  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: cardapio
    namespace: restaurante
  spec:
    selector:
      app: cardapio
    ports:
    - port: 80
`;
const restaurante = yaml`
  apiVersion: v1
  kind: Namespace
  metadata:
    name: restaurante
  ---
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: cardapio
    namespace: restaurante
  data:
    index.html: |
      <h1>Prato do dia: feijoada</h1>
  ---
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: site-antigo
    namespace: restaurante
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: cardapio
        versao: antiga
    template:
      metadata:
        labels:
          app: cardapio
          versao: antiga
      spec:
        containers:
        - name: httpd
          image: httpd:2.4
          ports:
          - containerPort: 80
`;
/** O que o Seu Bento fez ontem à noite: trocou o prato do dia no quadro (depois de os pods subirem). */
const trocarOPrato = (c) => {
  const cm = c.obter('ConfigMap', 'restaurante', 'cardapio');
  cm.data = { 'index.html': PRATO_NOVO };
  c.salvar(cm);
};

// ---------- O crachá do suporte: o nome no vínculo e os subrecursos ----------
const lojaDaBia = yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: caixa
    namespace: loja
  spec:
    containers:
    - name: caixa
      image: busybox:1.36
      command: ["sh", "-c", "while true; do echo venda registrada; sleep 10; done"]
`;
const crachaDaBia = ({ sujeito, log, exec }) => yaml`
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata:
    name: suporte
    namespace: loja
  rules:
  - apiGroups: [""]
    resources: ["pods"${log ? ', "pods/log"' : ''}]
    verbs: ["get", "list"]
${exec ? '  - apiGroups: [""]\n    resources: ["pods/exec"]\n    verbs: ["create"]\n' : ''}  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: suporte
    namespace: loja
  subjects:
  - kind: User
    name: ${sujeito}
    apiGroup: rbac.authorization.k8s.io
  roleRef:
    kind: Role
    name: suporte
    apiGroup: rbac.authorization.k8s.io
`;

// ---------- As normas só no papel: o modo warn, o securityContext e o root da imagem ----------
const blocoDePagamentos = (modo) => yaml`
  apiVersion: v1
  kind: Namespace
  metadata:
    name: pagamentos
    labels:
      pod-security.kubernetes.io/${modo}: restricted
`;
const cobranca = (seguro) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: cobranca
    namespace: pagamentos
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: cobranca
    template:
      metadata:
        labels:
          app: cobranca
      spec:
${seguro ? '        securityContext:\n          runAsNonRoot: true\n          runAsUser: 1000\n          seccompProfile:\n            type: RuntimeDefault\n' : ''}        containers:
        - name: cobranca
          image: kubelearn/loja:1.0
          ports:
          - containerPort: 8080
${seguro ? '          securityContext:\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: ["ALL"]\n' : ''}`;

// ---------- A promoção que derrubou a loja: command no lugar de args e a sonda na porta errada ----------
const lojaEmPromocao = ({ campo, porta }) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
  spec:
    replicas: 2
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
          image: kubelearn/loja:1.0
          ${campo}: ["--modo", "promocao"]
          ports:
          - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /healthz
              port: ${porta}
            periodSeconds: 10
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
const clienteDaLoja = yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: cliente
  spec:
    containers:
    - name: cliente
      image: busybox:1.36
      command: ["sleep", "3600"]
`;

// ---------- O relatório sem fôlego: o limite padrão escondido e o teto do bloco ----------
const regrasDoFinanceiro = (teto) => yaml`
  apiVersion: v1
  kind: LimitRange
  metadata:
    name: padrao
    namespace: financeiro
  spec:
    limits:
    - type: Container
      default:
        memory: 128Mi
      defaultRequest:
        memory: 64Mi
      max:
        memory: ${teto}
`;
const relatorioDoFinanceiro = (limite) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: relatorio
    namespace: financeiro
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
${limite ? `          resources:\n            limits:\n              memory: ${limite}\n` : ''}`;

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
  daSecao({
    id: 'ts-imagem-particular',
    titulo: 'O caixa que não chega',
    dificuldade: 'medio',
    morador: 'Dona Neide, da padaria',
    relato: `Compramos o programa de caixa novo e a TI instalou ontem: até guardou o login do registro num cofre, disse.
             Mas o caixa não abre, e o erro diz que a imagem nem existe. Existe sim: eu vejo ela no Docker Hub, com o nosso login!`,
    tarefa: `<p>Faça as 2 réplicas do <code>caixa</code> (namespace <code>padaria</code>) rodarem com a imagem
             <code>kubelearn/caixa:1.0</code>, que é particular. Há mais de um defeito: cada conserto revela o próximo.</p>`,
    vidaReal: 'O caixa novo está no depósito de um fornecedor que só entrega a quem mostra o crachá. O crachá foi feito, mas ninguém mandou o entregador levar, e ele ficou guardado no cofre de outro bloco.',
    limite: 'O fornecedor de verdade diria "você não tem acesso". O Docker Hub responde igual para imagem que não existe e para imagem particular sem login, para não contar a estranhos o que existe lá.',
    dica: 'kubectl describe pod -n padaria NOME (Events: "may require authorization"). O pod só usa o crachá que estiver em imagePullSecrets. Depois: kubectl get events -n padaria (FailedToRetrieveImagePullSecret) e kubectl get secrets -A: um Secret só vale no namespace dele.',
    comoSaber: '<code>kubectl get pods -n padaria</code>: as 2 réplicas do <code>caixa</code> em <code>Running</code>, <code>1/1</code>.',
    extras: [ns('padaria')],
    arquivos: { 'caixa.yaml': caixa(false), 'registro.yaml': registro(null) },
    correcao: { 'caixa.yaml': caixa(true), 'registro.yaml': registro('padaria') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=caixa', ns: 'padaria', prontos: 2, imagem: 'kubelearn/caixa:1.0' }],
  }),

  daSecao({
    id: 'ts-cardapio-de-ontem',
    titulo: 'O cardápio de ontem',
    dificuldade: 'medio',
    morador: 'Seu Bento, do restaurante do térreo',
    relato: `Ontem à noite troquei o prato do dia no quadro de avisos, como sempre: hoje é moqueca. Mas tem cliente vendo a
             feijoada de ontem, e tem cliente vendo uma página escrita "It works!". O que é isso?`,
    tarefa: `<p>Faça o Service <code>cardapio</code> (namespace <code>restaurante</code>) mostrar sempre o prato de hoje, que
             está no ConfigMap <code>cardapio</code>. E que a próxima troca do quadro apareça sozinha, sem reiniciar nada.</p>`,
    vidaReal: 'Dois atendentes no mesmo ramal: o do site antigo, que ninguém desligou, e o do cardápio. E o atendente do cardápio não lê o quadro de avisos: lê uma fotocópia tirada no dia em que chegou.',
    limite: 'Sem subPath, o kubelet troca o arquivo montado sozinho, mas não na hora (perto de um minuto), e o programa precisa ler o arquivo de novo (o nginx lê a cada pedido). Variável de ambiente vinda de ConfigMap não muda nunca: só num contêiner novo.',
    dica: 'kubectl get endpoints -n restaurante e kubectl get pods -n restaurante --show-labels: quem mais atende no ramal? Depois: kubectl get deploy cardapio -n restaurante -o yaml (volumeMounts). Um arquivo montado com subPath nunca recebe a versão nova do ConfigMap.',
    comoSaber: 'De um pod qualquer, <code>wget -qO- http://cardapio.restaurante</code> mostra a moqueca sempre, e o Deployment monta o quadro sem <code>subPath</code>.',
    extras: [restaurante],
    arquivos: { 'cardapio.yaml': cardapio(true) },
    correcao: { 'cardapio.yaml': cardapio(false) },
    partida: { comandos: [trocarOPrato] },
    solucaoTerminal: ['kubectl delete deployment site-antigo -n restaurante', 'kubectl apply -f .'],
    regras: [
      { endpoints: 'svc/cardapio', ns: 'restaurante', quantidade: 2, msg: 'só o cardápio atende no ramal' },
      { distribuicao: { url: 'http://cardapio.restaurante', vezes: 20, corpo: 'moqueca', entre: [20, 20] }, msg: 'o prato de hoje aparece sempre' },
      { objeto: 'deployment/cardapio', ns: 'restaurante', campo: 'spec.template.spec.containers[0].volumeMounts', regex: '^(?!.*subPath)', msg: 'o quadro chega sem subPath (a próxima troca aparece sozinha)' },
    ],
  }),

  daSecao({
    id: 'ts-cracha-do-suporte',
    titulo: 'O crachá do suporte',
    dificuldade: 'medio',
    morador: 'Bia, do suporte',
    relato: `Me deram um crachá para atender os chamados da loja, mas ele não abre nada: nem a lista de pods do bloco da
             loja. E, quando abrir, eu preciso ler os logs e entrar no caixa para investigar.`,
    tarefa: `<p>Conserte o crachá da Bia (o usuário <code>bia</code>) no namespace <code>loja</code>: ela precisa listar os pods,
             ler os logs e entrar neles com <code>kubectl exec</code>. Sem poder apagar nada. Teste como ela, com
             <code>--as=bia</code>.</p>`,
    vidaReal: 'O crachá foi impresso com o nome "Bia" e a catraca procura "bia". E, mesmo com o nome certo, ele só abria a porta dos apartamentos: o arquivo de ocorrências (logs) e a chave para entrar (exec) são portas à parte.',
    limite: 'Na portaria, alguém olharia o crachá e deixaria a Bia passar. O RBAC compara o nome letra por letra, e não avisa que o vínculo aponta para um usuário que nunca aparece.',
    dica: 'kubectl get pods -n loja --as=bia e kubectl describe rolebinding suporte -n loja (o nome em Subjects). Logs e exec são subrecursos: pods/log (get) e pods/exec (create). Confira com kubectl auth can-i get pods --subresource=log -n loja --as=bia.',
    comoSaber: 'Com <code>--as=bia</code>: <code>kubectl get pods -n loja</code>, <code>kubectl logs caixa -n loja</code> e <code>kubectl exec caixa -n loja -- ls</code> funcionam; <code>kubectl delete pod caixa -n loja</code> é recusado.',
    extras: [ns('loja'), lojaDaBia],
    arquivos: { 'suporte.yaml': crachaDaBia({ sujeito: 'Bia' }) },
    correcao: { 'suporte.yaml': crachaDaBia({ sujeito: 'bia', log: true, exec: true }) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pode: { quem: 'bia', verbo: 'list', recurso: 'pods', ns: 'loja', resposta: true } },
      { pode: { quem: 'bia', verbo: 'get', recurso: 'pods', sub: 'log', ns: 'loja', resposta: true } },
      { pode: { quem: 'bia', verbo: 'create', recurso: 'pods', sub: 'exec', ns: 'loja', resposta: true } },
      { pode: { quem: 'bia', verbo: 'delete', recurso: 'pods', ns: 'loja', resposta: false } },
    ],
  }),

  daSecao({
    id: 'ts-normas-so-no-papel',
    titulo: 'As normas só no papel',
    dificuldade: 'dificil',
    morador: 'Capitã Rocha, dos bombeiros',
    relato: `Na vistoria de hoje, a cobrança do bloco pagamentos estava rodando como root e com todos os poderes. A placa da
             norma restricted está lá na porta do bloco, mas pelo jeito ela não barra ninguém.`,
    tarefa: `<p>Faça o namespace <code>pagamentos</code> <b>barrar</b> (não só avisar) pods fora da norma
             <code>restricted</code>, com as 2 réplicas da <code>cobranca</code> rodando dentro dela. A cobrança roda bem
             com qualquer usuário que não seja o root (o 1000, por exemplo).</p>`,
    vidaReal: 'A placa dos bombeiros estava pendurada no modo "aviso": o porteiro lia a norma em voz alta e deixava entrar mesmo assim. Trocar para "barrar" não expulsa quem já está lá dentro: só vale para quem chega.',
    limite: 'Passar na norma não torna o programa seguro: só garante que ele começa sem poderes que não precisa.',
    dica: 'kubectl get ns pagamentos --show-labels: warn só avisa, enforce barra. Os pods que já rodam não são expulsos (no máximo, um aviso): para ver se a cobrança passa na norma, crie pods novos (kubectl rollout restart deployment/cobranca -n pagamentos) e olhe kubectl describe rs -n pagamentos. Depois, kubectl describe pod (runAsNonRoot).',
    comoSaber: '<code>kubectl get pods -n pagamentos</code>: 2 pods da <code>cobranca</code> prontos, criados depois da norma valer; e o namespace com <code>pod-security.kubernetes.io/enforce=restricted</code>.',
    arquivos: { 'bloco.yaml': blocoDePagamentos('warn'), 'cobranca.yaml': cobranca(false) },
    correcao: { 'bloco.yaml': blocoDePagamentos('enforce'), 'cobranca.yaml': cobranca(true) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { objeto: 'namespace/pagamentos', campo: 'metadata.labels["pod-security.kubernetes.io/enforce"]', igual: 'restricted', msg: 'o bloco barra quem não segue a norma' },
      { objeto: 'deployment/cobranca', ns: 'pagamentos', campo: 'spec.template.spec', regex: '^(?=.*"allowPrivilegeEscalation":false)(?=.*"drop":\\["ALL"\\])(?=.*"runAsNonRoot":true)(?=.*"RuntimeDefault")', msg: 'a cobrança segue a norma restricted' },
      { pods: 'app=cobranca', ns: 'pagamentos', quantidade: 2, prontos: 2 },
      { objeto: 'deployment/cobranca', ns: 'pagamentos', campo: 'status.updatedReplicas', igual: 2, msg: 'todos os pods são da versão dentro da norma' },
    ],
  }),

  daSecao({
    id: 'ts-promocao-que-nao-abre',
    titulo: 'A promoção que fechou a loja',
    dificuldade: 'facil',
    morador: 'Seu Jorge, dono da loja do térreo',
    relato: `Pedi ao meu sobrinho para ligar o modo promoção da loja. Ele aproveitou e copiou de outro site uma "checagem de
             saúde", que disse ser coisa de profissional. Desde então a loja não abre.`,
    tarefa: `<p>Faça a <code>loja</code> voltar a atender pelo Service <code>loja</code>, sem reiniciar sozinha, no modo
             promoção (o programa <code>/loja</code> recebe <code>--modo promocao</code>) e mantendo a livenessProbe: ela é
             boa ideia, só precisa estar certa.</p>`,
    vidaReal: 'O recado era "abra a loja no modo promoção", e o sobrinho escreveu só "modo promoção" no lugar do nome do funcionário: ninguém foi chamado para abrir. E o fiscal da saúde bate na porta da sala ao lado (a 80): como ninguém responde lá, ele manda o funcionário embora a cada meio minuto.',
    limite: 'No contêiner, command troca o programa que a imagem roda (o ENTRYPOINT); args só troca os argumentos dele. Uma livenessProbe errada é pior que nenhuma: ela reinicia um programa que estava funcionando.',
    dica: 'kubectl describe pod NOME (Last State: Terminated, Reason: StartError, exec: "--modo": executable file not found). Os argumentos vão em args. Depois: kubectl get pods (RESTARTS subindo) e kubectl get events (Liveness probe failed: connection refused). Em que porta a loja ouve?',
    comoSaber: '<code>kubectl get pods</code>: as 2 réplicas prontas, com <code>RESTARTS</code> parado em 0; e <code>kubectl exec cliente -- wget -qO- http://loja</code> responde.',
    extras: [clienteDaLoja],
    arquivos: { 'loja.yaml': lojaEmPromocao({ campo: 'command', porta: 80 }) },
    correcao: { 'loja.yaml': lojaEmPromocao({ campo: 'args', porta: 8080 }) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=loja', prontos: 2, reinicios: { max: 0 } },
      { requisicao: { de: 'pod/cliente', url: 'http://loja', status: 200 } },
      { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0]', regex: '--modo[",= ]+promocao', msg: 'a loja está no modo promoção' },
      { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].livenessProbe', existe: true, msg: 'a livenessProbe continua lá' },
    ],
  }),

  daSecao({
    id: 'ts-relatorio-sem-folego',
    titulo: 'O relatório sem fôlego',
    dificuldade: 'medio',
    morador: 'Seu Lima, do financeiro',
    relato: `O relatório começa, cai, começa de novo, cai de novo. Disseram que é falta de memória, mas eu não pus limite de
             memória nenhum: olhe o YAML! Ah, e a administração já aprovou até 1Gi por contêiner no financeiro.`,
    tarefa: `<p>Faça as 2 réplicas do <code>relatorio</code> (namespace <code>financeiro</code>) rodarem. O relatório carrega a
             planilha inteira na memória (uns 300Mi): declare no próprio Deployment o limite de memória dele (512Mi dá
             folga). O teto do bloco pode subir até 1Gi, mas não pode sumir.</p>`,
    vidaReal: 'O apartamento veio sem disjuntor no projeto, e a administração instalou o disjuntor padrão do bloco, pequeno demais para a máquina da contabilidade. E o bloco tem também um teto: disjuntor maior que ele nem entra.',
    limite: 'O LimitRange só age na criação do pod: mudar o padrão ou o teto não mexe nos pods que já existem. Por isso o limite escondido aparece no pod (kubectl describe pod), e não no seu YAML.',
    dica: 'kubectl describe pod -n financeiro NOME (Last State: OOMKilled; Limits; e a anotação kubernetes.io/limit-ranger). Quem pôs o limite? kubectl describe limitrange -n financeiro. Depois de declarar o limite: kubectl describe rs -n financeiro (FailedCreate).',
    comoSaber: '<code>kubectl get pods -n financeiro</code>: 2 pods do <code>relatorio</code> em <code>Running</code>, sem reiniciar.',
    extras: [ns('financeiro')],
    arquivos: { 'regras.yaml': regrasDoFinanceiro('256Mi'), 'relatorio.yaml': relatorioDoFinanceiro(null) },
    correcao: { 'regras.yaml': regrasDoFinanceiro('1Gi'), 'relatorio.yaml': relatorioDoFinanceiro('512Mi') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=relatorio', ns: 'financeiro', prontos: 2 },
      { objeto: 'deployment/relatorio', ns: 'financeiro', campo: 'spec.template.spec.containers[0].resources.limits.memory', existe: true, msg: 'o relatório declara o próprio limite de memória' },
      { objeto: 'limitrange/padrao', ns: 'financeiro', campo: 'spec.limits[0].max.memory', existe: true, msg: 'o bloco continua com um teto' },
    ],
  }),
];
