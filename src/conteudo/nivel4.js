// Nível 4: configuração e armazenamento (quadro de avisos, envelope lacrado, mesa de trabalho e box da garagem).
import { licao, problema, yaml } from './util.js';
import { BANCO, CADERNO, PVC, DB } from './clusters.js';

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const aplicar = (regras) => ({ descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [{ semErros: true }, ...regras] });
const depois = (descricao, regras, { oculto = false, esperar = '1m' } = {}) => ({ oculto, descricao, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }], regras });

const loja = (env = '') => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
    labels:
      app: loja
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
${env}          ports:
          - containerPort: 8080
`;
const ENV_COR = `          env:
          - name: COR
            valueFrom:
              configMapKeyRef:
                name: loja-config
                key: COR
`;
const configLoja = (dados) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: loja-config
data:
${dados}`;

const vitrine = (volumes = '') => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: vitrine
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: vitrine
    template:
      metadata:
        labels:
          app: vitrine
      spec:
        containers:
        - name: vitrine
          image: nginx:1.27
          ports:
          - containerPort: 80
${volumes}`;

const placa = (volumes = false) => `apiVersion: v1
kind: Pod
metadata:
  name: placa
  labels:
    app: placa
spec:
  containers:
  - name: nginx
    image: nginx:1.27
${volumes ? `    volumeMounts:
    - name: html
      mountPath: /usr/share/nginx/html
` : ''}  - name: pintor
    image: busybox:1.36
    command: ["sh", "-c", "while true; do echo '<h1>Placa atualizada</h1>' > /html/index.html; sleep 10; done"]
${volumes ? `    volumeMounts:
    - name: html
      mountPath: /html
  volumes:
  - name: html
    emptyDir: {}
` : ''}`;

const VOLUME_CADERNO = (fonte) => `          volumeMounts:
          - name: dados
            mountPath: /dados
        volumes:
        - name: dados
${fonte}`;

const servicoDb = yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: db
  spec:
    clusterIP: None        # headless: o DNS devolve cada pod, não um IP só
    selector:
      app: db
    ports:
    - port: 6379
`;

