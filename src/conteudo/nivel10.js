// Nível 10: Helm, Kustomize, CRD e GitOps (o projeto padrão da construtora, a mesma planta em cada cidade, o
// formulário novo da administração e a planta registrada em cartório).
import { licao, problema, yaml } from './util.js';
import { REPO_HELM as REPO_PADRAO } from '../constantes.js';

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const comK = (pasta, descricao, regras, { oculto = false, esperar = '1m' } = {}) => ({ oculto, descricao, passos: [{ comando: `kubectl apply -k ${pasta}` }, { avancar: esperar }], regras });
const daLoja = 'app.kubernetes.io/instance=loja';

// ---------- Kustomize ----------
const deployLoja = (env = false) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
  spec:
    replicas: ${env ? 2 : 1}
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
${env ? '          envFrom:\n          - configMapRef:\n              name: loja-config\n' : ''}`;
const svcLoja = yaml`
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
const kBase = (completo) => yaml`
  apiVersion: kustomize.config.k8s.io/v1beta1
  kind: Kustomization
  resources:
  - deployment.yaml
${completo ? `  - service.yaml
  labels:
  - pairs:
      app.kubernetes.io/part-of: loja
` : ''}`;
const kProd = (completo) => yaml`
  apiVersion: kustomize.config.k8s.io/v1beta1
  kind: Kustomization
  resources:
  - ../../base
  - namespace.yaml
  namespace: prod
  namePrefix: prod-
${completo ? `  replicas:
  - name: loja
    count: 3
  images:
  - name: kubelearn/loja
    newTag: "1.1"
` : ''}`;
const configAzul = (cor) => yaml`
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: loja-config
  data:
    COR: ${cor}
`;
const kCor = (gerador) => (gerador ? yaml`
  apiVersion: kustomize.config.k8s.io/v1beta1
  kind: Kustomization
  resources:
  - deployment.yaml
  configMapGenerator:
  - name: loja-config
    literals:
    - COR=verde
` : yaml`
  apiVersion: kustomize.config.k8s.io/v1beta1
  kind: Kustomization
  resources:
  - deployment.yaml
  - configmap.yaml
`);

// ---------- CRD ----------
const CRD_BACKUP = yaml`
  apiVersion: apiextensions.k8s.io/v1
  kind: CustomResourceDefinition
  metadata:
    name: backups.kube-learn.dev
  spec:
    group: kube-learn.dev
    names:
      kind: Backup
      plural: backups
      singular: backup
      shortNames:
      - bkp
    scope: Namespaced
    versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required:
              - banco
              - horario
              properties:
                banco:
                  type: string
                  description: O banco de dados a copiar.
                horario:
                  type: string
                  description: Quando copiar, no formato do cron (minuto hora dia mês dia-da-semana).
                guardar:
                  type: integer
                  minimum: 1
                  default: 7
                  description: Quantas cópias guardar.
      additionalPrinterColumns:
      - name: Banco
        type: string
        jsonPath: .spec.banco
      - name: Horario
        type: string
        jsonPath: .spec.horario
      - name: Age
        type: date
        jsonPath: .metadata.creationTimestamp
`;
const OPERADOR = yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: operador-backup
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: operador-backup
    template:
      metadata:
        labels:
          app: operador-backup
      spec:
        containers:
        - name: operador
          image: kubelearn/operador-backup:1.0
`;
const backup = (certo) => (certo ? yaml`
  apiVersion: kube-learn.dev/v1
  kind: Backup
  metadata:
    name: noturno
  spec:
    banco: loja
    horario: "0 3 * * *"
    guardar: 3
` : yaml`
  apiVersion: kube-learn.dev/v1
  kind: Backup
  metadata:
    name: noturno
  spec:
    database: loja
    schedule: "0 3 * * *"
    keep: 3
`);

// ---------- GitOps ----------
const lojaGit = (replicas) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
  spec:
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
          image: kubelearn/loja:1.0
          ports:
          - containerPort: 8080
`;

/** Os clusters de partida deste nível (em clusters.js). */
export const PARTIDA10 = {
  corAzul: `${configAzul('azul')}---\n${deployLoja(true)}`,
  operador: `${CRD_BACKUP}---\n${OPERADOR}`,
  lojaGit: lojaGit(3),
};

