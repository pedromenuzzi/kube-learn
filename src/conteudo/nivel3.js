// Nível 3: Services e rede (ramal fixo, DNS, de fora do cluster, Ingress e Gateway API).
import { licao, problema, yaml } from './util.js';

const servico = ({ nome = 'loja', porta = 80, alvo = 8080, app = nome, extra = '' } = {}) => yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: ${nome}
  spec:
${extra}    selector:
      app: ${app}
    ports:
    - port: ${porta}
      targetPort: ${alvo}
`;

const lojaComPorta = (nomePorta) => yaml`
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
          ports:
          - containerPort: 8080
${nomePorta ? `            name: ${nomePorta}\n` : ''}`;

const ingress = (regras) => `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: praca
spec:
  rules:
${regras}`;
const regraHost = (host, caminhos) => `  - host: ${host}
    http:
      paths:
${caminhos.map(([path, svc]) => `      - path: ${path}
        pathType: Prefix
        backend:
          service:
            name: ${svc}
            port:
              number: 80
`).join('')}`;

const rota = (backends, hostname = 'loja.kube-learn.local') => `apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: loja
spec:
  parentRefs:
  - name: portaria
  hostnames:
  - ${hostname}
  rules:
  - backendRefs:
${backends.map(([nome, peso]) => `    - name: ${nome}
      port: 80
${peso !== undefined ? `      weight: ${peso}\n` : ''}`).join('')}`;

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const aplicar = (regras) => ({ descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [{ semErros: true }, ...regras] });
const depois = (descricao, regras, oculto = true) => ({ oculto, descricao, passos: [{ comando: 'kubectl apply -f .' }, { avancar: '30s' }], regras });
const LOJA_RESPONDE = { requisicao: { url: 'http://loja', status: 200, corpo: '"app":"loja"' }, msg: 'http://loja responde (de dentro do cluster)' };

export const NIVEL3 = [
  licao({
    id: 'n3-licao-service',
    titulo: 'O ramal fixo: Service',
    vidaReal: 'O ramal fixo da empresa: as pessoas mudam de apartamento, o ramal continua o mesmo e toca em quem estiver lá.',
    limite: 'O ramal só toca em apartamentos prontos para atender (readiness); se nenhum está pronto, a ligação é recusada, e não fica esperando na linha.',
    conteudo: `
      <p>Os pods nascem e morrem o tempo todo, e cada pod novo tem <b>outro IP</b>. Ninguém consegue guardar esses IPs.
         O <b>Service</b> resolve isso: um endereço <b>fixo</b> (um IP e um nome no DNS) que entrega cada conexão a um dos
         pods prontos, escolhidos pelas labels.</p>
      <pre><code>apiVersion: v1
kind: Service
metadata:
  name: loja