export const NIVEL4 = [
  licao({
    id: 'n4-licao-config',
    titulo: 'O quadro de avisos e o envelope: ConfigMap e Secret',
    vidaReal: 'O ConfigMap é o quadro de avisos do prédio (horário da piscina, cor da fachada); o Secret é o envelope lacrado com a senha do portão.',
    limite: 'O envelope do Kubernetes não é cofre: o conteúdo está só em base64, que qualquer um com acesso ao Secret decodifica.',
    conteudo: `
      <p>A mesma imagem roda em lugares diferentes (teste, produção, a loja de outra cidade). O que muda de um lugar para
         outro fica <b>fora da imagem</b>, em dois objetos:</p>
      <ul>
        <li><b>ConfigMap</b>: configurações em texto (<code>COR: azul</code>, um arquivo de configuração inteiro);</li>
        <li><b>Secret</b>: o que não pode vazar (senhas, tokens). Guarda os valores em <b>base64</b>.</li>
      </ul>
      <h2>Três jeitos de o pod usar</h2>
      <pre><code>env:                         # 1. uma chave numa variável
- name: COR
  valueFrom:
    configMapKeyRef:           # (num Secret: secretKeyRef)
      name: loja-config
      key: COR
envFrom:                     # 2. todas as chaves de uma vez
- configMapRef:
    name: loja-config
volumes:                     # 3. cada chave vira um arquivo
- name: config
  configMap:
    name: loja-config</code></pre>
      <p>No terceiro jeito, o contêiner monta o volume com <code>volumeMounts</code> (<code>name</code> e <code>mountPath</code>)
         e encontra um arquivo por chave naquela pasta. Volume de ConfigMap e de Secret é sempre <b>só leitura</b>.</p>
      <h2>Quando o aviso muda</h2>
      <p>Mudou o ConfigMap? O <b>arquivo</b> montado acompanha sozinho (em até um minuto). A <b>variável de ambiente</b>, não:
         ela é lida quando o contêiner nasce. Para os pods verem o valor novo: <code>kubectl rollout restart deployment/NOME</code>.</p>
      <h2>base64 não é criptografia</h2>
      <p><code>kubectl get secret wifi -o jsonpath='{.data.senha}' | base64 -d</code> mostra a senha para quem pode ler o
         Secret. O que protege de verdade é quem pode ler (RBAC, no nível 8) e a criptografia do etcd.</p>`,
  }),

  licao({
    id: 'n4-licao-volumes',
    titulo: 'A mesa de trabalho e o box da garagem: volumes',
    vidaReal: 'O emptyDir é a mesa de trabalho do apartamento: os moradores dividem, mas ela vai embora na mudança. O PVC é o pedido de um box na garagem: o box continua lá quando o morador muda.',
    limite: 'O box do local-path (o disco do kind) fica num node só: um pod que precisa dele vai sempre para aquele node.',
    conteudo: `
      <p>O sistema de arquivos de um contêiner é <b>descartável</b>: reiniciou, o que foi gravado sumiu. Para guardar, monta-se
         um <b>volume</b>:</p>
      <ul>
        <li><b>emptyDir</b>: uma pasta vazia que nasce com o pod. Os contêineres do pod <b>dividem</b> a pasta, e ela
            sobrevive a um reinício de contêiner, mas <b>some com o pod</b>.</li>
        <li><b>PersistentVolumeClaim (PVC)</b>: o pedido de um disco ("quero 1Gi, ReadWriteOnce"). O disco de verdade é o
            <b>PersistentVolume (PV)</b>, e ele existe <b>fora</b> dos pods: o pod some, o PV fica.</li>
      </ul>
      <pre><code>apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dados
spec:
  accessModes: ["ReadWriteOnce"]   # um node por vez
  resources:
    requests:
      storage: 1Gi</code></pre>
      <p>E no pod: <code>volumes: [{ name: dados, persistentVolumeClaim: { claimName: dados } }]</code> mais o
         <code>volumeMounts</code> no contêiner.</p>
      <h2>Quem cria o disco: a StorageClass</h2>
      <p>Ninguém precisa criar PV à mão: a <b>StorageClass</b> sabe criar discos. Neste cluster (como no kind), a classe padrão
         é a <code>standard</code>, do provisionador <code>rancher.io/local-path</code>, com
         <code>WaitForFirstConsumer</code>: o PVC fica <code>Pending</code> até um pod usá-lo, e então o disco nasce no node
         daquele pod. Veja com <code>kubectl get sc</code>, <code>kubectl get pvc</code> e <code>kubectl get pv</code>.</p>
      <p>PVC preso em <code>Pending</code> com pod usando? <code>kubectl describe pvc NOME</code> conta o motivo (por exemplo,
         uma StorageClass que não existe).</p>`,
  }),

  licao({
    id: 'n4-licao-statefulset',
    titulo: 'Apartamentos numerados: StatefulSet',
    vidaReal: 'Num Deployment, os moradores são intercambiáveis (qualquer um atende). No StatefulSet, cada apartamento tem número fixo (101, 102...) e o seu próprio box, mesmo quando o morador é trocado.',
    limite: 'Número fixo não é endereço fixo: o pod db-0 pode voltar com outro IP. O que fica é o nome no DNS e o disco.',
    conteudo: `
      <p>Bancos de dados e filas precisam de <b>identidade</b>: cada réplica guarda os próprios dados e as outras precisam
         achá-la pelo nome. O <b>StatefulSet</b> dá isso:</p>
      <ul>
        <li>nomes fixos e numerados: <code>db-0</code>, <code>db-1</code>, <code>db-2</code> (apagou o <code>db-1</code>?
            volta outro <code>db-1</code>);</li>
        <li>criação <b>em ordem</b>: o <code>db-1</code> só nasce quando o <code>db-0</code> está pronto; para diminuir,
            sai primeiro o de número maior;</li>
        <li>um disco por pod, pelos <code>volumeClaimTemplates</code>: <code>dados-db-0</code>, <code>dados-db-1</code>...
            Os PVCs <b>ficam</b> quando o StatefulSet diminui (os dados esperam a volta);</li>
        <li>um nome no DNS por pod, com um Service <b>headless</b> (<code>clusterIP: None</code>) citado em
            <code>serviceName</code>: <code>db-0.db.default.svc.cluster.local</code>.</li>
      </ul>
      <pre><code>spec:
  serviceName: db
  replicas: 3
  ...
  volumeClaimTemplates:
  - metadata:
      name: dados
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi</code></pre>
      <p>Dica: o <code>nslookup</code> do busybox não completa nomes com ponto. Use o nome inteiro:
         <code>nslookup db-0.db.default.svc.cluster.local</code>.</p>`,
  }),

  problema({
    id: 'n4-cor-da-vitrine',
    titulo: 'A cor da vitrine',
    dificuldade: 'facil',
    cluster: 'loja-sem-config',
    vidaReal: 'Pendurar no quadro de avisos "a fachada é verde": quem for pintar lê o quadro, em vez de cada pintor decidir.',
    limite: 'A loja só lê o quadro quando abre: trocou o aviso depois, ela continua com a cor antiga até reabrir (o rollout restart).',
    enunciado: `
      <p>A loja mostra a cor da vitrine na resposta JSON (o campo <code>cor</code>), lida da variável <code>COR</code>.
         Crie o ConfigMap <code>loja-config</code> com <code>COR: verde</code> e faça o Deployment da loja ler a variável
         <code>COR</code> dele.</p>`,
    comoSaber: '<code>kubectl port-forward svc/loja 8080:80</code> e depois <code>curl localhost:8080</code>: a resposta tem <code>"cor":"verde"</code>.',
    dica: 'env: - name: COR, valueFrom: configMapKeyRef: name e key.',
    manual: ['pod.spec.containers.env', 'configmap.data'],
    inicial: {
      'config.yaml': configLoja('  # COR: ...\n'),
      'loja.yaml': loja(),
    },
    solucao: {
      'config.yaml': configLoja('  COR: verde\n'),
      'loja.yaml': loja(ENV_COR),
    },
    testes: [
      aplicar([{ objeto: 'configmap/loja-config', campo: 'data.COR', igual: 'verde' }]),
      depois('a vitrine fica verde', [
        { env: { pods: 'app=loja', nome: 'COR', igual: 'verde' } },
        { requisicao: { url: 'http://loja', corpo: '"cor":"verde"' }, msg: 'http://loja responde com "cor":"verde"' },
      ]),
    ],
  }),

  problema({
    id: 'n4-envfrom',
    titulo: 'O quadro inteiro de uma vez',
    dificuldade: 'facil',
    cluster: 'loja-sem-config',
    vidaReal: 'Em vez de copiar aviso por aviso, a loja fotografa o quadro inteiro.',
    limite: 'Chave nova no quadro só entra quando o pod reinicia; e uma chave com nome inválido para variável (como "cor-da-porta") é pulada.',
    enunciado: `
      <p>O <code>loja-config</code> já tem duas chaves (<code>COR</code> e <code>PROMOCAO</code>). Em vez de uma variável
         por chave, traga <b>todas</b> as chaves para o contêiner da loja com <code>envFrom</code>.</p>`,
    dica: 'envFrom: - configMapRef: name: loja-config (no mesmo nível de image, dentro do contêiner).',
    manual: ['pod.spec.containers.envFrom'],
    inicial: {
      'config.yaml': configLoja('  COR: verde\n  PROMOCAO: "leve 3 pague 2"\n'),
      'loja.yaml': loja(),
    },
    solucao: {
      'config.yaml': configLoja('  COR: verde\n  PROMOCAO: "leve 3 pague 2"\n'),
      'loja.yaml': loja('          envFrom:\n          - configMapRef:\n              name: loja-config\n'),
    },
    testes: [
      depois('as duas chaves viram variáveis', [
        { semErros: true },
        { env: { pods: 'app=loja', nome: 'COR', igual: 'verde' } },
        { env: { pods: 'app=loja', nome: 'PROMOCAO', igual: 'leve 3 pague 2' } },
      ]),
    ],
  }),

  problema({
    id: 'n4-avisos-pelo-terminal',
    titulo: 'Avisos pelo terminal',
    dificuldade: 'facil',
    cluster: 'vazio',
    terminal: true,
    vidaReal: 'Ditar os avisos para a administração em vez de escrever o papel.',
    limite: 'Feito pelo terminal, o aviso não fica guardado em arquivo nenhum: para recriar o cluster, você precisaria lembrar do comando.',
    enunciado: `
      <p>Crie, <b>só pelo terminal</b>, o ConfigMap <code>avisos</code> com duas chaves: <code>COR=azul</code> e
         <code>HORARIO=8h-18h</code>.</p>`,
    comoSaber: '<code>kubectl describe configmap avisos</code> mostra as duas chaves.',
    dica: 'kubectl create configmap NOME --from-literal=CHAVE=valor (uma --from-literal por chave).',
    solucaoTerminal: ['kubectl create configmap avisos --from-literal=COR=azul --from-literal=HORARIO=8h-18h'],
    testes: noCluster('o quadro de avisos está pendurado', [
      { comando: '^kubectl\\s+create\\s+(configmap|cm)\\b', msg: 'você usou o kubectl create configmap' },
      { objeto: 'configmap/avisos', campo: 'data.COR', igual: 'azul' },
      { objeto: 'configmap/avisos', campo: 'data.HORARIO', igual: '8h-18h' },
    ]),
  }),

  problema({
    id: 'n4-senha-do-banco',
    titulo: 'O banco sem senha',
    dificuldade: 'medio',
    cluster: 'banco-sem-senha',
    vidaReal: 'O síndico novo não abre o cofre sem a combinação, e a combinação vem num envelope lacrado, não pintada na porta.',
    limite: 'O envelope (Secret) só esconde de quem não tem permissão de ler Secrets; quem tem, lê em texto puro.',
    enunciado: `
      <p>O postgres está em <code>CrashLoopBackOff</code>. Leia os logs (<code>kubectl logs deploy/banco</code>): ele exige
         a variável <code>POSTGRES_PASSWORD</code>. Crie o Secret <code>banco-senha</code> com a chave <code>senha</code> e
         passe o valor para a variável com <code>secretKeyRef</code> (nada de escrever a senha no Deployment).</p>`,
    comoSaber: '<code>kubectl get pods</code>: o banco fica <code>1/1 Running</code>.',
    dica: 'No Secret, stringData aceita o texto puro (o servidor converte para base64). No contêiner: env, valueFrom, secretKeyRef.',
    manual: ['secret.stringData', 'pod.spec.containers.env.valueFrom.secretKeyRef'],
    inicial: {
      'segredo.yaml': yaml`
        apiVersion: v1
        kind: Secret
        metadata:
          name: banco-senha
        stringData:
          # senha: ...
      `,
      'banco.yaml': BANCO(),
    },
    solucao: {
      'segredo.yaml': yaml`
        apiVersion: v1
        kind: Secret
        metadata:
          name: banco-senha
        stringData:
          senha: tijolo-de-ouro
      `,
      'banco.yaml': BANCO({ chave: 'senha' }),
    },
    testes: [
      aplicar([{ objeto: 'secret/banco-senha', campo: 'data.senha', existe: true, msg: 'o Secret banco-senha tem a chave senha' }]),
      depois('o banco sobe', [{ pods: 'app=banco', prontos: 1 }]),
      depois('a senha vem do Secret', [{ objeto: 'deployment/banco', campo: 'spec.template.spec.containers[0].env', regex: '"secretKeyRef"', msg: 'POSTGRES_PASSWORD vem de um secretKeyRef' }], { oculto: true }),
    ],
  }),

  problema({
    id: 'n4-envelope-aberto',
    titulo: 'O envelope aberto',
    dificuldade: 'facil',
    cluster: 'cofre-secreto',
    terminal: true,
    vidaReal: 'O envelope "lacrado" só tem cola de papel: qualquer um com o envelope na mão lê a senha.',
    limite: 'Aqui você tem permissão de ler Secrets. Num cluster bem configurado, a maioria das pessoas não tem.',
    enunciado: `
      <p>O Secret <code>wifi</code> guarda a senha do Wi-Fi da obra. Descubra a senha pelo terminal.</p>`,
    rotuloResposta: 'A senha do Wi-Fi',
    dica: "kubectl get secret wifi -o jsonpath='{.data.senha}' mostra o valor em base64; termine com | base64 -d.",
    respostaCerta: 'argamassa-forte-7',
    solucaoTerminal: ["kubectl get secret wifi -o jsonpath='{.data.senha}' | base64 -d"],
    testes: noCluster('a senha está certa', [
      { comando: 'base64\\s+(-d|--decode)', msg: 'você decodificou o base64 no terminal' },
      { resposta: 'argamassa-forte-7' },
    ]),
  }),

  problema({
    id: 'n4-chave-errada',
    titulo: 'A chave errada do envelope',
    dificuldade: 'medio',
    cluster: 'senha-errada',
    vidaReal: 'O bilhete diz "a combinação está no envelope, na linha password", mas o envelope só tem a linha "senha".',
    limite: 'O kubelet não adivinha: chave que não existe trava o contêiner (a menos que a referência seja optional).',
    enunciado: `
      <p>O banco não sai de <code>CreateContainerConfigError</code>. Descubra o motivo com <code>kubectl describe pod NOME</code>
         (nas Events) e confira as chaves do Secret com <code>kubectl describe secret banco-senha</code>. Conserte o
         Deployment.</p>`,
    dica: 'O secretKeyRef precisa citar uma chave que exista no Secret.',
    inicial: { 'banco.yaml': BANCO({ chave: 'password' }) },
    solucao: { 'banco.yaml': BANCO({ chave: 'senha' }) },
    testes: [depois('o banco sobe', [{ semErros: true }, { pods: 'app=banco', prontos: 1 }])],
  }),

  problema({
    id: 'n4-vitrine-volume',
    titulo: 'A vitrine nova',
    dificuldade: 'medio',
    cluster: 'vitrine',
    vidaReal: 'Em vez de repintar a vitrine, a loja pendura o cartaz que veio do quadro de avisos.',
    limite: 'O cartaz é só leitura: dentro do pod ninguém escreve nele. Para mudar, muda-se o ConfigMap.',
    enunciado: `
      <p>O ConfigMap <code>vitrine-html</code> tem um <code>index.html</code> com a promoção. Monte esse ConfigMap como
         volume na pasta <code>/usr/share/nginx/html</code> do contêiner da vitrine, para o nginx mostrar a promoção em vez
         da página padrão.</p>`,
    comoSaber: 'De dentro de um pod da vitrine: <code>kubectl exec deploy/vitrine -- curl -s localhost</code> mostra a promoção.',
    dica: 'Dois lugares: spec.template.spec.volumes (o volume configMap) e volumeMounts no contêiner (name e mountPath).',
    manual: ['pod.spec.volumes.configMap', 'pod.spec.containers.volumeMounts'],
    inicial: { 'vitrine.yaml': vitrine() },
    solucao: {
      'vitrine.yaml': vitrine(`          volumeMounts:
          - name: html
            mountPath: /usr/share/nginx/html
        volumes:
        - name: html
          configMap:
            name: vitrine-html
`),
    },
    testes: [
      depois('a vitrine mostra a promoção', [{ semErros: true }, { requisicao: { url: 'http://vitrine', corpo: 'Promoção de tijolos' } }]),
      depois('todos os pods da vitrine mostram', [{ distribuicao: { url: 'http://vitrine', vezes: 10, corpo: 'Promoção', entre: [10, 10] } }], { oculto: true }),
    ],
  }),

  problema({
    id: 'n4-aviso-novo',
    titulo: 'O aviso mudou, a loja não',
    dificuldade: 'medio',
    cluster: 'loja-com-config',
    terminal: true,
    vidaReal: 'Trocaram o aviso do quadro, mas a loja só lê o quadro quando abre. Fecha e abre de novo (sem deixar os clientes na rua).',
    limite: 'Se o ConfigMap fosse montado como arquivo, o arquivo mudaria sozinho; a variável de ambiente, nunca.',
    enunciado: `
      <p>A loja lê a <code>COR</code> do ConfigMap <code>loja-config</code>, que diz <code>azul</code>. Mude o aviso para
         <code>verde</code> (o arquivo está no editor), aplique e faça a loja passar a mostrar <code>"cor":"verde"</code>.</p>`,
    comoSaber: '<code>kubectl port-forward svc/loja 8080:80</code> e <code>curl localhost:8080</code>.',
    dica: 'Aplicar o ConfigMap não basta: as variáveis são lidas quando o contêiner nasce. kubectl rollout restart deployment/loja.',
    inicial: { 'config.yaml': configLoja('  COR: azul\n') },
    solucao: { 'config.yaml': configLoja('  COR: verde\n') },
    solucaoTerminal: ['kubectl apply -f config.yaml', 'kubectl rollout restart deployment/loja'],
    testes: noCluster('a loja mostra o aviso novo', [
      { objeto: 'configmap/loja-config', campo: 'data.COR', igual: 'verde' },
      { env: { pods: 'app=loja', nome: 'COR', igual: 'verde' }, msg: 'os pods da loja têm COR=verde' },
    ]),
  }),

  problema({
    id: 'n4-mesa-compartilhada',
    titulo: 'A mesa compartilhada',
    dificuldade: 'medio',
    cluster: 'placa',
    vidaReal: 'O pintor e o vitrinista trabalham no mesmo apartamento, mas cada um numa mesa: o pintor pinta a placa e o vitrinista nunca a vê.',
    limite: 'A mesa (emptyDir) é do apartamento (o pod): trocou de pod, começa vazia.',
    enunciado: `
      <p>O pod <code>placa</code> tem dois contêineres: o <code>pintor</code> grava a placa em <code>/html/index.html</code>
         e o <code>nginx</code> serve <code>/usr/share/nginx/html</code>. Hoje o pintor nem consegue gravar (veja
         <code>kubectl logs placa -c pintor</code>). Ponha um volume <code>emptyDir</code> montado nas duas pastas, para o
         nginx servir a placa que o pintor faz.</p>`,
    comoSaber: '<code>kubectl exec placa -c nginx -- curl -s localhost</code> mostra "Placa atualizada".',
    dica: 'Um volume emptyDir em spec.volumes e um volumeMounts em cada contêiner (pastas diferentes, o mesmo volume). Pod não muda depois de criado: kubectl delete pod placa e aplique de novo.',
    manual: ['pod.spec.volumes.emptyDir'],
    inicial: { 'placa.yaml': placa(false) },
    solucao: { 'placa.yaml': placa(true) },
    testes: [depois('o nginx serve a placa do pintor', [{ semErros: true }, { requisicao: { url: 'http://placa', corpo: 'Placa atualizada' } }], { esperar: '30s' })],
  }),

  problema({
    id: 'n4-box-na-garagem',
    titulo: 'Um box na garagem',
    dificuldade: 'medio',
    cluster: 'caderno',
    vidaReal: 'O caderno fica na mesa do apartamento e some a cada mudança. Alugue um box na garagem: o morador muda, o caderno fica.',
    limite: 'Este box (local-path) fica num node só; num disco de nuvem, ele poderia seguir o pod para outro node.',
    enunciado: `
      <p>O <code>caderno</code> anota uma linha em <code>/dados/notas.txt</code> cada vez que o pod nasce, mas a pasta nem
         existe (veja os logs). Crie um PVC <code>dados</code> de <code>1Gi</code> (<code>ReadWriteOnce</code>) e monte-o em
         <code>/dados</code>. As notas precisam sobreviver quando o pod for trocado.</p>`,
    comoSaber: '<code>kubectl get pvc</code> mostra <code>Bound</code>; apague o pod e veja <code>kubectl exec deploy/caderno -- cat /dados/notas.txt</code> crescer.',
    dica: 'O PVC: accessModes e resources.requests.storage. No Deployment: volumes com persistentVolumeClaim.claimName e volumeMounts.',
    manual: ['persistentvolumeclaim.spec', 'pod.spec.volumes.persistentVolumeClaim'],
    inicial: {
      'disco.yaml': yaml`
        apiVersion: v1
        kind: PersistentVolumeClaim
        metadata:
          name: dados
        spec:
          # accessModes: ...
          # resources: ...
      `,
      'caderno.yaml': CADERNO(),
    },
    solucao: {
      'disco.yaml': PVC('dados'),
      'caderno.yaml': CADERNO(VOLUME_CADERNO('          persistentVolumeClaim:\n            claimName: dados\n')),
    },
    testes: [
      depois('o caderno tem o seu box', [{ semErros: true }, { objeto: 'pvc/dados', campo: 'status.phase', igual: 'Bound' }, { pods: 'app=caderno', prontos: 1 }]),
      {
        oculto: true,
        descricao: 'as notas sobrevivem à troca do pod',
        passos: [
          { comando: 'kubectl apply -f .' }, { avancar: '1m' },
          { comando: 'kubectl delete pod -l app=caderno' }, { avancar: '1m' },
          { comando: 'kubectl exec deploy/caderno -- cat /dados/notas.txt' },
        ],
        regras: [{ saida: 'nota\\nnota', msg: 'depois da troca, o arquivo tem as notas dos dois pods' }],
      },
    ],
  }),

  problema({
    id: 'n4-classe-que-nao-existe',
    titulo: 'O box climatizado',
    dificuldade: 'medio',
    cluster: 'pvc-rapido',
    terminal: true,
    vidaReal: 'Pediram um box "climatizado", mas o condomínio só tem o comum. O pedido fica na gaveta, e a galeria espera na porta.',
    limite: 'O pedido não pode ser emendado: para trocar o tipo de box, cancela e faz outro.',
    enunciado: `
      <p>A <code>galeria</code> está <code>Pending</code> há tempos. Investigue o PVC <code>fotos</code>
         (<code>kubectl describe pvc fotos</code>) e as classes de disco (<code>kubectl get sc</code>). O arquivo do PVC está
         no editor: conserte e recrie o pedido para a galeria subir.</p>`,
    dica: 'Um PVC não muda de classe: kubectl delete pvc fotos e depois kubectl apply -f fotos.yaml (com a classe standard, ou sem classe, que usa a padrão).',
    inicial: { 'fotos.yaml': PVC('fotos', 'rapido') },
    solucao: { 'fotos.yaml': PVC('fotos', 'standard') },
    solucaoTerminal: ['kubectl delete pvc fotos', 'kubectl apply -f fotos.yaml'],
    testes: noCluster('a galeria sobe com o box comum', [
      { objeto: 'pvc/fotos', campo: 'spec.storageClassName', igual: 'standard' },
      { objeto: 'pvc/fotos', campo: 'status.phase', igual: 'Bound' },
      { pods: 'app=galeria', prontos: 1 },
    ]),
  }),

  problema({
    id: 'n4-statefulset',
    titulo: 'Os apartamentos numerados',
    dificuldade: 'dificil',
    cluster: 'vazio',
    vidaReal: 'Três apartamentos numerados, cada um com o seu box: o 1 só é entregue depois do 0, e cada morador sempre volta para o mesmo número.',
    limite: 'O StatefulSet não sabe nada de banco de dados: copiar dados entre as réplicas é trabalho do programa (o redis, o postgres...).',
    enunciado: `
      <p>Monte o banco <code>db</code> com <b>3 réplicas</b> do <code>redis:7</code> num <b>StatefulSet</b>: Service headless
         <code>db</code> (porta 6379), <code>serviceName: db</code> e um disco de <code>1Gi</code> por pod
         (<code>volumeClaimTemplates</code> chamado <code>dados</code>, montado em <code>/data</code>).</p>`,
    comoSaber: '<code>kubectl get pods -w</code> mostra db-0, depois db-1, depois db-2; <code>kubectl get pvc</code> mostra dados-db-0, -1 e -2.',
    dica: 'Parece um Deployment, com serviceName e volumeClaimTemplates a mais. O selector precisa bater com as labels do template.',
    manual: ['statefulset.spec', 'statefulset.spec.volumeClaimTemplates', 'service.spec.clusterIP'],
    inicial: {
      'servico.yaml': servicoDb,
      'statefulset.yaml': yaml`
        apiVersion: apps/v1
        kind: StatefulSet
        metadata:
          name: db
        spec:
          # serviceName: ...
          # replicas: ...
          # selector, template (redis:7, porta 6379, volumeMounts em /data)
          # volumeClaimTemplates: ...
      `,
    },
    solucao: { 'servico.yaml': servicoDb, 'statefulset.yaml': DB(3).split('---')[1] },
    testes: [
      aplicar([{ objeto: 'statefulset/db', campo: 'spec.serviceName', igual: 'db' }]),
      depois('os três apartamentos ficam prontos, cada um com o seu box', [
        { pods: 'app=db', prontos: 3 },
        { objeto: 'pvc/dados-db-2', campo: 'status.phase', igual: 'Bound' },
        { dns: { nome: 'db-2.db.default.svc.cluster.local', quantidade: 1 }, msg: 'db-2.db.default.svc.cluster.local resolve' },
      ], { esperar: '2m' }),
      {
        oculto: true,
        descricao: 'o db-1 volta com o mesmo nome e os mesmos dados',
        passos: [
          { comando: 'kubectl apply -f .' }, { avancar: '2m' },
          { comando: "kubectl exec db-1 -- sh -c 'echo guardado > /data/marca'" },
          { comando: 'kubectl delete pod db-1' }, { avancar: '1m' },
          { comando: 'kubectl exec db-1 -- cat /data/marca' },
        ],
        regras: [{ objeto: 'pod/db-1', existe: true }, { saida: 'guardado', msg: 'o db-1 novo achou o arquivo do antigo' }],
      },
    ],
  }),

  problema({
    id: 'n4-nome-fixo',
    titulo: 'Quem mora no 2?',
    dificuldade: 'medio',
    cluster: 'db-pronto',
    terminal: true,
    vidaReal: 'Para falar com o apartamento 2, a portaria olha a lista de moradores pelo número, não pela cara.',
    limite: 'Se o db-2 for recriado, o nome continua o mesmo, mas o IP pode mudar: guarde o nome, não o IP.',
    enunciado: `
      <p>O StatefulSet <code>db</code> está no ar. A partir do pod <code>cliente</code> (busybox), descubra pelo
         <b>DNS</b> o IP do <code>db-2</code>.</p>`,
    rotuloResposta: 'O IP do db-2',
    dica: 'kubectl exec cliente -- nslookup db-2.db.default.svc.cluster.local (o nslookup do busybox precisa do nome inteiro).',
    respostaCerta: (c) => c.obter('Pod', 'default', 'db-2').status.podIP,
    solucaoTerminal: ['kubectl exec cliente -- nslookup db-2.db.default.svc.cluster.local'],
    testes: noCluster('você achou o db-2 pelo nome', [
      { comando: 'nslookup\\s+db-2\\.db', msg: 'você perguntou ao DNS pelo db-2' },
      { resposta: { de: 'pod/db-2', campo: 'status.podIP' } },
    ]),
  }),

  problema({
    id: 'n4-encolher',
    titulo: 'Fim de temporada',
    dificuldade: 'medio',
    cluster: 'db-pronto',
    terminal: true,
    vidaReal: 'Na baixa temporada, fecham os apartamentos 2 e 1 (nessa ordem), mas os boxes continuam alugados, com as coisas dentro.',
    limite: 'Os boxes guardados custam dinheiro: num disco de nuvem, PVC esquecido continua na conta.',
    enunciado: `
      <p>Diminua o StatefulSet <code>db</code> para <b>1 réplica</b>, pelo terminal. Depois, conte: quantos PVCs do
         <code>db</code> continuam existindo?</p>`,
    rotuloResposta: 'Quantos PVCs sobraram?',
    dica: 'kubectl scale statefulset db --replicas=1; depois kubectl get pvc.',
    respostaCerta: '3',
    solucaoTerminal: ['kubectl scale statefulset db --replicas=1', 'kubectl get pvc'],
    testes: noCluster('o db encolheu e os discos ficaram', [
      { pods: 'app=db', quantidade: 1 },
      { objeto: 'pvc/dados-db-2', existe: true, msg: 'o PVC do db-2 continua lá' },
      { resposta: '3' },
    ]),
  }),
];
