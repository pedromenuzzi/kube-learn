// Nível 7: scheduling e manutenção (o prédio com gerador, o prédio restrito, a reforma e a queda de energia).
import { licao, problema, yaml } from './util.js';

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const depois = (descricao, regras, { oculto = false, esperar = '1m', mais = [] } = {}) => ({ oculto, descricao, passos: [{ comando: 'kubectl apply -f .' }, { avancar: esperar }, ...mais], regras });

/** Um Deployment simples; `extra` entra no spec do pod (recuo de 6 espaços) e `recursos` no contêiner (8). */
const deployment = (nome, replicas, { extra = '', imagem = 'nginx:1.27', recursos = '' } = {}) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${nome}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${nome}
  template:
    metadata:
      labels:
        app: ${nome}
    spec:
${extra}      containers:
      - name: ${nome}
        image: ${imagem}
${recursos}`;

const seletor = (k, v) => `      nodeSelector:\n        ${k}: ${v}\n`;
const afinidadeGerador = (tipo) => (tipo === 'required' ? `      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: energia
                operator: In
                values:
                - gerador
` : `      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            preference:
              matchExpressions:
              - key: energia
                operator: In
                values:
                - gerador
`);
const longeDosIrmaos = `      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: backup
            topologyKey: kubernetes.io/hostname
`;
const espalharPorZona = `      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: site
`;
const tolerarGpu = `      tolerations:
      - key: dedicado
        operator: Equal
        value: gpu
        effect: NoSchedule
`;
const cpu = (quanto) => `        resources:\n          requests:\n            cpu: ${quanto}\n`;

const pdb = (app) => yaml`
  apiVersion: policy/v1
  kind: PodDisruptionBudget
  metadata:
    name: loja
  spec:
    minAvailable: 2
    selector:
      matchLabels:
        app: ${app}
`;

const classeCritica = yaml`
  apiVersion: scheduling.k8s.io/v1
  kind: PriorityClass
  metadata:
    name: critico
  value: 100000
  description: "Pagamentos: passam na frente quando falta espaço."
`;

/** Os clusters de partida deste nível (em clusters.js). */
export const PARTIDA7 = {
  semSsd: deployment('busca', 1, { extra: seletor('disco', 'ssd') }),
  impressao: deployment('impressao', 1, { extra: seletor('impressora', 'sim') }),
  relatorios: deployment('relatorios', 4, { recursos: cpu('900m') }),
  caderno: yaml`
    apiVersion: v1
    kind: Pod
    metadata:
      name: caderno
      labels:
        app: caderno
    spec:
      containers:
      - name: caderno
        image: nginx:1.27
  `,
};

export const NIVEL7 = [
  licao({
    id: 'n7-licao-scheduler',
    titulo: 'A corretora escolhe o prédio',
    vidaReal: 'A corretora (o scheduler) recebe cada apartamento novo, risca os prédios que não servem e, entre os que sobram, escolhe o melhor.',
    limite: 'Ela só escolhe na chegada: um pod nunca muda de node sozinho. Se o node fica ruim depois, só nasce outro pod (e só se houver um Deployment).',
    conteudo: `
      <p>Todo pod novo passa pelo <b>scheduler</b>, em duas etapas:</p>
      <ol>
        <li><b>Filtrar</b>: risca os nodes que não servem (interditados, com taint que o pod não tolera, sem a label
            pedida, sem CPU ou memória, regras de afinidade e de espalhamento).</li>
        <li><b>Pontuar</b>: entre os que sobraram, prefere o que cumpre as preferências, espalha as réplicas e está mais
            livre.</li>
      </ol>
      <p>Se nenhum node passa no filtro, o pod fica <b>Pending</b>, e o motivo está nos eventos:</p>
      <pre><code>0/3 nodes are available: 1 node(s) had untolerated taint(s),
