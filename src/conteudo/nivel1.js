// Nível 1: o cluster por dentro, o kubectl e os Pods.
import { licao, problema, yaml } from './util.js';

const podSimples = (nome, imagem, extra = '', conteiner = nome) => yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: ${nome}
${extra}  spec:
    containers:
    - name: ${conteiner}
      image: ${imagem}
`;

/** Teste das missões de terminal: confere no cluster do próprio aluno. */
const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];

export const NIVEL1 = [
  licao({
    id: 'n1-licao-condominio',
    titulo: 'O condomínio por dentro',
    vidaReal: 'O cluster é um condomínio: vários prédios (nodes) e uma administração (o control plane) que cuida de tudo.',
    limite: 'Num condomínio de verdade, cada morador escolhe o prédio. Aqui quem escolhe é a administração, e o apartamento (pod) nunca muda de prédio: se o prédio cai, nasce outro apartamento em outro lugar.',
    conteudo: `
      <p>Um cluster Kubernetes é um <b>condomínio</b>: vários <b>prédios</b> (os <b>nodes</b>, as máquinas) e uma
         <b>administração</b> (o <b>control plane</b>). Os <b>apartamentos</b> são os <b>pods</b>: onde os contêineres moram.</p>
      <h2>A administração (e quem trabalha nela)</h2>
      <p>Para decorar, cada componente virou um personagem cujo nome começa como o dele:</p>
      <table class="tabela-simples">
        <thead><tr><th>Personagem</th><th>Componente</th><th>O que faz</th></tr></thead>
        <tbody>
          <tr><td>Seu <b>Apo</b>linário, o porteiro</td><td><b>API</b> Server</td><td>Todo pedido passa por ele: o seu (pelo kubectl) e o dos outros componentes. Ele confere e anota.</td></tr>
          <tr><td>Dona <b>Et</b>elvina, a arquivista</td><td><b>et</b>cd</td><td>Guarda o livro com tudo: o que existe, como deveria estar, quem mora onde.</td></tr>
          <tr><td><b>Sh</b>irley, a corretora</td><td><b>Sch</b>eduler</td><td>Escolhe em qual prédio cada apartamento novo vai ficar, conforme o espaço.</td></tr>
          <tr><td>Dona <b>Con</b>ceição, a fiscal</td><td><b>Con</b>troller manager</td><td>Compara o desejado com o real, o tempo todo, e manda corrigir a diferença.</td></tr>
          <tr><td><b>K</b>leber, o zelador</td><td><b>k</b>ubelet</td><td>Um em cada prédio: cria e vigia os contêineres dos apartamentos dele.</td></tr>
        </tbody>
      </table>
      <h2>O caminho de um pedido</h2>
      <ol>
        <li>Você pede pelo interfone (<code>kubectl</code>) ao Seu Apolinário: "quero um pod com o nginx".</li>
        <li>Ele confere o pedido e anota no livro da Dona Etelvina.</li>
        <li>A Shirley vê um apartamento sem prédio e escolhe um com espaço.</li>
        <li>O Kleber daquele prédio vê o apartamento novo, baixa a imagem e liga o contêiner.</li>
      </ol>
      <p>No simulador, a administração mora no node <code>control-plane</code>. Veja com
         <code>kubectl get pods -n kube-system</code>: lá estão o etcd, o API Server, o scheduler e o controller manager.</p>`,
  }),

  licao({
    id: 'n1-licao-pod-yaml',
    titulo: 'Anatomia de um YAML',
    vidaReal: 'O manifesto é a planta do apartamento: diz como ele deve ser, não como construir.',
    limite: 'Uma planta errada pode ser recusada pelo porteiro (campo que não existe) ou aceita e dar problema depois (imagem que não existe).',
    conteudo: `
      <p>Tudo no Kubernetes é descrito num <b>manifesto</b> (YAML) com quatro partes:</p>
      <ul>
        <li><code>apiVersion</code>: a versão da API (Pod é <code>v1</code>; Deployment é <code>apps/v1</code>);</li>
        <li><code>kind</code>: o tipo do objeto;</li>
        <li><code>metadata</code>: o nome, o namespace e as labels;</li>
        <li><code>spec</code>: como você quer que seja.</li>
      </ul>
      <p>Depois de aplicado, o objeto ganha mais uma parte, o <code>status</code>, que o próprio cluster escreve: é o
         "como está agora". Compare <code>kubectl get pod ola -o yaml</code> com o arquivo do editor.</p>
      <p>No YAML, o <b>recuo</b> (2 espaços, nunca TAB) diz quem está dentro de quem, e o <code>-</code> começa um item de
         lista (cada contêiner é um item de <code>containers</code>).</p>
      <p><b>Para concluir:</b> clique em ▶ Aplicar e depois em ⬆ Entregar. Experimente também <code>kubectl get pods</code>
         e <code>kubectl describe pod ola</code>.</p>`,
    inicial: {
      'ola.yaml': yaml`
        apiVersion: v1            # a versão da API onde mora o tipo Pod
        kind: Pod                 # o tipo do objeto
        metadata:
          name: ola               # o nome (único no namespace)
          labels:
            app: ola              # etiquetas para achar o pod depois
        spec:
          containers:             # a lista de contêineres do pod
          - name: web             # cada contêiner começa com "-"
            image: nginx:1.27     # a imagem (sempre com tag!)
            ports:
            - containerPort: 80   # informativo: a porta onde o programa ouve
      `,
    },
  }),

  licao({
    id: 'n1-licao-kubectl',
    titulo: 'kubectl: o interfone com a portaria',
    vidaReal: 'O kubectl é o interfone: você fala com a portaria (API Server), nunca direto com os prédios.',
    limite: 'O interfone só funciona se você souber o nome certo do morador (e da empresa: o namespace).',
    conteudo: `
      <p>Os comandos que você vai usar todo dia:</p>
      <table class="tabela-simples">
        <thead><tr><th>Comando</th><th>Para quê</th></tr></thead>
        <tbody>
          <tr><td><code>kubectl get pods</code></td><td>Lista (acrescente <code>-o wide</code> para ver IP e node, <code>-A</code> para todos os namespaces).</td></tr>
          <tr><td><code>kubectl describe pod NOME</code></td><td>A ficha completa, com as <b>Events</b> no fim: o livro de ocorrências.</td></tr>
          <tr><td><code>kubectl logs NOME</code></td><td>O diário do contêiner (o que o programa escreveu).</td></tr>
          <tr><td><code>kubectl exec NOME -- COMANDO</code></td><td>Roda um comando dentro do contêiner (entrar no apartamento).</td></tr>
          <tr><td><code>kubectl apply -f ARQUIVO</code></td><td>Cria ou atualiza a partir da planta (YAML).</td></tr>
          <tr><td><code>kubectl delete pod NOME</code></td><td>Apaga.</td></tr>
          <tr><td><code>kubectl explain pod.spec</code></td><td>O manual de cada campo.</td></tr>
        </tbody>
      </table>
      <h2>Lendo o <code>kubectl get pods</code></h2>
      <pre><code>NAME   READY   STATUS    RESTARTS   AGE
