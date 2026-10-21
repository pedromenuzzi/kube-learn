// Nível 11: os projetos finais. Cada projeto tem 5 etapas encadeadas: a etapa começa dos arquivos que o aluno deixou na
// anterior (ou da solução de referência) e acrescenta uma coisa. Os testes aplicam tudo num cluster novo.
import { licao, projeto, yaml } from './util.js';

const depois = (descricao, regras, { oculto = false, esperar = '1m', mais = [], vigiar } = {}) => ({ oculto, descricao, vigiar, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }, ...mais], regras });
const pede = (url, extra) => ({ requisicao: { de: 'pod/cliente', url, ...extra } });
const deFora = (url, extra) => ({ requisicao: { de: 'fora', url, ...extra } });

/** Um Deployment; `labels` a mais no pod, `pod` no spec do pod (recuo 6) e `ct` no contêiner (recuo 8). */
const dep = (nome, { replicas = 1, imagem = 'kubelearn/loja:1.0', porta = 8080, labels = {}, pod = '', ct = '', anotacoes = '', estrategia = '' } = {}) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${nome}
${anotacoes}spec:
  replicas: ${replicas}
${estrategia}  selector:
    matchLabels:
      app: ${labels.app ?? nome}
${Object.entries(labels).filter(([k]) => k !== 'app').map(([k, v]) => `      ${k}: ${v}\n`).join('')}  template:
    metadata:
      labels:
        app: ${labels.app ?? nome}
${Object.entries(labels).filter(([k]) => k !== 'app').map(([k, v]) => `        ${k}: ${v}\n`).join('')}    spec:
${pod}      containers:
      - name: ${nome}
        image: ${imagem}
        ports:
        - containerPort: ${porta}
${ct}`;
const svc = (nome, { porta = 80, alvo = 8080, seletor = { app: nome }, headless = false } = {}) => `apiVersion: v1
kind: Service
metadata:
  name: ${nome}
spec:
${headless ? '  clusterIP: None\n' : ''}  selector:
${Object.entries(seletor).map(([k, v]) => `    ${k}: ${v}\n`).join('')}  ports:
  - port: ${porta}
    targetPort: ${alvo}
`;
const juntar = (...docs) => docs.map((d) => d.trim()).join('\n---\n') + '\n';
const prontidao = (caminho = '/healthz', porta = 8080) => `        readinessProbe:\n          httpGet:\n            path: ${caminho}\n            port: ${porta}\n`;

// ---------- Projeto 1: a loja completa (frontend, API e Redis) ----------
const api = ({ replicas = 2, redis = false, pronta = false } = {}) => dep('api', {
  replicas,
  ct: `${redis ? '        env:\n        - name: REDIS_HOST\n          value: redis\n' : ''}${pronta ? `${prontidao()}        resources:\n          requests:\n            cpu: 100m\n            memory: 64Mi\n` : ''}`,
});
const redis = (comSvc) => juntar(dep('redis', { imagem: 'redis:7', porta: 6379 }), ...(comSvc ? [svc('redis', { porta: 6379, alvo: 6379 })] : []));
const HTML = yaml`
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: vitrine-html
  data:
    index.html: |
      <h1>Loja do kube-learn</h1>
`;
const vitrine = ({ completa = false, pronta = false } = {}) => juntar(...(completa ? [HTML] : []), dep('vitrine', {
  replicas: 2,
  imagem: 'nginx:1.27',
  porta: 80,
  pod: '      volumes:\n      - name: html\n        configMap:\n          name: vitrine-html\n',
  ct: `        volumeMounts:\n        - name: html\n          mountPath: /usr/share/nginx/html\n${pronta ? prontidao('/', 80) : ''}`,
}), ...(completa ? [svc('vitrine', { alvo: 80 })] : []));
const entrada = (comApi) => yaml`
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
              name: vitrine
              port:
                number: 80
${comApi ? `        - path: /api
          pathType: Prefix
          backend:
            service:
              name: api
              port:
                number: 80
` : ''}`;

// ---------- Projeto 2: o blog com banco (StatefulSet, Secret, PVC) ----------
const segredo = (completo) => (completo ? yaml`
  apiVersion: v1
  kind: Secret
  metadata:
    name: banco
  stringData:
    senha: tijolo-azul-42