2 node(s) didn't match Pod's node affinity/selector.</code></pre>
      <p>Leia assim: 3 prédios, nenhum serviu; 1 tinha uma placa de restrição (o control plane), 2 não tinham a label pedida.</p>
      <h2>Escolher onde morar</h2>
      <ul>
        <li><code>nodeSelector</code>: "só em prédio com estas labels". Simples e obrigatório.</li>
        <li><code>affinity.nodeAffinity</code>: o mesmo, com mais recursos (In, NotIn, Exists) e em duas forças:
            <b>required</b> (obrigatório: sem node que cumpra, Pending) ou <b>preferred</b> (se der).</li>
        <li><code>affinity.podAntiAffinity</code>: longe de certos pods (as duas cópias do backup em prédios diferentes);
            <code>podAffinity</code>: perto deles. A <code>topologyKey</code> diz o que é "perto": o mesmo node
            (<code>kubernetes.io/hostname</code>) ou a mesma zona (<code>topology.kubernetes.io/zone</code>).</li>
        <li><code>topologySpreadConstraints</code>: espalhar um grupo entre nodes ou zonas, com uma diferença máxima
            (<code>maxSkew</code>) entre o mais cheio e o mais vazio.</li>
      </ul>
      <h2>Prédio restrito: taints e tolerations</h2>
      <p>O <b>taint</b> é uma placa no node que repele pods (<code>kubectl taint nodes node-2 dedicado=gpu:NoSchedule</code>).
         A <b>toleration</b> no pod diz "eu posso entrar". Efeitos: <code>NoSchedule</code> (não entra pod novo),
         <code>PreferNoSchedule</code> (evita, se der) e <code>NoExecute</code> (e ainda despeja quem já está lá).</p>
      <p><b>A pegadinha</b>: a toleration <b>permite</b>, não <b>obriga</b>. Para o pod ir para o prédio restrito, junte a
         toleration com um nodeSelector (ou affinity). O control plane do kind tem um taint: é por isso que seus pods nunca vão
         para lá.</p>`,
  }),

  problema({
    id: 'n7-gerador',
    titulo: 'O prédio com gerador',
    dificuldade: 'facil',
    cluster: 'gerador',
    vidaReal: 'A loja quer o caixa num prédio com gerador: se faltar luz, as vendas continuam.',
    limite: 'O nodeSelector é obrigatório: se o prédio com gerador lotar ou for interditado, o caixa novo espera na porta (Pending).',
    enunciado: `
      <p>No condomínio, só o <code>node-2</code> tem gerador: ele tem a label <code>energia=gerador</code>
         (confira com <code>kubectl get nodes --show-labels</code>).</p>
      <p>Faça as 2 réplicas do <code>caixa</code> rodarem <b>só</b> no prédio com gerador.</p>`,
    comoSaber: '<code>kubectl get pods -o wide</code>: a coluna NODE mostra node-2 nas duas.',
    dica: 'spec.template.spec.nodeSelector: { energia: gerador }',
    manual: ['pod.spec.nodeSelector'],
    inicial: { 'caixa.yaml': deployment('caixa', 2) },
    solucao: { 'caixa.yaml': deployment('caixa', 2, { extra: seletor('energia', 'gerador') }) },
    testes: [depois('as duas caixas no prédio com gerador', [{ semErros: true }, { pods: 'app=caixa', prontos: 2, node: 'node-2' }])],
  }),

  problema({
    id: 'n7-etiqueta-no-predio',
    titulo: 'Etiqueta no prédio',
    dificuldade: 'facil',
    cluster: 'sem-ssd',
    terminal: true,
    vidaReal: 'O motor de busca só aceita prédio com disco rápido. O node-1 tem SSD, mas ninguém pôs a etiqueta na porta.',
    limite: 'A label é só uma etiqueta: o Kubernetes não confere se o node tem mesmo SSD. Etiqueta errada manda o pod para o lugar errado.',
    enunciado: `
      <p>O pod da <code>busca</code> está <b>Pending</b>. Descubra o motivo (<code>kubectl describe pod</code>, nos Events)
         e, <b>pelo terminal</b>, ponha no <code>node-1</code> a label que ele pede.</p>`,
    comoSaber: 'Em poucos segundos o pod sai de Pending e vai para o node-1.',
    dica: 'kubectl label node node-1 disco=ssd',
    solucaoTerminal: ['kubectl label node node-1 disco=ssd'],
    testes: noCluster('a busca rodando no node-1', [
      { objeto: 'node/node-1', campo: 'metadata.labels.disco', igual: 'ssd' },
      { pods: 'app=busca', prontos: 1, node: 'node-1' },
    ]),
  }),

  problema({
    id: 'n7-preferencia',
    titulo: 'Gerador, se der',
    dificuldade: 'medio',
    cluster: 'gerador-em-reforma',
    vidaReal: 'A vitrine pode abrir em qualquer prédio; só prefere o com gerador. Mas o pedido dizia "só com gerador", e ele está em reforma.',
    limite: 'Preferência não move ninguém depois: quando o prédio do gerador volta, a vitrine fica onde está até os pods serem trocados.',
    enunciado: `
      <p>O <code>node-2</code> (o do gerador) está interditado para reforma, e a <code>vitrine</code> ficou <b>Pending</b>:
         a afinidade dela é <b>obrigatória</b> (<code>required...</code>).</p>
      <p>Troque por uma afinidade <b>preferida</b> (<code>preferredDuringSchedulingIgnoredDuringExecution</code>, peso 100):
         a vitrine abre já, em outro prédio, e volta a preferir o gerador quando ele estiver de pé.</p>`,
    comoSaber: 'As 2 réplicas ficam prontas no node-1.',
    dica: 'preferred: [{ weight: 100, preference: { matchExpressions: [...] } }] (sem o nodeSelectorTerms)',
    manual: ['pod.spec.affinity.nodeAffinity'],
    inicial: { 'vitrine.yaml': deployment('vitrine', 2, { extra: afinidadeGerador('required') }) },
    solucao: { 'vitrine.yaml': deployment('vitrine', 2, { extra: afinidadeGerador('preferred') }) },
    testes: [
      depois('a vitrine abre mesmo com o gerador em reforma', [{ semErros: true }, { pods: 'app=vitrine', prontos: 2 }]),
      depois('a reforma acaba e, na próxima troca, a vitrine vai para o prédio com gerador', [{ pods: 'app=vitrine', prontos: 2, node: 'node-2' }], {
        oculto: true,
        mais: [{ comando: 'kubectl uncordon node-2' }, { comando: 'kubectl rollout restart deployment vitrine' }, { avancar: '1m' }],
      }),
    ],
  }),

  problema({
    id: 'n7-backups-separados',
    titulo: 'Os backups em prédios diferentes',
    dificuldade: 'medio',
    cluster: 'vazio',
    vidaReal: 'Guardar as duas cópias do backup no mesmo prédio é ter uma cópia só: se o prédio pega fogo, vão as duas.',
    limite: 'Com a regra obrigatória, faltando prédio a cópia sobrando espera (Pending). Para "separe se der", use preferred.',
    enunciado: `
      <p>O <code>backup</code> tem 2 réplicas. Garanta que <b>nunca</b> duas réplicas fiquem no mesmo node, com uma
         <b>antiafinidade obrigatória</b> entre os pods dele (<code>topologyKey: kubernetes.io/hostname</code>).</p>
      <p>Se um dia alguém pedir mais réplicas do que há prédios, a sobrando deve esperar (Pending), e não dividir prédio.</p>`,
    comoSaber: '<code>kubectl get pods -o wide</code>: cada réplica num node.',
    dica: 'affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution: [{ labelSelector: { matchLabels: { app: backup } }, topologyKey: kubernetes.io/hostname }]',
    manual: ['pod.spec.affinity.podAntiAffinity'],
    inicial: { 'backup.yaml': deployment('backup', 2) },
    solucao: { 'backup.yaml': deployment('backup', 2, { extra: longeDosIrmaos }) },
    testes: [
      depois('as duas cópias de pé', [
        { semErros: true },
        { pods: 'app=backup', prontos: 2 },
        { objeto: 'deployment/backup', campo: 'spec.template.spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[0].topologyKey', igual: 'kubernetes.io/hostname' },
      ]),
      depois('com 3 réplicas e 2 prédios, a terceira espera', [{ pods: 'app=backup', quantidade: 3, prontos: 2 }], {
        oculto: true,
        mais: [{ comando: 'kubectl scale deployment backup --replicas=3' }, { avancar: '30s' }],
      }),
    ],
  }),

  problema({
    id: 'n7-zonas',
    titulo: 'Metade em cada bairro',
    dificuldade: 'medio',
    cluster: 'zonas',
    vidaReal: 'O condomínio tem dois bairros: o A, com dois prédios, e o B, com um. Se faltar luz num bairro, metade das lojas tem de continuar aberta.',
    limite: 'Espalhar por node não é espalhar por zona: 2 por prédio deixa 4 no bairro A e só 2 no B.',
    enunciado: `
      <p>Os nodes têm a label <code>topology.kubernetes.io/zone</code>: <code>node-1</code> e <code>node-2</code> na
         <code>zona-a</code>, <code>node-3</code> na <code>zona-b</code>.</p>
      <p>O <code>site</code> tem 6 réplicas. Espalhe-as entre as <b>zonas</b>, com diferença máxima de 1 (3 e 3), usando
         <code>topologySpreadConstraints</code>.</p>`,
    comoSaber: '<code>kubectl get pods -o wide</code>: 3 réplicas no node-3 e 3 entre o node-1 e o node-2.',
    dica: 'topologySpreadConstraints: [{ maxSkew: 1, topologyKey: topology.kubernetes.io/zone, whenUnsatisfiable: DoNotSchedule, labelSelector: {...} }]',
    manual: ['pod.spec.topologySpreadConstraints'],
    inicial: { 'site.yaml': deployment('site', 6) },
    solucao: { 'site.yaml': deployment('site', 6, { extra: espalharPorZona }) },
    testes: [depois('3 réplicas em cada zona', [
      { semErros: true },
      { pods: 'app=site', prontos: 6 },
      { espalhamento: { pods: 'app=site', chave: 'topology.kubernetes.io/zone', maxSkew: 1 } },
    ])],
  }),

  problema({
    id: 'n7-predio-restrito',
    titulo: 'O prédio restrito',
    dificuldade: 'medio',
    cluster: 'gpu',
    vidaReal: 'O prédio da GPU tem uma placa: "só entra quem tem autorização". O treino tem endereço certo, mas não tem a autorização.',
    limite: 'A autorização (toleration) não leva ninguém até lá: quem leva é o nodeSelector. Só a toleration, o pod pode cair em qualquer prédio.',
    enunciado: `
      <p>O <code>node-2</code> tem a GPU, a label <code>dedicado=gpu</code> e o taint <code>dedicado=gpu:NoSchedule</code>.</p>
      <p>O <code>treino</code> já pede o prédio certo (nodeSelector), mas está <b>Pending</b>. Dê a ele a
         <b>toleration</b> para o taint do prédio.</p>`,
    comoSaber: 'O pod do treino fica pronto no node-2.',
    dica: 'tolerations: [{ key: dedicado, operator: Equal, value: gpu, effect: NoSchedule }]',
    manual: ['pod.spec.tolerations'],
    inicial: { 'treino.yaml': deployment('treino', 1, { extra: seletor('dedicado', 'gpu') }) },
    solucao: { 'treino.yaml': deployment('treino', 1, { extra: seletor('dedicado', 'gpu') + tolerarGpu }) },
    testes: [
      depois('o treino roda no prédio da GPU', [{ semErros: true }, { pods: 'app=treino', prontos: 1, node: 'node-2' }]),
      depois('a loja continua fora do prédio restrito', [{ pods: 'app=loja', prontos: 3, node: 'node-1' }], { oculto: true }),
    ],
  }),

  problema({
    id: 'n7-tirar-a-placa',
    titulo: 'A placa esquecida',
    dificuldade: 'facil',
    cluster: 'placa-esquecida',
    terminal: true,
    vidaReal: 'A obra no node-1 acabou, mas ninguém tirou a placa "em obra": a impressora, que só existe lá, ficou sem ninguém.',
    limite: 'Tirar o taint NoSchedule não traz de volta quem saiu: só deixa os próximos entrarem.',
    enunciado: `
      <p>A <code>impressao</code> só roda no <code>node-1</code> (é lá que está a impressora), e o pod dela está
         <b>Pending</b>. Descubra o que está barrando (<code>kubectl describe node node-1</code>) e, <b>pelo terminal</b>,
         tire a placa.</p>`,
    comoSaber: '<code>kubectl describe node node-1</code> mostra <code>Taints: &lt;none&gt;</code>, e o pod fica pronto.',
    dica: 'kubectl taint nodes node-1 obra=sim:NoSchedule-  (o "-" no fim tira)',
    solucaoTerminal: ['kubectl taint nodes node-1 obra=sim:NoSchedule-'],
    testes: noCluster('a placa saiu e a impressão voltou', [
      { objeto: 'node/node-1', campo: 'spec.taints', existe: false, msg: 'o node-1 não tem mais taints' },
      { pods: 'app=impressao', prontos: 1, node: 'node-1' },
    ]),
  }),

  licao({
    id: 'n7-licao-manutencao',
    titulo: 'Reforma no prédio: cordon, drain e PDB',
    vidaReal: 'Para reformar um prédio, a administração interdita a entrada (cordon), muda os moradores para outros prédios (drain) e combina antes quantos elevadores precisam continuar funcionando (PDB).',
    limite: 'O combinado (PDB) vale para a reforma planejada. Queda de energia não pede licença: o prédio cai com quem estiver dentro.',
    conteudo: `
      <p>Trocar o disco, atualizar o sistema, reiniciar a máquina: um node precisa de manutenção de vez em quando.</p>
      <ul>
        <li><code>kubectl cordon node-1</code>: <b>interdita</b>. Nenhum pod novo entra; quem está lá continua
            (STATUS <code>Ready,SchedulingDisabled</code>).</li>
        <li><code>kubectl drain node-1 --ignore-daemonsets</code>: interdita e <b>esvazia</b>, despejando os pods um a um.
            Quem tem dono (Deployment, StatefulSet) renasce em outro node. O drain recusa sem permissão:
            <code>--ignore-daemonsets</code> (os pods de DaemonSet ficam: um por node, de propósito),
            <code>--delete-emptydir-data</code> (a mesa de trabalho some) e <code>--force</code> (pod sem dono
            <b>não volta</b>).</li>
        <li><code>kubectl uncordon node-1</code>: libera o node. Ninguém volta sozinho: só os próximos pods podem ir para lá.</li>
      </ul>
      <h2>O PodDisruptionBudget</h2>
      <p>O drain despeja pela <b>API de eviction</b>, que respeita os <b>PDBs</b>: "deste grupo, pelo menos 2 sempre prontos"
         (<code>minAvailable: 2</code>) ou "no máximo 1 fora" (<code>maxUnavailable: 1</code>). Sem folga, o despejo é recusado
         e o drain tenta de novo a cada 5 segundos, enquanto os substitutos sobem em outro node:</p>
      <pre><code>error when evicting pods/"loja-..." -n "default" (will retry after 5s):
