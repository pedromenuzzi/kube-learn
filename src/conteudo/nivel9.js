// Nível 9: troubleshooting. Só incidentes: cada missão chega com o cluster já quebrado, o relato de um morador e o que
// precisa funcionar no fim. A causa fica com o aluno (get, describe, logs, events); a dica só aparece depois de duas
// entregas erradas. Cada sintoma aqui tem uma causa diferente da missão parecida dos níveis anteriores.
import { licao, problema, yaml } from './util.js';
import { t } from '../i18n.js';

/** Um Deployment; `pod` entra no spec do pod (recuo de 6), `ct` no contêiner (recuo de 8). */
const dep = (nome, { replicas = 1, imagem = 'nginx:1.27', ns, estrategia, pod = '', ct = '' } = {}) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${nome}
${ns ? `  namespace: ${ns}\n` : ''}spec:
  replicas: ${replicas}
${estrategia ? `  strategy:\n    type: ${estrategia}\n` : ''}  selector:
    matchLabels:
      app: ${nome}
  template:
    metadata:
      labels:
        app: ${nome}
    spec:
${pod}      containers:
      - name: ${nome}
        image: ${imagem}
${ct}`;
const porta = (n, nome) => `        ports:\n        - containerPort: ${n}\n${nome ? `          name: ${nome}\n` : ''}`;
const svc = (nome, { alvo = 80, app = nome, ns } = {}) => `apiVersion: v1
kind: Service
metadata:
  name: ${nome}
${ns ? `  namespace: ${ns}\n` : ''}spec:
  selector:
    app: ${app}
  ports:
  - port: 80
    targetPort: ${alvo}
`;
const ns = (nome) => `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${nome}\n`;
const sh = (nome, { app = nome, ns: n } = {}) => `apiVersion: v1
kind: Pod
metadata:
  name: ${nome}
${n ? `  namespace: ${n}\n` : ''}  labels:
    app: ${app}
spec:
  containers:
  - name: ${nome}
    image: busybox:1.36
    command: ["sleep", "3600"]
`;
const juntar = (...docs) => docs.map((d) => d.trim()).join('\n---\n');
const loja = (replicas, extra = {}) => dep('loja', { replicas, imagem: 'kubelearn/loja:1.0', ct: porta(8080), ...extra });

/** Os clusters de partida (o cluster quebrado de cada incidente), em clusters.js. */
export const PARTIDA9 = {};

/**
 * Um incidente: o relato do morador, o que precisa funcionar no fim (`tarefa`, sem dizer a causa), os manifestos como
 * estão aplicados (`arquivos`) e, se precisar, como ficam consertados (`correcao`). O cluster de partida aplica os
 * arquivos e os `extras` (o que não é para mexer) e fica em `partidas` (a seção Troubleshooting usa a dela).
 * `travas`: as regras de um teste oculto que confere que o conserto não foi tirar a proteção (apagar a sonda...).
 * As descrições dos testes passam pelo t(): o Plantão do dia monta o incidente na hora, já no idioma escolhido.
 */
export function incidente({ id, morador, relato, tarefa, arquivos, correcao, extras = [], partida = {}, partidas = PARTIDA9, regras, travas, ...resto }) {
  const cluster = `incidente-${id.slice(3)}`;
  partidas[cluster] = { manifestos: juntar(...extras, ...Object.values(arquivos)), ...partida };
  return problema({
    id,
    cluster,
    terminal: true,
    enunciado: `<blockquote class="relato"><p>${relato}</p><footer>${morador}</footer></blockquote>${tarefa}`,
    inicial: arquivos,
    solucao: correcao ?? arquivos,
    testes: [
      { noClusterDoAluno: true, descricao: t('o incidente está resolvido'), regras },
      ...(travas ? [{ noClusterDoAluno: true, oculto: true, descricao: t('as travas de segurança continuam lá'), regras: travas }] : []),
    ],
    ...resto,
  });
}

/** A trava da readinessProbe: o conserto é a pergunta certa, não tirar a pergunta. */
export const PERGUNTA_CERTA = { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/healthz', msg: 'a readinessProbe continua perguntando em /healthz: tirar o detector de fumaça não apaga o fogo' };

/** O critério de sucesso do incidente: o que precisa funcionar no fim, do jeito que dá para conferir. */
const resolvido = (texto) => `<p><b>Resolvido quando:</b> ${texto}</p>`;

const banco = (portaDaSonda) => dep('banco', {
  imagem: 'postgres:17',
  ct: `${porta(5432)}        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: banco
              key: senha
        livenessProbe:
          tcpSocket:
            port: ${portaDaSonda}
`,
});
/** Um pedido de disco (PVC) de 1Gi, na classe padrão do kind (o local-path, que só cria o disco quando um pod o usa). */
const pvc = (nome) => yaml`
  apiVersion: v1
  kind: PersistentVolumeClaim
  metadata:
    name: ${nome}
  spec:
    accessModes:
    - ReadWriteOnce
    resources:
      requests:
        storage: 1Gi
`;
const relatorioComPlanilhas = (claim) => juntar(pvc('planilhas'), dep('relatorio', {
  imagem: 'kubelearn/relatorio:1.0',
  pod: `      volumes:\n      - name: planilhas\n        persistentVolumeClaim:\n          claimName: ${claim}\n`,
  ct: '        volumeMounts:\n        - name: planilhas\n          mountPath: /planilhas\n',
}));
// O relatório do mês: a TI trocou o comando inteiro (command) quando só queria passar o mês (args).
const relatorioDoMes = (ct) => dep('relatorio', { imagem: 'kubelearn/relatorio:1.0', ct });
// A galeria e o box das fotos: o upload rodou no node-2 (o node-1 estava interditado), e o disco do local-path ficou lá.
const uploadDasFotos = yaml`
  apiVersion: batch/v1
  kind: Job
  metadata:
    name: upload-das-fotos
  spec:
    template:
      spec:
        restartPolicy: Never
        containers:
        - name: upload
          image: busybox:1.36
          command: ["sh", "-c", "echo '<h1>Fotos do Lauro</h1>' > /fotos/index.html"]
          volumeMounts:
          - name: fotos
            mountPath: /fotos
        volumes:
        - name: fotos
          persistentVolumeClaim:
            claimName: fotos
