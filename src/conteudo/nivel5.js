// Nível 5: cargas especiais (a obra pontual, a coleta agendada, o extintor em cada prédio, a vistoria antes da mudança).
import { licao, problema, yaml } from './util.js';

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const depois = (descricao, regras, { oculto = false, esperar = '1m' } = {}) => ({ oculto, descricao, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }], regras });
const terminou = (nome, n = 1) => ({ objeto: `job/${nome}`, campo: 'status.succeeded', igual: n, msg: `o Job ${nome} terminou ${n === 1 ? 'com sucesso' : `${n} vezes com sucesso`}` });

const job = ({ nome, comando, extra = '', politica = 'Never', especificacao = '' }) => yaml`
  apiVersion: batch/v1
  kind: Job
  metadata:
    name: ${nome}
  spec:
${especificacao}    template:
      spec:
${politica ? `        restartPolicy: ${politica}\n` : ''}        containers:
        - name: ${nome}
          image: busybox:1.36
          command: ["sh", "-c", ${JSON.stringify(comando)}]
${extra}`;

const cron = (horario) => yaml`
  apiVersion: batch/v1
  kind: CronJob
  metadata:
    name: limpeza
  spec:
    schedule: "${horario}"
    jobTemplate:
      spec:
        template:
          spec:
            restartPolicy: OnFailure
            containers:
            - name: limpeza
              image: busybox:1.36
              command: ["sh", "-c", "echo varrendo os corredores"]
`;

const extintor = (tolerancia = '') => yaml`
  apiVersion: apps/v1
  kind: DaemonSet
  metadata:
    name: extintor
  spec:
    selector:
      matchLabels:
        app: extintor
    template:
      metadata:
        labels:
          app: extintor
      spec:
${tolerancia}        containers:
        - name: extintor
          image: busybox:1.36
          command: ["sleep", "infinity"]
`;
const TOLERA_ADMINISTRACAO = `        tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
`;

const painel = (comInit) => `apiVersion: v1
kind: Pod
metadata:
  name: painel
  labels:
    app: painel
spec:
${comInit ? '  initContainers:\n  - name: preparo' : '  containers:\n  - name: preparo'}
    image: busybox:1.36
    command: ["sh", "-c", "echo conferindo a obra; sleep 3; echo ok > /config/pronto"]
    volumeMounts:
    - name: config
      mountPath: /config
${comInit ? '  containers:\n' : ''}  - name: painel
    image: kubelearn/painel:1.0
    ports:
    - containerPort: 8080
    volumeMounts:
    - name: config
      mountPath: /config
  volumes:
  - name: config
    emptyDir: {}
`;

const enviador = `name: enviador
    image: busybox:1.36
    command: ["sh", "-c", "while true; do echo enviando o relatorio para a construtora; sleep 5; done"]`;
const jobComSidecar = (nativo) => `apiVersion: batch/v1
kind: Job
metadata:
  name: medicao
spec:
  template:
    spec:
      restartPolicy: Never
${nativo ? `      initContainers:
      - ${enviador.replaceAll('\n    ', '\n        ')}
        restartPolicy: Always
` : ''}      containers:
      - name: medicao
        image: busybox:1.36
        command: ["sh", "-c", "echo medindo a obra; sleep 5; echo medicao concluida"]
${nativo ? '' : `      - ${enviador.replaceAll('\n    ', '\n        ')}\n`}`;

const backup = yaml`
  apiVersion: batch/v1
  kind: CronJob
  metadata:
    name: backup
  spec:
    schedule: "0 3 * * *"
    jobTemplate:
      spec:
        template:
          spec:
            restartPolicy: OnFailure
            containers:
            - name: backup
              image: busybox:1.36
              command: ["sh", "-c", "echo copiando os arquivos da obra; echo backup feito: 128 arquivos"]
`;

/** Os clusters de partida deste nível (em clusters.js), com os mesmos manifestos dos arquivos iniciais. */
export const PARTIDA5 = {
  migracao: job({ nome: 'migracao', comando: 'echo migrando o banco; sleep 2; exti 0', especificacao: '    backoffLimit: 2\n' }),
  backup,
  extintor: extintor(),
  painel: painel(false),
};