Cannot evict pod as it would violate the pod's disruption budget.</code></pre>
      <h2>Quando o prédio cai</h2>
      <p>Se o kubelet para (luz, rede, máquina), o node fica <b>NotReady</b> em uns 50 segundos e ganha o taint
         <code>node.kubernetes.io/unreachable</code>. Os pods dele saem dos Services e, 5 minutos depois (a toleration
         padrão de 300 s), são despejados: os de um Deployment renascem em outro node; o pod solto fica
         <b>Terminating</b> para sempre e não volta.</p>
      <h2>Prioridade</h2>
      <p>Uma <b>PriorityClass</b> dá um número de importância (<code>priorityClassName</code> no pod). Sem espaço, o
         scheduler pode <b>tirar</b> pods de prioridade menor para pôr o mais importante (preempção), como a ambulância que
         passa na frente.</p>`,
  }),

  problema({
    id: 'n7-interditar',
    titulo: 'Interditar o prédio',
    dificuldade: 'facil',
    cluster: 'loja-3-replicas',
    terminal: true,
    vidaReal: 'Vai ter obra no node-2 semana que vem: a partir de hoje, nenhum morador novo entra lá. Quem já mora fica.',
    limite: 'Interditar não esvazia: os pods de lá continuam até um drain (ou até morrerem sozinhos).',
    enunciado: `
      <p><b>Pelo terminal</b>, interdite o <code>node-2</code> para pods novos, sem tirar quem já está lá.</p>`,
    comoSaber: '<code>kubectl get nodes</code> mostra <code>Ready,SchedulingDisabled</code> no node-2, e a loja continua com 3 pods.',
    dica: 'kubectl cordon node-2',
    solucaoTerminal: ['kubectl cordon node-2'],
    testes: noCluster('o node-2 interditado, a loja intacta', [
      { objeto: 'node/node-2', campo: 'spec.unschedulable', igual: true },
      { pods: 'app=loja', prontos: 3 },
    ]),
  }),

  problema({
    id: 'n7-esvaziar',
    titulo: 'Esvaziar para a reforma',
    dificuldade: 'medio',
    cluster: 'loja-3-replicas',
    terminal: true,
    vidaReal: 'O node-1 vai trocar de disco: muda todo mundo para os outros prédios, faz a troca e devolve o prédio ao condomínio.',
    limite: 'Devolver o prédio (uncordon) não traz os moradores de volta: eles ficam onde estão até alguém trocar os pods.',
    enunciado: `
      <p><b>Pelo terminal</b>, esvazie o <code>node-1</code> com <code>kubectl drain</code> (os pods de DaemonSet ficam:
         use a opção certa). Depois finja que trocou o disco e <b>devolva</b> o node ao condomínio.</p>`,
    comoSaber: 'A loja continua com 3 pods prontos, todos no node-2, e o node-1 volta a <code>Ready</code>.',
    dica: 'kubectl drain node-1 --ignore-daemonsets e, depois, kubectl uncordon node-1',
    solucaoTerminal: ['kubectl drain node-1 --ignore-daemonsets', 'kubectl uncordon node-1'],
    testes: noCluster('o node-1 esvaziado e devolvido', [
      { comando: '^kubectl\\s+drain\\s', msg: 'você usou o kubectl drain' },
      { pods: 'app=loja', prontos: 3, node: 'node-2' },
      { objeto: 'node/node-1', campo: 'spec.unschedulable', existe: false, msg: 'o node-1 voltou a receber pods' },
    ]),
  }),

  problema({
    id: 'n7-pdb',
    titulo: 'Pelo menos dois elevadores',
    dificuldade: 'medio',
    cluster: 'pdb-loja',
    vidaReal: 'Combinado com a administração: na reforma, pelo menos 2 elevadores da loja funcionando. Mas o combinado foi escrito com o nome errado.',
    limite: 'O PDB só vale para quem despeja pela API (drain, autoscaler de nodes). Um kubectl delete ou uma queda de node passam por cima.',
    enunciado: `
      <p>As 3 réplicas da <code>loja</code> estão no <code>node-1</code>, que vai para manutenção. O PDB deixado no
         <code>pdb.yaml</code> deveria garantir <b>pelo menos 2 prontas</b> durante o drain, mas não protege ninguém
         (confira <code>kubectl get pdb</code> depois de aplicar).</p>
      <p>Conserte o PDB.</p>`,
    comoSaber: '<code>kubectl get pdb</code> mostra <code>ALLOWED DISRUPTIONS 1</code> (3 prontas, 2 exigidas).',
    dica: 'O seletor do PDB precisa casar com as labels dos pods da loja (app: loja).',
    manual: ['poddisruptionbudget.spec'],
    inicial: { 'pdb.yaml': pdb('lojas') },
    solucao: { 'pdb.yaml': pdb('loja') },
    testes: [
      depois('o PDB protege a loja', [{ semErros: true }, { objeto: 'pdb/loja', campo: 'status.disruptionsAllowed', igual: 1 }], { esperar: '30s' }),
      depois('no drain, o PDB segura a fila e a loja muda inteira para o node-2', [
        { saida: "violate the pod's disruption budget", msg: 'o drain esperou o PDB' },
        { pods: 'app=loja', prontos: 3, node: 'node-2' },
      ], { oculto: true, esperar: '30s', mais: [{ comando: 'kubectl drain node-1 --ignore-daemonsets --timeout=3m' }, { avancar: '30s' }] }),
    ],
  }),

  problema({
    id: 'n7-prioridade',
    titulo: 'A ambulância passa na frente',
    dificuldade: 'dificil',
    cluster: 'lotado',
    vidaReal: 'O condomínio está lotado de relatórios, e o pagamento chegou: sem ele, a loja não vende. A ambulância passa na frente e tira o carro estacionado da vaga.',
    limite: 'Quem é tirado sai de verdade: o relatório despejado volta para a fila (Pending) e só roda quando sobrar espaço.',
    enunciado: `
      <p>Os nodes estão cheios: 4 réplicas de <code>relatorios</code> pedem 900m de CPU cada. O <code>pagamento</code>
         (500m) está <b>Pending</b> por <code>Insufficient cpu</code>.</p>
      <p>No <code>pagamento.yaml</code>, crie uma <b>PriorityClass</b> <code>critico</code> (valor 100000) e use-a no
         pagamento. O scheduler vai tirar um relatório para abrir a vaga.</p>`,
    comoSaber: 'O pagamento fica pronto, e um relatório vira Pending (nos Events dele: <i>Preempted</i>).',
    dica: 'Dois documentos no arquivo (separados por ---): a PriorityClass (apiVersion scheduling.k8s.io/v1, value: 100000) e o Deployment com priorityClassName: critico.',
    manual: ['priorityclass', 'pod.spec.priorityClassName'],
    inicial: { 'pagamento.yaml': deployment('pagamento', 1, { recursos: cpu('500m') }) },
    solucao: { 'pagamento.yaml': `${classeCritica}---\n${deployment('pagamento', 1, { extra: '      priorityClassName: critico\n', recursos: cpu('500m') })}` },
    testes: [depois('o pagamento passou na frente', [
      { semErros: true },
      { pods: 'app=pagamento', prontos: 1 },
      { evento: { motivo: 'Preempted' }, msg: 'um relatório foi tirado para abrir a vaga' },
    ])],
  }),

  problema({
    id: 'n7-predio-caiu',
    titulo: 'Queda de energia',
    dificuldade: 'medio',
    cluster: 'apagao',
    terminal: true,
    vidaReal: 'O node-2 ficou sem luz há alguns minutos. A loja já reabriu em outro prédio; alguém ficou para trás.',
    limite: 'O Kubernetes não sabe se o prédio caiu ou só perdeu o telefone: por isso espera 5 minutos e deixa os pods "Terminating" até ter notícias.',
    enunciado: `
      <p>O <code>node-2</code> caiu. Olhe os nodes e os pods (<code>-o wide</code>) e responda: qual pod <b>não vai voltar
         sozinho</b>?</p>`,
    rotuloResposta: 'O nome do pod',
    dica: 'kubectl get nodes e kubectl get pods -o wide: quem está Terminating no node-2 e não tem substituto?',
    respostaCerta: 'caderno',
    solucaoTerminal: ['kubectl get nodes', 'kubectl get pods -o wide'],
    testes: noCluster('você achou quem ficou para trás', [
      { comando: '^kubectl\\s+get\\s+(po|pod|pods)\\b', msg: 'você olhou os pods' },
      { resposta: 'caderno' },
    ]),
  }),
];
