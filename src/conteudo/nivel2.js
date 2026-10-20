// Nível 2: ReplicaSet e Deployment (manter réplicas e trocar de versão sem derrubar ninguém).
import { licao, problema, yaml } from './util.js';

const loja = ({ nome = 'loja', replicas = 3, versao = '1.0', estrategia = '', anotacoes = '', rotulo = nome } = {}) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: ${nome}
${anotacoes}    labels:
      app: ${nome}
  spec:
    replicas: ${replicas}
    selector:
      matchLabels:
        app: ${nome}
${estrategia}    template:
      metadata:
        labels:
          app: ${rotulo}
      spec:
        containers:
        - name: ${nome}
          image: kubelearn/loja:${versao}
          ports:
          - containerPort: 8080
`;

const rs = (replicas) => yaml`
  apiVersion: apps/v1
  kind: ReplicaSet
  metadata:
    name: suporte
  spec:
    replicas: ${replicas}
    selector:
      matchLabels:
        app: suporte
    template:
      metadata:
        labels:
          app: suporte
      spec:
        containers:
        - name: web
          image: nginx:1.27
`;

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const aplicar = (regras) => ({ descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [{ semErros: true }, ...regras] });

export const NIVEL2 = [
  licao({
    id: 'n2-licao-replicaset',
    titulo: 'O contrato: sempre N apartamentos ocupados',
    vidaReal: 'Um contrato que diz "sempre 3 apartamentos ocupados pela equipe de suporte": se um esvazia, a administração ocupa outro.',
    limite: 'O contrato confere só a etiqueta da porta (as labels): um apartamento estranho com a mesma etiqueta conta como "da equipe".',
    conteudo: `
      <p>Um pod solto (como os do nível anterior) <b>não volta</b> se for apagado ou se o node dele cair: ninguém pediu
         para ele existir de novo. Para isso existe o <b>ReplicaSet</b>: um contrato que diz "quero sempre N pods iguais".</p>
      <p>Ele tem três partes no <code>spec</code>:</p>
      <ul>
        <li><code>replicas</code>: quantos;</li>
        <li><code>selector</code>: como ele reconhece os pods dele (pelas labels);</li>
        <li><code>template</code>: o molde de cada pod novo (é um pod inteiro, sem o nome).</li>
      </ul>
      <p>O controlador (a Dona Conceição) compara o tempo todo: tem menos pods com aquelas labels? Cria. Tem mais? Apaga.
         Isso se chama <b>reconciliação</b>, e é o coração do Kubernetes.</p>
      <h2>A pegadinha das labels</h2>
      <p>O <code>selector</code> precisa casar com as labels do <code>template</code>: senão o ReplicaSet criaria pods que
         ele mesmo não reconhece, e o Kubernetes recusa o YAML. E se você tirar a label de um pod, o ReplicaSet "solta" esse
         pod e cria outro no lugar.</p>
      <p>Na prática, quase ninguém cria ReplicaSet à mão: quem cria é o <b>Deployment</b>, logo a seguir.</p>`,
  }),

  licao({
    id: 'n2-licao-deployment',
    titulo: 'Deployment: a reforma por etapas',
    vidaReal: 'A reforma por etapas: troca um apartamento por vez, sem fechar o condomínio, e guarda o projeto antigo para desfazer.',
    limite: 'Na reforma de verdade alguém confere se o apartamento novo ficou bom; aqui, sem uma readinessProbe (nível 6), "o programa subiu" já conta como pronto.',
    conteudo: `
      <p>O <b>Deployment</b> cuida de ReplicaSets por você. Quando o template muda (outra imagem, outra variável), ele cria
         um <b>ReplicaSet novo</b> e vai passando os pods do antigo para o novo, aos poucos: o <b>rolling update</b>.</p>
      <pre><code>deployment/loja