` : yaml`
  apiVersion: v1
  kind: Secret
  metadata:
    name: banco
  stringData: {}
`);
const banco = ({ senha = false, servico = false, disco = false } = {}) => juntar(...(servico ? [svc('db', { porta: 5432, alvo: 5432, headless: true })] : []), `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db
  replicas: 1
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
      - name: db
        image: postgres:17
        ports:
        - containerPort: 5432
${senha ? `        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: banco
              key: senha
` : ''}${disco ? `        volumeMounts:
        - name: dados
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: dados
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 1Gi
` : ''}`);
const blog = (completo) => juntar(dep('blog', {
  replicas: 2,
  imagem: 'httpd:2.4',
  porta: 80,
  ct: completo ? '        env:\n        - name: DB_HOST\n          value: db-0.db\n        - name: DB_SENHA\n          valueFrom:\n            secretKeyRef:\n              name: banco\n              key: senha\n' : '',
}), ...(completo ? [svc('blog', { alvo: 80 })] : []));
const copia = (horario) => yaml`
  apiVersion: batch/v1
  kind: CronJob
  metadata:
    name: backup-db
  spec:
    schedule: "${horario}"
    jobTemplate:
      spec:
        template:
          spec:
            restartPolicy: OnFailure
            containers:
            - name: copia
              image: busybox:1.36
              env:
              - name: DB_HOST
                value: db-0.db
              command: ["sh", "-c", "echo copiando o banco de $DB_HOST"]
`;

// ---------- Projeto 3: deploy sem downtime ----------
const ESTRATEGIA = '  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxUnavailable: 0\n      maxSurge: 1\n';
const lojaZero = ({ servico = true, pronta = false, estrategia = false, versao = '1.0', causa = false } = {}) => juntar(dep('loja', {
  replicas: 4,
  imagem: `kubelearn/loja:${versao}`,
  anotacoes: causa ? `  annotations:\n    kubernetes.io/change-cause: "versão ${versao}"\n` : '',
  estrategia: estrategia ? ESTRATEGIA : '',
  ct: pronta ? prontidao() : '',
}), ...(servico ? [svc('loja')] : []));
const pdb = yaml`
  apiVersion: policy/v1
  kind: PodDisruptionBudget
  metadata:
    name: loja
  spec:
    minAvailable: 3
    selector:
      matchLabels:
        app: loja
`;

// ---------- Projeto 4: canário ----------
const versaoDaLoja = (n, { replicas, comSvc = true }) => juntar(dep(`loja-${n}`, { replicas, imagem: `kubelearn/loja:${n === 'v1' ? '1.0' : '1.1'}`, labels: { app: 'loja', versao: n } }), ...(comSvc ? [svc(`loja-${n}`, { seletor: { app: 'loja', versao: n } })] : []));
const rota = (pesos) => yaml`
  apiVersion: gateway.networking.k8s.io/v1
  kind: HTTPRoute
  metadata:
    name: loja
  spec:
    parentRefs:
    - name: portaria
    hostnames:
    - loja.local
    rules:
    - backendRefs:
${Object.entries(pesos).map(([n, w]) => `      - name: loja-${n}\n        port: 80\n        weight: ${w}`).join('\n')}
`;
const versao11 = (entre) => ({ distribuicao: { de: 'fora', url: 'http://loja.local', vezes: 100, corpo: '"versao":"1.1"', entre } });

/** Os clusters de partida dos projetos (em clusters.js). */
export const PARTIDA11 = {
  cliente: yaml`
    apiVersion: v1
    kind: Pod
    metadata:
      name: cliente
    spec:
      containers:
      - name: cliente
        image: busybox:1.36
        command: ["sleep", "3600"]
  `,
};

export const NIVEL11 = [
  licao({
    id: 'n11-licao-projetos',
    titulo: 'Os projetos: tudo junto',
    vidaReal: 'Até aqui, cada missão era um cômodo. Agora é a obra inteira: fundação, paredes, instalações e acabamento, uma etapa depois da outra.',
    limite: 'Na obra de verdade, ninguém refaz a fundação a cada etapa. Aqui, os testes montam tudo de novo num cluster limpo: o que você esqueceu numa etapa aparece na próxima.',
    conteudo: `
      <p>Cada projeto tem <b>5 etapas</b>. Cada etapa <b>começa dos seus arquivos da etapa anterior</b> (se você fez; senão,
         da solução de referência) e pede uma coisa nova. Os testes aplicam todos os arquivos num cluster novo, então
         tudo o que você construiu precisa continuar funcionando.</p>
      <ul>
        <li><b>A loja completa</b>: API, Redis, vitrine e a entrada pelo Ingress.</li>
        <li><b>O blog com banco</b>: Secret, StatefulSet com disco e a cópia de segurança.</li>
        <li><b>Deploy sem downtime</b>: readiness, estratégia de rolling update e PDB.</li>
        <li><b>Canário</b>: duas versões e a divisão do tráfego pelo Gateway API.</li>
      </ul>
      <p>Dica de quem faz isso todo dia: <code>kubectl apply -f .</code>, <code>kubectl get all</code> e
         <code>kubectl describe</code> resolvem quase tudo. Quando travar, a aba Solução tem a referência de cada etapa.</p>`,
  }),

  ...projeto({
    id: 'n11-loja',
    titulo: 'A loja completa',
    cluster: 'projeto-loja',
    etapas: [
      {
        titulo: 'A API e o ramal dela',
        dificuldade: 'facil',
        vidaReal: 'Primeiro, o balcão de atendimento (a API) e o ramal fixo para falar com ele.',
        limite: 'O ramal só existe para quem está dentro do condomínio: de fora, ainda ninguém chega.',
        enunciado: `<p>O <code>api.yaml</code> tem o Deployment da API com 1 réplica. Suba para <b>2 réplicas</b> e acrescente o
                    Service <code>api</code> (porta 80, para a 8080 dos pods).</p>`,
        dica: 'replicas: 2 e, no mesmo arquivo depois de um ---, o Service com selector app: api, port 80 e targetPort 8080.',
        novos: { 'api.yaml': dep('api') },
        solucao: { 'api.yaml': juntar(api(), svc('api')) },
        testes: [depois('a API atende pelo ramal', [{ semErros: true }, { pods: 'app=api', prontos: 2 }, pede('http://api', { corpo: '"app":"loja"' })])],
      },
      {
        titulo: 'O cache',
        dificuldade: 'facil',
        vidaReal: 'A API ganha uma geladeira (o Redis) para não buscar tudo no estoque toda vez.',
        limite: 'O endereço da geladeira está escrito na API (REDIS_HOST): trocar o nome do Service quebra a ligação.',
        enunciado: `<p>O <code>redis.yaml</code> tem o Deployment do Redis. Acrescente o Service <code>redis</code> (porta 6379) e,
                    no <code>api.yaml</code>, a variável <code>REDIS_HOST=redis</code> na API.</p>`,
        dica: 'Service redis: port 6379, targetPort 6379. Na API: env: [{ name: REDIS_HOST, value: redis }].',
        novos: { 'redis.yaml': redis(false) },
        solucao: { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis(true) },
        testes: [depois('a API sabe onde está o cache', [
          { semErros: true },
          { endpoints: 'svc/redis', quantidade: 1 },
          { env: { pods: 'app=api', nome: 'REDIS_HOST', igual: 'redis' } },
        ])],
      },
      {
        titulo: 'A vitrine',
        dificuldade: 'medio',
        vidaReal: 'A vitrine (o nginx) mostra a página que está no quadro de avisos (o ConfigMap).',
        limite: 'O nginx lê o arquivo do volume a cada pedido: trocar o ConfigMap muda a página uns segundos depois, sem reiniciar.',
        enunciado: `<p>O <code>vitrine.yaml</code> tem o nginx montando o ConfigMap <code>vitrine-html</code>, que não existe. Crie o
                    ConfigMap com um <code>index.html</code> que tenha <code>Loja do kube-learn</code>, e o Service
                    <code>vitrine</code> (porta 80).</p>`,
        dica: 'ConfigMap vitrine-html com data: { index.html: "<h1>Loja do kube-learn</h1>" } e o Service vitrine (port 80, targetPort 80).',
        novos: { 'vitrine.yaml': vitrine() },
        solucao: { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis(true), 'vitrine.yaml': vitrine({ completa: true }) },
        testes: [depois('a vitrine mostra a página', [{ semErros: true }, { pods: 'app=vitrine', prontos: 2 }, pede('http://vitrine', { corpo: 'Loja do kube-learn' })])],
      },
      {
        titulo: 'A porta da rua',
        dificuldade: 'medio',
        vidaReal: 'O balcão de informações da portaria: quem pede "loja.local" vai à vitrine; quem pede "/api", ao balcão da API.',
        limite: 'O Ingress escolhe pelo caminho mais longo: /api vence o / para quem pede /api/qualquer-coisa.',
        enunciado: `<p>O <code>entrada.yaml</code> leva <code>loja.local</code> à vitrine. Acrescente o caminho <code>/api</code> para o
                    Service <code>api</code>.</p>`,
        dica: 'Mais um item em paths: path /api, pathType Prefix, backend service api, port 80.',
        novos: { 'entrada.yaml': entrada(false) },
        solucao: { 'api.yaml': juntar(api({ redis: true }), svc('api')), 'redis.yaml': redis(true), 'vitrine.yaml': vitrine({ completa: true }), 'entrada.yaml': entrada(true) },
        testes: [depois('a loja abre de fora', [
          { semErros: true },
          deFora('http://loja.local/', { corpo: 'Loja do kube-learn' }),
          deFora('http://loja.local/api', { corpo: '"app":"loja"' }),
        ])],
      },
      {
        titulo: 'Pronta para o público',
        dificuldade: 'dificil',
        vidaReal: 'Antes de abrir as portas: o síndico confere quem está pronto, e cada atendente diz quanto de energia precisa.',
        limite: 'A readinessProbe só protege se a resposta for honesta: um /healthz que sempre diz ok não protege de nada.',
        enunciado: `<p>Na API: uma <b>readinessProbe</b> em <code>/healthz</code> (porta 8080) e <b>requests</b> de 100m de CPU e 64Mi de
                    memória. Na vitrine: uma readinessProbe em <code>/</code> (porta 80). Uma atualização da API não pode
                    derrubar ninguém.</p>`,
        dica: 'readinessProbe: { httpGet: { path: /healthz, port: 8080 } } e resources: { requests: { cpu: 100m, memory: 64Mi } }.',
        solucao: { 'api.yaml': juntar(api({ redis: true, pronta: true }), svc('api')), 'redis.yaml': redis(true), 'vitrine.yaml': vitrine({ completa: true, pronta: true }), 'entrada.yaml': entrada(true) },
        testes: [
          depois('as sondas e os pedidos estão no lugar', [
            { semErros: true },
            { objeto: 'deployment/api', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/healthz' },
            { objeto: 'deployment/api', campo: 'spec.template.spec.containers[0].resources.requests.cpu', igual: '100m' },
            { objeto: 'deployment/vitrine', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/' },
          ]),
          depois('a API troca de versão sem ninguém ficar sem resposta', [{ vigia: { maxFalhas: 0 } }], {
            oculto: true,
            vigiar: 'http://api',
            mais: [{ zerar: true }, { comando: 'kubectl set image deployment/api api=kubelearn/loja:2.1-aquece' }, { avancar: '2m' }],
          }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-blog',
    titulo: 'O blog com banco',
    etapas: [
      {
        titulo: 'O envelope da senha',
        dificuldade: 'facil',
        vidaReal: 'Antes de chamar o banco, o envelope lacrado com a senha.',
        limite: 'Lacrado não é cofre: quem pode ler Secrets no namespace lê a senha (é só base64).',
        enunciado: '<p>O <code>segredo.yaml</code> tem o Secret <code>banco</code> vazio. Ponha nele a chave <code>senha</code> (o valor que você quiser).</p>',
        dica: 'stringData: { senha: tijolo-azul-42 }',
        novos: { 'segredo.yaml': segredo(false) },
        solucao: { 'segredo.yaml': segredo(true) },
        testes: [depois('o envelope tem a senha', [{ semErros: true }, { objeto: 'secret/banco', campo: 'data.senha', existe: true }], { esperar: '5s' })],
      },
      {
        titulo: 'O banco de dados',
        dificuldade: 'medio',
        vidaReal: 'O apartamento 0 do banco, com número fixo e o porteiro do prédio (o Service headless) que sabe chamar pelo nome.',
        limite: 'O headless não reparte as ligações: ele só dá o endereço de cada apartamento (db-0.db).',
        enunciado: `<p>O <code>banco.yaml</code> tem o StatefulSet <code>db</code> (postgres), que cai sem senha. Dê a ele a
                    <code>POSTGRES_PASSWORD</code> lida do Secret <code>banco</code> e crie o Service <b>headless</b>
                    <code>db</code> (porta 5432).</p>`,
        dica: 'env com valueFrom.secretKeyRef (name: banco, key: senha) e um Service com clusterIP: None.',
        novos: { 'banco.yaml': banco() },
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true }) },
        testes: [depois('o banco está de pé', [{ semErros: true }, { pods: 'app=db', prontos: 1 }, { objeto: 'svc/db', campo: 'spec.clusterIP', igual: 'None' }])],
      },
      {
        titulo: 'O disco do banco',
        dificuldade: 'medio',
        vidaReal: 'O apartamento 0 ganha o box dele na garagem: se o morador trocar, o box continua com as coisas.',
        limite: 'Apagar o StatefulSet não apaga o box (o PVC): o dado fica até alguém apagar o PVC.',
        enunciado: `<p>Dê ao banco um disco próprio: um <code>volumeClaimTemplates</code> <code>dados</code> de 1Gi, montado em
                    <code>/var/lib/postgresql/data</code>.</p>`,
        dica: 'volumeClaimTemplates no spec do StatefulSet e o volumeMount com o mesmo nome (dados).',
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true, disco: true }) },
        testes: [
          depois('o banco tem disco próprio', [{ semErros: true }, { objeto: 'pvc/dados-db-0', campo: 'status.phase', igual: 'Bound' }, { pods: 'app=db', prontos: 1 }], { esperar: '2m' }),
          depois('o db-0 volta com o mesmo disco (e os dados)', [{ saida: '^guardado', msg: 'o arquivo gravado antes continua lá' }, { pods: 'app=db', prontos: 1 }], {
            oculto: true,
            esperar: '2m',
            mais: [
              { comando: "kubectl exec db-0 -- sh -c 'echo guardado > /var/lib/postgresql/data/marca'" },
              { comando: 'kubectl delete pod db-0' }, { avancar: '1m' },
              { comando: 'kubectl exec db-0 -- cat /var/lib/postgresql/data/marca' },
            ],
          }),
        ],
      },
      {
        titulo: 'O blog',
        dificuldade: 'medio',
        vidaReal: 'O blog mora em outro apartamento e liga para o banco pelo endereço fixo do apartamento 0, com a senha do envelope.',
        limite: 'O endereço db-0.db aponta sempre para o mesmo pod: se o banco ganhasse réplicas, o blog não falaria com elas.',
        enunciado: `<p>O <code>blog.yaml</code> tem o Deployment do blog. Dê a ele as variáveis <code>DB_HOST=db-0.db</code> e
                    <code>DB_SENHA</code> (do Secret <code>banco</code>), e crie o Service <code>blog</code> (porta 80).</p>`,
        dica: 'env: DB_HOST com value e DB_SENHA com valueFrom.secretKeyRef; Service blog: port 80, targetPort 80.',
        novos: { 'blog.yaml': blog(false) },
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true, disco: true }), 'blog.yaml': blog(true) },
        testes: [depois('o blog acha o banco', [
          { semErros: true },
          { endpoints: 'svc/blog', quantidade: 2 },
          { env: { pods: 'app=blog', nome: 'DB_HOST', igual: 'db-0.db' } },
          { objeto: 'deployment/blog', campo: 'spec.template.spec.containers[0].env[1].valueFrom.secretKeyRef.name', igual: 'banco', msg: 'a DB_SENHA vem do Secret banco' },
        ], { esperar: '2m' })],
      },
      {
        titulo: 'A cópia de segurança',
        dificuldade: 'medio',
        vidaReal: 'Toda madrugada, às 2h, alguém copia o banco para o cofre.',
        limite: 'Cópia que nunca foi testada não é cópia: rode o Job na mão de vez em quando.',
        enunciado: `<p>O <code>backup.yaml</code> tem o CronJob <code>backup-db</code> rodando a cada minuto (para testar). Mude para
                    <b>todo dia às 2h</b>.</p>`,
        dica: 'schedule: "0 2 * * *" (minuto hora dia mês dia-da-semana).',
        novos: { 'backup.yaml': copia('* * * * *') },
        solucao: { 'segredo.yaml': segredo(true), 'banco.yaml': banco({ senha: true, servico: true, disco: true }), 'blog.yaml': blog(true), 'backup.yaml': copia('0 2 * * *') },
        testes: [
          depois('a cópia roda todo dia às 2h', [{ semErros: true }, { objeto: 'cronjob/backup-db', campo: 'spec.schedule', igual: '0 2 * * *' }], { esperar: '10s' }),
          depois('rodar na mão funciona', [{ objeto: 'job/teste', campo: 'status.succeeded', igual: 1 }], {
            oculto: true, esperar: '10s', mais: [{ comando: 'kubectl create job teste --from=cronjob/backup-db' }, { avancar: '1m' }],
          }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-zero',
    titulo: 'Deploy sem downtime',
    etapas: [
      {
        titulo: 'A loja e o ramal',
        dificuldade: 'facil',
        vidaReal: 'Quatro atendentes e o ramal fixo da loja.',
        limite: 'Por enquanto, o ramal manda clientes para qualquer atendente que estiver de pé, pronto ou não.',
        enunciado: '<p>O <code>loja.yaml</code> tem o Deployment da loja (4 réplicas). Acrescente o Service <code>loja</code> (porta 80 → 8080).</p>',
        dica: 'Service com selector app: loja, port 80 e targetPort 8080.',
        novos: { 'loja.yaml': lojaZero({ servico: false }) },
        solucao: { 'loja.yaml': lojaZero() },
        testes: [depois('o ramal tem 4 atendentes', [{ semErros: true }, { endpoints: 'svc/loja', quantidade: 4 }])],
      },
      {
        titulo: 'Só atende quem está pronto',
        dificuldade: 'medio',
        vidaReal: 'A versão nova da loja demora 20 segundos aquecendo. Sem perguntar se está pronta, o ramal manda clientes para quem ainda está de avental.',
        limite: 'A readiness não acelera nada: o atendente continua demorando, só não recebe ninguém antes da hora.',
        enunciado: '<p>Acrescente uma <b>readinessProbe</b> em <code>/healthz</code> (porta 8080). Os testes ocultos trocam a loja por uma versão que demora a aquecer.</p>',
        dica: 'readinessProbe: { httpGet: { path: /healthz, port: 8080 } }',
        solucao: { 'loja.yaml': lojaZero({ pronta: true }) },
        testes: [
          depois('a sonda está no lugar', [{ semErros: true }, { pods: 'app=loja', prontos: 4 }, { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].readinessProbe.httpGet.path', igual: '/healthz' }]),
          depois('a versão que aquece não derruba ninguém', [{ vigia: { maxFalhas: 0 } }], {
            oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, { comando: 'kubectl set image deployment/loja loja=kubelearn/loja:2.1-aquece' }, { avancar: '2m' }],
          }),
        ],
      },
      {
        titulo: 'Reforma sem fechar nenhum',
        dificuldade: 'medio',
        vidaReal: 'Na reforma por etapas, abre-se um apartamento novo antes de fechar um antigo: nunca menos de 4 abertos.',
        limite: 'Sem espaço para o apartamento extra (o maxSurge), a reforma para: maxUnavailable 0 exige folga no cluster.',
        enunciado: '<p>Configure o rolling update para <b>nunca</b> ficar com menos de 4 pods prontos: <code>maxUnavailable: 0</code> e <code>maxSurge: 1</code>.</p>',
        dica: 'spec.strategy: { type: RollingUpdate, rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true }) },
        testes: [
          depois('a estratégia está no lugar', [{ semErros: true }, { objeto: 'deployment/loja', campo: 'spec.strategy.rollingUpdate.maxUnavailable', igual: 0 }]),
          depois('a atualização nunca fica abaixo de 4', [{ rollout: 'deployment/loja', minDisponivel: 4 }], {
            oculto: true, mais: [{ zerar: true }, { comando: 'kubectl set image deployment/loja loja=kubelearn/loja:1.1' }, { avancar: '2m' }],
          }),
        ],
      },
      {
        titulo: 'Elevadores garantidos',
        dificuldade: 'medio',
        vidaReal: 'Na manutenção dos prédios (o drain), pelo menos 3 atendentes continuam atendendo.',
        limite: 'O PDB não segura uma queda de energia: só as saídas planejadas (drain).',
        enunciado: '<p>Crie um <code>pdb.yaml</code> com um PodDisruptionBudget <code>loja</code> que garanta <b>pelo menos 3</b> pods prontos.</p>',
        dica: 'policy/v1, kind PodDisruptionBudget, spec: { minAvailable: 3, selector: { matchLabels: { app: loja } } }',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true }), 'pdb.yaml': pdb },
        testes: [depois('o PDB deixa sair um por vez', [{ semErros: true }, { objeto: 'pdb/loja', campo: 'status.disruptionsAllowed', igual: 1 }])],
      },
      {
        titulo: 'A versão nova, com nome',
        dificuldade: 'dificil',
        vidaReal: 'A reforma ganha uma placa ("versão 1.1") para que todo mundo saiba o que mudou, e pode ser desfeita.',
        limite: 'O change-cause é só uma anotação: escreva a verdade, porque o histórico mostra o que estiver lá.',
        enunciado: `<p>Atualize a loja para a versão <b>1.1</b> e anote o motivo no Deployment
                    (<code>kubernetes.io/change-cause: "versão 1.1"</code>), para aparecer no <code>kubectl rollout history</code>.
                    Tudo o que você fez antes continua valendo.</p>`,
        dica: 'metadata.annotations do Deployment e image: kubelearn/loja:1.1.',
        solucao: { 'loja.yaml': lojaZero({ pronta: true, estrategia: true, versao: '1.1', causa: true }), 'pdb.yaml': pdb },
        testes: [
          depois('a versão 1.1, com a placa', [
            { semErros: true },
            { pods: 'app=loja', prontos: 4, imagem: 'kubelearn/loja:1.1' },
            { objeto: 'deployment/loja', campo: 'metadata.annotations["kubernetes.io/change-cause"]', regex: '1\\.1' },
          ]),
          depois('a próxima atualização também não derruba ninguém', [{ vigia: { maxFalhas: 0 } }, { rollout: 'deployment/loja', minDisponivel: 4 }], {
            oculto: true, vigiar: 'http://loja', mais: [{ zerar: true }, { comando: 'kubectl set image deployment/loja loja=kubelearn/loja:2.1-aquece' }, { avancar: '2m' }],
          }),
        ],
      },
    ],
  }),

  ...projeto({
    id: 'n11-canario',
    titulo: 'Canário',
    cluster: 'projeto-canario',
    etapas: [
      {
        titulo: 'A versão estável',
        dificuldade: 'facil',
        vidaReal: 'A loja de sempre, com a etiqueta da versão na porta de cada apartamento.',
        limite: 'A label versao é só uma etiqueta: o Kubernetes não sabe o que é uma versão; quem usa são os seletores.',
        enunciado: `<p>O <code>v1.yaml</code> tem a <code>loja-v1</code> (3 réplicas, labels <code>app: loja</code> e
                    <code>versao: v1</code>). Crie o Service <code>loja-v1</code> que escolha só os pods da v1.</p>`,
        dica: 'selector: { app: loja, versao: v1 }',
        novos: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3, comSvc: false }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }) },
        testes: [depois('a v1 atende pelo ramal dela', [{ semErros: true }, { endpoints: 'svc/loja-v1', quantidade: 3 }])],
      },
      {
        titulo: 'O canário',
        dificuldade: 'medio',
        vidaReal: 'Um único apartamento com a reforma nova, para ver se alguém reclama antes de reformar o prédio todo.',
        limite: 'Um canário com poucas visitas demora a mostrar defeito: dê tempo (e tráfego) antes de decidir.',
        enunciado: `<p>O <code>v2.yaml</code> tem a <code>loja-v2</code> (versão 1.1, 1 réplica, <code>versao: v2</code>). Crie o
                    Service <code>loja-v2</code>, que escolha só a v2.</p>`,
        dica: 'O mesmo Service da v1, com versao: v2.',
        novos: { 'v2.yaml': versaoDaLoja('v2', { replicas: 1, comSvc: false }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 1 }) },
        testes: [depois('cada versão com o seu ramal', [{ semErros: true }, { endpoints: 'svc/loja-v2', quantidade: 1 }, { endpoints: 'svc/loja-v1', quantidade: 3 }])],
      },
      {
        titulo: '10% para o canário',
        dificuldade: 'medio',
        vidaReal: 'A placa da portaria manda 1 em cada 10 visitantes para o apartamento reformado.',
        limite: 'O peso é por conexão, não por pessoa: o mesmo cliente pode cair ora numa versão, ora na outra.',
        enunciado: `<p>O <code>rota.yaml</code> manda tudo de <code>loja.local</code> para a v1. Divida: <b>90</b> para a
                    <code>loja-v1</code> e <b>10</b> para a <code>loja-v2</code>.</p>`,
        dica: 'backendRefs: [{ name: loja-v1, port: 80, weight: 90 }, { name: loja-v2, port: 80, weight: 10 }]',
        novos: { 'rota.yaml': rota({ v1: 100 }) },
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 1 }), 'rota.yaml': rota({ v1: 90, v2: 10 }) },
        testes: [depois('uns 10% chegam na versão 1.1', [{ semErros: true }, versao11([5, 15])])],
      },
      {
        titulo: 'Meio a meio',
        dificuldade: 'medio',
        vidaReal: 'Ninguém reclamou: metade dos visitantes já vai para a reforma.',
        limite: 'Meio a meio com 3 pods de um lado e 1 do outro: o pod da v2 recebe a mesma carga que os 3 da v1 juntos.',
        enunciado: '<p>Passe para <b>50/50</b> e, como a v2 vai receber muito mais visitas, suba a <code>loja-v2</code> para <b>3 réplicas</b>.</p>',
        dica: 'weight: 50 nos dois e replicas: 3 no v2.yaml.',
        solucao: { 'v1.yaml': versaoDaLoja('v1', { replicas: 3 }), 'v2.yaml': versaoDaLoja('v2', { replicas: 3 }), 'rota.yaml': rota({ v1: 50, v2: 50 }) },
        testes: [depois('metade na versão 1.1', [{ semErros: true }, versao11([40, 60]), { pods: 'versao=v2', prontos: 3 }])],
      },
      {
        titulo: 'A promoção',
        dificuldade: 'medio',
        vidaReal: 'A reforma foi aprovada: todo mundo para os apartamentos novos, e os antigos fecham.',
        limite: 'Depois de apagar a v1, voltar atrás é subir a v1 de novo: guarde o YAML dela até ter certeza.',
        enunciado: '<p>Mande <b>todo</b> o tráfego para a v2 e desligue a v1 (tire o <code>v1.yaml</code> e a v1 da rota).</p>',
        dica: 'Uma regra só com a loja-v2 (weight 100, ou sem weight) e apague o arquivo v1.yaml.',
        solucao: { 'v2.yaml': versaoDaLoja('v2', { replicas: 3 }), 'rota.yaml': rota({ v2: 100 }) },
        testes: [depois('todo mundo na versão 1.1', [{ semErros: true }, versao11([100, 100]), { pods: 'versao=v1', quantidade: 0 }])],
      },
    ],
  }),
];
