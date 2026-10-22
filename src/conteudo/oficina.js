// A Oficina do kubectl: exercícios curtos de terminal, contra o relógio, para ganhar fluência nos comandos que poupam
// tempo de verdade (gerar YAML, expor, trocar versão, rótulos, jsonpath...). Fica fora da trilha: abre desde o começo,
// não vale XP; vale o seu recorde (o menor tempo de cada exercício, guardado no navegador).
import { problema, yaml } from './util.js';

/** Os clusters de partida de cada exercício, em clusters.js. */
export const PARTIDA_OF = {};

const loja = (replicas = 3) => yaml`
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
const vizinhanca = yaml`
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
          image: nginx:1.29
  ---
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: cofre
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: cofre
    template:
      metadata:
        labels:
          app: cofre
      spec:
        containers:
        - name: cofre
          image: nginx:1.28
`;
const deployment = (nome, imagem, replicas) => yaml`
  apiVersion: apps/v1
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
        containers:
        - name: ${nome}
          image: ${imagem}
`;
PARTIDA_OF['of-loja'] = { manifestos: loja() };
PARTIDA_OF['of-loja-ramal'] = { manifestos: `${loja()}---\n${yaml`
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
`}` };
// Três Deployments: o balcao pede uma tag que não existe, e a vitrine acabou de ser reiniciada (os pods mais novos).
PARTIDA_OF['of-bairro'] = {
  manifestos: [deployment('vitrine', 'nginx:1.29', 2), deployment('cofre', 'nginx:1.28', 1), deployment('balcao', 'nginx:1.299', 1)].join('---\n'),
  comandos: ['kubectl rollout restart deployment/vitrine'],
};
PARTIDA_OF['of-vizinhanca'] = { manifestos: vizinhanca };
PARTIDA_OF['of-loja-quebrada'] = { manifestos: loja(), comandos: ['kubectl set image deployment/loja loja=kubelearn/loja:2.0-bugada'] };

const noCluster = (descricao, regras) => [{ noClusterDoAluno: true, descricao, regras }];
const exercicio = (dados) => problema({ terminal: true, secao: 'oficina', ...dados });

export const OFICINA = [
  exercicio({
    id: 'of-gerar-yaml',
    titulo: 'YAML sem digitar YAML',
    dificuldade: 'facil',
    cluster: 'vazio',
    enunciado: `<p>Crie o Deployment <code>api</code> (imagem <code>kubelearn/loja:1.0</code>, <b>3 réplicas</b>) sem escrever o
                YAML do zero: gere com o kubectl, grave em <code>api.yaml</code> e aplique.</p>`,
    dica: 'kubectl create deployment api --image=kubelearn/loja:1.0 --replicas=3 --dry-run=client -o yaml > api.yaml && kubectl apply -f api.yaml (aqui, um comando por vez)',
    vidaReal: 'Pedir à construtora a planta padrão já preenchida, em vez de desenhar à mão cada parede.',
    limite: 'A planta gerada vem com o básico: probes, recursos e o resto você ainda acrescenta no arquivo.',
    solucaoTerminal: ['kubectl create deployment api --image=kubelearn/loja:1.0 --replicas=3 --dry-run=client -o yaml > api.yaml', 'kubectl apply -f api.yaml'],
    testes: noCluster('a api foi gerada, gravada e aplicada', [
      { comando: '--dry-run=client\\s+-o\\s+yaml\\s*>\\s*api\\.yaml', msg: 'você gerou o YAML com --dry-run=client -o yaml > api.yaml' },
      { objeto: 'deployment/api', campo: 'spec.replicas', igual: 3 },
      { objeto: 'deployment/api', campo: 'spec.template.spec.containers[0].image', igual: 'kubelearn/loja:1.0' },
    ]),
  }),
  exercicio({
    id: 'of-expor',
    titulo: 'Um ramal num comando',
    dificuldade: 'facil',
    cluster: 'of-loja',
    enunciado: '<p>Dê à <code>loja</code> um Service do tipo <b>NodePort</b> na porta <code>80</code>, entregando na <code>8080</code> dos pods, com um comando só.</p>',
    dica: 'kubectl expose deployment loja --type=NodePort --port=80 --target-port=8080',
    vidaReal: 'Pedir o ramal por telefone, sem preencher formulário.',
    limite: 'O expose copia o seletor do Deployment naquele momento: se as labels mudarem depois, o Service não acompanha.',
    solucaoTerminal: ['kubectl expose deployment loja --type=NodePort --port=80 --target-port=8080'],
    testes: noCluster('a loja tem o seu NodePort', [
      { comando: '^kubectl\\s+expose\\b', msg: 'você usou o kubectl expose' },
      { objeto: 'svc/loja', campo: 'spec.type', igual: 'NodePort' },
      { objeto: 'svc/loja', campo: 'spec.ports[0].port', igual: 80 },
      { objeto: 'svc/loja', campo: 'spec.ports[0].targetPort', igual: 8080 },
    ]),
  }),
  exercicio({
    id: 'of-trocar-versao',
    titulo: 'Versão nova, sem abrir arquivo',
    dificuldade: 'medio',
    cluster: 'of-loja',
    enunciado: '<p>Troque a imagem da <code>loja</code> para <code>kubelearn/loja:1.1</code> pelo terminal e acompanhe a troca até o fim.</p>',
    dica: 'kubectl set image deployment/loja loja=kubelearn/loja:1.1 e depois kubectl rollout status deployment/loja',
    vidaReal: 'Trocar o atendente de um balcão de cada vez, sem fechar a loja, e ficar olhando até o último trocar.',
    limite: 'O set image muda o cluster, não o seu arquivo: no próximo apply do YAML antigo, a versão volta.',
    solucaoTerminal: ['kubectl set image deployment/loja loja=kubelearn/loja:1.1', 'kubectl rollout status deployment/loja'],
    testes: noCluster('a loja está na 1.1, e você acompanhou', [
      { comando: '^kubectl\\s+set\\s+image\\b', msg: 'você usou o kubectl set image' },
      { comando: '^kubectl\\s+rollout\\s+status\\b', msg: 'você acompanhou com o rollout status' },
      { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.1' },
    ]),
  }),
  exercicio({
    id: 'of-desfazer',
    titulo: 'Volta, volta!',
    dificuldade: 'facil',
    cluster: 'of-loja-quebrada',
    enunciado: '<p>Alguém subiu uma versão da <code>loja</code> que cai assim que liga. Volte para a versão anterior com <b>um comando</b>.</p>',
    dica: 'kubectl rollout undo deployment/loja',
    vidaReal: 'Desfazer a reforma que deu errado: o quadro de antes volta para a parede.',
    limite: 'O undo volta o Deployment, não o banco de dados: o que a versão quebrada gravou continua gravado.',
    solucaoTerminal: ['kubectl rollout undo deployment/loja'],
    testes: noCluster('a loja voltou para a 1.0', [
      { comando: '^kubectl\\s+rollout\\s+undo\\b', msg: 'você usou o kubectl rollout undo' },
      { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.0' },
    ]),
  }),
  exercicio({
    id: 'of-rotulos',
    titulo: 'Etiqueta e filtro',
    dificuldade: 'facil',
    cluster: 'of-vizinhanca',
    enunciado: '<p>Ponha a label <code>tier=frontend</code> em todos os pods da <code>vitrine</code> (de uma vez, pelo seletor) e liste só os pods com essa label.</p>',
    dica: 'kubectl label pods -l app=vitrine tier=frontend e depois kubectl get pods -l tier=frontend',
    vidaReal: 'Pôr o mesmo adesivo em todas as portas de um andar e depois chamar só quem tem o adesivo.',
    limite: 'A label vai nos pods de agora: um pod novo do Deployment nasce sem ela (para durar, a label vai no template).',
    solucaoTerminal: ['kubectl label pods -l app=vitrine tier=frontend', 'kubectl get pods -l tier=frontend'],
    testes: noCluster('os pods da vitrine estão etiquetados', [
      { comando: '^kubectl\\s+label\\s+pods?\\s+(.*\\s)?-l\\s*app=vitrine', msg: 'você etiquetou pelo seletor (-l app=vitrine)' },
      { comando: '^kubectl\\s+get\\s+pods?\\s+(.*\\s)?-l\\s*tier=frontend', msg: 'você listou com -l tier=frontend' },
      { pods: 'tier=frontend', quantidade: 2 },
    ]),
  }),
  exercicio({
    id: 'of-jsonpath',
    titulo: 'Só o que interessa',
    dificuldade: 'medio',
    cluster: 'of-vizinhanca',
    enunciado: '<p>Qual imagem o Deployment <code>cofre</code> usa? Descubra com <code>-o jsonpath</code> (só a imagem na saída) e responda abaixo.</p>',
    rotuloResposta: 'A imagem do cofre',
    dica: "kubectl get deployment cofre -o jsonpath='{.spec.template.spec.containers[0].image}'",
    vidaReal: 'Pedir ao porteiro só o número do apartamento, e não a ficha inteira do morador.',
    limite: 'O jsonpath pega o campo exato: se a lista tiver dois contêineres, o [0] mostra só o primeiro.',
    solucaoTerminal: ["kubectl get deployment cofre -o jsonpath='{.spec.template.spec.containers[0].image}'"],
    respostaCerta: 'nginx:1.28',
    testes: noCluster('você achou a imagem com jsonpath', [
      { comando: '-o\\s*jsonpath', msg: 'você usou o -o jsonpath' },
      { resposta: /^\s*(docker\.io\/(library\/)?)?nginx:1\.28\s*$/ },
    ]),
  }),
  exercicio({
    id: 'of-autoscale',
    titulo: 'O gerente num comando',
    dificuldade: 'medio',
    cluster: 'of-loja',
    enunciado: '<p>Crie para a <code>loja</code> um HPA de <b>2 a 6</b> réplicas, com alvo de <b>60%</b> de CPU, com um comando só.</p>',
    dica: 'kubectl autoscale deployment loja --min=2 --max=6 --cpu=60%',
    vidaReal: 'Contratar o gerente de temporários com as regras ditas de uma vez: mínimo, máximo e quando chamar.',
    limite: 'O comando cria o HPA, mas sem requests de CPU nos pods ele não consegue calcular a porcentagem.',
    solucaoTerminal: ['kubectl autoscale deployment loja --min=2 --max=6 --cpu=60%'],
    testes: noCluster('a loja tem o seu gerente', [
      { comando: '^kubectl\\s+autoscale\\b', msg: 'você usou o kubectl autoscale' },
      { objeto: 'hpa/loja', campo: 'spec.minReplicas', igual: 2 },
      { objeto: 'hpa/loja', campo: 'spec.maxReplicas', igual: 6 },
      { objeto: 'hpa/loja', campo: 'spec.metrics[0].resource.target.averageUtilization', igual: 60 },
    ]),
  }),
  exercicio({
    id: 'of-colunas',
    titulo: 'A tabela do seu jeito',
    dificuldade: 'medio',
    cluster: 'of-bairro',
    enunciado: `<p>Monte uma tabela dos Deployments com só duas colunas, <code>NOME</code> e <code>IMAGEM</code>, usando
                <code>-o custom-columns</code>. Qual Deployment usa a imagem <code>nginx:1.28</code>?</p>`,
    rotuloResposta: 'O Deployment',
    dica: 'kubectl get deployments -o custom-columns=NOME:.metadata.name,IMAGEM:.spec.template.spec.containers[0].image',
    vidaReal: 'Pedir à administração uma planilha só com o nome e o telefone de cada morador, sem a ficha inteira.',
    limite: 'Cada coluna é um caminho fixo: se um Deployment tiver dois contêineres, o [0] mostra só a imagem do primeiro.',
    solucaoTerminal: ['kubectl get deployments -o custom-columns=NOME:.metadata.name,IMAGEM:.spec.template.spec.containers[0].image'],
    respostaCerta: 'cofre',
    testes: noCluster('você montou a tabela e achou o Deployment', [
      { comando: '-o\\s*custom-columns', msg: 'você usou o -o custom-columns' },
      { resposta: /^\s*(deploy(ment)?s?(\.apps)?\/)?cofre\s*$/i },
    ]),
  }),
  exercicio({
    id: 'of-ordenar',
    titulo: 'Quem chegou por último?',
    dificuldade: 'facil',
    cluster: 'of-bairro',
    enunciado: `<p>Liste os pods em ordem de criação, com <code>--sort-by</code> (o mais novo fica no fim). De qual Deployment
                são os pods mais novos?</p>`,
    rotuloResposta: 'O Deployment',
    dica: 'kubectl get pods --sort-by=.metadata.creationTimestamp',
    vidaReal: 'Pedir a lista de moradores em ordem de chegada, para achar quem se mudou ontem.',
    limite: 'A ordem é pelo campo que você escolhe: dois pods criados no mesmo segundo podem aparecer em qualquer ordem entre si.',
    solucaoTerminal: ['kubectl get pods --sort-by=.metadata.creationTimestamp'],
    respostaCerta: 'vitrine',
    testes: noCluster('você ordenou e achou os pods mais novos', [
      { comando: '--sort-by[= ]\\S*creationTimestamp', msg: 'você ordenou pela criação (--sort-by=.metadata.creationTimestamp)' },
      { resposta: /^\s*(deploy(ment)?s?(\.apps)?\/)?vitrine(-[a-z0-9]+-[a-z0-9]+)?\s*$/i },
    ]),
  }),
  exercicio({
    id: 'of-eventos',
    titulo: 'Só as más notícias',
    dificuldade: 'facil',
    cluster: 'of-bairro',
    enunciado: `<p>Algum Deployment do bairro não está subindo. Sem abrir pod por pod, liste só os avisos do namespace com
                <code>kubectl events --types=Warning</code>. Qual Deployment está com problema?</p>`,
    rotuloResposta: 'O Deployment',
    dica: 'kubectl events --types=Warning (a coluna OBJECT diz de quem é o aviso)',
    vidaReal: 'Ler só as reclamações do livro da portaria, e não o livro inteiro.',
    limite: 'Os eventos somem depois de uma hora: um problema antigo, já sem aviso novo, não aparece mais aqui.',
    solucaoTerminal: ['kubectl events --types=Warning'],
    respostaCerta: 'balcao',
    testes: noCluster('você filtrou os avisos e achou o problema', [
      { comando: '^kubectl\\s+events\\b.*--types[= ]Warning', msg: 'você usou o kubectl events --types=Warning' },
      { resposta: /^\s*(deploy(ment)?s?(\.apps)?\/)?balcao\s*$/i },
    ]),
  }),
  exercicio({
    id: 'of-patch',
    titulo: 'Um remendo cirúrgico',
    dificuldade: 'medio',
    cluster: 'of-loja',
    enunciado: `<p>Na próxima troca de versão, a <code>loja</code> não pode tirar nenhum pod do ar antes do substituto ficar pronto:
                ponha <code>maxUnavailable: 0</code> na estratégia dela com <code>kubectl patch</code>, sem abrir arquivo.</p>`,
    dica: `kubectl patch deployment loja -p '{"spec":{"strategy":{"rollingUpdate":{"maxUnavailable":0}}}}'`,
    vidaReal: 'Trocar uma telha sem reformar o telhado inteiro.',
    limite: 'O patch muda o cluster, não o seu arquivo: no próximo apply do YAML antigo, o campo volta ao que estava lá.',
    solucaoTerminal: [`kubectl patch deployment loja -p '{"spec":{"strategy":{"rollingUpdate":{"maxUnavailable":0}}}}'`],
    testes: noCluster('a loja troca de versão sem tirar ninguém do ar', [
      { comando: '^kubectl\\s+patch\\b', msg: 'você usou o kubectl patch' },
      { objeto: 'deployment/loja', campo: 'spec.strategy.rollingUpdate.maxUnavailable', igual: 0 },
    ]),
  }),
  exercicio({
    id: 'of-set-env',
    titulo: 'Variável sem YAML',
    dificuldade: 'facil',
    cluster: 'of-loja',
    enunciado: '<p>Ponha a variável de ambiente <code>MODO=manutencao</code> na <code>loja</code> com <code>kubectl set env</code>.</p>',
    dica: 'kubectl set env deployment/loja MODO=manutencao',
    vidaReal: 'Mudar o aviso do quadro da portaria sem reimprimir o regulamento.',
    limite: 'Mudar o env muda o template: o Deployment troca todos os pods, um por um, como numa versão nova.',
    solucaoTerminal: ['kubectl set env deployment/loja MODO=manutencao'],
    testes: noCluster('a loja tem o MODO=manutencao', [
      { comando: '^kubectl\\s+set\\s+env\\b', msg: 'você usou o kubectl set env' },
      { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].env[0].name', igual: 'MODO' },
      { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].env[0].value', igual: 'manutencao' },
    ]),
  }),
  exercicio({
    id: 'of-editar',
    titulo: 'Mexendo no objeto vivo',
    dificuldade: 'facil',
    cluster: 'of-loja',
    enunciado: `<p>A <code>loja</code> guarda as 10 últimas versões para o <code>rollout undo</code>. Com <code>kubectl edit</code>, mude
                para guardar só as <b>3</b> últimas (<code>revisionHistoryLimit</code>), direto no objeto do cluster.</p>`,
    dica: 'kubectl edit deployment loja: no editor, ache revisionHistoryLimit: 10, troque para 3 e salve (Ctrl+S).',
    vidaReal: 'Corrigir a ficha do morador direto no fichário da portaria, sem preencher um formulário novo.',
    limite: 'O edit muda o cluster, não o seu arquivo: no próximo apply do YAML antigo, o valor volta (e quem usa GitOps perde a edição na próxima sincronização).',
    solucaoTerminal: [`KUBE_EDITOR="sed -i 's/revisionHistoryLimit: 10/revisionHistoryLimit: 3/'" kubectl edit deployment loja`],
    testes: noCluster('a loja guarda só 3 versões', [
      { comando: 'kubectl\\s+edit\\b', msg: 'você usou o kubectl edit' },
      { objeto: 'deployment/loja', campo: 'spec.revisionHistoryLimit', igual: 3 },
    ]),
  }),
  exercicio({
    id: 'of-depurar',
    titulo: 'O pod descartável',
    dificuldade: 'medio',
    cluster: 'of-loja-ramal',
    enunciado: `<p>Teste o Service <code>loja</code> de dentro do cluster com um pod que se apaga sozinho no fim: <code>kubectl run</code>
                com <code>--rm -i</code>, a imagem <code>busybox:1.36</code> e um <code>wget -qO- http://loja</code>. Qual versão a loja responde?</p>`,
    rotuloResposta: 'A versão',
    dica: 'kubectl run tmp --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- http://loja',
    vidaReal: 'Mandar um entregador de teste até o balcão e ele ir embora assim que voltar com a resposta.',
    limite: 'O pod descartável roda com as regras do namespace: se uma NetworkPolicy barra a saída, ele também é barrado (o que, aliás, ajuda a testar a catraca).',
    solucaoTerminal: ['kubectl run tmp --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- http://loja'],
    respostaCerta: '1.0',
    testes: noCluster('você testou de dentro do cluster, e o pod foi embora', [
      { comando: '^kubectl\\s+run\\b.*--rm', msg: 'você usou o kubectl run --rm' },
      { resposta: /^\s*v?1\.0\s*$/ },
    ]),
  }),
  exercicio({
    id: 'of-contar',
    titulo: 'Conta pra mim',
    dificuldade: 'facil',
    cluster: 'vazio',
    enunciado: `<p>Quantos pods o kind roda no namespace <code>kube-system</code>? Conte no terminal, sem contar de cabeça:
                <code>--no-headers</code> tira o cabeçalho, e <code>| wc -l</code> conta as linhas.</p>`,
    rotuloResposta: 'Quantos pods',
    dica: 'kubectl get pods -n kube-system --no-headers | wc -l',
    vidaReal: 'Pedir ao porteiro só o total de moradores do bloco, e não a lista com todos os nomes.',
    limite: 'O wc conta linhas, não pods: sem o --no-headers, o cabeçalho entra na conta (e um pod a mais aparece do nada).',
    solucaoTerminal: ['kubectl get pods -n kube-system --no-headers | wc -l'],
    respostaCerta: '12',
    testes: noCluster('você contou com o wc -l', [
      { comando: '\\|\\s*wc\\s+-l', msg: 'você contou com | wc -l' },
      { resposta: /^\s*12\s*$/ },
    ]),
  }),
];