└── replicaset/loja-6fdbb7c54b   (o sufixo é um hash do template)
    ├── pod/loja-6fdbb7c54b-8m9n7
    ├── pod/loja-6fdbb7c54b-9zjrw
    └── pod/loja-6fdbb7c54b-s742d</code></pre>
      <p>Os comandos do dia a dia:</p>
      <ul>
        <li><code>kubectl rollout status deploy/loja</code>: acompanha a troca até o fim;</li>
        <li><code>kubectl rollout history deploy/loja</code>: as revisões (cada ReplicaSet antigo é uma);</li>
        <li><code>kubectl rollout undo deploy/loja</code>: volta para a revisão anterior;</li>
        <li><code>kubectl scale deploy/loja --replicas=5</code>: muda a quantidade (isso <b>não</b> cria revisão).</li>
      </ul>
      <p><b>Para concluir:</b> aplique o Deployment do editor e veja na aba 🌳 Recursos a árvore Deployment → ReplicaSet →
         Pods. Depois, ⬆ Entregar.</p>`,
    inicial: { 'loja.yaml': loja() },
  }),

  problema({
    id: 'n2-replicaset',
    titulo: 'Contrato de 3 apartamentos',
    dificuldade: 'facil',
    vidaReal: 'Trocar o apartamento avulso por um contrato: "sempre 3 do suporte".',
    limite: 'O ReplicaSet não troca versão: mudar o template não mexe nos pods que já existem. Para isso, Deployment.',
    enunciado: `
      <p>O pod <code>suporte</code> é avulso: se cair, não volta. Troque o arquivo por um <b>ReplicaSet</b> chamado
         <code>suporte</code>, com <b>3 réplicas</b>, que crie pods com a label <code>app: suporte</code> e o contêiner
         <code>web</code> (<code>nginx:1.27</code>).</p>
      <p>Depois, apague um dos pods e veja outro nascer.</p>`,
    dica: 'kind: ReplicaSet (apps/v1) · spec: replicas, selector.matchLabels, template (metadata.labels + spec)',
    manual: ['replicaset.spec'],
    inicial: {
      'suporte.yaml': yaml`
        # Um pod avulso: se ele cair, ninguém cria outro.
        apiVersion: v1
        kind: Pod
        metadata:
          name: suporte
          labels:
            app: suporte
        spec:
          containers:
          - name: web
            image: nginx:1.27
      `,
    },
    solucao: { 'suporte.yaml': rs(3) },
    testes: [
      aplicar([{ objeto: 'replicaset/suporte', campo: 'spec.replicas', igual: 3 }]),
      {
        oculto: true,
        descricao: 'os pods são apagados e o contrato recria os 3',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '30s' }, { comando: 'kubectl delete pods -l app=suporte' }, { avancar: '1m' }],
        regras: [{ pods: 'app=suporte', prontos: 3 }],
      },
    ],
  }),

  problema({
    id: 'n2-deployment',
    titulo: 'Do apartamento avulso ao Deployment',
    dificuldade: 'facil',
    vidaReal: 'A loja deixa de ser um apartamento avulso e ganha um contrato com reforma por etapas.',
    limite: 'O Deployment cuida dos pods, não dos dados: se a loja guardasse arquivos dentro do contêiner, eles sumiriam a cada troca.',
    enunciado: `
      <p>Transforme o pod avulso da loja num <b>Deployment</b> chamado <code>loja</code>, com <b>3 réplicas</b> da imagem
         <code>kubelearn/loja:1.0</code> (label <code>app: loja</code>, porta <code>8080</code>).</p>`,
    comoSaber: '<code>kubectl get deploy loja</code> mostra <code>3/3</code>, e a aba 🌳 Recursos mostra a árvore.',
    dica: 'kind: Deployment (apps/v1). O template é o pod de antes, sem o metadata.name.',
    manual: ['deployment.spec'],
    inicial: {
      'loja.yaml': yaml`
        apiVersion: v1
        kind: Pod
        metadata:
          name: loja
          labels:
            app: loja
        spec:
          containers:
          - name: loja
            image: kubelearn/loja:1.0
            ports:
            - containerPort: 8080
      `,
    },
    solucao: { 'loja.yaml': loja() },
    testes: [
      aplicar([{ objeto: 'deployment/loja', campo: 'spec.replicas', igual: 3 }]),
      {
        oculto: true,
        descricao: 'um pod cai e o Deployment repõe',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '30s' }, { comando: 'kubectl delete pods -l app=loja' }, { avancar: '1m' }],
        regras: [{ pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.0' }],
      },
    ],
  }),

  problema({
    id: 'n2-seletor-torto',
    titulo: 'A etiqueta não bate com o contrato',
    dificuldade: 'medio',
    vidaReal: 'O contrato diz "equipe: loja", mas as plaquinhas das portas dizem "lojinha": a fiscal nunca acharia os apartamentos.',
    limite: 'Aqui o porteiro recusa o pedido na hora; com ReplicaSets criados à mão, um seletor largo demais pode "adotar" pods de outros.',
    enunciado: `
      <p>Este Deployment é recusado ao aplicar. Leia o erro (e a caixa 🏠 embaixo dele) e conserte o YAML, mantendo o
         seletor <code>app: loja</code>.</p>`,
    dica: 'spec.selector.matchLabels precisa estar contido em spec.template.metadata.labels.',
    inicial: { 'loja.yaml': loja({ rotulo: 'lojinha' }) },
    solucao: { 'loja.yaml': loja() },
    testes: [
      aplicar([]),
      { oculto: true, descricao: 'os 3 pods sobem', regras: [{ pods: 'app=loja', prontos: 3 }] },
    ],
  }),

  problema({
    id: 'kubectl-escalar',
    titulo: 'Black Friday: mais réplicas pelo terminal',
    dificuldade: 'facil',
    cluster: 'loja-3-replicas',
    terminal: true,
    vidaReal: 'Contratar temporários para a Black Friday: o contrato passa de 3 para 5 apartamentos ocupados, e a administração providencia o resto.',
    limite: 'Aqui você muda o número na mão. Para acompanhar o movimento sozinho, existe o HPA (nível 6).',
    enunciado: '<p>A Black Friday chegou. Deixe a <code>deployment/loja</code> com <b>5 réplicas</b>, usando <b>só o terminal</b> (sem editar YAML).</p>',
    comoSaber: '<code>kubectl get deploy loja</code> mostra <code>5/5</code>.',
    dica: 'kubectl scale deployment loja --replicas=...',
    manual: ['deployment.spec.replicas'],
    solucaoTerminal: ['kubectl scale deployment loja --replicas=5'],
    testes: noCluster('a loja tem 5 réplicas prontas', [
      { comando: '^kubectl\\s+scale\\b', msg: 'você usou o kubectl scale' },
      { objeto: 'deployment/loja', campo: 'spec.replicas', igual: 5 },
      { pods: 'app=loja', prontos: 5 },
    ]),
  }),

  problema({
    id: 'n2-autocura',
    titulo: 'Volta sozinho',
    dificuldade: 'facil',
    cluster: 'loja-3-replicas',
    terminal: true,
    vidaReal: 'Esvaziou um apartamento do contrato? A fiscal percebe e ocupa outro na hora.',
    limite: 'O pod que volta é outro: nome novo, IP novo, nada do que estava dentro do antigo.',
    enunciado: `
      <p>Apague pods da loja (um, ou todos de uma vez com <code>-l app=loja</code>) e acompanhe com
         <code>kubectl get pods -w</code> ou na aba 🗺️ Mapa. Quantos pods prontos a loja tem quando tudo se acalma?</p>`,
    rotuloResposta: 'Quantos pods prontos?',
    dica: 'kubectl delete pod NOME (ou -l app=loja)',
    respostaCerta: '3',
    solucaoTerminal: ['kubectl delete pods -l app=loja'],
    testes: noCluster('a loja se recuperou', [
      { comando: '^kubectl\\s+delete\\s+(pods?|po)\\b', msg: 'você apagou pods da loja' },
      { pods: 'app=loja', prontos: 3 },
      { resposta: '3' },
    ]),
  }),

  problema({
    id: 'deploy-rolling-sem-indisponibilidade',
    titulo: 'Atualizar sem derrubar ninguém',
    dificuldade: 'medio',
    cluster: 'loja-3-replicas',
    vidaReal: 'Uma reforma por etapas: abre o apartamento novo, espera ficar pronto e só então fecha o antigo. O condomínio nunca fica sem atendimento.',
    limite: 'Na reforma de verdade alguém confere se o apartamento ficou bom. Aqui, sem uma readinessProbe, o Kubernetes acha que "subiu" = "pronto".',
    enunciado: `
      <p>A loja está rodando a versão <code>1.0</code> com 3 réplicas. Chegou a <code>1.1</code>.</p>
      <ul>
        <li>troque a imagem para <code>kubelearn/loja:1.1</code>;</li>
        <li>e garanta que <b>nenhum pod</b> fique indisponível durante a troca:
          <code>maxUnavailable: 0</code> (pode criar <b>1</b> pod a mais por vez: <code>maxSurge: 1</code>).</li>
      </ul>
      <p>Depois de aplicar, acompanhe no terminal: <code>kubectl get pods -w</code> ou
         <code>kubectl rollout status deploy/loja</code>.</p>`,
    comoSaber: 'Os 3 pods novos ficam prontos e, durante a troca, nunca há menos de 3 pods atendendo.',
    dica: 'Em spec: strategy → rollingUpdate → maxSurge: 1 e maxUnavailable: 0.',
    manual: ['deployment.spec.strategy', 'deployment.spec.strategy.rollingUpdate'],
    inicial: { 'loja.yaml': loja() },
    solucao: { 'loja.yaml': loja({ versao: '1.1', estrategia: '    strategy:\n      rollingUpdate:\n        maxSurge: 1\n        maxUnavailable: 0\n' }) },
    testes: [
      aplicar([
        { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].image', igual: 'kubelearn/loja:1.1' },
        { objeto: 'deployment/loja', campo: 'spec.strategy.rollingUpdate.maxUnavailable', igual: 0 },
      ]),
      {
        oculto: true,
        descricao: 'rollout completo, sem ninguém indisponível',
        regras: [
          { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.1' },
          { rollout: 'deployment/loja', minDisponivel: 3 },
        ],
      },
    ],
  }),

  problema({
    id: 'n2-set-image',
    titulo: 'A versão nova pelo terminal',
    dificuldade: 'facil',
    cluster: 'loja-3-replicas',
    terminal: true,
    vidaReal: 'Mandar a reforma pelo interfone: "troquem o modelo dos apartamentos da loja para o 1.1".',
    limite: 'Mudança pelo terminal não fica no arquivo: no próximo apply do YAML antigo, a versão volta para a 1.0.',
    enunciado: `
      <p>Atualize a loja para <code>kubelearn/loja:1.1</code> pelo terminal (o contêiner se chama <code>loja</code>) e
         acompanhe até o fim com <code>kubectl rollout status</code>.</p>`,
    dica: 'kubectl set image deployment/loja loja=...',
    solucaoTerminal: ['kubectl set image deployment/loja loja=kubelearn/loja:1.1', 'kubectl rollout status deployment/loja'],
    testes: noCluster('a loja está na 1.1', [
      { comando: '^kubectl\\s+set\\s+image\\b', msg: 'você usou o kubectl set image' },
      { comando: 'rollout\\s+status', msg: 'você acompanhou com rollout status' },
      { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.1' },
    ]),
  }),

  problema({
    id: 'n2-rollback',
    titulo: 'A reforma deu errado',
    dificuldade: 'medio',
    cluster: 'loja-bugada',
    terminal: true,
    vidaReal: 'O apartamento novo ficou inabitável: a reforma para e você manda desfazer, voltando ao projeto anterior.',
    limite: 'O rollback volta o template dos pods; se a versão nova tivesse mudado um banco de dados, isso não voltaria junto.',
    enunciado: `
      <p>Alguém atualizou a loja para a <code>2.0-bugada</code>. O pod novo cai sem parar (veja o
         <code>kubectl get pods</code> e o <code>kubectl logs ... --previous</code>), mas os 3 pods antigos seguram as pontas,
         graças ao rolling update.</p>
      <p>Volte para a versão anterior.</p>`,
    comoSaber: 'Os 3 pods da loja voltam a ser da 1.0, sem nenhum em CrashLoopBackOff.',
    dica: 'kubectl rollout undo deployment/...',
    solucaoTerminal: ['kubectl rollout undo deployment/loja'],
    testes: noCluster('a loja voltou para a 1.0', [
      { comando: 'rollout\\s+undo', msg: 'você desfez com rollout undo' },
      { pods: 'app=loja', quantidade: 3, prontos: 3, imagem: 'kubelearn/loja:1.0' },
    ]),
  }),

  problema({
    id: 'n2-historico',
    titulo: 'Voltar duas casas',
    dificuldade: 'medio',
    cluster: 'loja-historico',
    terminal: true,
    vidaReal: 'Olhar o livro de reformas e escolher para qual projeto antigo voltar.',
    limite: 'O livro guarda só as últimas reformas (revisionHistoryLimit, 10 por padrão): as mais antigas são apagadas.',
    enunciado: `
      <p>A loja já passou por três versões. O cliente reclamou da atual e a anterior também tem problema. Veja o histórico
         e volte para a revisão da <b>abertura da loja</b>.</p>`,
    comoSaber: 'Os pods voltam para <code>kubelearn/loja:1.0</code>.',
    dica: 'kubectl rollout history ... e kubectl rollout undo ... --to-revision=N',
    solucaoTerminal: ['kubectl rollout history deployment/loja', 'kubectl rollout undo deployment/loja --to-revision=1'],
    testes: noCluster('a loja voltou para a abertura', [
      { comando: 'rollout\\s+history', msg: 'você olhou o histórico' },
      { comando: 'rollout\\s+undo.*--to-revision', msg: 'você escolheu a revisão com --to-revision' },
      { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.0' },
    ]),
  }),

  problema({
    id: 'n2-change-cause',
    titulo: 'Anote o motivo da reforma',
    dificuldade: 'medio',
    cluster: 'loja-3-replicas',
    vidaReal: 'Escrever no livro de reformas por que cada uma foi feita.',
    limite: 'A anotação é só um texto: ninguém confere se o motivo é verdade.',
    enunciado: `
      <p>Atualize a loja para <code>kubelearn/loja:1.1</code> e deixe registrado o motivo, na anotação
         <code>kubernetes.io/change-cause</code> do Deployment, com o texto <code>versao 1.1: carrinho novo</code>.</p>
      <p>Depois, <code>kubectl rollout history deploy/loja</code> mostra o motivo na coluna CHANGE-CAUSE.</p>`,
    dica: 'metadata.annotations: { kubernetes.io/change-cause: "..." } (entre aspas, por causa dos dois-pontos)',
    manual: ['deployment.metadata.annotations'],
    inicial: { 'loja.yaml': loja() },
    solucao: { 'loja.yaml': loja({ versao: '1.1', anotacoes: '    annotations:\n      kubernetes.io/change-cause: "versao 1.1: carrinho novo"\n' }) },
    testes: [
      aplicar([
        { objeto: 'deployment/loja', campo: 'metadata.annotations["kubernetes.io/change-cause"]', igual: 'versao 1.1: carrinho novo' },
        { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].image', igual: 'kubelearn/loja:1.1' },
      ]),
      {
        oculto: true,
        descricao: 'o histórico mostra o motivo',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '1m' }, { comando: 'kubectl rollout history deployment/loja' }],
        regras: [{ pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.1' }],
      },
    ],
  }),

  problema({
    id: 'n2-recreate',
    titulo: 'Reforma geral: fecha tudo e reabre',
    dificuldade: 'medio',
    cluster: 'relatorio',
    vidaReal: 'Uma reforma que exige fechar o andar inteiro: não dá para ter o projeto antigo e o novo funcionando juntos.',
    limite: 'Fechar tudo tem preço: durante a troca, ninguém atende. Use só quando as duas versões juntas quebram algo.',
    enunciado: `
      <p>O gerador de relatórios grava num arquivo que <b>duas versões não podem usar ao mesmo tempo</b>. Atualize-o para
         <code>nginx:1.28</code> de um jeito que os pods antigos saiam <b>todos</b> antes dos novos entrarem.</p>`,
    dica: 'spec.strategy.type: Recreate',
    manual: ['deployment.spec.strategy'],
    inicial: {
      'relatorio.yaml': yaml`
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
                image: nginx:1.27
      `,
    },
    solucao: {
      'relatorio.yaml': yaml`
        apiVersion: apps/v1
        kind: Deployment
        metadata:
          name: relatorio
        spec:
          replicas: 2
          strategy:
            type: Recreate
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
                image: nginx:1.28
      `,
    },
    testes: [
      aplicar([
        { objeto: 'deployment/relatorio', campo: 'spec.strategy.type', igual: 'Recreate' },
        { objeto: 'deployment/relatorio', campo: 'spec.template.spec.containers[0].image', igual: 'nginx:1.28' },
      ]),
      {
        oculto: true,
        descricao: 'as duas versões nunca rodaram juntas',
        regras: [{ rollout: 'deployment/relatorio', semMistura: true }, { pods: 'app=relatorio', prontos: 2, imagem: 'nginx:1.28' }],
      },
    ],
  }),

  problema({
    id: 'n2-maxsurge',
    titulo: 'Reforma relâmpago',
    dificuldade: 'dificil',
    cluster: 'loja-4-replicas',
    vidaReal: 'Abrir de uma vez todos os apartamentos novos ao lado dos antigos e só depois fechar os antigos: rápido, mas exige espaço sobrando.',
    limite: 'O espaço extra é de verdade: por um tempo, o cluster precisa caber o dobro de pods. Num cluster apertado, os novos ficariam Pending.',
    enunciado: `
      <p>Hoje a loja tem <b>4 réplicas</b> e a <code>1.1</code> precisa entrar <b>o mais rápido possível</b>, sem
         nunca ficar com menos de 4 pods prontos.</p>
      <p>Ajuste a estratégia para criar <b>todos</b> os pods novos de uma vez e só então tirar os antigos, e troque a imagem.</p>`,
    comoSaber: 'A troca acontece em poucos segundos e nunca há menos de 4 pods prontos.',
    dica: 'maxSurge aceita número ou porcentagem: 100% de 4 é 4. E maxUnavailable: 0.',
    manual: ['deployment.spec.strategy.rollingUpdate'],
    inicial: { 'loja.yaml': loja({ replicas: 4 }) },
    solucao: { 'loja.yaml': loja({ replicas: 4, versao: '1.1', estrategia: '    strategy:\n      rollingUpdate:\n        maxSurge: 100%\n        maxUnavailable: 0\n' }) },
    testes: [
      aplicar([{ objeto: 'deployment/loja', campo: 'spec.strategy.rollingUpdate.maxUnavailable', igual: 0 }]),
      {
        oculto: true,
        descricao: 'em 5 segundos, as 4 réplicas novas estão prontas, sem nenhum buraco',
        passos: [{ comando: 'kubectl apply -f .' }, { avancar: '5s' }],
        regras: [{ pods: 'app=loja', prontos: 4, imagem: 'kubelearn/loja:1.1' }, { rollout: 'deployment/loja', minDisponivel: 4 }],
      },
    ],
  }),
];