web    1/1     Running   0          2m</code></pre>
      <ul>
        <li><b>READY</b>: contêineres prontos / total do pod.</li>
        <li><b>STATUS</b>: Running, Pending (sem lugar ainda), ContainerCreating, CrashLoopBackOff (caindo e voltando),
            ImagePullBackOff (imagem não baixou)...</li>
        <li><b>RESTARTS</b>: quantas vezes o contêiner reiniciou. Número subindo é sinal de problema.</li>
        <li><b>AGE</b>: há quanto tempo o pod existe.</li>
      </ul>
      <p>No terminal deste site, a tecla <b>Tab</b> completa comandos e nomes, e <b>↑</b> repete o comando anterior.</p>`,
  }),

  problema({
    id: 'n1-quantos-nodes',
    titulo: 'Quantos prédios tem o condomínio?',
    dificuldade: 'facil',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: 'Contar os prédios do condomínio, incluindo o da administração.',
    limite: 'Prédios de condomínio não somem; nodes entram e saem do cluster (e, na nuvem, podem ser criados sob demanda).',
    enunciado: '<p>Use o terminal para descobrir <b>quantos nodes</b> o cluster tem, contando o control plane. Escreva o número no campo abaixo.</p>',
    rotuloResposta: 'Quantos nodes?',
    dica: 'kubectl get nodes',
    respostaCerta: '3',
    solucaoTerminal: ['kubectl get nodes'],
    testes: noCluster('você contou os nodes', [
      { comando: '^kubectl\\s+get\\s+(nodes|node|no)\\b', msg: 'você listou os nodes' },
      { resposta: '3' },
    ]),
  }),

  problema({
    id: 'n1-primeiro-pod',
    titulo: 'Pedra fundamental: o primeiro pod',
    dificuldade: 'facil',
    vidaReal: 'O primeiro apartamento do condomínio: um endereço com um morador dentro.',
    limite: 'Um apartamento solto, sem contrato (Deployment), não é refeito se sumir. No próximo andar você vê como resolver isso.',
    enunciado: `
      <p>Complete o arquivo para criar um <b>Pod</b>:</p>
      <ul>
        <li>chamado <code>recepcao</code>;</li>
        <li>com um contêiner chamado <code>web</code>, da imagem <code>nginx:1.27</code>.</li>
      </ul>`,
    comoSaber: '<code>kubectl get pod recepcao</code> mostra <code>1/1 Running</code>.',
    dica: 'kind: Pod · metadata.name · spec.containers: - name / image',
    manual: ['pod.spec.containers'],
    inicial: {
      'recepcao.yaml': yaml`
        apiVersion: v1
        kind: Pod
        metadata:
          name: # o nome do pod
        spec:
          containers:
          # - name: ...
          #   image: ...
      `,
    },
    solucao: { 'recepcao.yaml': podSimples('recepcao', 'nginx:1.27', '', 'web') },
    testes: [
      { descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [
        { semErros: true },
        { objeto: 'pod/recepcao', campo: 'spec.containers[0].name', igual: 'web' },
        { objeto: 'pod/recepcao', campo: 'spec.containers[0].image', igual: 'nginx:1.27' },
      ] },
      { oculto: true, descricao: 'o pod fica Running', regras: [{ objeto: 'pod/recepcao', campo: 'status.phase', igual: 'Running' }] },
    ],
  }),

  problema({
    id: 'n1-kubectl-run',
    titulo: 'Um pod direto pelo interfone',
    dificuldade: 'facil',
    terminal: true,
    vidaReal: 'Pedir um apartamento por telefone, sem desenhar a planta: rápido para testar.',
    limite: 'Pedido por telefone não fica registrado em arquivo: para repetir amanhã, ou em outro cluster, a planta (YAML) é melhor.',
    enunciado: '<p>Sem escrever YAML, crie pelo terminal um pod chamado <code>porteiro</code> com a imagem <code>httpd:2.4</code>.</p>',
    comoSaber: '<code>kubectl get pod porteiro</code> mostra Running.',
    dica: 'kubectl run NOME --image=IMAGEM',
    solucaoTerminal: ['kubectl run porteiro --image=httpd:2.4'],
    testes: noCluster('o pod porteiro está rodando', [
      { comando: '^kubectl\\s+run\\b', msg: 'você usou o kubectl run' },
      { objeto: 'pod/porteiro', campo: 'spec.containers[0].image', igual: 'httpd:2.4' },
      { objeto: 'pod/porteiro', campo: 'status.phase', igual: 'Running' },
    ]),
  }),

  problema({
    id: 'n1-em-que-node',
    titulo: 'Em que prédio mora o mistério?',
    dificuldade: 'facil',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: 'Descobrir em qual prédio do condomínio fica um apartamento.',
    limite: 'Aqui o "prédio" foi escolhido pela corretora (o scheduler), não pelo morador. Para mandar num prédio específico há regras próprias (nível 7).',
    enunciado: '<p>O pod <code>misterio</code> está rodando em algum node. Descubra <b>qual</b> e escreva o nome do node.</p>',
    rotuloResposta: 'Nome do node',
    dica: 'O -o wide acrescenta as colunas IP e NODE. O describe também mostra.',
    respostaCerta: (c) => c.obter('Pod', 'default', 'misterio').spec.nodeName,
    solucaoTerminal: ['kubectl get pod misterio -o wide'],
    testes: noCluster('você achou o node', [
      { comando: '-o\\s*=?\\s*wide|describe', msg: 'você olhou o node no kubectl (-o wide ou describe)' },
      { resposta: { de: 'pod/misterio', campo: 'spec.nodeName' } },
    ]),
  }),

  problema({
    id: 'n1-diario',
    titulo: 'Leia o diário de obra',
    dificuldade: 'facil',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: 'O diário de obra: tudo que aconteceu fica anotado ali.',
    limite: 'O diário do contêiner some quando o pod é apagado. Para guardar de verdade, os logs são mandados para outro lugar.',
    enunciado: '<p>O pod <code>diario</code> anota tudo no log. Uma das anotações tem a <b>senha do Wi-Fi da obra</b>. Qual é?</p>',
    rotuloResposta: 'A senha',
    dica: 'kubectl logs NOME',
    respostaCerta: 'tijolo-azul-42',
    solucaoTerminal: ['kubectl logs diario'],
    testes: noCluster('você achou a senha', [
      { comando: '^kubectl\\s+logs\\b', msg: 'você leu os logs' },
      { resposta: 'tijolo-azul-42' },
    ]),
  }),

  problema({
    id: 'n1-cofre',
    titulo: 'Entre no apartamento e abra o cofre',
    dificuldade: 'medio',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: 'Entrar no apartamento para olhar uma gaveta.',
    limite: 'Mexer dentro do contêiner é bom para investigar, mas o que você muda lá some quando o pod é recriado.',
    enunciado: `
      <p>Dentro do contêiner do pod <code>cofre</code>, na pasta <code>/cofre</code>, há um arquivo com a combinação.
         Descubra qual é.</p>
      <p>Você pode rodar um comando só (<code>kubectl exec cofre -- ls /cofre</code>) ou abrir um shell
         (<code>kubectl exec -it cofre -- sh</code>, e <code>exit</code> para sair).</p>`,
    rotuloResposta: 'A combinação',
    dica: 'kubectl exec cofre -- cat /cofre/...',
    respostaCerta: '7-3-9',
    solucaoTerminal: ['kubectl exec cofre -- ls /cofre', 'kubectl exec cofre -- cat /cofre/combinacao.txt'],
    testes: noCluster('você abriu o cofre', [
      { comando: '^kubectl\\s+exec\\b', msg: 'você entrou no contêiner (kubectl exec)' },
      { resposta: '7-3-9' },
    ]),
  }),

  problema({
    id: 'n1-labels',
    titulo: 'Plaquinhas na porta',
    dificuldade: 'facil',
    vidaReal: 'Etiquetas na porta dizem de quem é o apartamento: "equipe: vendas".',
    limite: 'Etiquetas não são únicas: vários apartamentos podem ter a mesma, e quem procura pela etiqueta leva todos.',
    enunciado: `
      <p>O pod <code>balcao</code> precisa de duas labels:</p>
      <ul><li><code>app: loja</code></li><li><code>time: vendas</code></li></ul>
      <p>Depois de aplicar, teste a busca por label: <code>kubectl get pods -l time=vendas</code>.</p>`,
    dica: 'metadata.labels é um mapa: chave: valor, uma por linha.',
    manual: ['pod.metadata.labels'],
    inicial: { 'balcao.yaml': podSimples('balcao', 'nginx:1.27') },
    solucao: { 'balcao.yaml': podSimples('balcao', 'nginx:1.27', '    labels:\n      app: loja\n      time: vendas\n') },
    testes: [
      { descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [
        { semErros: true },
        { objeto: 'pod/balcao', campo: 'metadata.labels.app', igual: 'loja' },
        { objeto: 'pod/balcao', campo: 'metadata.labels.time', igual: 'vendas' },
      ] },
      { oculto: true, descricao: 'a busca por label acha o pod', regras: [{ pods: 'app=loja,time=vendas', quantidade: 1 }] },
    ],
  }),

  problema({
    id: 'n1-seletor',
    titulo: 'Quantos são da equipe de suporte?',
    dificuldade: 'facil',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: '"Todos os apartamentos com a etiqueta equipe: suporte."',
    limite: 'O seletor não conhece a "equipe" de verdade: só a etiqueta. Pod com a etiqueta errada fica de fora (ou entra de penetra).',
    enunciado: '<p>Alguns pods têm a label <code>equipe</code>. Quantos pods têm <code>equipe=suporte</code>? Use o seletor de labels do kubectl.</p>',
    rotuloResposta: 'Quantos pods?',
    dica: 'kubectl get pods -l chave=valor (e --show-labels mostra todas as labels)',
    respostaCerta: '3',
    solucaoTerminal: ['kubectl get pods -l equipe=suporte'],
    testes: noCluster('você filtrou pela label', [
      { comando: '(-l|--selector)[\\s=]*equipe', msg: 'você usou o seletor de labels (-l)' },
      { resposta: '3' },
    ]),
  }),

  problema({
    id: 'n1-namespaces',
    titulo: 'Duas empresas, a mesma sala-de-reunião',
    dificuldade: 'medio',
    vidaReal: 'Cada empresa do condomínio pode ter a sua "sala-de-reuniao": o nome se repete, mas o endereço completo, com a empresa, não.',
    limite: 'O namespace separa os nomes, mas sozinho não tranca nada: os pods de uma empresa ainda conversam com os da outra.',
    enunciado: `
      <p>Crie dois <b>namespaces</b>, <code>financeiro</code> e <code>rh</code>, e um pod chamado
         <code>sala-de-reuniao</code> (imagem <code>nginx:1.27</code>) em <b>cada um</b>.</p>
      <p>Num arquivo só, separe os objetos com <code>---</code>. Veja depois: <code>kubectl get pods -A</code>.</p>`,
    dica: 'kind: Namespace precisa só do metadata.name. No pod, metadata.namespace diz onde ele mora.',
    manual: ['pod.metadata.namespace'],
    inicial: {
      'empresas.yaml': yaml`
        apiVersion: v1
        kind: Namespace
        metadata:
          name: financeiro
        ---
        # falta o namespace rh e os dois pods
      `,
    },
    solucao: {
      'empresas.yaml': ['financeiro', 'rh'].map((n) => `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${n}\n`).join('---\n')
        + ['financeiro', 'rh'].map((n) => `---\n${podSimples('sala-de-reuniao', 'nginx:1.27', `    namespace: ${n}\n`)}`).join(''),
    },
    testes: [
      { descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [
        { semErros: true },
        { objeto: 'namespace/financeiro' },
        { objeto: 'namespace/rh' },
        { objeto: 'pod/sala-de-reuniao', ns: 'financeiro' },
        { objeto: 'pod/sala-de-reuniao', ns: 'rh' },
      ] },
    ],
  }),

  problema({
    id: 'n1-contexto',
    titulo: 'Trabalhar direto na empresa de vendas',
    dificuldade: 'medio',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: 'Configurar o interfone para ligar direto para a empresa de vendas, sem dizer o nome dela toda vez.',
    limite: 'É só um atalho do seu kubectl: os outros usuários continuam com o namespace deles.',
    enunciado: `
      <p>Escrever <code>-n vendas</code> em todo comando cansa. Mude o <b>namespace padrão</b> do seu kubectl para
         <code>vendas</code>. Depois, um simples <code>kubectl get pods</code> deve mostrar o pod <code>caixa</code>.</p>`,
    comoSaber: '<code>kubectl config get-contexts</code> mostra <code>vendas</code> na coluna NAMESPACE.',
    dica: 'kubectl config set-context --current --namespace=...',
    solucaoTerminal: ['kubectl config set-context --current --namespace=vendas'],
    testes: noCluster('o namespace padrão é vendas', [
      { comando: 'config\\s+set-context', msg: 'você usou o kubectl config set-context' },
      { contexto: { namespace: 'vendas' } },
    ]),
  }),

  problema({
    id: 'n1-dry-run',
    titulo: 'Peça o rascunho ao Seu Apolinário',
    dificuldade: 'medio',
    terminal: true,
    comArquivos: true,
    vidaReal: 'Pedir à administração um rascunho de planta já preenchido, em vez de desenhar do zero.',
    limite: 'O rascunho vem só com o básico: você ainda completa a planta antes de mandar construir.',
    enunciado: `
      <p>Escrever YAML do zero é lento. O kubectl gera o rascunho para você, sem criar nada:</p>
      <ol>
        <li>gere o YAML de um pod <code>rascunho</code> com a imagem <code>nginx:1.27</code> usando
            <code>--dry-run=client -o yaml</code> e salve no arquivo <code>rascunho.yaml</code> (com <code>&gt; rascunho.yaml</code>);</li>
        <li>aplique o arquivo.</li>
      </ol>
      <p>O arquivo aparece no editor: dá para ajustar antes de aplicar. (No exame CKAD, esse truque economiza muito tempo.)</p>`,
    dica: 'kubectl run rascunho --image=nginx:1.27 --dry-run=client -o yaml > rascunho.yaml',
    solucaoTerminal: ['kubectl run rascunho --image=nginx:1.27 --dry-run=client -o yaml > rascunho.yaml', 'kubectl apply -f rascunho.yaml'],
    testes: noCluster('o rascunho virou um pod', [
      { comando: '--dry-run=client', msg: 'você gerou o rascunho com --dry-run=client' },
      { comando: '^kubectl\\s+apply\\s+-f', msg: 'você aplicou o arquivo' },
      { objeto: 'pod/rascunho', campo: 'spec.containers[0].image', igual: 'nginx:1.27' },
    ]),
  }),

  problema({
    id: 'n1-explain',
    titulo: 'O manual técnico',
    dificuldade: 'facil',
    terminal: true,
    vidaReal: 'O manual técnico da administração: cada campo da planta explicado.',
    limite: 'O manual diz o que cada campo é, não qual valor usar no seu caso.',
    enunciado: `
      <p>Você quer que o programa do contêiner rode numa pasta específica. Use <code>kubectl explain</code> para achar
         <b>qual campo do contêiner</b> define a pasta de trabalho.</p>`,
    rotuloResposta: 'Nome do campo',
    dica: 'kubectl explain pod.spec.containers',
    respostaCerta: 'workingDir',
    solucaoTerminal: ['kubectl explain pod.spec.containers'],
    testes: noCluster('você achou o campo', [
      { comando: '^kubectl\\s+explain\\b', msg: 'você usou o kubectl explain' },
      { resposta: /^(pod\.spec\.containers\.)?workingdir$/ },
    ]),
  }),

  problema({
    id: 'n1-colegas',
    titulo: 'Colegas de apartamento',
    dificuldade: 'medio',
    vidaReal: 'Dois moradores dividindo o mesmo apartamento: o titular e um assistente.',
    limite: 'Colegas de pod nascem, mudam e morrem juntos: não dá para escalar só o assistente.',
    enunciado: `
      <p>Crie o pod <code>dupla</code> (label <code>app: dupla</code>) com <b>dois contêineres</b>:</p>
      <ul>
        <li><code>web</code>: <code>nginx:1.27</code>;</li>
        <li><code>assistente</code>: <code>busybox:1.36</code>, com o comando <code>sleep 3600</code> (sem um comando
            que fique rodando, o busybox termina na hora).</li>
      </ul>
      <p>O READY deve ficar <code>2/2</code>. Para ver os logs ou entrar num deles, use <code>-c NOME</code>.</p>`,
    dica: 'command: ["sleep", "3600"] no segundo item de containers.',
    manual: ['pod.spec.containers.command'],
    inicial: { 'dupla.yaml': podSimples('dupla', 'nginx:1.27', '    labels:\n      app: dupla\n', 'web') },
    solucao: {
      'dupla.yaml': `${podSimples('dupla', 'nginx:1.27', '    labels:\n      app: dupla\n', 'web')}  - name: assistente\n    image: busybox:1.36\n    command: ["sleep", "3600"]\n`,
    },
    testes: [
      { descricao: 'kubectl apply -f .', passos: [{ comando: 'kubectl apply -f .' }], regras: [
        { semErros: true },
        { objeto: 'pod/dupla', campo: 'spec.containers[1].image', igual: 'busybox:1.36' },
      ] },
      { oculto: true, descricao: 'os dois contêineres ficam prontos (2/2)', regras: [{ pods: 'app=dupla', prontos: 1 }, { status: 'pod/dupla', motivo: 'Running' }] },
    ],
  }),

  problema({
    id: 'n1-intruso',
    titulo: 'Tem um intruso no prédio',
    dificuldade: 'facil',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: 'Desocupar um apartamento.',
    limite: 'Apagar um pod é definitivo: ele não volta, porque ninguém (nenhum contrato) pediu para ele existir.',
    enunciado: '<p>Apareceu um pod chamado <code>intruso</code> no namespace default. Apague-o (e só ele).</p>',
    dica: 'kubectl delete pod NOME',
    solucaoTerminal: ['kubectl delete pod intruso'],
    testes: noCluster('o intruso saiu e os outros ficaram', [
      { comando: '^kubectl\\s+delete\\b', msg: 'você usou o kubectl delete' },
      { objeto: 'pod/intruso', existe: false },
      { objeto: 'pod/misterio' },
      { objeto: 'pod/diario' },
    ]),
  }),

  problema({
    id: 'n1-vitrine',
    titulo: 'A vitrine não abre',
    dificuldade: 'medio',
    cluster: 'nivel1',
    terminal: true,
    vidaReal: 'O pré-moldado da vitrine não chegou: alguém escreveu o modelo errado no pedido.',
    limite: 'Aqui você mesmo conserta o pedido; num Deployment, o certo é corrigir o YAML e aplicar de novo.',
    enunciado: `
      <p>O pod <code>vitrine</code> não sai do lugar. Investigue com <code>kubectl describe</code> (olhe as Events no fim)
         e conserte: ele deve rodar o <b>nginx</b>, versão <code>1.27</code>.</p>`,
    comoSaber: '<code>kubectl get pod vitrine</code> mostra Running.',
    dica: 'Num pod, a imagem pode ser trocada: kubectl set image pod/vitrine vitrine=...',
    solucaoTerminal: ['kubectl describe pod vitrine', 'kubectl set image pod/vitrine vitrine=nginx:1.27'],
    testes: noCluster('a vitrine abriu', [
      { comando: '^kubectl\\s+describe\\b', msg: 'você investigou com o describe' },
      { objeto: 'pod/vitrine', campo: 'spec.containers[0].image', igual: 'nginx:1.27' },
      { objeto: 'pod/vitrine', campo: 'status.phase', igual: 'Running' },
    ]),
  }),
];