spec:
  selector:
    app: loja        # os pods que atendem
  ports:
  - port: 80         # a porta do Service (o ramal)
    targetPort: 8080 # a porta onde o programa ouve, dentro do pod</code></pre>
      <h2>Onde cada coisa aparece</h2>
      <ul>
        <li><code>kubectl get svc</code>: o tipo, o <b>CLUSTER-IP</b> e as portas;</li>
        <li><code>kubectl get endpoints loja</code>: a lista de pods atrás do ramal agora (se estiver <code>&lt;none&gt;</code>,
            o seletor não achou ninguém, ou ninguém está pronto);</li>
        <li>o nome no DNS: <code>loja</code> (no mesmo namespace), <code>loja.vendas</code> (de outro namespace) ou
            <code>loja.vendas.svc.cluster.local</code> (o nome completo).</li>
      </ul>
      <h2>Testando de dentro</h2>
      <p>O Service do tipo padrão (<b>ClusterIP</b>) só existe dentro do cluster. Para testar, entre num pod:
         <code>kubectl exec POD -- wget -qO- http://loja</code> (no busybox) ou <code>curl</code> (no nginx).</p>`,
  }),

  licao({
    id: 'n3-licao-de-fora',
    titulo: 'Chegando de fora do cluster',
    vidaReal: 'O ramal só funciona dentro do condomínio. Para quem está na rua, há o interfone de cada prédio (NodePort), a portaria da rua (LoadBalancer) e a passagem temporária da sua casa (port-forward).',
    limite: 'No condomínio, a portaria da rua é um prédio; na nuvem, o LoadBalancer é um serviço pago, criado pelo provedor a cada Service desse tipo.',
    conteudo: `
      <p>Três jeitos de chegar num Service vindo de fora:</p>
      <table class="tabela-simples">
        <thead><tr><th>Jeito</th><th>Como</th><th>Para quê</th></tr></thead>
        <tbody>
          <tr><td><b>port-forward</b></td><td><code>kubectl port-forward svc/loja 8080:80</code> e depois <code>http://localhost:8080</code></td><td>Testar do seu computador, rapidinho. Só você usa.</td></tr>
          <tr><td><b>NodePort</b></td><td><code>type: NodePort</code>: abre a mesma porta (30000–32767) em <b>todos</b> os nodes</td><td>Laboratórios e ambientes sem balanceador.</td></tr>
          <tr><td><b>LoadBalancer</b></td><td><code>type: LoadBalancer</code>: o provedor de nuvem dá um IP externo (coluna EXTERNAL-IP)</td><td>Produção, quando cada Service merece um IP.</td></tr>
        </tbody>
      </table>
      <h2>O seu computador, neste terminal</h2>
      <p>Neste site, o terminal tem dois mundos: o <code>kubectl exec ... -- wget</code> roda <b>dentro</b> de um pod; um
         <code>curl</code> digitado direto roda no <b>seu computador</b>, fora do cluster. De fora, <code>http://loja</code>
         não funciona (o nome só existe no DNS do cluster): é preciso uma das entradas acima.</p>`,
  }),

  licao({
    id: 'n3-licao-ingress-gateway',
    titulo: 'A portaria do condomínio: Ingress e Gateway API',
    vidaReal: 'Em vez de uma portaria por empresa, uma portaria só, com um balcão que diz: "/loja, bloco A; blog.condominio, bloco B".',
    limite: 'O balcão não faz nada sozinho: precisa de um controlador instalado no cluster (o "funcionário" do balcão). Sem ele, o Ingress é só um papel na parede.',
    conteudo: `
      <p>Um LoadBalancer por Service sai caro. O <b>Ingress</b> põe <b>uma entrada só</b> na frente de vários Services e
         escolhe o destino pelo <b>nome</b> (host) e pelo <b>caminho</b> (path):</p>
      <pre><code>rules:
- host: praca.kube-learn.local
  http:
    paths:
    - path: /api           # /api e tudo abaixo dele
      pathType: Prefix
      backend:
        service:
          name: loja
          port:
            number: 80</code></pre>
      <p>Quem faz o roteamento é um <b>controlador de Ingress</b> (Traefik, NGINX, HAProxy...), escolhido pela
         <code>ingressClassName</code> (ou pela classe padrão do cluster: <code>kubectl get ingressclass</code>).</p>
      <h2>O caminho novo: Gateway API</h2>
      <p>O controlador mais famoso, o <b>ingress-nginx</b>, foi aposentado em 2026. O caminho que a comunidade recomenda é o
         <b>Gateway API</b>, que separa os papéis:</p>
      <ul>
        <li><b>GatewayClass</b> e <b>Gateway</b>: a portaria (endereço e portas), cuidada pelo time de plataforma;</li>
        <li><b>HTTPRoute</b>: a placa de cada time (nomes, caminhos e até <b>pesos</b>, para mandar 10% do tráfego para a
            versão nova: o canário).</li>
      </ul>
      <p>Neste simulador, o "DNS da empresa" já aponta os nomes <code>*.kube-learn.local</code> usados nos Ingresses e nas
         HTTPRoutes para a entrada certa: teste com <code>curl http://praca.kube-learn.local/api</code>.</p>`,
  }),

  problema({
    id: 'n3-ramal',
    titulo: 'O ramal da loja',
    dificuldade: 'facil',
    cluster: 'loja-sem-servico',
    vidaReal: 'Dar à loja um ramal fixo, que toca em qualquer um dos atendentes.',
    limite: 'O ramal não sabe se o atendente está ocupado: ele só reparte as ligações (em rodízio).',
    enunciado: `
      <p>A loja tem 3 pods, mas ninguém sabe onde ligar. Crie um <b>Service</b> chamado <code>loja</code> que receba na
         porta <code>80</code> e entregue na porta <code>8080</code> dos pods com a label <code>app: loja</code>.</p>`,
    comoSaber: '<code>kubectl get endpoints loja</code> mostra 3 endereços.',
    dica: 'spec.selector (as labels) e spec.ports: port e targetPort.',
    manual: ['service.spec.ports'],
    inicial: { 'servico.yaml': yaml`
      apiVersion: v1
      kind: Service
      metadata:
        name: loja
      spec:
        # selector: ...
        # ports: ...
    ` },
    solucao: { 'servico.yaml': servico() },
    testes: [
      aplicar([{ objeto: 'service/loja', campo: 'spec.ports[0].targetPort', igual: 8080 }]),
      depois('o ramal toca nos 3 pods', [{ endpoints: 'svc/loja', quantidade: 3 }, LOJA_RESPONDE]),
    ],
  }),

  problema({
    id: 'n3-expose',
    titulo: 'O ramal pelo interfone',
    dificuldade: 'facil',
    cluster: 'loja-sem-servico',
    terminal: true,
    vidaReal: 'Pedir o ramal pelo telefone, sem preencher formulário.',
    limite: 'O expose copia o seletor do Deployment; se o Deployment mudar de labels depois, o Service não acompanha.',
    enunciado: '<p>Crie o Service da loja pelo terminal, com <code>kubectl expose</code>: porta <code>80</code>, entregando na <code>8080</code>.</p>',
    dica: 'kubectl expose deployment loja --port=... --target-port=...',
    solucaoTerminal: ['kubectl expose deployment loja --port=80 --target-port=8080'],
    testes: noCluster('a loja tem ramal', [
      { comando: '^kubectl\\s+expose\\b', msg: 'você usou o kubectl expose' },
      { endpoints: 'svc/loja', quantidade: 3 },
      LOJA_RESPONDE,
    ]),
  }),

  problema({
    id: 'n3-dns-namespace',
    titulo: 'Ligando para outra empresa',
    dificuldade: 'medio',
    cluster: 'estoque',
    terminal: true,
    vidaReal: 'Ligar para o ramal de outra empresa do condomínio: além do ramal, você diz a empresa.',
    limite: 'Saber o nome não garante a ligação: com NetworkPolicy (nível 8), uma empresa pode bloquear as outras.',
    enunciado: `
      <p>O Service <code>estoque</code> mora no namespace <code>estoque</code>. A partir do pod <code>cliente</code>
         (namespace default, imagem busybox), busque a página dele e diga o <b>título</b> que aparece no
         <code>&lt;title&gt;</code>.</p>`,
    rotuloResposta: 'O título da página',
    dica: 'De outro namespace, o nome é servico.namespace. No busybox: wget -qO- http://...',
    respostaCerta: 'Welcome to nginx!',
    solucaoTerminal: ['kubectl exec cliente -- wget -qO- http://estoque.estoque'],
    testes: noCluster('você chamou o estoque pelo nome com o namespace', [
      { comando: 'exec.*estoque\\.estoque', msg: 'você usou o nome estoque.estoque de dentro do pod' },
      { resposta: /welcome to nginx/ },
    ]),
  }),

  problema({
    id: 'n3-target-port',
    titulo: 'O ramal na porta errada',
    dificuldade: 'medio',
    cluster: 'loja-sem-servico',
    vidaReal: 'O ramal toca no apartamento certo, mas no cômodo errado: ninguém atende lá.',
    limite: 'Aqui a ligação é recusada na hora; num programa de verdade, às vezes outra coisa está ouvindo naquela porta, e o erro fica mais confuso.',
    enunciado: `
      <p>O Service existe, os endpoints aparecem, mas toda conexão é <b>recusada</b>. A loja ouve na porta <code>8080</code>
         (veja o <code>containerPort</code> do Deployment, ou os logs de um pod). Conserte o Service.</p>`,
    dica: 'port é a porta do Service; targetPort é a do pod.',
    inicial: { 'servico.yaml': servico({ alvo: 80 }) },
    solucao: { 'servico.yaml': servico() },
    testes: [
      { descricao: 'a loja responde pelo Service', passos: [{ comando: 'kubectl apply -f .' }, { avancar: '10s' }], regras: [{ semErros: true }, LOJA_RESPONDE] },
    ],
  }),

  problema({
    id: 'n3-ramal-mudo',
    titulo: 'O ramal mudo',
    dificuldade: 'medio',
    cluster: 'loja-sem-servico',
    vidaReal: 'O ramal procura a plaquinha "lojinha", mas as portas dizem "loja": ele não toca em ninguém.',
    limite: 'O Kubernetes não avisa que o seletor não achou ninguém: o Service é criado normalmente, só fica sem endpoints.',
    enunciado: `
      <p>Este Service é aceito, mas <code>kubectl get endpoints loja</code> mostra <code>&lt;none&gt;</code>. Compare o
         seletor dele com as labels dos pods (<code>kubectl get pods --show-labels</code>) e conserte.</p>`,
    dica: 'O selector precisa casar com as labels dos pods.',
    inicial: { 'servico.yaml': servico({ app: 'lojinha' }) },
    solucao: { 'servico.yaml': servico() },
    testes: [
      aplicar([]),
      depois('o ramal voltou a tocar', [{ endpoints: 'svc/loja', quantidade: 3 }, LOJA_RESPONDE], false),
    ],
  }),

  problema({
    id: 'n3-porta-nomeada',
    titulo: 'Ramal pelo nome da porta',
    dificuldade: 'medio',
    vidaReal: 'Em vez de "cômodo 8080", o ramal pede "o cômodo de atendimento": se o número mudar, o ramal continua certo.',
    limite: 'O nome precisa existir em todos os pods: um pod sem a porta com esse nome fica de fora dos endpoints.',
    enunciado: `
      <p>O Service usa <code>targetPort: http</code> (um <b>nome</b>, não um número), mas nenhum pod tem uma porta com esse
         nome. Dê o nome <code>http</code> à porta <code>8080</code> do contêiner da loja.</p>`,
    dica: 'Em ports do contêiner: - containerPort: 8080 + name: http',
    manual: ['pod.spec.containers.ports'],
    inicial: { 'loja.yaml': lojaComPorta(), 'servico.yaml': servico({ alvo: 'http' }) },
    solucao: { 'loja.yaml': lojaComPorta('http'), 'servico.yaml': servico({ alvo: 'http' }) },
    testes: [
      aplicar([{ objeto: 'service/loja', campo: 'spec.ports[0].targetPort', igual: 'http' }]),
      depois('os endpoints usam a porta pelo nome', [{ endpoints: 'svc/loja', quantidade: 2 }, LOJA_RESPONDE], false),
    ],
  }),

  problema({
    id: 'n3-nodeport',
    titulo: 'O interfone de cada prédio',
    dificuldade: 'medio',
    cluster: 'loja-sem-servico',
    vidaReal: 'Um interfone numerado na porta de cada prédio: de qualquer prédio, o 30080 chama a loja.',
    limite: 'As portas são altas (30000–32767) e ficam abertas em todos os nodes: bom para laboratório, ruim de lembrar e de proteger.',
    enunciado: `
      <p>Crie o Service <code>loja</code> do tipo <b>NodePort</b> (porta 80 → 8080 nos pods) com o
         <code>nodePort: 30080</code>. Depois teste do <b>seu computador</b>: veja o IP de um node em
         <code>kubectl get nodes -o wide</code> e rode <code>curl http://IP-DO-NODE:30080</code> (sem kubectl).</p>`,
    dica: 'spec.type: NodePort e, em ports, nodePort: 30080.',
    manual: ['service.spec.ports'],
    inicial: { 'servico.yaml': servico() },
    solucao: { 'servico.yaml': servico({ extra: '    type: NodePort\n' }).replace('    targetPort: 8080', '    targetPort: 8080\n    nodePort: 30080') },
    testes: [
      aplicar([{ objeto: 'service/loja', campo: 'spec.type', igual: 'NodePort' }, { objeto: 'service/loja', campo: 'spec.ports[0].nodePort', igual: 30080 }]),
      depois('de fora, pelo node, a loja responde', [{ requisicao: { de: 'fora', url: 'http://172.18.0.3:30080/', status: 200, corpo: '"app":"loja"' } }]),
    ],
  }),

  problema({
    id: 'n3-loadbalancer',
    titulo: 'A portaria da rua',
    dificuldade: 'medio',
    cluster: 'loja-sem-servico',
    terminal: true,
    vidaReal: 'Uma portaria na rua só para a loja, com endereço próprio.',
    limite: 'Na nuvem cada LoadBalancer é um recurso cobrado à parte; com muitos Services, o Ingress ou o Gateway saem mais baratos.',
    enunciado: `
      <p>Exponha a loja com um Service <b>LoadBalancer</b> (porta 80 → 8080), espere o <code>EXTERNAL-IP</code> aparecer
         (<code>kubectl get svc -w</code>) e teste do seu computador com <code>curl</code>. Qual é o IP externo?</p>`,
    rotuloResposta: 'O EXTERNAL-IP',
    dica: 'kubectl expose deployment loja --type=LoadBalancer --port=80 --target-port=8080',
    respostaCerta: (c) => c.obter('Service', 'default', 'loja').status.loadBalancer.ingress[0].ip,
    solucaoTerminal: ['kubectl expose deployment loja --type=LoadBalancer --port=80 --target-port=8080', 'kubectl get svc loja', 'curl http://172.18.255.200/'],
    testes: noCluster('a loja tem portaria na rua', [
      { objeto: 'service/loja', campo: 'spec.type', igual: 'LoadBalancer' },
      { comando: '^curl\\b', msg: 'você testou com curl do seu computador' },
      { resposta: { de: 'service/loja', campo: 'status.loadBalancer.ingress[0].ip' } },
    ]),
  }),

  problema({
    id: 'n3-port-forward',
    titulo: 'Uma passagem só sua',
    dificuldade: 'facil',
    cluster: 'loja-3-replicas',
    terminal: true,
    vidaReal: 'Uma passagem temporária da sua casa direto até a loja, sem passar pela portaria.',
    limite: 'A passagem vai para um pod só (escolhido no começo), e some quando o comando para.',
    enunciado: `
      <p>Sem mexer em nenhum Service, abra uma passagem da porta <code>8080</code> do seu computador para a porta 80 do
         Service <code>loja</code> e chame <code>http://localhost:8080</code> com <code>curl</code>. Qual <b>versão</b> a
         loja responde?</p>`,
    rotuloResposta: 'A versão',
    dica: 'kubectl port-forward svc/loja 8080:80',
    respostaCerta: '1.0',
    solucaoTerminal: ['kubectl port-forward svc/loja 8080:80', 'curl http://localhost:8080'],
    testes: noCluster('você chegou na loja pela passagem', [
      { comando: 'port-forward', msg: 'você usou o port-forward' },
      { comando: '^curl.*localhost:8080', msg: 'você chamou o localhost:8080' },
      { resposta: '1.0' },
    ]),
  }),

  problema({
    id: 'n3-headless',
    titulo: 'Os apartamentos pelo nome',
    dificuldade: 'dificil',
    cluster: 'banco',
    vidaReal: 'Em vez de um ramal que reparte as ligações, uma lista com o número de cada apartamento: quem liga escolhe com quem falar.',
    limite: 'Sem o rodízio do ramal, quem chama precisa saber escolher (é o caso dos bancos de dados com réplicas e de StatefulSets, no nível 4).',
    enunciado: `
      <p>As 3 réplicas do <code>banco</code> (Redis, porta 6379) precisam se achar <b>uma a uma</b>, sem rodízio. Crie um
         Service <b>headless</b> chamado <code>banco</code>: sem IP próprio, o DNS devolve o IP de cada pod.</p>
      <p>Confira de um pod de teste: <code>kubectl run t --image=busybox:1.36 -- sleep 3600</code> e depois
         <code>kubectl exec t -- nslookup banco</code>.</p>`,
    dica: 'spec.clusterIP: None',
    manual: ['service.spec.clusterIP'],
    inicial: { 'banco.yaml': servico({ nome: 'banco', porta: 6379, alvo: 6379 }) },
    solucao: { 'banco.yaml': servico({ nome: 'banco', porta: 6379, alvo: 6379, extra: '    clusterIP: None\n' }) },
    testes: [
      aplicar([{ objeto: 'service/banco', campo: 'spec.clusterIP', igual: 'None' }]),
      depois('o DNS devolve os 3 pods', [{ dns: { nome: 'banco.default.svc.cluster.local', quantidade: 3 } }]),
    ],
  }),

  problema({
    id: 'n3-ingress-caminho',
    titulo: 'O balcão da praça de alimentação',
    dificuldade: 'medio',
    cluster: 'praca',
    vidaReal: 'Uma entrada só para a praça: "/api, balcão da loja; o resto, o blog".',
    limite: 'O caminho chega inteiro no destino: a loja recebe /api (e precisa saber responder nele).',
    enunciado: `
      <p>Na praça <code>praca.kube-learn.local</code>, hoje tudo vai para o <code>blog</code>. Acrescente ao Ingress a regra
         que manda <code>/api</code> (e o que vier abaixo) para o Service <code>loja</code> (porta 80).</p>
      <p>Teste do seu computador: <code>curl http://praca.kube-learn.local/api</code> e
         <code>curl http://praca.kube-learn.local/</code>.</p>`,
    dica: 'Outro item em paths: path: /api, pathType: Prefix, backend.service.name: loja.',
    manual: ['ingress.spec.rules.http.paths'],
    inicial: { 'praca.yaml': ingress(regraHost('praca.kube-learn.local', [['/', 'blog']])) },
    solucao: { 'praca.yaml': ingress(regraHost('praca.kube-learn.local', [['/api', 'loja'], ['/', 'blog']])) },
    testes: [
      aplicar([]),
      depois('de fora, /api vai para a loja e / para o blog', [
        { requisicao: { de: 'fora', url: 'http://praca.kube-learn.local/api', status: 200, corpo: '"app":"loja"' } },
        { requisicao: { de: 'fora', url: 'http://praca.kube-learn.local/', status: 200, corpo: 'It works' } },
      ], false),
    ],
  }),

  problema({
    id: 'n3-ingress-host',
    titulo: 'Uma placa para cada nome',
    dificuldade: 'medio',
    cluster: 'praca',
    vidaReal: 'O mesmo balcão atende dois endereços: quem pergunta pela loja vai para um lado; pelo blog, para o outro.',
    limite: 'O nome precisa chegar até o balcão (DNS apontando para o Ingress); aqui o DNS da empresa já faz isso por você.',
    enunciado: `
      <p>Troque o Ingress por duas regras de <b>host</b>: <code>loja.kube-learn.local</code> vai para o Service
         <code>loja</code> e <code>blog.kube-learn.local</code> vai para o <code>blog</code> (os dois na porta 80, path
         <code>/</code>).</p>`,
    dica: 'Dois itens em rules, cada um com o seu host.',
    inicial: { 'praca.yaml': ingress(regraHost('praca.kube-learn.local', [['/', 'blog']])) },
    solucao: { 'praca.yaml': ingress(regraHost('loja.kube-learn.local', [['/', 'loja']]) + regraHost('blog.kube-learn.local', [['/', 'blog']])) },
    testes: [
      aplicar([]),
      depois('cada nome chega no seu destino', [
        { requisicao: { de: 'fora', url: 'http://loja.kube-learn.local/', status: 200, corpo: '"app":"loja"' } },
        { requisicao: { de: 'fora', url: 'http://blog.kube-learn.local/', status: 200, corpo: 'It works' } },
      ], false),
    ],
  }),

  problema({
    id: 'n3-gateway',
    titulo: 'A placa na portaria nova',
    dificuldade: 'medio',
    cluster: 'condominio-gateway',
    vidaReal: 'A administração já montou a portaria (Gateway); cada empresa só pendura a sua placa (HTTPRoute).',
    limite: 'A placa só vale na portaria que ela cita (parentRefs) e se a portaria aceitar rotas do seu namespace.',
    enunciado: `
      <p>O time de plataforma já criou o Gateway <code>portaria</code> (veja <code>kubectl get gateway</code>). Crie uma
         <b>HTTPRoute</b> chamada <code>loja</code>, presa nessa portaria, que leve <code>loja.kube-learn.local</code> para o
         Service <code>loja</code> (porta 80).</p>`,
    dica: 'spec.parentRefs: [{ name: portaria }], hostnames e rules[].backendRefs.',
    manual: ['httproute.spec'],
    inicial: { 'rota.yaml': yaml`
      apiVersion: gateway.networking.k8s.io/v1
      kind: HTTPRoute
      metadata:
        name: loja
      spec:
        # parentRefs, hostnames e rules
    ` },
    solucao: { 'rota.yaml': rota([['loja']]) },
    testes: [
      aplicar([{ objeto: 'httproute/loja', campo: 'spec.parentRefs[0].name', igual: 'portaria' }]),
      depois('de fora, pela portaria nova, a loja responde', [{ requisicao: { de: 'fora', url: 'http://loja.kube-learn.local/', status: 200, corpo: '"app":"loja"' } }], false),
    ],
  }),

  problema({
    id: 'n3-canario',
    titulo: '10% para a versão nova',
    dificuldade: 'dificil',
    cluster: 'canario',
    vidaReal: 'Abrir a reforma para 1 em cada 10 clientes, ver se ninguém reclama, e só depois para todos.',
    limite: 'A divisão é por requisição: o mesmo cliente pode cair ora na versão velha, ora na nova.',
    enunciado: `
      <p>A versão <code>1.1</code> da loja roda no Service <code>loja-v2</code>. Mude a rota para mandar <b>90%</b> do
         tráfego para <code>loja</code> e <b>10%</b> para <code>loja-v2</code>: o <b>canário</b>.</p>
      <p>Teste várias vezes do seu computador: <code>curl http://loja.kube-learn.local/</code>.</p>`,
    dica: 'Dois backendRefs, cada um com weight.',
    manual: ['httproute.spec.rules.backendRefs'],
    inicial: { 'rota.yaml': rota([['loja']]) },
    solucao: { 'rota.yaml': rota([['loja', 90], ['loja-v2', 10]]) },
    testes: [
      aplicar([]),
      depois('de 100 clientes, uns 10 veem a versão nova', [{ distribuicao: { de: 'fora', url: 'http://loja.kube-learn.local/', vezes: 100, corpo: '"versao":"1.1"', entre: [8, 12] } }]),
    ],
  }),
];