`;
const galeria = (noPredio1) => juntar(pvc('fotos'), dep('galeria', {
  estrategia: 'Recreate',
  pod: `${noPredio1 ? '      nodeSelector:\n        kubernetes.io/hostname: node-1\n' : ''}      volumes:\n      - name: fotos\n        persistentVolumeClaim:\n          claimName: fotos\n`,
  ct: `${porta(80)}        volumeMounts:\n        - name: fotos\n          mountPath: /usr/share/nginx/html\n`,
}), svc('galeria'));
const lojaComSonda = (espera) => loja(3, {
  ct: `${porta(8080)}        readinessProbe:\n          httpGet:\n            path: /healthz\n            port: 8080\n          initialDelaySeconds: ${espera}\n`,
});
const vitrineComConfig = dep('vitrine', { replicas: 2, imagem: 'kubelearn/loja:1.0', ct: `${porta(8080)}        envFrom:\n        - configMapRef:\n            name: vitrine-config\n` });
const protegeLoja = (comVitrine) => yaml`
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: protege-loja
  spec:
    podSelector:
      matchLabels:
        app: loja
    ingress:
    - from:
      - podSelector:
          matchLabels:
            app: admin
${comVitrine ? '      - podSelector:\n          matchLabels:\n            app: vitrine\n' : ''}`;
const papelDoCi = (verbos) => yaml`
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata:
    name: deploy-ci
    namespace: loja
  rules:
  - apiGroups:
    - apps
    resources:
    - deployments
    verbs:
${verbos.map((v) => `    - ${v}`).join('\n')}
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: carla-ci
    namespace: loja
  subjects:
  - kind: User
    name: carla
    apiGroup: rbac.authorization.k8s.io
  roleRef:
    kind: Role
    name: deploy-ci
    apiGroup: rbac.authorization.k8s.io
`;
const vitrineDoEstoque = (url) => dep('vitrine', {
  ns: 'loja',
  imagem: 'busybox:1.36',
  ct: `        env:\n        - name: API_URL\n          value: ${url}\n        command: ["sh", "-c", "while true; do wget -q -O- -T 2 $API_URL > /dev/null && echo estoque ok || echo estoque fora do ar; sleep 5; done"]\n`,
});
const migracao = (prazo) => yaml`
  apiVersion: batch/v1
  kind: Job
  metadata:
    name: migracao
  spec:
    backoffLimit: 2
    activeDeadlineSeconds: ${prazo}
    template:
      spec:
        restartPolicy: Never
        containers:
        - name: migracao
          image: busybox:1.36
          command: ["sh", "-c", "echo migrando o banco; sleep 20; echo pronto"]
`;
const limpeza = (suspenso) => yaml`
  apiVersion: batch/v1
  kind: CronJob
  metadata:
    name: limpeza
  spec:
    schedule: "*/1 * * * *"
    suspend: ${suspenso}
    jobTemplate:
      spec:
        template:
          spec:
            restartPolicy: OnFailure
            containers:
            - name: limpeza
              image: busybox:1.36
              command: ["sh", "-c", "echo limpando a lixeira"]
`;
const fila = yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: fila
  spec:
    clusterIP: None
    selector:
      app: fila
    ports:
    - port: 6379
  ---
  apiVersion: apps/v1
  kind: StatefulSet
  metadata:
    name: fila
  spec:
    serviceName: fila
    replicas: 1
    selector:
      matchLabels:
        app: fila
    template:
      metadata:
        labels:
          app: fila
      spec:
        containers:
        - name: fila
          image: redis:7
          ports:
          - containerPort: 6379
`;
const balcao = (servico) => yaml`
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
              name: ${servico}
              port:
                number: 80
`;
const classeDeIngress = yaml`
  apiVersion: networking.k8s.io/v1
  kind: IngressClass
  metadata:
    name: traefik
    annotations:
      ingressclass.kubernetes.io/is-default-class: "true"
  spec:
    controller: traefik.io/ingress-controller
`;
// A loja da promoção pede o que usa no pico (250m); o teste de carga da semana passada ficou ligado, reservando CPU.
const lojaDeVendas = dep('loja', {
  ns: 'vendas',
  replicas: 6,
  imagem: 'kubelearn/loja:1.0',
  ct: `${porta(8080)}        resources:\n          requests:\n            cpu: 250m\n`,
});
const testeDeCarga = dep('teste-de-carga', {
  ns: 'testes',
  replicas: 2,
  imagem: 'busybox:1.36',
  ct: '        command: ["sleep", "infinity"]\n        resources:\n          requests:\n            cpu: 1200m\n',
});
const painel = (espera) => dep('painel', {
  pod: `      initContainers:\n      - name: espera-o-banco\n        image: busybox:1.36\n        command: ["sh", "-c", "until nslookup ${espera}.default.svc.cluster.local; do echo esperando o ${espera}; sleep 2; done"]\n`,
  ct: porta(80),
});