export const NIVEL5 = [
  licao({
    id: 'n5-licao-jobs',
    titulo: 'A obra pontual e a coleta agendada: Job e CronJob',
    vidaReal: 'O Job é a empreitada: o pedreiro vem, faz o serviço e vai embora (se der errado, tenta de novo). O CronJob é a coleta de lixo: toda terça às 7h, sem ninguém precisar pedir.',
    limite: 'O "tenta de novo" tem limite (backoffLimit) e espera cada vez mais entre as tentativas: um erro no comando não se resolve sozinho.',
    conteudo: `
      <p>Deployment é para o que <b>não pode parar</b> (a loja aberta). Para o que precisa <b>terminar</b> (gerar um
         relatório, migrar o banco, fazer backup), use um <b>Job</b>:</p>
      <pre><code>apiVersion: batch/v1
kind: Job
metadata:
  name: relatorio
spec:
  completions: 3      # precisa dar certo 3 vezes
  parallelism: 2      # no máximo 2 ao mesmo tempo
  backoffLimit: 6     # quantas falhas aceitar antes de desistir
  template:
    spec:
      restartPolicy: Never   # ou OnFailure (nunca Always)
      containers:
      - name: relatorio
        image: busybox:1.36
        command: ["sh", "-c", "echo gerando relatorio"]</code></pre>
      <p>O pod que termina bem fica <code>Completed</code> (o log continua lá: <code>kubectl logs job/relatorio</code>). O que
         falha dá lugar a outro, com espera crescente (10s, 20s, 40s...). Passou do <code>backoffLimit</code>, o Job fica
         <code>Failed</code>. Para esperar o fim num script: <code>kubectl wait --for=condition=complete job/relatorio</code>.</p>
      <h2>CronJob: o Job com hora marcada</h2>
      <p>O CronJob cria um Job a cada horário do <code>schedule</code>, no formato do cron: <b>minuto hora dia mês dia-da-semana</b>.</p>
      <ul>
        <li><code>*/5 * * * *</code>: a cada 5 minutos;</li>
        <li><code>0 3 * * *</code>: todo dia às 3h;</li>
        <li><code>0 7 * * 2</code>: toda terça às 7h (domingo é 0).</li>
      </ul>
      <p>Para testar sem esperar o horário: <code>kubectl create job teste --from=cronjob/NOME</code>. O CronJob guarda os
         últimos Jobs (3 que deram certo e 1 que falhou, por padrão) e apaga os mais velhos.</p>`,
  }),

  licao({
    id: 'n5-licao-daemonset-init',
    titulo: 'O extintor em cada prédio e a vistoria antes da mudança',
    vidaReal: 'O DaemonSet é a regra do condomínio: todo prédio tem um extintor, inclusive o que ficar pronto amanhã. O init container é a vistoria: a mudança só entra depois que ela termina. O sidecar é o porteiro que trabalha junto com o morador.',
    limite: 'O extintor só vai para os prédios que aceitam: a administração (o control plane) tem um taint, e o DaemonSet só entra lá com a tolerância.',
    conteudo: `
      <h2>DaemonSet: um pod em cada node</h2>
      <p>Coleta de logs, rede, monitoramento: tem coisa que precisa rodar em <b>todo</b> node. O <b>DaemonSet</b> garante um
         pod por node, e põe o pod sozinho em todo node novo. O próprio cluster usa: veja
         <code>kubectl get ds -n kube-system</code> (o <code>kube-proxy</code> e a rede <code>kindnet</code>).</p>
      <p>Não há <code>replicas</code>: quem manda é a quantidade de nodes. Para escolher os nodes, use
         <code>nodeSelector</code>; para entrar num node com taint (como o control plane), use <code>tolerations</code>.</p>
      <h2>Init container: antes de tudo</h2>
      <p>Os <code>initContainers</code> rodam <b>antes</b> dos contêineres do app, em ordem, e cada um precisa terminar com
         sucesso. Bom para preparar arquivos, esperar um banco, migrar dados. Enquanto isso, o pod mostra
         <code>Init:0/1</code>; se um falha, <code>Init:Error</code> ou <code>Init:CrashLoopBackOff</code>.</p>
      <h2>Sidecar: junto, do começo ao fim</h2>
      <p>Um init container com <code>restartPolicy: Always</code> vira um <b>sidecar</b>: sobe antes do app, fica rodando ao
         lado dele (enviando logs, fazendo proxy) e sai quando o app termina. Num Job isso faz diferença: um contêiner comum
         que nunca termina deixa o Job preso para sempre.</p>`,
  }),

  problema({
    id: 'n5-primeiro-job',
    titulo: 'A primeira empreitada',
    dificuldade: 'facil',
    vidaReal: 'Chamar o pedreiro para um serviço só: ele faz e vai embora.',
    limite: 'O pedreiro vai embora, mas o recibo (o pod Completed e o log) fica até alguém jogar fora.',
    enunciado: `
      <p>Crie o Job <code>boas-vindas</code> (imagem <code>busybox:1.36</code>) que escreve <b>obra concluída</b> no log e
         termina.</p>`,
    comoSaber: '<code>kubectl get jobs</code> mostra <code>Complete</code>; <code>kubectl logs job/boas-vindas</code> mostra a frase.',
    dica: 'command: ["sh", "-c", "echo obra concluída"], e restartPolicy Never ou OnFailure.',
    manual: ['job.spec', 'job.spec.template.spec.restartPolicy'],
    inicial: {
      'job.yaml': yaml`
        apiVersion: batch/v1
        kind: Job
        metadata:
          name: boas-vindas
        spec:
          template:
            spec:
              # restartPolicy: ...
              # containers: ...
      `,
    },
    solucao: { 'job.yaml': job({ nome: 'boas-vindas', comando: 'echo obra concluída' }) },
    testes: [
      depois('o Job termina', [{ semErros: true }, terminou('boas-vindas')], { esperar: '30s' }),
      {
        oculto: true,
        descricao: 'o log tem a frase',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '30s' }, { comando: 'kubectl logs job/boas-vindas' }],
        regras: [{ saida: 'obra concluída' }],
      },
    ],
  }),

  problema({
    id: 'n5-politica',
    titulo: 'O pedreiro que nunca vai embora',
    dificuldade: 'facil',
    vidaReal: 'O contrato da empreitada diz "se terminar, comece de novo": isso não é empreitada, é emprego fixo.',
    limite: 'O Kubernetes recusa o contrato logo na entrada: nem chega a criar o Job.',
    enunciado: `
      <p>Este Job é recusado ao aplicar. Leia o erro e conserte (o trabalho em si está certo).</p>`,
    dica: 'Job aceita restartPolicy OnFailure ou Never. Always é para o que não pode parar (Deployment).',
    inicial: { 'job.yaml': job({ nome: 'medicao', comando: 'echo medindo; sleep 2; echo 42 metros', politica: 'Always' }) },
    solucao: { 'job.yaml': job({ nome: 'medicao', comando: 'echo medindo; sleep 2; echo 42 metros' }) },
    testes: [depois('o Job é aceito e termina', [{ semErros: true }, terminou('medicao')], { esperar: '30s' })],
  }),

  problema({
    id: 'n5-mutirao',
    titulo: 'O mutirão',
    dificuldade: 'medio',
    vidaReal: 'Seis paredes para levantar e um pedreiro só: dá, mas demora. Com três pedreiros ao mesmo tempo, sai em dois turnos.',
    limite: 'Mais pedreiros só ajudam se houver espaço na obra: sem CPU livre nos nodes, os pods extras ficam esperando (Pending).',
    enunciado: `
      <p>O Job <code>paredes</code> precisa terminar <b>6 vezes</b>, e cada parede leva uns 10 segundos. Do jeito que está,
         ele faz uma de cada vez. Ajuste para fazer <b>3 ao mesmo tempo</b>: o teste espera no máximo 40 segundos.</p>`,
    comoSaber: '<code>kubectl get pods -l job-name=paredes -w</code>: três pods por vez.',
    dica: 'spec.completions (quantas vezes) e spec.parallelism (quantas ao mesmo tempo).',
    manual: ['job.spec.completions', 'job.spec.parallelism'],
    inicial: { 'job.yaml': job({ nome: 'paredes', comando: 'echo levantando parede; sleep 10', especificacao: '    completions: 6\n' }) },
    solucao: { 'job.yaml': job({ nome: 'paredes', comando: 'echo levantando parede; sleep 10', especificacao: '    completions: 6\n    parallelism: 3\n' }) },
    testes: [depois('as 6 paredes ficam prontas em 40 segundos', [{ semErros: true }, { objeto: 'job/paredes', campo: 'spec.parallelism', regex: '^[3-6]$', msg: 'pelo menos 3 pedreiros ao mesmo tempo' }, terminou('paredes', 6)], { esperar: '40s' })],
  }),

  problema({
    id: 'n5-erro-de-digitacao',
    titulo: 'A migração que nunca termina',
    dificuldade: 'medio',
    cluster: 'job-quebrado',
    vidaReal: 'O pedreiro tenta, falha, volta mais tarde, falha de novo: a planta tem um erro e ele não tem como adivinhar.',
    limite: 'O Kubernetes não lê o log: ele só vê que o comando saiu com erro (código diferente de 0) e tenta de novo.',
    enunciado: `
      <p>O Job <code>migracao</code> está falhando. Descubra o motivo nos logs (<code>kubectl logs job/migracao</code>) e
         conserte o arquivo. Dica: um Job não muda de comando; apague e crie de novo
         (<code>kubectl delete job migracao</code> e aplique).</p>`,
    dica: 'O log diz "sh: exti: not found": o comando tem um erro de digitação.',
    inicial: { 'migracao.yaml': job({ nome: 'migracao', comando: 'echo migrando o banco; sleep 2; exti 0', especificacao: '    backoffLimit: 2\n' }) },
    solucao: { 'migracao.yaml': job({ nome: 'migracao', comando: 'echo migrando o banco; sleep 2; exit 0', especificacao: '    backoffLimit: 2\n' }) },
    testes: [{
      descricao: 'a migração termina',
      passos: [{ comando: 'kubectl delete job migracao' }, { comando: 'kubectl apply -f .' }, { avancar: '30s' }],
      regras: [terminou('migracao')],
    }],
  }),

  problema({
    id: 'n5-coleta',
    titulo: 'A coleta de lixo',
    dificuldade: 'medio',
    vidaReal: 'A coleta passa a cada 5 minutos, sozinha, sem ninguém ligar pedindo.',
    limite: 'O caminhão sai no horário mesmo que a coleta anterior ainda não tenha acabado (a não ser que a regra diga Forbid).',
    enunciado: `
      <p>Crie o CronJob <code>limpeza</code> que roda <b>a cada 5 minutos</b> (o trabalho já está no arquivo).</p>`,
    comoSaber: '<code>kubectl get cronjob</code> mostra o horário; depois de 5 minutos, <code>kubectl get jobs</code> mostra o primeiro Job.',
    dica: 'O schedule no formato do cron: minuto hora dia mês dia-da-semana. "A cada 5" é */5.',
    manual: ['cronjob.spec.schedule'],
    inicial: { 'limpeza.yaml': cron('# quando?') },
    solucao: { 'limpeza.yaml': cron('*/5 * * * *') },
    testes: [
      { descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [{ semErros: true }, { objeto: 'cronjob/limpeza', campo: 'spec.schedule', regex: '^\\*/5 \\* \\* \\* \\*$' }] },
      {
        oculto: true,
        descricao: 'a coleta passa sozinha',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '6m' }, { comando: 'kubectl get jobs' }],
        regras: [{ saida: 'limpeza-\\d+\\s+Complete', msg: 'um Job da limpeza rodou e terminou' }],
      },
    ],
  }),

  problema({
    id: 'n5-coleta-agora',
    titulo: 'Testar a coleta sem esperar',
    dificuldade: 'facil',
    cluster: 'backup-noturno',
    terminal: true,
    vidaReal: 'O backup roda às 3h da manhã. Ninguém vai ficar acordado para ver se funciona: pede-se uma rodada extra agora.',
    limite: 'A rodada extra conta como um Job comum: ela não muda o horário do CronJob.',
    enunciado: `
      <p>O CronJob <code>backup</code> roda todo dia às 3h. Rode-o <b>agora</b>, criando um Job chamado
         <code>teste</code> a partir dele, e diga quantos arquivos o backup copiou (está no log).</p>`,
    rotuloResposta: 'Quantos arquivos?',
    dica: 'kubectl create job teste --from=cronjob/backup; depois kubectl logs job/teste.',
    respostaCerta: '128',
    solucaoTerminal: ['kubectl create job teste --from=cronjob/backup', 'kubectl wait --for=condition=complete job/teste', 'kubectl logs job/teste'],
    testes: noCluster('o backup rodou agora', [
      { comando: 'create\\s+job\\s+teste\\s+--from=(cronjob|cj)/backup', msg: 'você criou o Job a partir do CronJob' },
      { objeto: 'job/teste', campo: 'metadata.annotations["cronjob.kubernetes.io/instantiate"]', igual: 'manual' },
      { resposta: '128' },
    ]),
  }),

  problema({
    id: 'n5-extintor',
    titulo: 'Um extintor em cada prédio',
    dificuldade: 'medio',
    vidaReal: 'Todo prédio tem extintor, inclusive o que a construtora entregar na semana que vem.',
    limite: 'Prédio interditado (com taint) não recebe o extintor sem uma tolerância.',
    enunciado: `
      <p>Crie o DaemonSet <code>extintor</code> (imagem <code>busybox:1.36</code>, comando <code>sleep infinity</code>), para
         ter um pod em cada node de trabalho. Os testes ocultos vão construir um prédio novo.</p>`,
    comoSaber: '<code>kubectl get ds</code> mostra DESIRED 2; <code>kubectl get pods -o wide</code>, um pod em node-1 e outro em node-2.',
    dica: 'Parece um Deployment sem replicas: kind DaemonSet, selector, template.',
    manual: ['daemonset.spec'],
    inicial: {
      'extintor.yaml': yaml`
        apiVersion: apps/v1
        kind: DaemonSet
        metadata:
          name: extintor
        spec:
          # selector: ...
          # template: ...
      `,
    },
    solucao: { 'extintor.yaml': extintor() },
    testes: [
      depois('um extintor em cada node de trabalho', [{ semErros: true }, { pods: 'app=extintor', quantidade: 2, prontos: 2 }], { esperar: '30s' }),
      {
        oculto: true,
        descricao: 'o prédio novo também ganha o extintor',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '30s' }, { adicionarNode: 'node-3' }, { avancar: '30s' }],
        regras: [{ pods: 'app=extintor', quantidade: 3, prontos: 3 }],
      },
    ],
  }),

  problema({
    id: 'n5-extintor-na-administracao',
    titulo: 'Extintor na administração também',
    dificuldade: 'medio',
    cluster: 'extintor',
    vidaReal: 'A administração do condomínio é um prédio com placa "só funcionários". O extintor entra se tiver autorização.',
    limite: 'A tolerância libera a entrada, não obriga: num Deployment, o pod poderia ir para a administração ou não.',
    enunciado: `
      <p>O DaemonSet <code>extintor</code> está em node-1 e node-2, mas não no <code>control-plane</code>. Descubra por quê
         (<code>kubectl describe node control-plane</code>, em Taints) e faça o extintor chegar lá também.</p>`,
    dica: 'Uma toleration para a chave node-role.kubernetes.io/control-plane, efeito NoSchedule (operator Exists).',
    manual: ['pod.spec.tolerations'],
    inicial: { 'extintor.yaml': extintor() },
    solucao: { 'extintor.yaml': extintor(TOLERA_ADMINISTRACAO) },
    testes: [depois('um extintor em cada um dos 3 nodes', [{ semErros: true }, { pods: 'app=extintor', quantidade: 3, prontos: 3 }], { esperar: '30s' })],
  }),

  problema({
    id: 'n5-vistoria',
    titulo: 'A vistoria antes da mudança',
    dificuldade: 'medio',
    cluster: 'painel',
    vidaReal: 'A mudança e a vistoria chegaram juntas: o caminhão descarrega antes de o fiscal liberar, e tudo volta para o caminhão.',
    limite: 'A vistoria (init) roda uma vez, na subida do pod; se o app reiniciar depois, ela não roda de novo.',
    enunciado: `
      <p>O <code>painel</code> só abre se o arquivo <code>/config/pronto</code> existir, e quem cria o arquivo é o contêiner
         <code>preparo</code>. Os dois sobem juntos, e o painel cai (veja <code>kubectl logs painel -c painel</code>).
         Faça o <code>preparo</code> rodar <b>antes</b> e terminar primeiro, sem o painel reiniciar.</p>`,
    comoSaber: '<code>kubectl get pod painel</code> passa por <code>Init:0/1</code> e chega a <code>1/1 Running</code> com 0 reinícios.',
    dica: 'Mova o preparo de containers para initContainers (no mesmo nível). Pod não muda depois de criado: kubectl delete pod painel e aplique.',
    manual: ['pod.spec.initContainers'],
    inicial: { 'painel.yaml': painel(false) },
    solucao: { 'painel.yaml': painel(true) },
    testes: [{
      descricao: 'o painel abre de primeira',
      passos: [{ comando: 'kubectl delete pod painel' }, { comando: 'kubectl apply -f .' }, { avancar: '40s' }],
      regras: [{ pods: 'app=painel', prontos: 1, reinicios: { max: 0 } }],
    }],
  }),

  problema({
    id: 'n5-sidecar',
    titulo: 'O Job que nunca termina',
    dificuldade: 'dificil',
    vidaReal: 'A medição acabou, mas o mensageiro que leva o relatório fica na obra para sempre, e a empreitada nunca é dada como encerrada.',
    limite: 'O sidecar sai quando o app termina; se o app nunca termina (um servidor), o sidecar também fica.',
    enunciado: `
      <p>O Job <code>medicao</code> tem dois contêineres: a <code>medicao</code>, que termina em segundos, e o
         <code>enviador</code>, que manda o relatório sem parar. Por causa dele, o Job nunca fica <code>Complete</code>.
         Transforme o <code>enviador</code> num <b>sidecar</b> de verdade.</p>`,
    comoSaber: '<code>kubectl get jobs</code> mostra <code>Complete</code>; <code>kubectl get pods</code>, o pod <code>Completed</code>.',
    dica: 'Sidecar é um init container com restartPolicy: Always. Um Job não muda de template: apague o Job e aplique de novo.',
    manual: ['pod.spec.initContainers.restartPolicy'],
    inicial: { 'medicao.yaml': jobComSidecar(false) },
    solucao: { 'medicao.yaml': jobComSidecar(true) },
    testes: [{
      descricao: 'a medição termina e o Job também',
      passos: [{ comando: 'kubectl apply -f .' }, { avancar: '40s' }, { comando: 'kubectl logs job/medicao -c enviador' }],
      regras: [
        { semErros: true },
        terminou('medicao'),
        { objeto: 'job/medicao', campo: 'spec.template.spec.initContainers[0].name', igual: 'enviador', msg: 'o enviador está nos initContainers' },
        { objeto: 'job/medicao', campo: 'spec.template.spec.initContainers[0].restartPolicy', igual: 'Always', msg: 'o enviador tem restartPolicy: Always (sidecar)' },
        { saida: 'enviando o relatorio', msg: 'o enviador mandou o relatório' },
      ],
    }],
  }),
];
