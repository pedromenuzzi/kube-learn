// Nível 9: troubleshooting. Só incidentes: cada missão chega com o cluster já quebrado, o relato de um morador e os
// manifestos aplicados (no editor). O aluno investiga no terminal (get, describe, logs, events) e conserta.
import { licao, problema, yaml } from './util.js';

/** Um Deployment; `pod` entra no spec do pod (recuo de 6), `ct` no contêiner (recuo de 8). */
const dep = (nome, { replicas = 1, imagem = 'nginx:1.27', ns, pod = '', ct = '' } = {}) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${nome}
${ns ? `  namespace: ${ns}\n` : ''}spec:
  replicas: ${replicas}
  selector:
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
const porta = (n) => `        ports:\n        - containerPort: ${n}\n`;
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
 * Um incidente: o relato do morador, o que fazer, os manifestos como estão aplicados (`arquivos`) e, se precisar, como
 * ficam consertados (`correcao`). O cluster de partida aplica os arquivos e os `extras` (o que não é para mexer) e
 * fica em `partidas` (a seção Troubleshooting usa a dela).
 */
export function incidente({ id, morador, relato, tarefa, arquivos, correcao, extras = [], partida = {}, partidas = PARTIDA9, regras, ...resto }) {
  const cluster = `incidente-${id.slice(3)}`;
  partidas[cluster] = { manifestos: juntar(...extras, ...Object.values(arquivos)), ...partida };
  return problema({
    id,
    cluster,
    terminal: true,
    enunciado: `<blockquote class="relato"><p>${relato}</p><footer>${morador}</footer></blockquote>${tarefa}`,
    inicial: arquivos,
    solucao: correcao ?? arquivos,
    testes: [{ noClusterDoAluno: true, descricao: 'o incidente está resolvido', regras }],
    ...resto,
  });
}

const relatorio = (cpu, memoria) => dep('relatorio', {
  imagem: 'kubelearn/relatorio:1.0',
  ct: `        resources:\n${cpu ? `          requests:\n            cpu: "${cpu}"\n` : ''}${memoria ? `          limits:\n            memory: ${memoria}\n` : ''}`,
});
const banco = (comSenha) => dep('banco', {
  imagem: 'postgres:17',
  ct: `${porta(5432)}${comSenha ? `        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: banco
              key: senha
` : ''}`,
});
const galeria = (classe) => `${yaml`
  apiVersion: v1
  kind: PersistentVolumeClaim
  metadata:
    name: fotos
  spec:
    accessModes:
    - ReadWriteOnce
    storageClassName: ${classe}
    resources:
      requests:
        storage: 1Gi
`}---
${dep('galeria', {
    pod: '      volumes:\n      - name: fotos\n        persistentVolumeClaim:\n          claimName: fotos\n',
    ct: `${porta(80)}        volumeMounts:\n        - name: fotos\n          mountPath: /usr/share/nginx/html\n`,
  })}`;