export const NIVEL9 = [
  licao({
    id: 'n9-licao-plantao',
    titulo: 'O plantão do síndico',
    vidaReal: 'O síndico de plantão não sai trocando tudo: ouve o morador, olha o livro de ocorrências, entra no apartamento e só então chama o eletricista certo.',
    limite: 'No condomínio, o síndico vê o estrago com os próprios olhos. No cluster, você só vê o que os comandos mostram: aprenda a perguntar.',
    conteudo: `
      <p>Neste nível, cada missão é um <b>incidente</b>: o cluster chega quebrado e um morador conta o que viu. O enunciado
         traz só o relato e o que precisa funcionar no fim; a causa é você quem descobre. Os manifestos aplicados estão no
         editor (mude e clique em <b>Aplicar</b>) e o terminal é seu. Entregou e não passou duas vezes? A dica aparece.</p>
      <h2>O roteiro</h2>
      <ol>
        <li><code>kubectl get pods</code> (com <code>-o wide</code> e <code>-A</code>): o STATUS já aponta o caminho.</li>
        <li><code>kubectl describe pod NOME</code>: as <b>Events</b> no fim contam o que o Kubernetes tentou e por que falhou.
            Dê o nome inteiro: com vários pods (sem nome, ou só o começo dele), o describe esconde as Events. Para ver todas
            de uma vez, <code>kubectl get events</code>.</li>
        <li><code>kubectl logs NOME</code> (e <code>--previous</code>, se reiniciou): o que o próprio programa disse.</li>
        <li><code>kubectl get events --sort-by=.lastTimestamp</code>: o livro de ocorrências do namespace.</li>
        <li><code>kubectl exec</code>: entrar e testar de dentro (<code>wget</code>, <code>nslookup</code>, <code>cat</code>).</li>
      </ol>
      <h2>Do sintoma à causa</h2>
      <table class="tabela-simples">
        <thead><tr><th>Sintoma</th><th>Onde olhar</th><th>Causas comuns</th></tr></thead>
        <tbody>
          <tr><td>Pending</td><td>describe pod (FailedScheduling)</td><td>sem CPU/memória, taint, nodeSelector, afinidade, PVC (ou o disco dele, preso em outro node)</td></tr>
          <tr><td>ImagePullBackOff</td><td>describe pod</td><td>nome ou tag errados, registry privado</td></tr>
          <tr><td>CrashLoopBackOff</td><td>logs --previous, describe pod</td><td>env ou arquivo faltando, comando errado, bug, OOMKilled, livenessProbe errada</td></tr>
          <tr><td>CreateContainerConfigError</td><td>describe pod</td><td>ConfigMap/Secret faltando, runAsNonRoot</td></tr>
          <tr><td>Running, 0/1 pronto</td><td>describe pod (Unhealthy, a linha Readiness)</td><td>readinessProbe errada (caminho, porta, atraso)</td></tr>
          <tr><td>Faltam pods (nem chegam a existir)</td><td>describe rs, get events</td><td>cota, LimitRange, Pod Security</td></tr>
          <tr><td>Service não responde</td><td>get endpoints, describe svc</td><td>seletor (de menos ou de mais), targetPort (número ou nome), ninguém pronto, NetworkPolicy</td></tr>
          <tr><td>Forbidden</td><td>auth can-i --as</td><td>falta verbo ou recurso na Role</td></tr>
          <tr><td>Terminating que não acaba</td><td>get nodes, get pods -o wide</td><td>o node caiu: o kubelet dele não confirma a saída</td></tr>
        </tbody>
      </table>
      <p>Uma regra de ouro: <b>mude uma coisa por vez</b> e confira de novo. E leia a mensagem de erro inteira: quase sempre
         ela diz exatamente o que falta.</p>`,
  }),

  incidente({
    id: 'n9-imagem-errada',
    titulo: 'A vitrine que não abre',
    dificuldade: 'facil',
    morador: 'Dona Marta, da loja de roupas do 101',
    relato: 'A vitrine nova não abriu até agora. O rapaz disse que usou o nginx de sempre, "com um ajuste meu", e que no notebook dele funcionou.',
    tarefa: resolvido('as 2 réplicas da <code>vitrine</code> estão prontas, rodando o nginx oficial (<code>nginx:1.27</code>).'),
    vidaReal: 'O rapaz encomendou à fábrica o modelo "1.27-vitrine", que ele montou na oficina dele e nunca mandou para lá: a fábrica tem o nginx, mas não esse modelo.',
    limite: 'Imagem construída no seu computador só existe lá até alguém fazer o push para um registry. E repare no erro: "not found" é a tag que falta; "repository does not exist" é o nome inteiro errado.',
    dica: 'kubectl describe pod NOME (Events: Failed to pull image ... not found). O repositório nginx existe; a tag 1.27-vitrine, não: ela só existia no notebook do rapaz. Use nginx:1.27.',
    arquivos: { 'vitrine.yaml': dep('vitrine', { replicas: 2, imagem: 'nginx:1.27-vitrine', ct: porta(80) }) },
    correcao: { 'vitrine.yaml': dep('vitrine', { replicas: 2, imagem: 'nginx:1.27', ct: porta(80) }) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=vitrine', prontos: 2, imagem: 'nginx:1.27' }],
  }),

  incidente({
    id: 'n9-sem-senha',
    titulo: 'O banco que não para de cair',
    dificuldade: 'medio',
    morador: 'Seu Lima, do financeiro',
    relato: 'Desde que trocamos o MySQL pelo Postgres, o banco fica de pé uns trinta segundos e cai. Volta, fica mais um pouco, cai de novo. E a senha está certa, eu conferi.',
    tarefa: resolvido('o <code>banco</code> fica de pé sem reiniciar (o RESTARTS para de subir), sem tirar do Deployment nenhuma das verificações de saúde.'),
    vidaReal: 'O zelador confere se o banco está vivo tocando a campainha do 3306, o apartamento do inquilino antigo (o MySQL). Ninguém atende, e ele reinicia o banco, que estava ótimo no 5432.',
    limite: 'A livenessProbe não sabe que quem errou foi ela: para ela, quem não atende travou. Uma sonda errada derruba um programa saudável, de novo e de novo, e o log do programa não mostra erro nenhum.',
    dica: 'kubectl describe pod NOME (Events: Liveness probe failed: dial tcp ...:3306 e "failed liveness probe, will be restarted"). O Postgres ouve na 5432: troque a porta da livenessProbe.',
    extras: [yaml`
      apiVersion: v1
      kind: Secret
      metadata:
        name: banco
      stringData:
        senha: tijolo-azul-42
    `],
    arquivos: { 'banco.yaml': banco(3306) },
    correcao: { 'banco.yaml': banco(5432) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=banco', prontos: 1, reinicios: { max: 0 } },
      { objeto: 'deployment/banco', campo: 'spec.template.spec.containers[0].livenessProbe', existe: true, msg: 'o banco continua com a livenessProbe' },
    ],
  }),

  incidente({
    id: 'n9-sem-espaco',
    titulo: 'O relatório que nunca começa',
    dificuldade: 'medio',
    morador: 'Dona Zélia, da contabilidade',
    relato: 'Pedi o relatório do mês às oito. Ele está "esperando" até agora. A TI olhou e disse que o problema é o disco das planilhas, que também está "esperando".',
    tarefa: resolvido('o <code>relatorio</code> está rodando, com o disco <code>planilhas</code> montado.'),
    vidaReal: 'O relatório pediu o box "planilha", e o box alugado se chama "planilhas". A corretora não acha o box, então não acha lugar para o relatório; e o box, sem ninguém que o use, nem é montado.',
    limite: 'O PVC Pending aqui é inocente: com WaitForFirstConsumer (a classe do kind), o disco só é criado quando um pod que o usa ganha um node. Nem todo Pending é defeito do próprio objeto.',
    dica: 'kubectl describe pod NOME (persistentvolumeclaim "planilha" not found) e kubectl describe pvc planilhas (waiting for first consumer). O PVC espera o relatório, e o relatório pede o nome errado: claimName: planilhas.',
    arquivos: { 'relatorio.yaml': relatorioComPlanilhas('planilha') },
    correcao: { 'relatorio.yaml': relatorioComPlanilhas('planilhas') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=relatorio', prontos: 1 },
      { objeto: 'pvc/planilhas', campo: 'status.phase', igual: 'Bound', msg: 'o disco planilhas está ligado ao relatório' },
    ],
  }),

  incidente({
    id: 'n9-manutencao-esquecida',
    titulo: 'A placa da reforma de ontem',
    dificuldade: 'medio',
    morador: 'Kleber, o zelador',
    relato: 'Ontem teve manutenção nos dois prédios. Hoje a loja nova não consegue morar em lugar nenhum.',
    tarefa: resolvido('as 2 réplicas da <code>loja</code> estão rodando, e os dois prédios voltaram ao normal, sem nada da manutenção.'),
    vidaReal: 'Esqueceram a placa "em reforma" pendurada nas portas dos dois prédios.',
    limite: 'Tirar a placa só deixa os próximos entrarem: quem foi recusado espera a próxima tentativa do scheduler.',
    dica: 'kubectl describe pod NOME (untolerated taint), kubectl describe node (a linha Taints) e kubectl taint nodes NODE chave-.',
    partida: { nodes: [{ nome: 'control-plane', controlPlane: true }, ...['node-1', 'node-2'].map((nome) => ({ nome, taints: [{ effect: 'NoSchedule', key: 'manutencao', value: 'sim' }] }))] },
    arquivos: { 'loja.yaml': loja(2) },
    solucaoTerminal: ['kubectl taint nodes node-1 manutencao-', 'kubectl taint nodes node-2 manutencao-'],
    regras: [
      { pods: 'app=loja', prontos: 2 },
      { objeto: 'node/node-1', campo: 'spec.taints', existe: false, msg: 'o node-1 está sem a placa' },
      { objeto: 'node/node-2', campo: 'spec.taints', existe: false, msg: 'o node-2 está sem a placa' },
    ],
  }),

  incidente({
    id: 'n9-disco-que-nao-vem',
    titulo: 'A galeria longe do box',
    dificuldade: 'dificil',
    morador: 'Seu Lauro, o fotógrafo',
    relato: 'Ontem subi as fotos para o box da galeria, deu tudo certo. Mas a galeria não abre. A TI disse que ela "tem que ficar no prédio 1, o das vitrines".',
    tarefa: resolvido('a <code>galeria</code> está aberta (<code>http://galeria</code>, do pod <code>cliente</code>) mostrando as fotos que já estão no box.'),
    vidaReal: 'O box da galeria fica no subsolo do prédio 2, e a ordem é a galeria morar no prédio 1. O box não se muda junto, e a galeria não abre sem ele.',
    limite: 'Um disco do local-path (o do kind) mora num node só, e o pod fica preso a ele. Discos de rede (os da nuvem) trocam de node, mas também têm zona: o mesmo conflito aparece entre zonas.',
    dica: 'kubectl describe pod NOME (FailedScheduling: um node não casa com o nodeSelector da galeria; o outro, com a afinidade do PersistentVolume) e kubectl describe pv (Node Affinity: o box mora no node-2). Tire o nodeSelector e aplique: a galeria vai aonde o box está. Nada de apagar o PVC: as fotos iriam junto.',
    partida: { antes: ['kubectl cordon node-1'], comandos: ['kubectl uncordon node-1'] },
    extras: [sh('cliente'), uploadDasFotos],
    arquivos: { 'galeria.yaml': galeria(true) },
    correcao: { 'galeria.yaml': galeria(false) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=galeria', prontos: 1 },
      { requisicao: { de: 'pod/cliente', url: 'http://galeria', status: 200, corpo: 'Fotos do Lauro' }, msg: 'a galeria mostra as fotos que já estavam no box' },
    ],
  }),

  incidente({
    id: 'n9-ramal-mudo',
    titulo: 'O ramal que ninguém atende',
    dificuldade: 'medio',
    morador: 'Lúcia, do atendimento',
    relato: 'Os atendentes da loja estão todos lá, eu vi. Mas quem liga no ramal "loja" não fala com ninguém. Ontem o pessoal só "padronizou os nomes" nos arquivos.',
    tarefa: resolvido('o ramal <code>loja</code> tem os 3 atendentes, e quem liga é atendido (<code>http://loja</code>, do pod <code>cliente</code>).'),
    vidaReal: 'O ramal transfere para a sala chamada "http", e nos apartamentos da loja a sala se chama "web": o ramal não acha a sala e tira o apartamento da lista.',
    limite: 'O Service não reclama do nome que não existe: o pod só fica de fora da lista, quieto. O nome da porta é útil (dá para mudar o número sem mexer no Service), desde que os dois lados usem o mesmo.',
    dica: 'kubectl get endpoints loja (vazio, com os pods prontos) e kubectl describe svc loja (TargetPort: http). Compare com o name da containerPort no Deployment: os dois precisam ser iguais.',
    extras: [sh('cliente')],
    arquivos: { 'loja.yaml': juntar(loja(3, { ct: porta(8080, 'web') }), svc('loja', { alvo: 'http' })) },
    correcao: { 'loja.yaml': juntar(loja(3, { ct: porta(8080, 'http') }), svc('loja', { alvo: 'http' })) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ endpoints: 'svc/loja', quantidade: 3 }, { requisicao: { de: 'pod/cliente', url: 'http://loja', status: 200 } }],
  }),

  incidente({
    id: 'n9-porta-errada',
    titulo: 'Conexão recusada, às vezes',
    dificuldade: 'medio',
    morador: 'Lúcia, do atendimento',
    relato: 'Agora o ramal chama, mas de vez em quando cai na hora: "conexão recusada". Ligo de novo e funciona. É mais ou menos uma ligação em cada quatro.',
    tarefa: resolvido('toda ligação para o ramal <code>loja</code> (<code>http://loja</code>, do pod <code>cliente</code>) é atendida pela loja.'),
    vidaReal: 'O ramal toca em todo apartamento com a plaquinha "loja" na porta, e alguém pendurou a plaquinha na sala de testes, onde ninguém atende telefone.',
    limite: 'O Service não sabe quem "é" a loja: ele confia nas labels. Qualquer pod com app=loja entra no rodízio, mesmo sem nada ouvindo na porta 8080.',
    dica: 'kubectl get endpoints loja (quantos endereços, para 3 atendentes?) e kubectl get pods -l app=loja -o wide. Quem está ali que não é da loja? Apague esse pod (ou tire a label dele).',
    extras: [sh('cliente'), sh('depuracao', { app: 'loja' })],
    arquivos: { 'loja.yaml': juntar(loja(3), svc('loja', { alvo: 8080 })) },
    solucaoTerminal: ['kubectl delete pod depuracao'],
    regras: [
      { endpoints: 'svc/loja', quantidade: 3 },
      { distribuicao: { de: 'pod/cliente', url: 'http://loja', vezes: 20, corpo: '"app":"loja"', entre: [20, 20] }, msg: 'as 20 ligações de teste para http://loja são atendidas pela loja' },
    ],
  }),

  incidente({
    id: 'n9-nunca-pronto',
    titulo: 'Rodando, mas sem clientes',
    dificuldade: 'medio',
    morador: 'Seu Jorge, dono da loja do térreo',
    relato: 'Subimos a loja nova. Os três atendentes estão lá dentro, "Running", mas o ramal não manda cliente nenhum para eles. Esperei, e nada. E não aparece erro em lugar nenhum!',
    tarefa: resolvido('os 3 pods da <code>loja</code> estão prontos, e o ramal <code>loja</code> manda clientes para os três.'),
    vidaReal: 'Combinaram que o zelador só pergunta "pode receber cliente?" depois de 3000 segundos, achando que eram 3 (como se fossem milissegundos). Até lá, a loja fica fechada, e ninguém reclama de nada.',
    limite: 'Enquanto a readinessProbe não roda, o pod conta como não pronto: sem erro, sem evento Unhealthy. Às vezes a pista é justamente o silêncio, e ela está na configuração, não nos eventos.',
    dica: 'Sem eventos de erro? Leia a linha Readiness do kubectl describe pod NOME: delay=3000s. O initialDelaySeconds é em segundos: 3000 são 50 minutos. Use poucos segundos (2, por exemplo).',
    arquivos: { 'loja.yaml': juntar(lojaComSonda(3000), svc('loja', { alvo: 8080 })) },
    correcao: { 'loja.yaml': juntar(lojaComSonda(2), svc('loja', { alvo: 8080 })) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=loja', prontos: 3 }, { endpoints: 'svc/loja', quantidade: 3 }],
    travas: [PERGUNTA_CERTA],
    armadilhas: [{ descricao: 'apagar a readinessProbe', arquivos: { 'loja.yaml': juntar(loja(3), svc('loja', { alvo: 8080 })) } }],
  }),

  incidente({
    id: 'n9-disjuntor',
    titulo: 'O relatório que nem liga',
    dificuldade: 'medio',
    morador: 'Dona Zélia, da contabilidade',
    relato: 'Ontem a TI mexeu no relatório para ele gerar o mês 10. Desde então ele não liga: cai antes de começar, e o log dele fica vazio.',
    tarefa: resolvido('o <code>relatorio</code> fica de pé, sem reiniciar, e ainda recebendo o pedido do mês (<code>--mes 10</code>).'),
    vidaReal: 'A TI reescreveu o bilhete de ligar a máquina: "ligue a relatorio, mês 10". Só que a máquina fica em /relatorio, fora dos armários onde o zelador procura (o PATH): ele não acha e desiste antes de ligar.',
    limite: 'command troca o ENTRYPOINT da imagem; args troca só o CMD. Para passar opções ao programa, quase sempre basta args. E o log fica vazio porque o programa nem chegou a rodar.',
    dica: 'kubectl describe pod NOME (Last State: StartError, exec: "relatorio": executable file not found in $PATH). O programa da imagem é /relatorio: deixe o command de fora e passe só args: ["--mes", "10"] (ou use o caminho inteiro no command).',
    arquivos: { 'relatorio.yaml': relatorioDoMes('        command: ["relatorio", "--mes", "10"]\n') },
    correcao: { 'relatorio.yaml': relatorioDoMes('        args: ["--mes", "10"]\n') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=relatorio', prontos: 1, reinicios: { max: 0 } },
      { objeto: 'deployment/relatorio', campo: 'spec.template.spec.containers[0]', regex: '"--mes","10"', msg: 'o relatório continua recebendo --mes 10' },
    ],
  }),

  incidente({
    id: 'n9-quadro-sem-aviso',
    titulo: 'O quadro de avisos que sumiu',
    dificuldade: 'facil',
    morador: 'Dona Marta, da loja de roupas do 101',
    relato: 'A vitrine nova era para ser azul. Nem azul, nem nada: ela nem abre.',
    tarefa: resolvido('as 2 réplicas da <code>vitrine</code> estão prontas e azuis: a variável <code>COR</code> vale <code>azul</code> dentro delas.'),
    vidaReal: 'A vitrine vai ler a cor no quadro de avisos, e o quadro nunca foi pendurado.',
    limite: 'Assim que o ConfigMap aparece, o kubelet tenta de novo e a vitrine sobe: não precisa reiniciar nada.',
    dica: 'kubectl describe pod NOME (configmap "vitrine-config" not found). kubectl create configmap vitrine-config --from-literal=COR=azul',
    arquivos: { 'vitrine.yaml': vitrineComConfig },
    solucaoTerminal: ['kubectl create configmap vitrine-config --from-literal=COR=azul'],
    regras: [{ pods: 'app=vitrine', prontos: 2 }, { env: { pods: 'app=vitrine', nome: 'COR', igual: 'azul' } }],
  }),

  incidente({
    id: 'n9-catraca-esquecida',
    titulo: 'A catraca esquecida',
    dificuldade: 'medio',
    morador: 'Rafa, da vitrine',
    relato: 'Desde a auditoria de segurança, a vitrine não consegue mais falar com a loja. Só o pessoal do admin passa.',
    tarefa: resolvido('a <code>vitrine</code> volta a falar com a loja (<code>http://loja</code>), e o resto do condomínio, como o pod <code>curioso</code>, continua barrado.'),
    vidaReal: 'A catraca nova só reconhece o crachá do admin: a vitrine fica barrada na porta.',
    limite: 'Apagar a catraca também "resolve", e abre a loja para qualquer um (inclusive o curioso).',
    dica: 'kubectl get netpol e kubectl describe netpol protege-loja (quem pode entrar na loja?). Acrescente um podSelector app: vitrine no from, sem apagar a regra.',
    extras: [svc('loja', { alvo: 8080 }), sh('vitrine'), sh('curioso')],
    arquivos: { 'loja.yaml': loja(2), 'protege-loja.yaml': protegeLoja(false) },
    correcao: { 'loja.yaml': loja(2), 'protege-loja.yaml': protegeLoja(true) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { requisicao: { de: 'pod/vitrine', url: 'http://loja', status: 200 } },
      { requisicao: { de: 'pod/curioso', url: 'http://loja', status: 'timeout' }, msg: 'o curioso continua barrado' },
    ],
  }),

  incidente({
    id: 'n9-sem-cracha',
    titulo: 'O deploy proibido',
    dificuldade: 'medio',
    morador: 'Carla, da esteira de deploy (CI)',
    relato: 'A esteira cria Deployments na loja sem problema, mas, quando tenta atualizar, dá isto: <code>deployments.apps "loja" is forbidden: User "carla" cannot patch resource "deployments" in API group "apps" in the namespace "loja"</code>.',
    tarefa: resolvido('a <code>carla</code> consegue atualizar Deployments no namespace <code>loja</code> (com <code>patch</code> e com <code>update</code>), sem ganhar o poder de apagar.'),
    vidaReal: 'O crachá abre a porta para trazer móveis novos, mas não para trocar os que já estão lá.',
    limite: 'O kubectl apply usa patch; o kubectl replace, update. Para a esteira não depender disso, os dois.',
    dica: 'kubectl auth can-i patch deployments --as=carla -n loja e kubectl describe role deploy-ci -n loja. Acrescente update e patch aos verbos.',
    extras: [ns('loja')],
    arquivos: { 'ci.yaml': papelDoCi(['get', 'list', 'create']) },
    correcao: { 'ci.yaml': papelDoCi(['get', 'list', 'create', 'update', 'patch']) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pode: { quem: 'carla', verbo: 'patch', recurso: 'deployments', ns: 'loja', resposta: true } },
      { pode: { quem: 'carla', verbo: 'update', recurso: 'deployments', ns: 'loja', resposta: true } },
      { pode: { quem: 'carla', verbo: 'delete', recurso: 'deployments', ns: 'loja', resposta: false } },
    ],
  }),

  incidente({
    id: 'n9-endereco-errado',
    titulo: 'O estoque no outro bloco',
    dificuldade: 'medio',
    morador: 'Rafa, da vitrine',
    relato: 'A vitrine mudou para o bloco da loja e agora diz "estoque fora do ar" o tempo todo. O estoque está funcionando, eu liguei lá.',
    tarefa: resolvido('a <code>vitrine</code> (namespace <code>loja</code>) volta a achar a <code>api</code> do estoque: os logs dela dizem "estoque ok".'),
    vidaReal: 'Ligaram para o ramal "api" do próprio bloco; a api é de outro bloco, e o endereço curto não chega lá.',
    limite: 'O nome curto vale só no mesmo namespace: de outro, é nome.namespace (ou o nome completo, nome.namespace.svc.cluster.local).',
    dica: 'kubectl logs -n loja deploy/vitrine e kubectl get svc -A (onde mora a api?). De outro namespace, o endereço é http://api.estoque.',
    extras: [ns('loja'), ns('estoque'), dep('api', { ns: 'estoque', ct: porta(80) }), svc('api', { ns: 'estoque' })],
    arquivos: { 'vitrine.yaml': vitrineDoEstoque('http://api') },
    correcao: { 'vitrine.yaml': vitrineDoEstoque('http://api.estoque') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=vitrine', ns: 'loja', prontos: 1 },
      { env: { pods: 'app=vitrine', ns: 'loja', nome: 'API_URL', regex: '^http://api\\.estoque(\\.svc(\\.cluster\\.local)?)?/?$' }, msg: 'a API_URL aponta para o namespace estoque' },
    ],
  }),

  incidente({
    id: 'n9-rollout-travado',
    titulo: 'A reforma que não anda',
    dificuldade: 'medio',
    morador: 'Seu Jorge, dono da loja do térreo',
    relato: 'Mandaram a loja para a versão nova de manhã. Até agora o "rollout status" diz que está esperando. A loja velha continua atendendo, pelo menos.',
    tarefa: resolvido('as 3 réplicas da <code>loja</code> estão numa versão que funciona, com o rollout concluído.'),
    vidaReal: 'A reforma por etapas parou no primeiro apartamento: o material novo nunca chegou, e os antigos continuam de pé.',
    limite: 'O Deployment não desiste sozinho: depois do prazo (progressDeadlineSeconds), só marca "ProgressDeadlineExceeded" e espera alguém decidir.',
    dica: 'kubectl rollout status deployment/loja, kubectl get pods (ErrImagePull na tag nova). Volte para a anterior: kubectl rollout undo deployment/loja',
    partida: { comandos: ['kubectl set image deployment/loja loja=kubelearn/loja:1.2'] },
    arquivos: { 'loja.yaml': loja(3) },
    solucaoTerminal: ['kubectl rollout undo deployment/loja'],
    regras: [
      { pods: 'app=loja', quantidade: 3, prontos: 3 },
      { objeto: 'deployment/loja', campo: 'status.updatedReplicas', igual: 3, msg: 'o rollout terminou' },
    ],
  }),

  incidente({
    id: 'n9-job-que-falha',
    titulo: 'A migração que parou no meio',
    dificuldade: 'medio',
    morador: 'Seu Lima, do financeiro',
    relato: 'A migração do banco rodou de madrugada e diz "falhou". Mas ela não deu erro nenhum: começou, estava migrando... e parou no meio. Ela leva uns 20 segundos.',
    tarefa: resolvido('o Job <code>migracao</code> termina com sucesso (<code>COMPLETIONS 1/1</code>).'),
    vidaReal: 'O pedreiro ganhou 10 segundos de autorização para um serviço de 20: no fim do prazo, a administração o tira da obra no meio do serviço, sem erro nenhum da parte dele.',
    limite: 'O activeDeadlineSeconds vale para o Job inteiro (todas as tentativas somadas) e passa na frente do backoffLimit: venceu o prazo, acabou, sem nova tentativa.',
    dica: 'kubectl describe job migracao (DeadlineExceeded: Job was active longer than specified deadline) e o activeDeadlineSeconds no YAML. Dê folga (120) e rode de novo: kubectl delete job migracao e kubectl apply -f .',
    arquivos: { 'migracao.yaml': migracao(10) },
    correcao: { 'migracao.yaml': migracao(120) },
    solucaoTerminal: ['kubectl delete job migracao', 'kubectl apply -f .'],
    regras: [{ objeto: 'job/migracao', campo: 'status.succeeded', igual: 1, msg: 'a migração terminou com sucesso' }],
  }),

  incidente({
    id: 'n9-limpeza-suspensa',
    titulo: 'A coleta que nunca passou',
    dificuldade: 'medio',
    morador: 'Seu Nestor, do 302',
    relato: 'A coleta de lixo era para passar todo minuto. Não passou nenhuma vez esta semana, e o lixo está acumulando no corredor.',
    tarefa: resolvido('a coleta (o CronJob <code>limpeza</code>) volta a passar no horário.'),
    vidaReal: 'Alguém pendurou a placa "coleta suspensa" na reforma da semana passada e ninguém tirou.',
    limite: 'Ao voltar, a coleta não repõe cada vez que perdeu: passa uma vez na hora (pela última perdida, se ainda estiver dentro do startingDeadlineSeconds) e segue o horário.',
    dica: 'kubectl get cronjob limpeza (a coluna SUSPEND). Mude suspend para false e aplique.',
    arquivos: { 'limpeza.yaml': limpeza(true) },
    correcao: { 'limpeza.yaml': limpeza(false) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { objeto: 'cronjob/limpeza', campo: 'spec.suspend', igual: false },
      { objeto: 'cronjob/limpeza', campo: 'status.lastScheduleTime', existe: true, msg: 'a coleta passou' },
    ],
  }),

  incidente({
    id: 'n9-fila-presa',
    titulo: 'A fila presa no prédio sem luz',
    dificuldade: 'dificil',
    morador: 'Lúcia, do atendimento',
    relato: 'O prédio 2 ficou sem luz e a fila de pedidos parou. A loja voltou em outro prédio, mas a fila não volta nunca. A manutenção disse que o prédio 2 só religa amanhã.',
    tarefa: resolvido('a <code>fila</code> está rodando de novo, em outro prédio.'),
    vidaReal: 'O apartamento 0 da fila tem dono e número. Enquanto a administração não tiver certeza de que o antigo saiu, não entrega o número a outro, e um prédio sem luz não responde nada.',
    limite: 'Avisar que o prédio está desligado (ou forçar a saída do pod) é afirmar "o antigo não está rodando". Se o prédio estivesse só sem telefone, com a fila viva lá dentro, haveria duas filas-0 gravando ao mesmo tempo.',
    dica: 'kubectl get nodes (node-2 NotReady) e kubectl get pods -o wide (fila-0 Terminating no node-2). O StatefulSet espera a fila-0 antiga sumir de vez. Avise o cluster que o prédio está desligado: kubectl taint nodes node-2 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute (e tire o taint quando ele religar). O jeito antigo, um pod por vez: kubectl delete pod fila-0 --force --grace-period=0',
    partida: {
      antes: ['kubectl cordon node-1'],
      comandos: ['kubectl uncordon node-1', (c) => { c.derrubarNode('node-2'); c.avancar('6m'); }],
    },
    extras: [loja(2)],
    arquivos: { 'fila.yaml': fila },
    solucaoTerminal: ['kubectl taint nodes node-2 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute'],
    regras: [{ pods: 'app=fila', prontos: 1, node: 'node-1' }],
  }),

  incidente({
    id: 'n9-balcao-errado',
    titulo: 'O balcão manda para a sala errada',
    dificuldade: 'facil',
    morador: 'Dona Odete, do 203',
    relato: 'Fui à loja pela portaria, procurando loja.local, e voltei com "Service Unavailable". Mas a loja está aberta, eu vi pela janela!',
    tarefa: resolvido('<code>http://loja.local</code>, de fora do cluster (o <code>curl</code> do seu computador), chega à loja.'),
    vidaReal: 'O balcão de informações manda os clientes para a sala "lojas", e a sala se chama "loja".',
    limite: 'O Ingress não confere se o Service existe ao ser criado: o erro só aparece quando alguém chega.',
    dica: 'kubectl describe ingress loja (Backends: o Service existe?) e kubectl get svc.',
    extras: [classeDeIngress, loja(2), svc('loja', { alvo: 8080 })],
    arquivos: { 'balcao.yaml': balcao('lojas') },
    correcao: { 'balcao.yaml': balcao('loja') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ requisicao: { de: 'fora', url: 'http://loja.local', status: 200 } }],
  }),

  incidente({
    id: 'n9-cota-estourada',
    titulo: 'Pedimos seis, vieram quatro',
    dificuldade: 'medio',
    morador: 'Dona Cida, gerente de vendas',
    relato: 'Para a promoção, pedi seis atendentes. Vieram quatro; os outros dois estão "esperando lugar" desde cedo. Semana passada a TI fez um teste de carga para a promoção e disse que o condomínio aguenta.',
    tarefa: resolvido('as 6 réplicas da <code>loja</code> (namespace <code>vendas</code>) estão prontas, cada uma ainda pedindo os 250m de CPU que usa no pico.'),
    vidaReal: 'O teste de carga da semana passada reservou meia potência de cada prédio, e ninguém o desligou. Os atendentes novos não acham tomada livre, mesmo com o teste parado num canto.',
    limite: 'O request é reserva, não uso: um pod que só dorme (sleep) ocupa a reserva inteira. O kubectl top mostra o uso; o kubectl describe node mostra a reserva.',
    dica: 'kubectl describe pod -n vendas NOME (Insufficient cpu) e kubectl describe node node-1 (Non-terminated Pods e Allocated resources: quem reserva a CPU?). O teste de carga ficou ligado no namespace testes: kubectl delete deployment teste-de-carga -n testes',
    extras: [ns('vendas'), ns('testes'), testeDeCarga],
    arquivos: { 'loja.yaml': lojaDeVendas },
    solucaoTerminal: ['kubectl delete deployment teste-de-carga -n testes'],
    regras: [
      { pods: 'app=loja', ns: 'vendas', prontos: 6 },
      { objeto: 'deployment/loja', ns: 'vendas', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '250m', msg: 'cada atendente continua pedindo 250m de CPU' },
    ],
  }),

  incidente({
    id: 'n9-pintura-sem-fim',
    titulo: 'A pintura que não termina',
    dificuldade: 'medio',
    morador: 'Tânia, da equipe da obra',
    relato: 'O painel novo está "Init:0/1" desde ontem. A equipe de pintura chegou e ficou parada na porta, esperando alguém.',
    tarefa: resolvido('o <code>painel</code> está rodando (<code>1/1 Running</code>).'),
    vidaReal: 'A equipe de pintura espera o morador "banco" chegar, e o morador se chama "db": ela vai esperar para sempre.',
    limite: 'O init container não tem prazo: sem um timeout no script, ele espera indefinidamente, sem erro nenhum.',
    dica: 'kubectl logs deploy/painel -c espera-o-banco (esperando o banco) e kubectl get svc. O Service se chama db: troque banco por db no nome que o init container procura.',
    extras: [dep('db', { imagem: 'redis:7', ct: porta(6379) }), svc('db', { alvo: 6379 }).replace('port: 80', 'port: 6379')],
    arquivos: { 'painel.yaml': painel('banco') },
    correcao: { 'painel.yaml': painel('db') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=painel', prontos: 1 }],
    travas: [{ objeto: 'deployment/painel', campo: 'spec.template.spec.initContainers[0].command', existe: true, msg: 'a equipe de pintura (o init container) continua esperando o banco: dispensar a espera não faz o banco chegar' }],
    armadilhas: [
      { descricao: 'apagar o init container', mudar: (a) => ({ 'painel.yaml': a['painel.yaml'].replace(/\n\s+initContainers:\n[\s\S]*?(?=\n\s+containers:)/, '') }) },
      { descricao: 'tirar o command do init container', mudar: (a) => ({ 'painel.yaml': a['painel.yaml'].replace(/\n\s+command: \["sh", "-c", "until[^\n]*/, '') }) },
    ],
  }),
];