export const NIVEL10 = [
  licao({
    id: 'n10-licao-helm',
    titulo: 'O projeto padrão da construtora: Helm',
    vidaReal: 'A construtora tem um projeto padrão de loja (o chart). Você só escolhe os acabamentos (os values): quantos atendentes, que versão, se tem balcão na rua. Cada obra entregue é uma release, com histórico.',
    limite: 'O projeto padrão só deixa mudar o que ele previu nos values: um acabamento que o chart não conhece é ignorado, sem aviso.',
    conteudo: `
      <p>Instalar uma aplicação de verdade costuma pedir vários manifestos (Deployment, Service, Ingress, ConfigMap...). O
         <b>Helm</b> empacota tudo num <b>chart</b>, com os pontos de ajuste num arquivo de <b>values</b>:</p>
      <pre><code>helm repo add kube-learn ${REPO_PADRAO}
helm show values kube-learn/loja            # o que dá para ajustar
helm install loja kube-learn/loja --set replicaCount=3
helm list                                   # as releases do namespace</code></pre>
      <ul>
        <li><b>Release</b>: uma instalação do chart, com nome (<code>loja</code>). Cada mudança é uma <b>revisão</b> nova.</li>
        <li><b>Values</b>: <code>--set chave=valor</code> ou <code>-f valores.yaml</code>. <code>helm get values loja</code>
            mostra o que você escolheu.</li>
        <li><code>helm upgrade loja kube-learn/loja --set image.tag=1.1</code>: revisão nova. Atenção: com valores novos,
            o upgrade parte dos padrões do chart; para manter os de antes, <code>--reuse-values</code>.</li>
        <li><code>helm rollback loja 1</code>: volta para a revisão 1 (e isso vira uma revisão nova). <code>helm history
            loja</code> mostra todas.</li>
        <li><code>helm template</code>: mostra os manifestos que o chart geraria, sem instalar nada.</li>
      </ul>
      <p>Muitos charts hoje ficam num <b>registry OCI</b>, o mesmo tipo de servidor das imagens. Aí não há
         <code>helm repo add</code>: o endereço vai direto no comando
         (<code>helm install loja oci://ghcr.io/empresa/charts/loja --version 1.2.0</code>). Neste simulador, só existe o
         repositório <code>kube-learn</code>.</p>
      <p>O Helm guarda cada revisão num Secret do namespace (<code>sh.helm.release.v1.loja.v1</code>...). Não apague esses
         Secrets: sem eles, o Helm esquece a release.</p>`,
  }),

  problema({
    id: 'n10-instalar',
    titulo: 'A primeira obra da construtora',
    dificuldade: 'facil',
    cluster: 'vazio',
    terminal: true,
    vidaReal: 'Cadastrar a construtora (o repositório) e encomendar o projeto padrão de loja.',
    limite: 'O repositório é só o catálogo: nada é instalado até o helm install.',
    enunciado: `
      <p><b>Pelo terminal</b>, acrescente o repositório <code>kube-learn</code>
         (<code>${REPO_PADRAO}</code>) e instale o chart <code>kube-learn/loja</code> com o nome de release
         <code>loja</code>.</p>`,
    comoSaber: '<code>helm list</code> mostra a release <code>loja</code> como <i>deployed</i>, e os 2 pods sobem.',
    dica: `helm repo add kube-learn ${REPO_PADRAO} e helm install loja kube-learn/loja`,
    solucaoTerminal: [`helm repo add kube-learn ${REPO_PADRAO}`, 'helm install loja kube-learn/loja'],
    testes: noCluster('a loja instalada pelo Helm', [
      { release: { nome: 'loja', status: 'deployed', revisao: 1 } },
      { pods: daLoja, prontos: 2 },
    ]),
  }),

  problema({
    id: 'n10-valores',
    titulo: 'Os acabamentos que o projeto ignorou',
    dificuldade: 'medio',
    cluster: 'helm-repo',
    terminal: true,
    vidaReal: 'Pediram "três atendentes e a versão 1.1" com os nomes errados no formulário: a construtora entregou o padrão, sem reclamar.',
    limite: 'O Helm não avisa de value desconhecido: confira sempre com helm show values (o que existe) e helm get values (o que foi usado).',
    enunciado: `
      <p>O <code>valores.yaml</code> pede 3 atendentes e a versão 1.1, mas com nomes que o chart não conhece. Veja os nomes
         certos (<code>helm show values kube-learn/loja</code>), conserte o arquivo e instale a release <code>loja</code>
         com ele (<code>-f valores.yaml</code>).</p>`,
    comoSaber: 'Três pods com a imagem <code>kubelearn/loja:1.1</code>.',
    dica: 'replicaCount: 3 e image: { tag: "1.1" }. Depois: helm install loja kube-learn/loja -f valores.yaml',
    inicial: { 'valores.yaml': 'replicas: 3\ntag: "1.1"\n' },
    solucao: { 'valores.yaml': 'replicaCount: 3\nimage:\n  tag: "1.1"\n' },
    solucaoTerminal: ['helm install loja kube-learn/loja -f valores.yaml'],
    testes: noCluster('três atendentes na versão 1.1', [
      { release: { nome: 'loja', status: 'deployed' } },
      { pods: daLoja, prontos: 3, imagem: 'kubelearn/loja:1.1' },
    ]),
  }),

  problema({
    id: 'n10-upgrade',
    titulo: 'Atualizar sem perder o que já foi escolhido',
    dificuldade: 'medio',
    cluster: 'helm-loja-4',
    terminal: true,
    vidaReal: 'A reforma pede só a versão nova, mas a ficha da obra foi preenchida do zero: os 4 atendentes que estavam combinados sumiram.',
    limite: 'Sem nenhum valor novo, o upgrade reaproveita os antigos; com qualquer --set ou -f, ele parte dos padrões do chart.',
    enunciado: `
      <p>A release <code>loja</code> foi instalada com <code>--set replicaCount=4</code>. Atualize para a versão
         <b>1.1</b> (<code>image.tag</code>) <b>mantendo as 4 réplicas</b>.</p>`,
    comoSaber: '<code>helm get values loja</code> mostra replicaCount 4 e a tag 1.1; há 4 pods na versão 1.1.',
    dica: 'helm upgrade loja kube-learn/loja --reuse-values --set image.tag=1.1 (ou repita o replicaCount=4).',
    solucaoTerminal: ['helm upgrade loja kube-learn/loja --reuse-values --set image.tag=1.1'],
    testes: noCluster('4 atendentes na versão 1.1', [
      { release: { nome: 'loja', status: 'deployed', revisao: 2 } },
      { pods: daLoja, prontos: 4, imagem: 'kubelearn/loja:1.1' },
    ]),
  }),

  problema({
    id: 'n10-rollback',
    titulo: 'Voltar a obra que funcionava',
    dificuldade: 'medio',
    cluster: 'helm-quebrado',
    terminal: true,
    vidaReal: 'A reforma de ontem deixou a loja caindo. A construtora guarda as plantas de cada entrega: é só pedir a anterior de volta.',
    limite: 'O rollback é uma revisão nova (a 3, igual à 1): o histórico nunca volta para trás, só para a frente.',
    enunciado: `
      <p>A revisão 2 da release <code>loja</code> trocou a imagem por uma versão com defeito. Pelo <b>Helm</b> (não pelo
         kubectl), volte para a revisão que funcionava.</p>`,
    comoSaber: '<code>helm history loja</code> mostra a revisão 3, <i>Rollback to 1</i>, e os pods voltam a ficar prontos.',
    dica: 'helm history loja e helm rollback loja 1',
    solucaoTerminal: ['helm rollback loja 1'],
    testes: noCluster('a loja voltou à revisão boa', [
      { release: { nome: 'loja', status: 'deployed', revisao: 3, descricao: 'Rollback to 1' } },
      { pods: daLoja, prontos: 2, imagem: 'kubelearn/loja:1.0' },
    ]),
  }),

  problema({
    id: 'n10-template',
    titulo: 'Olhar a planta antes de construir',
    dificuldade: 'facil',
    cluster: 'helm-repo',
    terminal: true,
    vidaReal: 'Pedir à construtora a planta impressa, com os acabamentos escolhidos, antes de assinar a obra.',
    limite: 'O template mostra o que seria criado, mas não confere se cabe no cluster: cota, permissões e nomes repetidos só aparecem no install.',
    enunciado: `
      <p>Sem instalar nada, veja o que o chart <code>kube-learn/loja</code> criaria com o Ingress ligado
         (<code>--set ingress.enabled=true</code>). Quantos objetos ele cria?</p>`,
    rotuloResposta: 'Quantos objetos',
    dica: 'helm template loja kube-learn/loja --set ingress.enabled=true (cada objeto começa com ---).',
    respostaCerta: '3',
    solucaoTerminal: ['helm template loja kube-learn/loja --set ingress.enabled=true'],
    testes: noCluster('você leu a planta', [{ comando: '^helm\\s+template\\s', msg: 'você usou o helm template' }, { resposta: /^(3|tr[eê]s)$/ }]),
  }),

  licao({
    id: 'n10-licao-kustomize',
    titulo: 'A mesma planta em cada cidade: Kustomize',
    vidaReal: 'A planta da loja é a mesma em todas as cidades; cada filial só anota os ajustes dela (quantos atendentes, que versão) numa folha à parte.',
    limite: 'O Kustomize só ajusta YAML que já existe: não tem lógica (se, para cada). Para isso, é o Helm.',
    conteudo: `
      <p>O <b>Kustomize</b> já vem no kubectl. Em vez de templates, ele parte de YAML comum (a <b>base</b>) e aplica
         <b>ajustes</b> listados num <code>kustomization.yaml</code>:</p>
      <pre><code>base/
  kustomization.yaml   # resources: [deployment.yaml, service.yaml]
  deployment.yaml
  service.yaml
overlays/prod/
  kustomization.yaml   # resources: [../../base] + os ajustes de produção</code></pre>
      <ul>
        <li><code>namespace</code>, <code>namePrefix</code>, <code>labels</code>: valem para todos os objetos.</li>
        <li><code>replicas</code> e <code>images</code> (<code>newTag</code>): o número de pods e a versão, sem patch.</li>
        <li><code>patches</code>: um pedaço de YAML mesclado por cima (ex.: os resources só em produção).</li>
        <li><code>configMapGenerator</code>: gera o ConfigMap com um <b>sufixo de hash</b>. Mudou o conteúdo, muda o nome,
            e o Deployment que usa é atualizado: os pods são trocados sozinhos.</li>
      </ul>
      <pre><code>kubectl kustomize overlays/prod     # mostra o resultado
kubectl apply -k overlays/prod      # aplica</code></pre>
      <p>No editor, as pastas aparecem no nome do arquivo (<code>overlays/prod/kustomization.yaml</code>).</p>`,
  }),

  problema({
    id: 'n10-kustomize-base',
    titulo: 'A base da planta',
    dificuldade: 'facil',
    cluster: 'vazio',
    vidaReal: 'A folha de rosto da planta lista as páginas e o carimbo que vai em todas. Esqueceram uma página e o carimbo.',
    limite: 'O Kustomize só lê o que está em resources: um arquivo esquecido na pasta simplesmente não existe para ele.',
    enunciado: `
      <p>O <code>kustomization.yaml</code> esqueceu o <code>service.yaml</code>. Acrescente-o em <code>resources</code> e
         ponha em todos os objetos a label <code>app.kubernetes.io/part-of: loja</code> (com <code>labels</code>).</p>`,
    comoSaber: '<code>kubectl kustomize .</code> mostra o Service, e os dois objetos com a label.',
    dica: 'labels: [{ pairs: { app.kubernetes.io/part-of: loja } }]',
    inicial: { 'kustomization.yaml': kBase(false), 'deployment.yaml': deployLoja(), 'service.yaml': svcLoja },
    solucao: { 'kustomization.yaml': kBase(true), 'deployment.yaml': deployLoja(), 'service.yaml': svcLoja },
    testes: [comK('.', 'a base completa, com o carimbo', [
      { semErros: true },
      { objeto: 'svc/loja', campo: 'metadata.labels["app.kubernetes.io/part-of"]', igual: 'loja' },
      { objeto: 'deployment/loja', campo: 'metadata.labels["app.kubernetes.io/part-of"]', igual: 'loja' },
    ], { esperar: '10s' })],
  }),

  problema({
    id: 'n10-overlay-prod',
    titulo: 'A filial de produção',
    dificuldade: 'medio',
    cluster: 'vazio',
    vidaReal: 'A filial grande usa a mesma planta, com mais atendentes e a versão nova, anotados na folha dela.',
    limite: 'O overlay não muda a base: as outras filiais (dev, homologação) continuam com o original.',
    enunciado: `
      <p>O overlay <code>overlays/prod</code> já põe tudo no namespace <code>prod</code> com o prefixo <code>prod-</code>.
         Acrescente nele: <b>3 réplicas</b> da loja (<code>replicas</code>) e a imagem na tag <b>1.1</b>
         (<code>images</code>), sem mexer na base.</p>`,
    comoSaber: '<code>kubectl kustomize overlays/prod</code> mostra o <code>prod-loja</code> com 3 réplicas e a imagem 1.1.',
    dica: 'replicas: [{ name: loja, count: 3 }] e images: [{ name: kubelearn/loja, newTag: "1.1" }] (pelo nome original, sem o prefixo).',
    inicial: {
      'base/kustomization.yaml': kBase(true), 'base/deployment.yaml': deployLoja(), 'base/service.yaml': svcLoja,
      'overlays/prod/kustomization.yaml': kProd(false), 'overlays/prod/namespace.yaml': 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: prod\n',
    },
    solucao: {
      'base/kustomization.yaml': kBase(true), 'base/deployment.yaml': deployLoja(), 'base/service.yaml': svcLoja,
      'overlays/prod/kustomization.yaml': kProd(true), 'overlays/prod/namespace.yaml': 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: prod\n',
    },
    testes: [
      comK('overlays/prod', 'produção com 3 réplicas da versão 1.1', [
        { semErros: true },
        { objeto: 'deployment/prod-loja', ns: 'prod', campo: 'spec.replicas', igual: 3 },
        { pods: 'app=loja', ns: 'prod', prontos: 3, imagem: 'kubelearn/loja:1.1' },
      ]),
      comK('base', 'a base continua igual (1 réplica, versão 1.0)', [
        { objeto: 'deployment/loja', campo: 'spec.replicas', igual: 1 },
        { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].image', igual: 'kubelearn/loja:1.0' },
      ], { oculto: true, esperar: '10s' }),
    ],
  }),

  problema({
    id: 'n10-gerador',
    titulo: 'Trocar a cor sem chamar ninguém',
    dificuldade: 'medio',
    cluster: 'loja-azul',
    vidaReal: 'Trocar o aviso do quadro não muda o que os atendentes já leram. Com um quadro novo (outro nome), todo mundo é avisado de que precisa ler de novo.',
    limite: 'Os ConfigMaps antigos (com o hash velho) ficam para trás: limpe de vez em quando, ou use o prune.',
    enunciado: `
      <p>A loja lê a cor de um ConfigMap (<code>COR=azul</code>). Mudar o ConfigMap para verde e aplicar não adianta: os pods
         que já estão rodando não releem as variáveis.</p>
      <p>Troque o <code>configmap.yaml</code> por um <b>configMapGenerator</b> com <code>COR=verde</code> no
         <code>kustomization.yaml</code>. O nome ganha um hash, o Deployment passa a apontar para ele, e os pods são
         trocados sozinhos.</p>`,
    comoSaber: 'Depois do <code>kubectl apply -k .</code>, os pods novos têm <code>COR=verde</code>.',
    dica: 'configMapGenerator: [{ name: loja-config, literals: [COR=verde] }] e tire o configmap.yaml dos resources.',
    inicial: { 'kustomization.yaml': kCor(false), 'deployment.yaml': deployLoja(true), 'configmap.yaml': configAzul('verde') },
    solucao: { 'kustomization.yaml': kCor(true), 'deployment.yaml': deployLoja(true), 'configmap.yaml': configAzul('verde') },
    testes: [comK('.', 'os pods novos estão verdes', [{ semErros: true }, { pods: 'app=loja', prontos: 2 }, { env: { pods: 'app=loja', nome: 'COR', igual: 'verde' } }])],
  }),

  licao({
    id: 'n10-licao-crd-gitops',
    titulo: 'Formulários novos e o fiscal do cartório',
    vidaReal: 'A administração aceita um formulário novo ("pedido de backup") e contrata um especialista que sabe atender esse pedido. E a planta oficial fica no cartório, com um fiscal que acerta a obra sozinho.',
    limite: 'O formulário sem especialista não faz nada: o CRD só ensina a API a guardar o pedido; quem age é o operador.',
    conteudo: `
      <h2>CRD e operador</h2>
      <p>Um <b>CustomResourceDefinition</b> ensina um tipo novo à API: depois dele, <code>kubectl get backups</code> funciona
         como <code>get pods</code>, com os campos validados pelo esquema do CRD. Mas o CRD só guarda. Quem age é um
         <b>operador</b>: um programa (num Deployment) que vigia esses objetos e faz o trabalho, criando CronJobs,
         StatefulSets ou o que for.</p>
      <pre><code>kubectl get crd
kubectl explain backup.spec       # os campos que o CRD aceita
kubectl get backups               # os objetos do tipo novo</code></pre>
      <h2>GitOps</h2>
      <p>No GitOps, o que vale é o que está no <b>git</b>: um controlador (Argo CD, Flux) aplica o repositório no cluster e,
         com o <i>self-heal</i>, desfaz qualquer mudança feita à mão. Para mudar, muda-se o git:</p>
      <pre><code>git add loja.yaml
git commit -m "loja com 5 atendentes"
git push</code></pre>
      <p>Neste simulador, o fiscal confere o repositório a cada 30 segundos (e logo depois de cada push).</p>`,
  }),

  problema({
    id: 'n10-crd',
    titulo: 'O formulário de backup',
    dificuldade: 'medio',
    cluster: 'operador-backup',
    vidaReal: 'O formulário de backup tem campos com nomes certos. Preenchido em inglês, com outros nomes, a administração devolve sem ler.',
    limite: 'A administração confere o formulário (o esquema), mas não o conteúdo: um horário que nunca acontece é aceito do mesmo jeito.',
    enunciado: `
      <p>O cluster tem o CRD <code>backups.kube-learn.dev</code> e o operador de backup rodando. Escreva o Backup
         <code>noturno</code>: banco <code>loja</code>, todo dia às 03:00 (<code>0 3 * * *</code>), guardando 3 cópias.
         O arquivo usa nomes de campo que o CRD não conhece: veja os certos com <code>kubectl explain backup.spec</code>.</p>`,
    comoSaber: '<code>kubectl get backups</code> mostra o noturno, e o operador cria o CronJob <code>backup-noturno</code>.',
    dica: 'spec: { banco: loja, horario: "0 3 * * *", guardar: 3 }',
    inicial: { 'backup.yaml': backup(false) },
    solucao: { 'backup.yaml': backup(true) },
    testes: [{ descricao: 'o backup noturno, e o operador criou o CronJob', passos: [{ comando: 'kubectl apply -f .' }, { avancar: '30s' }], regras: [
      { semErros: true },
      { objeto: 'backup/noturno', campo: 'spec.guardar', igual: 3 },
      { objeto: 'cronjob/backup-noturno', campo: 'spec.schedule', igual: '0 3 * * *', msg: 'o operador criou o CronJob backup-noturno' },
    ] }],
  }),

  problema({
    id: 'n10-gitops',
    titulo: 'Pelo cartório',
    dificuldade: 'medio',
    cluster: 'gitops-loja',
    terminal: true,
    vidaReal: 'A obra segue a planta registrada em cartório. Mudar a parede na mão não adianta: o fiscal passa e refaz como está na planta.',
    limite: 'O fiscal só corrige o que a planta declara: o que não está no git (um objeto criado à mão) ele não vê.',
    enunciado: `
      <p>A loja deste cluster é cuidada por GitOps: o <code>loja.yaml</code> do editor é o repositório. A gerente quer
         <b>5 atendentes</b>. Experimente <code>kubectl scale deployment loja --replicas=5</code>, espere uns 30 segundos
         (<b>+30s</b>) e veja o fiscal voltar para 3.</p>
      <p>Depois faça do jeito certo: mude o <code>loja.yaml</code>, faça o commit e o push.</p>`,
    comoSaber: 'Depois do push, o fiscal aplica e a loja fica com 5 pods (e fica, mesmo depois de 30 segundos).',
    dica: 'replicas: 5 no loja.yaml, e no terminal: git add loja.yaml, git commit -m "loja com 5 atendentes", git push',
    inicial: { 'loja.yaml': lojaGit(3) },
    solucao: { 'loja.yaml': lojaGit(5) },
    solucaoTerminal: ['git add loja.yaml', 'git commit -m "loja com 5 atendentes"', 'git push'],
    testes: noCluster('5 atendentes, pelo git', [
      { comando: '^git\\s+push\\b', msg: 'você fez o git push' },
      { objeto: 'deployment/loja', campo: 'spec.replicas', igual: 5 },
      { pods: 'app=loja', prontos: 5 },
    ]),
  }),
];