const lojaComSonda = (caminho) => loja(3, {
  ct: `${porta(8080)}        readinessProbe:\n          httpGet:\n            path: ${caminho}\n            port: 8080\n`,
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
const migracao = (comando) => yaml`
  apiVersion: batch/v1
  kind: Job
  metadata:
    name: migracao
  spec:
    backoffLimit: 2
    template:
      spec:
        restartPolicy: Never
        containers:
        - name: migracao
          image: busybox:1.36
          command: ["sh", "-c", "echo migrando o banco && ${comando} 2 && echo pronto"]
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
const cota = (pods) => yaml`
  apiVersion: v1
  kind: ResourceQuota
  metadata:
    name: cota
    namespace: vendas
  spec:
    hard:
      pods: "${pods}"
`;
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
      <p>Neste nível, cada missão é um <b>incidente</b>: o cluster chega quebrado, um morador conta o que viu, e você
         investiga e conserta. Os manifestos aplicados estão no editor (mude e clique em <b>Aplicar</b>) e o terminal é seu.</p>
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
          <tr><td>Pending</td><td>describe pod (FailedScheduling)</td><td>sem CPU/memória, taint, nodeSelector, PVC, cota</td></tr>
          <tr><td>ImagePullBackOff</td><td>describe pod</td><td>nome ou tag errados, registry privado</td></tr>
          <tr><td>CrashLoopBackOff</td><td>logs --previous</td><td>env ou arquivo faltando, bug, OOMKilled</td></tr>
          <tr><td>CreateContainerConfigError</td><td>describe pod</td><td>ConfigMap/Secret faltando, runAsNonRoot</td></tr>
          <tr><td>Running, 0/1 pronto</td><td>describe pod (Unhealthy)</td><td>readinessProbe errada</td></tr>
          <tr><td>Service não responde</td><td>get endpoints, describe svc</td><td>seletor, targetPort, ninguém pronto, NetworkPolicy</td></tr>
          <tr><td>Forbidden</td><td>auth can-i --as</td><td>falta verbo ou recurso na Role</td></tr>
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
    relato: 'A vitrine nova não abriu até agora. O rapaz disse que era só subir o nginx e ir embora.',
    tarefa: '<p>Descubra por que os pods da <code>vitrine</code> não sobem e conserte.</p>',
    vidaReal: 'O pré-moldado não chegou: no pedido, o modelo estava escrito errado.',
    limite: 'O kubelet tenta de novo sozinho, cada vez mais devagar: consertar o nome resolve sem precisar apagar nada.',
    dica: 'kubectl describe pod NOME (Events: Failed to pull image). Confira a grafia da imagem.',
    arquivos: { 'vitrine.yaml': dep('vitrine', { replicas: 2, imagem: 'ngnix:1.27', ct: porta(80) }) },
    correcao: { 'vitrine.yaml': dep('vitrine', { replicas: 2, imagem: 'nginx:1.27', ct: porta(80) }) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=vitrine', prontos: 2, imagem: 'nginx:1.27' }],
  }),

  incidente({
    id: 'n9-sem-senha',
    titulo: 'O banco que não para de cair',
    dificuldade: 'medio',
    morador: 'Seu Jorge, do financeiro',
    relato: 'O banco de dados reinicia sem parar desde a mudança. A senha está guardada no envelope de sempre, juro.',
    tarefa: `<p>O Secret <code>banco</code> (chave <code>senha</code>) já existe. Descubra o que o banco pede e entregue a senha
             a ele, lendo do Secret.</p>`,
    vidaReal: 'O porteiro do banco não abre sem a senha, e ninguém entregou o envelope a ele.',
    limite: 'O envelope (Secret) estava lá o tempo todo: guardar não basta, é preciso dizer ao pod para ler.',
    dica: 'kubectl logs deploy/banco --previous pede POSTGRES_PASSWORD. Use env com valueFrom.secretKeyRef.',
    extras: [yaml`
      apiVersion: v1
      kind: Secret
      metadata:
        name: banco
      stringData:
        senha: tijolo-azul-42
    `],
    arquivos: { 'banco.yaml': banco(false) },
    correcao: { 'banco.yaml': banco(true) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [
      { pods: 'app=banco', prontos: 1 },
      { objeto: 'deployment/banco', campo: 'spec.template.spec.containers[0].env[0].valueFrom.secretKeyRef.name', igual: 'banco', msg: 'a senha vem do Secret banco' },
    ],
  }),

  incidente({
    id: 'n9-sem-espaco',
    titulo: 'O relatório que nunca começa',
    dificuldade: 'medio',
    morador: 'Dona Zélia, da contabilidade',
    relato: 'Pedi o relatório do mês às oito. Ele está "esperando" até agora. Esperando o quê?',
    tarefa: `<p>O pod do <code>relatorio</code> está Pending. Descubra o motivo e ajuste o pedido para algo razoável
             (meio núcleo de CPU basta).</p>`,
    vidaReal: 'Pediram um apartamento com a potência de três prédios: nenhum prédio do condomínio tem tanta energia.',
    limite: 'O request é o que se reserva, não o que se usa: pedir demais deixa o pod sem lugar, mesmo com os nodes ociosos.',
    dica: 'kubectl describe pod NOME (0/3 nodes are available: ... Insufficient cpu). Cada node tem 2 CPUs.',
    arquivos: { 'relatorio.yaml': relatorio('3', null) },
    correcao: { 'relatorio.yaml': relatorio('500m', null) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=relatorio', prontos: 1 }],
  }),

  incidente({
    id: 'n9-manutencao-esquecida',
    titulo: 'A placa da reforma de ontem',
    dificuldade: 'medio',
    morador: 'Kleber, o zelador',
    relato: 'Ontem teve manutenção nos dois prédios. Hoje a loja nova não consegue morar em lugar nenhum.',
    tarefa: '<p>Os pods da <code>loja</code> estão Pending. Descubra o que ficou para trás da manutenção e tire.</p>',
    vidaReal: 'Esqueceram a placa "em reforma" pendurada nas portas dos dois prédios.',
    limite: 'Tirar a placa só deixa os próximos entrarem: quem foi recusado espera a próxima tentativa do scheduler.',
    dica: 'kubectl describe node (linha Taints) e kubectl taint nodes NODE chave-.',
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
    titulo: 'O box que nunca foi entregue',
    dificuldade: 'medio',
    morador: 'Seu Lauro, o fotógrafo',
    relato: 'Aluguei um box para guardar as fotos da galeria, e a galeria nem abriu. Disseram que o box era do tipo "rápido".',
    tarefa: `<p>A <code>galeria</code> espera o disco <code>fotos</code>, que nunca fica pronto. Descubra o motivo e use a
             classe de disco que existe no cluster.</p>`,
    vidaReal: 'Pediram um box "climatizado", e o condomínio só tem box comum: o pedido fica na gaveta para sempre.',
    limite: 'O pedido de box (PVC) não se edita depois de feito: para trocar a classe, é apagar e pedir de novo.',
    dica: 'kubectl describe pvc fotos e kubectl get storageclass. Como o PVC não muda, kubectl delete -f . e depois kubectl apply -f .',
    arquivos: { 'galeria.yaml': galeria('rapido') },
    correcao: { 'galeria.yaml': galeria('standard') },
    solucaoTerminal: ['kubectl delete -f .', 'kubectl apply -f .'],
    regras: [
      { objeto: 'pvc/fotos', campo: 'status.phase', igual: 'Bound' },
      { pods: 'app=galeria', prontos: 1 },
    ],
  }),

  incidente({
    id: 'n9-ramal-mudo',
    titulo: 'O ramal que ninguém atende',
    dificuldade: 'facil',
    morador: 'Lúcia, do atendimento',
    relato: 'Os atendentes da loja estão todos lá, eu vi. Mas quem liga no ramal "loja" não fala com ninguém.',
    tarefa: '<p>Os pods da loja estão prontos, mas o Service <code>loja</code> não entrega para eles. Conserte o Service.</p>',
    vidaReal: 'O ramal está cadastrado para a equipe "lojas", e a equipe se chama "loja".',
    limite: 'O Service não avisa que o seletor não casa com ninguém: ele só fica com a lista de atendentes vazia.',
    dica: 'kubectl get endpoints loja (vazio) e compare o seletor do Service com as labels dos pods (--show-labels).',
    extras: [sh('cliente')],
    arquivos: { 'loja.yaml': juntar(loja(3), svc('loja', { alvo: 8080, app: 'lojas' })) },
    correcao: { 'loja.yaml': juntar(loja(3), svc('loja', { alvo: 8080 })) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ endpoints: 'svc/loja', quantidade: 3 }, { requisicao: { de: 'pod/cliente', url: 'http://loja', status: 200 } }],
  }),

  incidente({
    id: 'n9-porta-errada',
    titulo: 'Conexão recusada',
    dificuldade: 'facil',
    morador: 'Lúcia, do atendimento',
    relato: 'Agora o ramal até chama, mas cai na hora: "conexão recusada".',
    tarefa: `<p>O Service <code>loja</code> tem os 3 pods atrás dele, mas ninguém atende. Descubra em que porta a loja ouve e
             conserte o Service.</p>`,
    vidaReal: 'O ramal toca no telefone da mesa ao lado: os atendentes estão no apartamento, mas na outra sala.',
    limite: 'O Service confere quem está pronto, não em que porta o programa ouve: a lista fica cheia e a ligação cai.',
    dica: 'kubectl describe svc loja (TargetPort) e a containerPort dos pods. A loja ouve na 8080.',
    extras: [sh('cliente')],
    arquivos: { 'loja.yaml': juntar(loja(3), svc('loja', { alvo: 80 })) },
    correcao: { 'loja.yaml': juntar(loja(3), svc('loja', { alvo: 8080 })) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ requisicao: { de: 'pod/cliente', url: 'http://loja', status: 200 } }],
  }),

  incidente({
    id: 'n9-nunca-pronto',
    titulo: 'Rodando, mas nunca pronta',
    dificuldade: 'medio',
    morador: 'Seu Apolinário, o porteiro',
    relato: 'Os três atendentes da loja chegaram cedo e estão lá dentro. Mas eu não posso mandar cliente para quem não diz que está pronto.',
    tarefa: `<p>Os pods da <code>loja</code> rodam, mas ficam <code>0/1</code> e o Service fica sem ninguém. Conserte a
             readinessProbe.</p>`,
    vidaReal: 'O síndico pergunta "pode receber visita?" na porta errada: ninguém responde, e ele marca como fechado.',
    limite: 'A readiness não reinicia ninguém: o pod fica rodando para sempre, só que sem receber clientes.',
    dica: 'kubectl describe pod NOME (Events: Unhealthy, Readiness probe failed: HTTP probe failed with statuscode: 404). A loja responde em /healthz.',
    arquivos: { 'loja.yaml': juntar(lojaComSonda('/pronto'), svc('loja', { alvo: 8080 })) },
    correcao: { 'loja.yaml': juntar(lojaComSonda('/healthz'), svc('loja', { alvo: 8080 })) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=loja', prontos: 3 }, { endpoints: 'svc/loja', quantidade: 3 }],
  }),

  incidente({
    id: 'n9-disjuntor',
    titulo: 'O disjuntor que desarma',
    dificuldade: 'medio',
    morador: 'Dona Zélia, da contabilidade',
    relato: 'O relatório começa, a luz pisca e ele some. Começa de novo, pisca, some.',
    tarefa: `<p>O <code>relatorio</code> carrega a planilha inteira na memória (uns 300Mi). Descubra por que ele cai e dê a ele
             um limite que caiba (512Mi).</p>`,
    vidaReal: 'O disjuntor do apartamento é de 128, e a máquina da contabilidade puxa 300 quando liga.',
    limite: 'Subir o limite resolve quando o programa precisa mesmo daquilo. Se ele vaza memória, só adia a próxima queda.',
    dica: 'kubectl describe pod NOME (Last State: Terminated, Reason: OOMKilled). Mude o limits.memory.',
    arquivos: { 'relatorio.yaml': relatorio(null, '128Mi') },
    correcao: { 'relatorio.yaml': relatorio(null, '512Mi') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=relatorio', prontos: 1 }],
  }),

  incidente({
    id: 'n9-quadro-sem-aviso',
    titulo: 'O quadro de avisos que sumiu',
    dificuldade: 'facil',
    morador: 'Dona Marta, da loja de roupas do 101',
    relato: 'A vitrine nova era para ser azul. Nem azul, nem nada: ela nem abre.',
    tarefa: '<p>Os pods da <code>vitrine</code> não criam o contêiner. Descubra o que falta e crie, com <code>COR=azul</code>.</p>',
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
    tarefa: `<p>A NetworkPolicy <code>protege-loja</code> deixa entrar na loja só os pods <code>app=admin</code>. Libere também
             a <code>vitrine</code>, sem abrir para todo mundo.</p>`,
    vidaReal: 'A catraca nova só reconhece o crachá do admin: a vitrine fica barrada na porta.',
    limite: 'Apagar a catraca também "resolve", e abre a loja para qualquer um (inclusive o curioso).',
    dica: 'kubectl get netpol e kubectl describe netpol protege-loja. Acrescente um podSelector app: vitrine no from.',
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
    tarefa: `<p>Dê à Role <code>deploy-ci</code> o que falta para a carla <b>atualizar</b> Deployments (update e patch), sem
             dar o poder de apagar.</p>`,
    vidaReal: 'O crachá abre a porta para trazer móveis novos, mas não para trocar os que já estão lá.',
    limite: 'O kubectl apply usa patch; o kubectl replace, update. Para a esteira não depender disso, os dois.',
    dica: 'kubectl auth can-i patch deployments --as=carla -n loja. Acrescente update e patch aos verbos.',
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
    tarefa: `<p>A <code>vitrine</code> (namespace <code>loja</code>) chama a <code>api</code> do estoque pelo endereço da
             variável <code>API_URL</code>. Mas a api mora no namespace <code>estoque</code>. Conserte o endereço.</p>`,
    vidaReal: 'Ligaram para o ramal "api" do próprio bloco; a api é de outro bloco, e o endereço curto não chega lá.',
    limite: 'O nome curto vale só no mesmo namespace: de outro, é nome.namespace (ou o nome completo, nome.namespace.svc.cluster.local).',
    dica: 'kubectl logs -n loja deploy/vitrine (wget: bad address). O endereço é http://api.estoque.',
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
    morador: 'Seu Jorge, do financeiro',
    relato: 'Mandaram a loja para a versão nova de manhã. Até agora o "rollout status" diz que está esperando. A loja velha continua atendendo, pelo menos.',
    tarefa: `<p>A atualização da <code>loja</code> está parada. Descubra por quê e devolva a loja a uma versão que existe
             (a anterior serve).</p>`,
    vidaReal: 'A reforma por etapas parou no primeiro apartamento: o material novo nunca chegou, e os antigos continuam de pé.',
    limite: 'O Deployment não desiste sozinho: depois do prazo (progressDeadlineSeconds), só marca "ProgressDeadlineExceeded" e espera alguém decidir.',
    dica: 'kubectl rollout status deployment/loja, kubectl get pods (ErrImagePull na tag nova). kubectl rollout undo deployment/loja',
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
    titulo: 'A migração que desistiu',
    dificuldade: 'medio',
    morador: 'Seu Jorge, do financeiro',
    relato: 'A migração do banco rodou de madrugada e diz "falhou". Tentou três vezes e desistiu.',
    tarefa: '<p>Descubra por que o Job <code>migracao</code> falha, conserte e rode de novo.</p>',
    vidaReal: 'O pedreiro tentou três vezes seguir a instrução escrita errada ("slep" no lugar de "sleep") e foi embora.',
    limite: 'O molde dos pods de um Job não se edita depois de criado: para rodar de novo com a correção, é apagar o Job e criar outro.',
    dica: 'kubectl logs job/migracao (sh: slep: not found). Depois: kubectl delete job migracao e kubectl apply -f .',
    arquivos: { 'migracao.yaml': migracao('slep') },
    correcao: { 'migracao.yaml': migracao('sleep') },
    solucaoTerminal: ['kubectl delete job migracao', 'kubectl apply -f .'],
    regras: [{ objeto: 'job/migracao', campo: 'status.succeeded', igual: 1, msg: 'a migração terminou com sucesso' }],
  }),

  incidente({
    id: 'n9-limpeza-suspensa',
    titulo: 'A coleta que nunca passou',
    dificuldade: 'medio',
    morador: 'Kleber, o zelador',
    relato: 'A coleta de lixo era para passar todo minuto. Não passou nenhuma vez esta semana.',
    tarefa: '<p>O CronJob <code>limpeza</code> nunca criou um Job. Descubra o motivo e faça a coleta voltar.</p>',
    vidaReal: 'Alguém pendurou a placa "coleta suspensa" na reforma da semana passada e ninguém tirou.',
    limite: 'Ao voltar, a coleta não passa pelas vezes que perdeu: segue do próximo horário em diante.',
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
    relato: 'O node-2 ficou sem luz e a fila de pedidos parou. A loja voltou em outro prédio, mas a fila não volta nunca.',
    tarefa: `<p>A <code>fila</code> é um StatefulSet com uma réplica, e o pod <code>fila-0</code> ficou preso
             <code>Terminating</code> no <code>node-2</code>, que não volta hoje. Faça a fila voltar em outro prédio.</p>`,
    vidaReal: 'O apartamento 0 da fila tem dono e número: enquanto a administração não tiver certeza de que o antigo saiu, não entrega o número a outro.',
    limite: 'Forçar a saída é afirmar "o antigo morreu mesmo". Se o prédio voltar e o antigo ainda estiver vivo, haveria duas filas-0.',
    dica: 'kubectl get pods -o wide e kubectl get nodes. O StatefulSet espera o fila-0 sumir de vez: kubectl delete pod fila-0 --force --grace-period=0',
    partida: {
      antes: ['kubectl cordon node-1'],
      comandos: ['kubectl uncordon node-1', (c) => { c.derrubarNode('node-2'); c.avancar('6m'); }],
    },
    extras: [loja(2)],
    arquivos: { 'fila.yaml': fila },
    solucaoTerminal: ['kubectl delete pod fila-0 --force --grace-period=0'],
    regras: [{ pods: 'app=fila', prontos: 1, node: 'node-1' }],
  }),

  incidente({
    id: 'n9-balcao-errado',
    titulo: 'O balcão manda para a sala errada',
    dificuldade: 'facil',
    morador: 'Seu Apolinário, o porteiro',
    relato: 'Quem chega pela portaria procurando loja.local volta com "Service Unavailable". A loja está aberta, eu vi.',
    tarefa: '<p>O Ingress <code>loja</code> leva <code>loja.local</code> para um Service que não existe. Conserte.</p>',
    vidaReal: 'O balcão de informações manda os clientes para a sala "lojas", e a sala se chama "loja".',
    limite: 'O Ingress não confere se o Service existe ao ser criado: o erro só aparece quando alguém chega.',
    dica: 'kubectl describe ingress loja (Backends) e kubectl get svc.',
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
    relato: 'Para a promoção, pedi seis atendentes. Vieram quatro. O gerente geral já aprovou a cota de dez.',
    tarefa: `<p>A <code>loja</code> do namespace <code>vendas</code> tem 6 réplicas e só 4 pods. Descubra o que segura e
             aplique a cota aprovada: <b>10 pods</b>.</p>`,
    vidaReal: 'A empresa só pode ter quatro apartamentos no condomínio: o contrato dos outros dois é recusado na portaria.',
    limite: 'A cota recusa na criação, sem barulho: o Deployment mostra 4/6, e o motivo só aparece nos eventos do ReplicaSet.',
    dica: 'kubectl describe rs -n vendas (exceeded quota) e kubectl describe quota -n vendas. Mude o hard.pods para "10".',
    extras: [ns('vendas'), dep('loja', { ns: 'vendas', replicas: 6, imagem: 'kubelearn/loja:1.0', ct: porta(8080) })],
    arquivos: { 'cota.yaml': cota(4) },
    correcao: { 'cota.yaml': cota(10) },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=loja', ns: 'vendas', prontos: 6 }],
  }),

  incidente({
    id: 'n9-pintura-sem-fim',
    titulo: 'A pintura que não termina',
    dificuldade: 'medio',
    morador: 'Seu Lauro, o fotógrafo',
    relato: 'O painel novo está "Init:0/1" desde ontem. A equipe de pintura chegou e ficou parada na porta.',
    tarefa: `<p>O init container do <code>painel</code> espera o banco pelo nome antes de liberar o painel. Descubra o que
             ele espera, como o banco se chama de verdade (<code>kubectl get svc</code>), e conserte.</p>`,
    vidaReal: 'A equipe de pintura espera o morador "banco" chegar, e o morador se chama "db": ela vai esperar para sempre.',
    limite: 'O init container não tem prazo: sem um timeout no script, ele espera indefinidamente, sem erro nenhum.',
    dica: 'kubectl logs deploy/painel -c espera-o-banco (esperando o banco). O Service se chama db: troque banco por db no nome que o init container procura.',
    extras: [dep('db', { imagem: 'redis:7', ct: porta(6379) }), svc('db', { alvo: 6379 }).replace('port: 80', 'port: 6379')],
    arquivos: { 'painel.yaml': painel('banco') },
    correcao: { 'painel.yaml': painel('db') },
    solucaoTerminal: ['kubectl apply -f .'],
    regras: [{ pods: 'app=painel', prontos: 1 }],
  }),
];
