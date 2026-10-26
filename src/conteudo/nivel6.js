// Nível 6: saúde e recursos (o síndico que bate na porta, o disjuntor, a potência contratada e os temporários).
import { licao, problema, yaml } from './util.js';
import { PERGUNTA_CERTA } from './nivel9.js';

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
// O teste oculto das travas: o conserto não pode ser tirar a proteção (a sonda, o limite, a cota).
const TRAVAS = 'as travas de segurança continuam lá';
const depois = (descricao, regras, { oculto = false, esperar = '1m' } = {}) => ({ oculto, descricao, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }], regras });

/** A loja (Deployment), com o que cada missão pede a mais no contêiner. */
const loja = ({ versao = '1.0', replicas = 3, extra = '', ns = '' } = {}) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
${ns ? `    namespace: ${ns}\n` : ''}  spec:
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
${extra}`;
const sonda = (tipo, { caminho = '/healthz', extra = '' } = {}) => `          ${tipo}:
            httpGet:
              path: ${caminho}
              port: 8080
${extra}`;
const recursos = (pedido, limite) => `          resources:
            requests:
${Object.entries(pedido).map(([k, v]) => `              ${k}: ${v}`).join('\n')}
${limite ? `            limits:\n${Object.entries(limite).map(([k, v]) => `              ${k}: ${v}`).join('\n')}\n` : ''}`;

const travada = (extra) => loja({ versao: '2.2-trava', replicas: 2, extra });

const relatorio = (limite) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: relatorio
  spec:
    replicas: 1
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
            limits:
              memory: ${limite}
`;

const garantido = (comRecursos) => `apiVersion: v1
kind: Pod
metadata:
  name: caixa-forte
spec:
  containers:
  - name: caixa-forte
    image: nginx:1.27
${comRecursos ? `    resources:
      requests:
        cpu: 250m
        memory: 128Mi
      limits:
        cpu: 250m
        memory: 128Mi
` : ''}`;

const limiteDoNamespace = yaml`
  apiVersion: v1
  kind: LimitRange
  metadata:
    name: padrao
    namespace: compras
  spec:
    limits:
    - type: Container
      defaultRequest:
        cpu: 100m
        memory: 64Mi
      default:
        cpu: 250m
        memory: 128Mi
`;

/** Os clusters de partida deste nível (em clusters.js). */
export const PARTIDA6 = {
  trava: travada(),
  lenta: loja({ versao: '3.0-lenta', replicas: 2, extra: sonda('livenessProbe', { extra: '            periodSeconds: 5\n' }) }),
  sondaErrada: loja({ replicas: 2, extra: sonda('readinessProbe', { caminho: '/saude' }) }),
  apertado: loja({ extra: recursos({ cpu: '1500m' }) }),
  oom: relatorio('128Mi'),
  semPedido: loja({ replicas: 2 }),
  vendas: loja({ replicas: 2, ns: 'vendas' }),
  compras: loja({ replicas: 2, ns: 'compras' }),
  grande: loja({ replicas: 2, ns: 'compras', extra: recursos({ memory: '256Mi' }, { memory: '1Gi' }) }),
};

export const NIVEL6 = [
  licao({
    id: 'n6-licao-probes',
    titulo: 'O síndico que bate na porta: probes',
    vidaReal: 'O síndico passa de tempos em tempos e pergunta: "tem alguém vivo aí?" (liveness), "pode atender clientes?" (readiness) e, no primeiro dia, "já terminou a mudança?" (startup).',
    limite: 'O síndico só sabe o que a porta responde: se a resposta mente (sempre "tudo bem"), ele não percebe o problema.',
    conteudo: `
      <p>O Kubernetes sabe se o <b>processo</b> está rodando, mas não se ele está <b>funcionando</b>. Para isso existem as
         <b>probes</b>, testes que o kubelet faz em cada contêiner:</p>
      <ul>
        <li><b>readinessProbe</b>: "pode receber clientes?". Enquanto falha, o pod fica <b>fora dos endpoints</b> do
            Service (READY 0/1), mas não é reiniciado. É ela que deixa uma atualização sem erro para os clientes.</li>
        <li><b>livenessProbe</b>: "está vivo?". Se falhar seguidas vezes (failureThreshold), o contêiner é
            <b>reiniciado</b>. Serve para programa travado, que continua rodando sem responder.</li>
        <li><b>startupProbe</b>: "já terminou de subir?". Enquanto não passa, as outras duas esperam. Para quem demora
            para subir, sem precisar afrouxar a liveness.</li>
      </ul>
      <pre><code>readinessProbe:
  httpGet:              # ou tcpSocket: { port: 8080 }, ou exec: { command: [...] }
    path: /healthz
    port: 8080
  initialDelaySeconds: 0
  periodSeconds: 10     # de quanto em quanto tempo
  failureThreshold: 3   # quantas falhas seguidas para agir</code></pre>
      <p>Onde olhar: <code>kubectl describe pod NOME</code> mostra as probes (<code>Liveness:</code>, <code>Readiness:</code>) e,
         nas Events, cada falha (<i>Unhealthy</i>) e cada reinício por liveness (<i>Killing</i>).</p>
      <p><b>A pegadinha clássica</b>: uma liveness apertada num programa que demora para subir mata o contêiner antes de ele
         ficar pronto, para sempre (CrashLoopBackOff). Use uma startupProbe.</p>`,
  }),

  licao({
    id: 'n6-licao-recursos',
    titulo: 'A potência contratada e o disjuntor: requests e limits',
    vidaReal: 'O request é a potência contratada: o prédio só aceita o morador se a rede aguenta. O limit é o disjuntor: passou da memória, desarma (o contêiner morre); de CPU, a luz fica fraca (fica lento).',
    limite: 'Na rede elétrica, todo mundo pode puxar mais que o contratado ao mesmo tempo e o prédio cai; no Kubernetes, o request é reservado de verdade no node.',
    conteudo: `
      <pre><code>resources:
  requests:        # o que o scheduler reserva no node
    cpu: 250m      # 250 milicores = um quarto de CPU
    memory: 128Mi
  limits:          # o máximo
    cpu: 500m      # passou: o contêiner fica mais lento (throttling)
    memory: 256Mi  # passou: o contêiner é morto (OOMKilled)</code></pre>
      <ul>
        <li><b>requests</b>: o scheduler só põe o pod num node onde a soma dos requests cabe. Pedido grande demais =
            pod <code>Pending</code> (<i>Insufficient cpu</i>).</li>
        <li><b>limits de memória</b>: passou, o kernel mata o contêiner, o motivo fica <code>OOMKilled</code> (código 137) e
            ele reinicia (e entra em CrashLoopBackOff se continuar).</li>
        <li><b>limits de CPU</b>: o contêiner não morre, só fica limitado: o <code>kubectl top</code> mostra ele grudado no
            limite.</li>
      </ul>
      <h2>Classes de QoS</h2>
      <p>Quando falta memória no node, sai primeiro quem pediu menos garantia: <b>BestEffort</b> (nada declarado), depois
         <b>Burstable</b> (algo declarado) e por último <b>Guaranteed</b> (requests = limits, de CPU e memória, em todo
         contêiner). Veja em <code>kubectl describe pod NOME</code>, na linha <code>QoS Class</code>.</p>
      <h2>Quanto cada um gasta</h2>
      <p><code>kubectl top pods</code> e <code>kubectl top nodes</code> mostram o uso de agora. Quem mede é o
         <b>metrics-server</b>, que o kind não traz instalado (sem ele: <i>Metrics API not available</i>); os clusters deste
         nível já vêm com ele.</p>`,
  }),

  licao({
    id: 'n6-licao-escala',
    titulo: 'Os temporários da Black Friday e a cota do condomínio',
    vidaReal: 'O HPA é o gerente que contrata temporários quando a fila cresce e dispensa quando acalma. A ResourceQuota é a cota de energia de cada empresa no condomínio; o LimitRange, as regras para quem chega sem dizer quanto vai gastar.',
    limite: 'O gerente demora: mede a fila de 15 em 15 segundos e espera 5 minutos antes de dispensar alguém (para não demitir e recontratar a cada minuto).',
    conteudo: `
      <h2>HorizontalPodAutoscaler</h2>
      <pre><code>kubectl autoscale deployment loja --cpu=50% --min=2 --max=8</code></pre>
      <p>O HPA olha o uso de CPU dos pods como <b>porcentagem do request</b> e calcula
         <code>réplicas = ⌈réplicas atuais × uso / alvo⌉</code>. Por isso os pods <b>precisam de requests</b>: sem eles,
         o alvo fica <code>&lt;unknown&gt;</code> e nada acontece. Acompanhe com <code>kubectl get hpa -w</code>.</p>
      <p>Cuidado: o HPA muda o <code>spec.replicas</code> do Deployment. Se o seu YAML também diz <code>replicas</code>, cada
         <code>apply</code> briga com ele.</p>
      <h2>ResourceQuota e LimitRange</h2>
      <ul>
        <li><b>ResourceQuota</b>: o teto de um namespace (pods, requests e limits somados). Pod que estoura é recusado
            (<i>exceeded quota</i>), e, com cota de CPU ou memória, todo contêiner precisa declarar requests e limits
            (<i>must specify</i>).</li>
        <li><b>LimitRange</b>: valores <b>padrão</b> para quem não declarou nada, e mínimos e máximos por contêiner.</li>
      </ul>
      <p>Quando um Deployment não consegue criar pods, o erro não aparece no apply: está nas Events do ReplicaSet
         (<code>kubectl describe rs</code>, <i>FailedCreate</i>). Veja o uso com <code>kubectl describe quota</code>.</p>`,
  }),

  problema({
    id: 'n6-pronto-para-atender',
    titulo: 'Atualizar sem nenhum erro, de verdade',
    dificuldade: 'medio',
    cluster: 'loja-3-replicas',
    vidaReal: 'O atendente novo chega, mas ainda está ligando o computador. Sem a pergunta "já pode atender?", a portaria já manda cliente para ele.',
    limite: 'A readiness só protege quem chega pelo Service: quem fala direto com o IP do pod não passa pelo síndico.',
    enunciado: `
      <p>A loja 2.1 (<code>kubelearn/loja:2.1-aquece</code>) aquece o cache por 20 segundos antes de atender. Atualize a
         loja para ela <b>sem nenhum cliente receber erro</b>: um cliente vai pedir <code>http://loja</code> a cada segundo
         durante a troca. A loja responde <code>200</code> em <code>/healthz</code> (porta 8080) quando está pronta.</p>`,
    comoSaber: 'Durante a troca, <code>kubectl get pods -w</code>: os pods novos ficam <code>0/1</code> por uns 20 segundos.',
    dica: 'Troque a imagem e ponha uma readinessProbe httpGet em /healthz, porta 8080. Sem ela, o pod novo conta como pronto antes de abrir a porta.',
    manual: ['pod.spec.containers.readinessProbe', 'pod.spec.containers.readinessProbe.httpGet'],
    inicial: { 'loja.yaml': loja() },
    solucao: { 'loja.yaml': loja({ versao: '2.1-aquece', extra: sonda('readinessProbe', { extra: '            periodSeconds: 2\n' }) }) },
    testes: [
      {
        descricao: 'a troca para a 2.1 sem erro para os clientes',
        vigiar: 'http://loja',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '2m' }],
        regras: [{ semErros: true }, { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:2.1-aquece' }, { vigia: { maxFalhas: 0 } }],
      },
    ],
  }),

  problema({
    id: 'n6-loja-travada',
    titulo: 'A loja travada',
    dificuldade: 'medio',
    cluster: 'loja-trava',
    vidaReal: 'O atendente está na cadeira, de olhos abertos, mas não responde ninguém. Do lado de fora parece tudo normal.',
    limite: 'Reiniciar resolve o sintoma, não a causa: o deadlock volta. A liveness compra tempo até alguém consertar o programa.',
    enunciado: `
      <p>Depois de uns 40 segundos no ar, a loja trava: o processo continua rodando, o pod continua <code>Running</code>,
         mas as requisições ficam sem resposta (veja os logs). Faça o Kubernetes <b>perceber e reiniciar</b> o contêiner
         travado.</p>`,
    comoSaber: '<code>kubectl get pods -w</code>: a coluna RESTARTS sobe; <code>kubectl describe pod NOME</code> mostra <i>Container loja failed liveness probe, will be restarted</i>.',
    dica: 'Uma livenessProbe httpGet em /healthz, porta 8080.',
    manual: ['pod.spec.containers.livenessProbe'],
    inicial: { 'loja.yaml': PARTIDA6.trava },
    solucao: { 'loja.yaml': travada(sonda('livenessProbe', { extra: '            periodSeconds: 5\n' })) },
    testes: [depois('o kubelet reinicia a loja travada', [
      { semErros: true },
      // o Killing sozinho não basta: a troca de versão também mata os contêineres antigos (Stopping container)
      { evento: { motivo: 'Killing', mensagem: 'failed liveness probe, will be restarted' }, msg: 'o kubelet matou um contêiner pela liveness' },
      { evento: { motivo: 'Unhealthy', mensagem: 'Liveness probe failed: .*deadline exceeded' }, msg: 'a liveness reprovou a loja quando ela travou (sem resposta), e não antes' },
      { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].livenessProbe', existe: true },
    ], { esperar: '2m' })],
    armadilhas: [
      // a loja travada ainda aceita a conexão: só a pergunta HTTP percebe que ninguém responde
      { descricao: 'liveness tcpSocket na 8080', arquivos: { 'loja.yaml': travada('          livenessProbe:\n            tcpSocket:\n              port: 8080\n') } },
      { descricao: 'liveness num caminho que não existe (/saude)', arquivos: { 'loja.yaml': travada(sonda('livenessProbe', { caminho: '/saude' })) } },
      { descricao: 'liveness na porta 9090', arquivos: { 'loja.yaml': travada(sonda('livenessProbe').replace('8080', '9090')) } },
    ],
  }),

  problema({
    id: 'n6-subida-lenta',
    titulo: 'A loja que demora para acordar',
    dificuldade: 'medio',
    cluster: 'loja-lenta',
    vidaReal: 'O síndico bate na porta 3 vezes em 15 segundos e, sem resposta, arromba. Só que a mudança leva 45 segundos: ele arromba toda vez, e a mudança nunca termina.',
    limite: 'Dá para afrouxar a liveness (initialDelaySeconds), mas aí um travamento de verdade também demora para ser percebido.',
    enunciado: `
      <p>A loja 3.0 migra o banco quando sobe (uns 45 segundos). A livenessProbe dela é apertada, e os pods não saem de
         <code>CrashLoopBackOff</code>. Sem afrouxar a liveness, faça a loja subir.</p>`,
    comoSaber: '<code>kubectl get pods</code>: <code>1/1 Running</code>, com 0 reinícios.',
    dica: 'Uma startupProbe (httpGet /healthz, porta 8080) com failureThreshold × periodSeconds maior que 45 segundos: enquanto ela não passa, a liveness espera.',
    manual: ['pod.spec.containers.startupProbe'],
    inicial: { 'loja.yaml': PARTIDA6.lenta },
    solucao: {
      'loja.yaml': loja({
        versao: '3.0-lenta',
        replicas: 2,
        extra: sonda('startupProbe', { extra: '            periodSeconds: 5\n            failureThreshold: 20\n' }) + sonda('livenessProbe', { extra: '            periodSeconds: 5\n' }),
      }),
    },
    testes: [depois('a loja sobe sem reiniciar', [
      { semErros: true },
      { pods: 'app=loja', prontos: 2, reinicios: { max: 0 } },
      { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].startupProbe', existe: true },
      {
        objeto: 'deployment/loja',
        campo: 'spec.template.spec.containers[0].livenessProbe',
        igual: { httpGet: { path: '/healthz', port: 8080, scheme: 'HTTP' }, periodSeconds: 5, timeoutSeconds: 1, successThreshold: 1, failureThreshold: 3 },
        msg: 'a livenessProbe continua como estava',
      },
    ], { esperar: '2m' })],
  }),

  problema({
    id: 'n6-pergunta-errada',
    titulo: 'A pergunta errada',
    dificuldade: 'facil',
    cluster: 'loja-sonda-errada',
    vidaReal: 'O síndico pergunta "a sala de reuniões está livre?" para saber se a loja abriu: a resposta é sempre "não sei", e a loja nunca abre.',
    limite: 'A readiness errada não derruba nada: só deixa o pod fora do Service, quieto, o que às vezes demora para alguém notar.',
    enunciado: `
      <p>Os pods da loja estão <code>Running</code>, mas <code>0/1</code>, e o Service <code>loja</code> não tem endpoints.
         Descubra o motivo nas Events (<code>kubectl describe pod NOME</code>) e conserte. A loja responde saúde em
         <code>/healthz</code>.</p>`,
    dica: 'A readinessProbe pergunta num caminho que a loja não conhece (404).',
    inicial: { 'loja.yaml': PARTIDA6.sondaErrada },
    solucao: { 'loja.yaml': loja({ replicas: 2, extra: sonda('readinessProbe') }) },
    testes: [
      depois('o ramal volta a tocar', [{ semErros: true }, { endpoints: 'svc/loja', quantidade: 2 }]),
      depois(TRAVAS, [PERGUNTA_CERTA], { oculto: true }),
    ],
    armadilhas: [{ descricao: 'apagar a readinessProbe', arquivos: { 'loja.yaml': loja({ replicas: 2 }) } }],
  }),

  problema({
    id: 'n6-potencia-demais',
    titulo: 'Potência demais',
    dificuldade: 'medio',
    cluster: 'loja-apertada',
    vidaReal: 'Cada loja pediu 1,5 kW de potência contratada, mas cada prédio só tem 2 kW: a terceira loja não cabe em lugar nenhum.',
    limite: 'O request não é o que o programa usa: é o que fica reservado. A loja usa bem menos, e mesmo assim a reserva ocupa o lugar.',
    enunciado: `
      <p>Um dos 3 pods da loja está <code>Pending</code>. Veja o motivo (<code>kubectl describe pod NOME</code>, em Events) e
         quanto a loja usa de verdade (<code>kubectl top pods</code>). Ajuste o pedido para os 3 caberem.</p>`,
    comoSaber: '<code>kubectl get pods</code>: 3 pods <code>Running</code>.',
    dica: 'resources.requests.cpu: 1500m é demais. A loja usa poucos milicores; 250m sobra.',
    inicial: { 'loja.yaml': PARTIDA6.apertado },
    solucao: { 'loja.yaml': loja({ extra: recursos({ cpu: '250m' }) }) },
    testes: [
      depois('as 3 lojas cabem', [{ semErros: true }, { pods: 'app=loja', prontos: 3 }]),
      depois(TRAVAS, [{ objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].resources.requests.cpu', existe: true, msg: 'o pedido de CPU continua lá: rasgar a conta de luz não diminui o consumo' }], { oculto: true }),
    ],
    armadilhas: [{ descricao: 'apagar o resources (BestEffort)', arquivos: { 'loja.yaml': loja() } }],
  }),

  problema({
    id: 'n6-disjuntor',
    titulo: 'O disjuntor que desarma',
    dificuldade: 'medio',
    cluster: 'relatorio-oom',
    vidaReal: 'O relatório liga o ar-condicionado, o forno e o chuveiro ao mesmo tempo num disjuntor de 10 A: desarma toda vez.',
    limite: 'Aumentar o disjuntor resolve se o relatório precisa mesmo daquilo; se ele vaza memória, só adia a queda.',
    enunciado: `
      <p>O <code>relatorio</code> não para de reiniciar. Descubra o motivo (<code>kubectl describe pod NOME</code>: o
         <i>Last State</i> e o <i>Reason</i>) e conserte. O relatório carrega uma planilha de uns 300Mi.</p>`,
    comoSaber: '<code>kubectl get pods</code>: <code>1/1 Running</code> e os reinícios param.',
    dica: 'OOMKilled: o contêiner passou do limits.memory. Suba o limite (512Mi dá folga).',
    inicial: { 'relatorio.yaml': PARTIDA6.oom },
    solucao: { 'relatorio.yaml': relatorio('512Mi') },
    testes: [
      depois('o relatório fica de pé', [
        { semErros: true },
        { pods: 'app=relatorio', prontos: 1, reinicios: { max: 0 } },
        { objeto: 'deployment/relatorio', campo: 'spec.template.spec.containers[0].resources.limits.memory', maiorQue: '300Mi', msg: 'o limite de memória deixa folga acima dos 300Mi da planilha' },
      ]),
      depois(TRAVAS, [{ objeto: 'deployment/relatorio', campo: 'spec.template.spec.containers[0].resources.limits.memory', existe: true, msg: 'o limite de memória continua lá: tirar o disjuntor não conserta a fiação' }], { oculto: true }),
    ],
    armadilhas: [
      { descricao: 'o limite justo nos 300Mi, sem folga', arquivos: { 'relatorio.yaml': relatorio('300Mi') } },
      { descricao: 'apagar o limits (sem disjuntor)', mudar: (a) => ({ 'relatorio.yaml': a['relatorio.yaml'].replace(/\n\s+resources:[\s\S]*$/, '\n') }) },
    ],
  }),

  problema({
    id: 'n6-garantido',
    titulo: 'A caixa-forte garantida',
    dificuldade: 'facil',
    vidaReal: 'Na falta de energia, os geradores atendem primeiro quem contratou potência garantida.',
    limite: 'Garantido não é imortal: o pod Guaranteed ainda morre se passar do próprio limite de memória.',
    enunciado: `
      <p>Faça o pod <code>caixa-forte</code> ter QoS <b>Guaranteed</b>: o último a sair quando faltar memória no node.</p>`,
    comoSaber: '<code>kubectl describe pod caixa-forte</code> mostra <code>QoS Class: Guaranteed</code>.',
    dica: 'requests e limits iguais, de cpu e de memória.',
    manual: ['pod.spec.containers.resources'],
    inicial: { 'caixa-forte.yaml': garantido(false) },
    solucao: { 'caixa-forte.yaml': garantido(true) },
    testes: [depois('o pod é Guaranteed', [{ semErros: true }, { objeto: 'pod/caixa-forte', campo: 'status.qosClass', igual: 'Guaranteed' }], { esperar: '10s' })],
  }),

  problema({
    id: 'n6-quem-gasta',
    titulo: 'Quem está gastando?',
    dificuldade: 'facil',
    cluster: 'consumo',
    terminal: true,
    vidaReal: 'A conta de luz veio alta: o síndico olha o medidor de cada apartamento.',
    limite: 'O medidor mostra o agora, não o histórico: para o pico de ontem, só com uma ferramenta de monitoramento (Prometheus).',
    enunciado: `
      <p>Qual pod do namespace default está usando <b>mais memória</b>?</p>`,
    rotuloResposta: 'O nome do pod',
    dica: 'kubectl top pods (ou com --sort-by=memory).',
    respostaCerta: (c) => c.listar('Pod', 'default').find((p) => p.metadata.labels?.app === 'relatorio').metadata.name,
    solucaoTerminal: ['kubectl top pods --sort-by=memory'],
    testes: noCluster('você achou o gastão', [
      { comando: '^kubectl\\s+top\\s+(po|pod|pods)\\b', msg: 'você usou o kubectl top' },
      { resposta: /^relatorio-[a-z0-9]+-[a-z0-9]{5}$/ },
    ]),
  }),

  problema({
    id: 'n6-autoscale',
    titulo: 'O gerente de temporários',
    dificuldade: 'facil',
    cluster: 'loja-pedidos',
    terminal: true,
    vidaReal: 'Contratar um gerente com a regra: "mantenha os atendentes ocupados em metade do tempo, com no mínimo 2 e no máximo 6".',
    limite: 'O gerente só contrata se tiver vaga: sem espaço nos nodes, os temporários ficam esperando na porta (Pending).',
    enunciado: `
      <p>Pelo terminal, crie um HPA para a <code>deployment/loja</code>: alvo de <b>50% de CPU</b>, mínimo <b>2</b> e máximo
         <b>6</b> réplicas.</p>`,
    comoSaber: '<code>kubectl get hpa</code> mostra <code>cpu: N%/50%</code>, MINPODS 2 e MAXPODS 6.',
    dica: 'kubectl autoscale deployment loja --cpu=50% --min=2 --max=6',
    solucaoTerminal: ['kubectl autoscale deployment loja --cpu=50% --min=2 --max=6'],
    testes: noCluster('o HPA está de pé', [
      { objeto: 'hpa/loja', campo: 'spec.metrics[0].resource.target.averageUtilization', igual: 50 },
      { objeto: 'hpa/loja', campo: 'spec.minReplicas', igual: 2 },
      { objeto: 'hpa/loja', campo: 'spec.maxReplicas', igual: 6 },
    ]),
  }),

  problema({
    id: 'n6-black-friday',
    titulo: 'Black Friday',
    dificuldade: 'dificil',
    cluster: 'black-friday',
    vidaReal: 'O gerente recebeu a ordem "mantenha os atendentes em 50% da capacidade", mas ninguém disse qual é a capacidade de cada um: ele não consegue fazer a conta e não contrata ninguém.',
    limite: 'O HPA reage em minutos, não em segundos: para um pico súbito, é bom já começar com folga (minReplicas).',
    enunciado: `
      <p>A Black Friday começou: o pod <code>carga</code> está mandando pedidos sem parar para a loja, e o HPA existe, mas
         a loja continua com 2 réplicas. <code>kubectl get hpa</code> mostra <code>&lt;unknown&gt;</code>. Descubra o motivo
         (<code>kubectl describe hpa loja</code>) e faça o HPA funcionar.</p>`,
    comoSaber: '<code>kubectl get hpa -w</code>: o alvo deixa de ser <code>&lt;unknown&gt;</code> e as réplicas sobem.',
    dica: 'O HPA calcula a CPU como porcentagem do request: a loja precisa de resources.requests.cpu (100m, por exemplo). Não escreva replicas no Deployment: quem manda nelas agora é o HPA.',
    inicial: { 'loja.yaml': PARTIDA6.semPedido.replace('    replicas: 2\n', '') },
    solucao: { 'loja.yaml': loja({ replicas: 2, extra: recursos({ cpu: '100m' }) }).replace('    replicas: 2\n', '') },
    testes: [depois('o HPA contrata temporários', [
      { semErros: true },
      { objeto: 'deployment/loja', campo: 'spec.replicas', regex: '^[3-8]$', msg: 'a loja passou de 2 réplicas' },
      { objeto: 'hpa/loja', campo: 'status.currentMetrics[0].resource.current.averageUtilization', existe: true, msg: 'o HPA consegue medir a CPU' },
    ], { esperar: '2m' })],
  }),

  problema({
    id: 'n6-cota',
    titulo: 'A cota do condomínio',
    dificuldade: 'medio',
    cluster: 'cota-vendas',
    vidaReal: 'O condomínio deu à empresa Vendas uma cota de energia e exige que todo aparelho venha com a etiqueta de consumo. Aparelho sem etiqueta não entra.',
    limite: 'A cota soma o que foi declarado, não o que é usado: um pedido exagerado ocupa a cota mesmo com a loja parada.',
    enunciado: `
      <p>No namespace <code>vendas</code>, o Deployment <code>loja</code> não consegue criar nenhum pod. Descubra o motivo
         (<code>kubectl describe rs -n vendas</code>, em Events, e <code>kubectl describe quota -n vendas</code>) e conserte
         o Deployment, cabendo na cota.</p>`,
    comoSaber: '<code>kubectl get pods -n vendas</code>: 2 pods <code>Running</code>.',
    dica: 'A cota tem requests.cpu e limits.memory: todo contêiner precisa declarar os dois. Cada loja pode pedir 250m de CPU e 256Mi de limite de memória.',
    inicial: { 'loja.yaml': PARTIDA6.vendas },
    solucao: { 'loja.yaml': loja({ replicas: 2, ns: 'vendas', extra: recursos({ cpu: '250m' }, { memory: '256Mi' }) }) },
    testes: [
      depois('a loja de vendas abre dentro da cota', [{ semErros: true }, { pods: 'app=loja', ns: 'vendas', prontos: 2 }], { esperar: '2m' }),
      depois(TRAVAS, [{ objeto: 'quota/cota', ns: 'vendas', campo: 'spec.hard', igual: { 'requests.cpu': '1', 'limits.memory': '1Gi' }, msg: 'a cota continua como a administração deixou: rasgar a regra do condomínio não cria energia' }], { oculto: true }),
    ],
    armadilhas: [{
      descricao: 'reescrever a cota sem mexer no Deployment',
      arquivos: { 'cota.yaml': 'apiVersion: v1\nkind: ResourceQuota\nmetadata:\n  name: cota\n  namespace: vendas\nspec:\n  hard:\n    pods: "10"\n', 'loja.yaml': PARTIDA6.vendas },
    }],
  }),

  problema({
    id: 'n6-regras-padrao',
    titulo: 'As regras para quem chega sem etiqueta',
    dificuldade: 'medio',
    cluster: 'cota-compras',
    vidaReal: 'Em vez de devolver todo aparelho sem etiqueta, a administração põe uma etiqueta padrão na entrada.',
    limite: 'O padrão vale para todos: um aparelho que gasta muito mais que o padrão vai cair no disjuntor (o limit padrão).',
    enunciado: `
      <p>O namespace <code>compras</code> tem uma cota que exige requests e limits, e o time não quer mexer em cada
         Deployment. Crie um <b>LimitRange</b> chamado <code>padrao</code> que dê a todo contêiner sem nada declarado:
         request de <code>100m</code> de CPU e <code>64Mi</code> de memória, e limit de <code>250m</code> e
         <code>128Mi</code>. A loja de compras precisa subir sem mudar o Deployment.</p>`,
    comoSaber: '<code>kubectl get pods -n compras</code>: 2 pods <code>Running</code> (o ReplicaSet tenta de novo sozinho, em alguns segundos).',
    dica: 'kind LimitRange, spec.limits com type Container, defaultRequest e default.',
    manual: ['limitrange.spec.limits'],
    inicial: {
      'limites.yaml': yaml`
        apiVersion: v1
        kind: LimitRange
        metadata:
          name: padrao
          namespace: compras
        spec:
          limits:
          - type: Container
            # defaultRequest: ...
            # default: ...
      `,
    },
    solucao: { 'limites.yaml': limiteDoNamespace },
    testes: [depois('a loja de compras sobe com as regras padrão', [{ semErros: true }, { pods: 'app=loja', ns: 'compras', prontos: 2 }], { esperar: '2m' })],
  }),

  problema({
    id: 'n6-teto',
    titulo: 'O teto por aparelho',
    dificuldade: 'facil',
    cluster: 'teto-compras',
    vidaReal: 'A regra do condomínio diz: nenhum aparelho com disjuntor acima de 512. O seu veio com 1000.',
    limite: 'O teto vale por contêiner; para limitar o total do namespace, é a cota (ResourceQuota).',
    enunciado: `
      <p>A loja de <code>compras</code> não cria pods (veja as Events do ReplicaSet no namespace <code>compras</code>).
         Conserte o Deployment.</p>`,
    dica: 'O LimitRange do namespace tem max de memória 512Mi: o limits.memory da loja precisa caber.',
    inicial: { 'loja.yaml': PARTIDA6.grande },
    solucao: { 'loja.yaml': loja({ replicas: 2, ns: 'compras', extra: recursos({ memory: '256Mi' }, { memory: '512Mi' }) }) },
    testes: [depois('a loja cabe no teto', [{ semErros: true }, { pods: 'app=loja', ns: 'compras', prontos: 2 }], { esperar: '2m' })],
  }),
];
