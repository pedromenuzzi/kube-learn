// Os quizzes dos níveis 1 a 11: as pegadinhas que uma missão não testa (o que um campo NÃO faz, a ordem das coisas, o
// que acontece depois). Ficam num arquivo só e entram na trilha logo depois do item `depois` (em niveis.js); o inglês
// fica em src/i18n/en/conteudo/quizzes.json. Construtor: quiz() de util.js, com alternativas que explicam cada escolha.
import { quiz } from './util.js';

/** Um quiz da trilha: `depois` é o id do item que vem antes dele. */
export const novoQuiz = (depois, dados) => ({ ...quiz(dados), depois, arquivo: 'quizzes' });

export const QUIZZES = [
  // Nível 1
  novoQuiz('n1-primeiro-pod', {
    id: 'n1-quiz-apply-create',
    titulo: 'Quiz: apply ou create?',
    vidaReal: 'O create é o pedido de obra nova: se o apartamento já existe, o porteiro devolve. O apply é a planta atualizada: o porteiro compara e muda só a diferença.',
    limite: 'O apply não faz milagre: quase nada no spec de um pod muda depois de criado (dá para trocar a imagem, não para acrescentar um contêiner), e aí é apagar e criar de novo.',
    pergunta: `
      <p>O pod <code>recepcao</code> já existe: você aplicou o <code>recepcao.yaml</code>. Agora acrescenta uma label no
         arquivo e roda <code>kubectl create -f recepcao.yaml</code>. O que acontece?</p>`,
    alternativas: [
      { texto: 'O pod ganha a label nova.', explicacao: 'Isso é o <code>kubectl apply</code>: ele cria ou atualiza. O <code>create</code> só sabe criar.' },
      { texto: 'Nasce um segundo pod <code>recepcao</code>, já com a label.', explicacao: 'Não: no mesmo namespace, dois objetos do mesmo tipo não podem ter o mesmo nome.' },
      { texto: 'Erro: o pod já existe (<code>AlreadyExists</code>), e nada muda.', certa: true, explicacao: 'Isso. Para atualizar a partir do arquivo, use <code>kubectl apply -f</code>; se nada mudou, ele responde <code>unchanged</code>.' },
      { texto: 'O pod antigo é apagado e criado de novo, com a label.', explicacao: 'Nem o <code>create</code> nem o <code>apply</code> apagam o pod para recriar. Uma label nova o <code>apply</code> muda no próprio pod.' },
    ],
  }),
  novoQuiz('n1-namespaces', {
    id: 'n1-quiz-namespace-rede',
    titulo: 'Quiz: o namespace tranca a porta?',
    vidaReal: 'Duas empresas no mesmo condomínio: placas diferentes na porta, mas o corredor é o mesmo.',
    limite: 'No condomínio, cada empresa tranca a própria porta. No cluster, sem NetworkPolicy, nenhuma porta tem tranca.',
    pergunta: `
      <p>O pod <code>sala-de-reuniao</code> do <code>financeiro</code> consegue falar, pela rede, com o
         <code>sala-de-reuniao</code> do <code>rh</code>?</p>`,
    alternativas: [
      { texto: 'Não: namespaces diferentes têm redes separadas.', explicacao: 'Esse é o engano mais comum. O namespace separa os nomes (e, mais à frente, crachás e cotas), não a rede.' },
      { texto: 'Só se os dois pods tiverem a mesma label.', explicacao: 'Labels não abrem nem fecham a rede: elas só servem para escolher pods.' },
      { texto: 'Sim: por padrão, todo pod fala com todo pod.', certa: true, explicacao: 'Isso. Para fechar a passagem existem as catracas (NetworkPolicy), no nível 8.' },
    ],
  }),

  // Nível 2
  novoQuiz('n2-licao-deployment', {
    id: 'n2-quiz-reforma',
    titulo: 'Quiz: o que a troca de versão cria?',
    vidaReal: 'A reforma por etapas: o andar novo é montado ao lado, os moradores mudam aos poucos, e o andar antigo fica vazio, guardado, caso seja preciso voltar.',
    limite: 'Um andar vazio custaria aluguel; um ReplicaSet com 0 pods não gasta nada, mas só os últimos 10 ficam guardados (revisionHistoryLimit).',
    pergunta: '<p>A <code>loja</code> (um Deployment com 3 réplicas) roda a 1.0. Você troca a imagem para a 1.1 e aplica. O que acontece por baixo?</p>',
    alternativas: [
      { texto: 'O ReplicaSet que já existe troca a imagem dos pods, um por um, sem recriá-los.', explicacao: 'Não: o Deployment não reforma o ReplicaSet antigo, cria outro (com outro hash no nome). E os pods são trocados, não reformados: nome novo, IP novo.' },
      { texto: 'Nasce um ReplicaSet novo, que sobe os pods aos poucos; o antigo desce até 0 e fica guardado.', certa: true, explicacao: 'Isso. O ReplicaSet antigo, vazio, é a revisão anterior: é para ele que o <code>kubectl rollout undo</code> volta.' },
      { texto: 'O Deployment apaga os 3 pods de uma vez e só depois cria os 3 novos, já na 1.1.', explicacao: 'Esse é o jeito da estratégia <code>Recreate</code>. O padrão é o <code>RollingUpdate</code>: aos poucos, sem fechar a loja.' },
      { texto: 'Nada por enquanto: os pods só pegam a imagem nova quando alguém os apagar.', explicacao: 'Isso aconteceria com um ReplicaSet sozinho. O Deployment percebe o template novo e começa a troca na hora.' },
    ],
  }),
  novoQuiz('kubectl-escalar', {
    id: 'n2-quiz-scale-e-apply',
    titulo: 'Quiz: o scale e o arquivo',
    vidaReal: 'Os temporários foram contratados por telefone, mas o contrato no arquivo continua dizendo 3: quando alguém reenvia o contrato, valem os 3.',
    limite: 'Para o número mudar de vez, mude o arquivo. E, quando o HPA (nível 6) cuidar das réplicas, o melhor é nem escrever replicas no YAML.',
    pergunta: `
      <p>Na Black Friday, você rodou <code>kubectl scale deploy/loja --replicas=5</code>. Dias depois, alguém aplica o
         <code>loja.yaml</code> do repositório, que diz <code>replicas: 3</code>. Com quantas réplicas a <code>loja</code> fica?</p>`,
    alternativas: [
      { texto: '5', explicacao: 'O <code>scale</code> mudou só o cluster, não o arquivo. O <code>apply</code> escreve o que o arquivo declara.' },
      { texto: '8', explicacao: 'O <code>apply</code> não soma nada: ele deixa o campo igual ao do arquivo.' },
      { texto: '3', certa: true, explicacao: 'Isso: o <code>apply</code> volta o <code>replicas</code> para o que o arquivo diz. Mudança feita pelo terminal some no próximo apply do arquivo antigo.' },
    ],
  }),
  novoQuiz('n2-historico', {
    id: 'n2-quiz-undo',
    titulo: 'Quiz: o número da revisão',
    vidaReal: 'No livro de reformas ninguém arranca páginas: desfazer a reforma é escrever uma página nova dizendo "voltamos ao projeto da abertura".',
    limite: 'No livro de papel, a página antiga continua lá. Aqui o número antigo some, porque o ReplicaSet é o mesmo e só ganha um número novo.',
    pergunta: `
      <p>O <code>kubectl rollout history deploy/loja</code> mostra as revisões 1, 2 e 3. Você roda
         <code>kubectl rollout undo deploy/loja --to-revision=1</code>. Como fica o histórico depois?</p>`,
    alternativas: [
      { texto: '1, 2 e 3, com a 1 marcada como a atual.', explicacao: 'O histórico não tem marcação de "atual": a atual é sempre a de número maior.' },
      { texto: 'Só a 1: as revisões 2 e 3 são apagadas.', explicacao: 'Nada é apagado: as 2 e 3 continuam lá, para você poder voltar a elas também.' },
      { texto: '2, 3 e 4: a revisão 1 virou a 4.', certa: true, explicacao: 'Isso: voltar é andar para a frente. O template da 1 (o mesmo ReplicaSet) ganha o número 4, e o 1 sai da lista.' },
    ],
  }),

  // Nível 3
  novoQuiz('n3-ramal', {
    id: 'n3-quiz-sorteio',
    titulo: 'Quiz: quem atende o ramal?',
    vidaReal: 'A central do ramal sorteia um atendente a cada ligação: não existe fila nem vez.',
    limite: 'Numa central de verdade, a ligação cai em quem está livre. O Service não sabe quem está ocupado: ele só sorteia.',
    pergunta: '<p>Há 3 pods atrás do Service <code>loja</code>. Um cliente abre 3 conexões, uma depois da outra. Como o ramal reparte?</p>',
    alternativas: [
      { texto: 'Em rodízio: uma conexão para cada pod, na ordem, e a quarta voltaria ao primeiro.', explicacao: 'É o que quase todo mundo imagina, mas o kube-proxy (no modo padrão) não guarda a vez de ninguém.' },
      { texto: 'Cada conexão sorteia um pod: um só pode atender as três.', certa: true, explicacao: 'Isso: um sorteio a cada conexão nova. Com muitas conexões a carga fica parecida; com poucas, pode ficar torta. E é por conexão: quem reaproveita a conexão (keep-alive) fala sempre com o mesmo pod.' },
      { texto: 'Todas vão para o pod menos ocupado no momento da conexão.', explicacao: 'O ramal não mede carga: ele não sabe se o atendente está ocupado.' },
      { texto: 'Todas vão para o primeiro pod, até ele cair.', explicacao: 'Não: o Service espalha as conexões entre todos os pods prontos.' },
    ],
  }),
  novoQuiz('n3-target-port', {
    id: 'n3-quiz-porta',
    titulo: 'Quiz: que porta você disca?',
    vidaReal: 'O ramal é o 80 da central; lá dentro, o atendente fica na sala 8080. Quem liga disca o ramal, não o número da sala.',
    limite: 'Discando o IP de um pod, na 8080, você também chega, mas pula o ramal: sem sorteio e sem garantia de que aquele pod ainda existe.',
    pergunta: `
      <p>O Service <code>loja</code> tem <code>port: 80</code> e <code>targetPort: 8080</code>. De dentro de outro pod,
         qual endereço chega na loja pelo ramal?</p>`,
    alternativas: [
      { texto: '<code>http://loja</code> (a porta 80)', certa: true, explicacao: 'Isso: o cliente usa a <code>port</code> do Service (a 80, padrão do http), e o Service entrega na <code>targetPort</code> (8080) do pod sorteado.' },
      { texto: '<code>http://loja:8080</code>', explicacao: 'O Service não ouve na 8080: ela é a porta dentro do pod. No ramal, a porta é a 80.' },
      { texto: 'Os dois: o Service ouve nas duas portas.', explicacao: 'Não: o Service ouve só nas portas da lista <code>ports</code> (aqui, a 80).' },
    ],
  }),
  novoQuiz('n3-licao-ingress-gateway', {
    id: 'n3-quiz-ingress-sem-controlador',
    titulo: 'Quiz: o balcão sem funcionário',
    vidaReal: 'Pendurar a placa "balcão de informações" numa portaria sem funcionário: a placa existe, mas ninguém atende.',
    limite: 'Numa portaria de verdade alguém estranharia a placa sem funcionário. O Kubernetes não estranha: o Ingress fica lá, sem ADDRESS, e ninguém avisa.',
    pergunta: '<p>Num cluster sem nenhum controlador de Ingress, você aplica um Ingress que manda <code>/api</code> para o Service <code>loja</code>. O que acontece?</p>',
    alternativas: [
      { texto: 'O apply é recusado: falta o controlador.', explicacao: 'O porteiro aceita: o Ingress é só um objeto guardado no livro. Ele não confere se alguém vai cumprir.' },
      { texto: 'O Kubernetes instala um controlador sozinho.', explicacao: 'Não instala: escolher e instalar o controlador (Traefik, NGINX, HAProxy...) é com quem cuida do cluster.' },
      { texto: 'O Service <code>loja</code> vira LoadBalancer.', explicacao: 'O Ingress não muda o Service: ele só aponta para ele.' },
      { texto: 'O Ingress é criado, mas nada passa a responder.', certa: true, explicacao: 'Isso: sem controlador, ninguém lê as regras. O Ingress fica sem endereço (a coluna ADDRESS vazia).' },
    ],
  }),

  // Nível 4
  novoQuiz('n4-aviso-novo', {
    id: 'n4-quiz-aviso-mudou',
    titulo: 'Quiz: quem vê o aviso novo?',
    vidaReal: 'Quem tem o cartaz pendurado na sala vê o aviso novo; quem copiou o aviso num caderno ao se mudar continua com a cópia velha.',
    limite: 'O cartaz muda sozinho, mas alguém precisa olhar de novo: um programa que só lê o arquivo quando sobe também não percebe a mudança.',
    pergunta: '<p>Três pods leem o ConfigMap <code>loja-config</code>, cada um de um jeito. Você muda o ConfigMap. Qual deles vê o valor novo sem reiniciar?</p>',
    alternativas: [
      { texto: 'O que lê uma chave com <code>env</code> e <code>configMapKeyRef</code>.', explicacao: 'A variável de ambiente é lida quando o contêiner nasce e não muda mais.' },
      { texto: 'O que lê todas as chaves com <code>envFrom</code>.', explicacao: 'Também é variável de ambiente: fica com o valor do nascimento.' },
      { texto: 'O que monta o ConfigMap como volume numa pasta.', certa: true, explicacao: 'Isso: o arquivo montado acompanha sozinho, em até um minuto, mais ou menos. Exceção: montado com <code>subPath</code> (um arquivo só, dentro de uma pasta que já existe), ele não acompanha.' },
      { texto: 'Nenhum: o kubelet reinicia todos os pods quando o ConfigMap muda.', explicacao: 'Ninguém reinicia nada sozinho. Para as variáveis mudarem, é você quem roda <code>kubectl rollout restart</code>.' },
    ],
  }),
  novoQuiz('n4-mesa-compartilhada', {
    id: 'n4-quiz-mesa',
    titulo: 'Quiz: a mesa depois do tombo',
    vidaReal: 'O morador desmaiou e voltou: a mesa continua com os papéis em cima. Na mudança (um pod novo), a mesa fica para trás.',
    limite: 'Uma mesa de verdade poderia ir junto na mudança; o emptyDir nunca vai: pod novo, mesa vazia.',
    pergunta: '<p>O contêiner <code>nginx</code> do pod <code>placa</code> caiu e o kubelet o reiniciou. O que aconteceu com o que estava no emptyDir?</p>',
    alternativas: [
      { texto: 'Sumiu junto com o contêiner: o kubelet recomeça com a pasta vazia.', explicacao: 'O que some no reinício é o que foi gravado no disco do próprio contêiner, fora dos volumes. O emptyDir é do pod.' },
      { texto: 'Continua lá: o pod é o mesmo, e o emptyDir é dele.', certa: true, explicacao: 'Isso: o emptyDir sobrevive ao reinício de contêiner. Ele só some quando o pod sai (apagado, despejado ou trocado por um Deployment).' },
      { texto: 'Foi copiado para um PVC, que o kubelet cria para guardar o volume.', explicacao: 'Ninguém copia nada para um PVC sozinho: o PVC é um pedido seu, separado.' },
    ],
  }),
  novoQuiz('n4-encolher', {
    id: 'n4-quiz-volta-da-temporada',
    titulo: 'Quiz: a volta da temporada',
    vidaReal: 'O morador do 1 volta da viagem e o box 1 está lá, com as coisas dele dentro.',
    limite: 'No condomínio, ninguém esquece um box cheio. No cluster, o PVC parado não avisa ninguém. Dá para pedir que ele seja apagado ao diminuir (persistentVolumeClaimRetentionPolicy), mas aí o dado vai junto.',
    pergunta: '<p>Você diminuiu o <code>db</code> de 3 para 1 réplica, e os PVCs <code>dados-db-1</code> e <code>dados-db-2</code> ficaram. Agora volta para 3. O que o <code>db-1</code> novo recebe?</p>',
    alternativas: [
      { texto: 'Um disco novo, vazio.', explicacao: 'O PVC <code>dados-db-1</code> ainda existe: o StatefulSet não pede outro.' },
      { texto: 'Uma cópia dos dados do <code>db-0</code>.', explicacao: 'O StatefulSet não copia dados entre réplicas: isso é trabalho do programa (o redis, o postgres).' },
      { texto: 'Nada: o <code>db-1</code> não volta enquanto alguém não apagar o PVC velho.', explicacao: 'O PVC velho não atrapalha: é exatamente o que o <code>db-1</code> procura.' },
      { texto: 'O mesmo PVC <code>dados-db-1</code>, com os dados de antes.', certa: true, explicacao: 'Isso: o nome do PVC segue o do pod, e o <code>db-1</code> reencontra o box dele. É por isso que os PVCs ficam quando o StatefulSet diminui.' },
    ],
  }),

  // Nível 5
  novoQuiz('n5-coleta', {
    id: 'n5-quiz-coleta-atrasada',
    titulo: 'Quiz: a coleta atrasada',
    vidaReal: 'O caminhão das 7h05 sai mesmo que o das 7h00 ainda esteja na rua: são dois caminhões no mesmo quarteirão.',
    limite: 'Dois caminhões juntos só atrapalham o trânsito; dois Jobs juntos podem estragar dados (dois backups gravando o mesmo arquivo). Para esses, Forbid.',
    pergunta: '<p>A <code>limpeza</code> roda a cada 5 minutos. Hoje, uma rodada demorou 7 minutos. O que acontece quando dá a hora da próxima?</p>',
    alternativas: [
      { texto: 'O CronJob espera a rodada atrasada terminar e só então começa a próxima.', explicacao: 'Ele não espera nunca. Com <code>concurrencyPolicy: Forbid</code>, ele pula a rodada nova.' },
      { texto: 'Começa outra rodada, ao mesmo tempo que a atrasada.', certa: true, explicacao: 'Isso: o padrão (<code>concurrencyPolicy: Allow</code>) deixa as duas rodarem juntas. <code>Forbid</code> pula a nova; <code>Replace</code> para a velha e começa a nova.' },
      { texto: 'A rodada atrasada é cancelada.', explicacao: 'Só com <code>concurrencyPolicy: Replace</code>. O padrão deixa as duas rodando.' },
    ],
  }),
  novoQuiz('n5-coleta-agora', {
    id: 'n5-quiz-fuso',
    titulo: 'Quiz: 3h de onde?',
    vidaReal: 'A coleta segue o relógio da administração, não o seu: se a administração acerta o relógio por Greenwich, as 3h dela são meia-noite em Brasília.',
    limite: 'No condomínio, todo mundo vive no mesmo fuso. Um cluster na nuvem quase sempre usa UTC, esteja onde estiver.',
    pergunta: `
      <p>O CronJob <code>backup</code> tem <code>schedule: "0 3 * * *"</code>, sem <code>timeZone</code>. A Dona Conceição
         (o controller manager) usa o relógio em UTC, e a empresa segue o horário de Brasília (UTC−3). A que horas de
         Brasília o backup roda?</p>`,
    alternativas: [
      { texto: 'Às 3h.', explicacao: 'Seria assim se o controller manager usasse o horário de Brasília. Ele usa UTC.' },
      { texto: 'Às 6h.', explicacao: 'A conta é ao contrário: Brasília está 3 horas atrás do UTC, não na frente.' },
      { texto: 'Depende do fuso do computador de quem aplicou o YAML.', explicacao: 'O kubectl não manda fuso nenhum: o horário é lido pelo controller manager, no cluster.' },
      { texto: 'À meia-noite.', certa: true, explicacao: 'Isso: sem <code>spec.timeZone</code>, vale o fuso do controller manager (quase sempre UTC), e 3h em UTC é meia-noite em Brasília. Para 3h daqui: <code>timeZone: America/Sao_Paulo</code>.' },
    ],
  }),

  // Nível 6
  novoQuiz('n6-pronto-para-atender', {
    id: 'n6-quiz-readiness',
    titulo: 'Quiz: quando a readiness falha',
    vidaReal: 'O atendente diz "agora não posso": a portaria para de mandar clientes, mas ninguém tira ele da cadeira.',
    limite: 'Se todos dizem "agora não posso" ao mesmo tempo, o ramal fica sem ninguém e a ligação é recusada: a readiness não chama reforço.',
    pergunta: '<p>Um pod da <code>loja</code> estava pronto. Agora a readinessProbe dele falha 3 vezes seguidas, e a livenessProbe continua passando. O que acontece?</p>',
    alternativas: [
      { texto: 'O kubelet reinicia o contêiner, como faria se a liveness falhasse.', explicacao: 'Quem reinicia é a liveness, e ela está passando. A readiness só decide se o pod recebe clientes.' },
      { texto: 'O Deployment apaga o pod e cria outro no lugar, num node qualquer.', explicacao: 'Ninguém apaga o pod por causa da readiness: ele continua lá, esperando melhorar.' },
      { texto: 'O pod sai dos endpoints do Service (READY 0/1), mas continua rodando.', certa: true, explicacao: 'Isso: fora do ramal, sem reinício. Quando a probe volta a passar, o pod volta a receber clientes.' },
      { texto: 'Nada muda: o pod só fica marcado como não pronto, e segue atendendo.', explicacao: 'Muda, sim: um pod não pronto deixa de receber clientes pelo Service.' },
    ],
  }),
  novoQuiz('n6-potencia-demais', {
    id: 'n6-quiz-request-limit',
    titulo: 'Quiz: o scheduler olha o limit?',
    vidaReal: 'O prédio aceita o morador pela potência contratada; o disjuntor dele pode ser maior que a sobra do prédio, porque nem todo mundo liga tudo ao mesmo tempo.',
    limite: 'Se todos puxam até o limit ao mesmo tempo, a CPU é dividida (todo mundo fica lento); a memória não se divide: alguém é morto ou despejado.',
    pergunta: '<p>No <code>node-1</code> sobra 1 CPU (somando os requests de quem já mora lá). Chega um pod com <code>requests.cpu: 500m</code> e <code>limits.cpu: 2</code>. O scheduler pode pôr ele no <code>node-1</code>?</p>',
    alternativas: [
      { texto: 'Não: o limit de 2 CPUs não cabe em 1.', explicacao: 'O scheduler não olha o limit, só o request. O limit pode passar do que o node tem.' },
      { texto: 'Só se o pod estiver usando menos de 1 CPU agora.', explicacao: 'O scheduler não olha o uso (o <code>kubectl top</code>): o pod nem começou. Ele soma as reservas.' },
      { texto: 'Sim: o scheduler só soma os requests, não os limits.', certa: true, explicacao: 'Isso: 500m cabem na sobra de 1 CPU. O limit de 2 só diz até onde o contêiner pode puxar, se houver CPU livre.' },
    ],
  }),
  novoQuiz('n6-black-friday', {
    id: 'n6-quiz-hpa-replicas',
    titulo: 'Quiz: o gerente e o arquivo',
    vidaReal: 'O gerente contratou 6 temporários; chega o contrato antigo dizendo 2 e o RH dispensa 4. Minutos depois, o gerente contrata de novo.',
    limite: 'No RH de verdade, alguém perceberia a briga. No cluster ninguém avisa: o número sobe e desce, e os clientes sentem.',
    pergunta: '<p>O HPA levou a <code>loja</code> para 6 réplicas. No meio da promoção, alguém aplica o <code>loja.yaml</code>, que diz <code>replicas: 2</code>. O que acontece?</p>',
    alternativas: [
      { texto: 'Cai para 2, e o HPA sobe de novo na próxima conta: os dois brigam.', certa: true, explicacao: 'Isso. Com HPA, deixe o <code>replicas</code> fora do YAML: quem decide o número é o gerente.' },
      { texto: 'O apply é recusado, porque quem cuida das réplicas da loja agora é o HPA.', explicacao: 'O apply não sabe do HPA: ele escreve o que o arquivo diz.' },
      { texto: 'O HPA trava o número em 6, e o apply ignora o campo.', explicacao: 'O HPA não trava nada: ele só muda o <code>replicas</code> de tempos em tempos, como qualquer um.' },
      { texto: 'O HPA é apagado.', explicacao: 'Não: o HPA é um objeto separado e continua lá (por isso a briga).' },
    ],
  }),

  // Nível 7
  novoQuiz('n7-predio-restrito', {
    id: 'n7-quiz-toleration',
    titulo: 'Quiz: a autorização leva até lá?',
    vidaReal: 'A autorização para entrar no prédio da GPU não é uma ordem de mudar para lá: o morador autorizado pode muito bem ir morar no prédio comum.',
    limite: 'No condomínio, quem tem autorização costuma ir para o prédio especial. No cluster, a corretora não liga para a autorização na hora de escolher: só o nodeSelector (ou a affinity) puxa o pod para lá.',
    pergunta: `
      <p>O <code>node-2</code> tem o taint <code>dedicado=gpu:NoSchedule</code>. Um pod tem a toleration para esse taint e
         nenhum nodeSelector nem affinity. Onde ele pode cair?</p>`,
    alternativas: [
      { texto: 'Só no <code>node-2</code>: é o node que ela tolera.', explicacao: 'A toleration não leva ninguém até lá: ela só tira a placa do caminho.' },
      { texto: 'No <code>node-1</code> ou no <code>node-2</code>: a toleration permite, não obriga.', certa: true, explicacao: 'Isso. Para ir só para o <code>node-2</code>, junte a toleration com um nodeSelector (<code>dedicado: gpu</code>).' },
      { texto: 'Em nenhum: fica Pending até ganhar um nodeSelector.', explicacao: 'O <code>node-1</code> não tem taint nenhum: qualquer pod entra.' },
      { texto: 'Em qualquer node, inclusive o <code>control-plane</code>, que também tem um taint.', explicacao: 'O <code>control-plane</code> tem outro taint (<code>node-role.kubernetes.io/control-plane</code>), que essa toleration não cobre.' },
    ],
  }),
  novoQuiz('n7-esvaziar', {
    id: 'n7-quiz-uncordon',
    titulo: 'Quiz: o prédio reabriu',
    vidaReal: 'A reforma acabou e o prédio reabriu, mas ninguém se muda de volta só porque a placa saiu.',
    limite: 'Moradores de verdade talvez quisessem voltar. No cluster, o node fica vazio até chegarem pods novos (um rollout, uma réplica a mais).',
    pergunta: '<p>Você esvaziou o <code>node-1</code> (<code>kubectl drain</code>), trocou o disco e rodou <code>kubectl uncordon node-1</code>. O que acontece com os pods que saíram de lá?</p>',
    alternativas: [
      { texto: 'Voltam para o <code>node-1</code> sozinhos.', explicacao: 'Ninguém manda eles voltarem: o uncordon só tira a interdição.' },
      { texto: 'O scheduler redistribui tudo, para equilibrar os nodes.', explicacao: 'O scheduler só escolhe na chegada: nunca move um pod que já está rodando.' },
      { texto: 'Ficam onde estão; só os próximos pods podem ir para o <code>node-1</code>.', certa: true, explicacao: 'Isso: o node volta a aceitar pods novos, e os antigos seguem nos outros nodes até serem trocados.' },
    ],
  }),
  novoQuiz('n7-pdb', {
    id: 'n7-quiz-pdb',
    titulo: 'Quiz: o que o PDB segura?',
    vidaReal: 'O combinado dos elevadores vale para a reforma marcada; se cai a luz, o prédio cai com quem estiver dentro.',
    limite: 'No condomínio, furar o combinado dá briga. No cluster, um kubectl delete passa por cima do PDB sem nem perguntar.',
    pergunta: '<p>A <code>loja</code> tem 3 réplicas e um PDB com <code>minAvailable: 2</code>. Qual destas situações o PDB segura?</p>',
    alternativas: [
      { texto: 'O <code>node-1</code> perde a luz, com 2 pods da loja dentro.', explicacao: 'Queda não pede licença: o PDB não tem a quem dizer "não".' },
      { texto: 'Um <code>kubectl delete pod</code> nos 3 pods.', explicacao: 'O delete não passa pela API de eviction: o PDB nem é consultado.' },
      { texto: 'Uma troca de versão da loja (o rolling update).', explicacao: 'A troca de versão segue o <code>maxUnavailable</code> do Deployment, não o PDB.' },
      { texto: 'Um <code>kubectl drain</code> que deixaria só 1 pod pronto.', certa: true, explicacao: 'Isso: o drain despeja pela API de eviction, que consulta o PDB e espera os substitutos ficarem prontos.' },
    ],
  }),

  // Nível 8
  novoQuiz('n8-licao-rbac', {
    id: 'n8-quiz-rolebinding',
    titulo: 'Quiz: até onde vai o crachá?',
    vidaReal: 'O modelo de crachá "visitante" é do condomínio inteiro, mas a portaria do bloco B só entrega crachás que abrem o bloco B.',
    limite: 'Um crachá de verdade pode ser emprestado. No cluster, ele vale só para quem o recebeu (User, Group ou ServiceAccount).',
    pergunta: '<p>Um RoleBinding no namespace <code>loja</code> entrega à <code>ana</code> a ClusterRole <code>view</code>. Onde a ana pode ler?</p>',
    alternativas: [
      { texto: 'Em todos os namespaces, porque <code>view</code> é uma ClusterRole.', explicacao: 'Quem decide o alcance é a entrega, não o crachá: um RoleBinding vale só no namespace dele.' },
      { texto: 'Só no namespace <code>loja</code>.', certa: true, explicacao: 'Isso. A ClusterRole é só o modelo do crachá. Para valer em todos os namespaces, é ClusterRoleBinding.' },
      { texto: 'Em nenhum: um RoleBinding não pode apontar para uma ClusterRole.', explicacao: 'Pode, e é comum: assim se reaproveitam <code>view</code>, <code>edit</code> e <code>admin</code> em vários namespaces, sem copiar a Role.' },
    ],
  }),
  novoQuiz('n8-licao-netpol', {
    id: 'n8-quiz-cni',
    titulo: 'Quiz: a catraca de papel',
    vidaReal: 'A administração aprovou a catraca no papel, mas ninguém instalou a catraca na porta: o papel está no arquivo, e a porta continua aberta.',
    limite: 'Numa obra de verdade, alguém veria a porta sem catraca. No cluster, a política aparece no kubectl get netpol como se funcionasse.',
    pergunta: '<p>Você aplica uma NetworkPolicy que fecha a entrada de todos os pods do namespace. Ela é aceita, mas tudo continua passando. Qual pode ser o motivo?</p>',
    alternativas: [
      { texto: 'A política só vale para os pods criados depois dela.', explicacao: 'Ela vale na hora, também para os pods que já existem.' },
      { texto: 'NetworkPolicy só bloqueia o que vem de outros namespaces.', explicacao: 'Bloqueia de qualquer lugar, inclusive do mesmo namespace.' },
      { texto: 'O plugin de rede (CNI) do cluster não implementa NetworkPolicy.', certa: true, explicacao: 'Isso: a API guarda a política, mas quem barra os pacotes é o CNI. Com um que não implementa, a política vira enfeite, sem erro nenhum.' },
    ],
  }),
  novoQuiz('n8-so-a-vitrine', {
    id: 'n8-quiz-catracas-somam',
    titulo: 'Quiz: duas catracas na mesma porta',
    vidaReal: 'Cada catraca nova é mais uma lista de quem pode passar: o porteiro deixa entrar quem estiver em qualquer uma das listas.',
    limite: 'Num prédio, uma placa de "proibido" pode valer mais que um passe. Aqui não existe placa de proibido: quem fecha é a falta de passe.',
    pergunta: `
      <p>No namespace <code>rede</code>, duas políticas escolhem a <code>api</code>: a <code>nega-tudo</code> (fecha a
         entrada) e a que libera a entrada para <code>app=vitrine</code>. A vitrine passa?</p>`,
    alternativas: [
      { texto: 'Não: negar vale mais que liberar.', explicacao: 'Uma NetworkPolicy não tem como negar: cada uma só libera, e as liberações somam.' },
      { texto: 'Depende de qual política foi aplicada por último.', explicacao: 'A ordem não importa: não há prioridade entre elas.' },
      { texto: 'Sim: as regras somam, e passa o que qualquer uma liberar.', certa: true, explicacao: 'Isso. A <code>nega-tudo</code> só "fecha" porque escolhe os pods sem liberar nada; a outra acrescenta uma liberação.' },
    ],
  }),

  // Nível 9
  novoQuiz('n9-licao-plantao', {
    id: 'n9-quiz-previous',
    titulo: 'Quiz: o diário da véspera',
    vidaReal: 'O morador desmaia, é acordado e não lembra de nada: o que ele disse antes de desmaiar está no diário da véspera.',
    limite: 'O cluster guarda só a tentativa anterior: as mais antigas se perdem. Para guardar tudo, os logs vão para outro lugar (Loki, Elasticsearch).',
    pergunta: '<p>O banco cai a cada minuto (o RESTARTS não para de subir). Agora ele está Running de novo, e <code>kubectl logs NOME</code> só mostra a subida, sem erro nenhum. Onde está a mensagem do erro?</p>',
    alternativas: [
      { texto: 'Em <code>kubectl logs NOME --previous</code>.', certa: true, explicacao: 'Isso: o contêiner que roda agora é outro, que acabou de subir. O erro ficou no log da tentativa anterior.' },
      { texto: 'Em lugar nenhum: o log some junto com o contêiner que caiu.', explicacao: 'O kubelet guarda o log da última tentativa: é o que o <code>--previous</code> mostra.' },
      { texto: 'Em <code>kubectl get pods -o wide</code>.', explicacao: 'Ele mostra o node e o IP, não o que o programa escreveu.' },
    ],
  }),
  novoQuiz('n9-imagem-errada', {
    id: 'n9-quiz-apagar-o-pod',
    titulo: 'Quiz: apagar o pod resolve?',
    vidaReal: 'Jogar fora o pré-moldado com defeito não adianta se o pedido à fábrica continua com o modelo errado: chega outro igual.',
    limite: 'Às vezes apagar o pod resolve, sim: quando o defeito era do pod (um estado travado, um node ruim), e não da planta.',
    pergunta: '<p>Os pods da <code>vitrine</code> (um Deployment) estão em ImagePullBackOff: o YAML pede <code>nginx:1.27-vitrine</code>, uma tag que nunca foi enviada ao registry. Você apaga um deles com <code>kubectl delete pod</code>. O que acontece?</p>',
    alternativas: [
      { texto: 'Nasce outro pod, e desta vez a imagem é encontrada.', explicacao: 'O pod novo sai do mesmo template, que continua pedindo a tag que não existe no registry.' },
      { texto: 'A vitrine fica com um pod a menos.', explicacao: 'O Deployment (pelo ReplicaSet) repõe o pod na hora.' },
      { texto: 'Nasce outro pod, com a mesma imagem errada, e o erro volta.', certa: true, explicacao: 'Isso: o conserto é no Deployment (no YAML ou com <code>kubectl set image</code>). Aí os pods são trocados sozinhos.' },
    ],
  }),

  // Nível 10
  novoQuiz('n10-upgrade', {
    id: 'n10-quiz-install-de-novo',
    titulo: 'Quiz: install ou upgrade?',
    vidaReal: 'Pedir à construtora uma obra nova com o nome de uma que já existe: ela recusa e manda pedir uma reforma.',
    limite: 'Duas obras com o mesmo nome podem existir, em blocos diferentes: o nome da release é único só dentro do namespace.',
    pergunta: '<p>A release <code>loja</code> já está instalada. Para trocar a versão, alguém roda <code>helm install loja kube-learn/loja --set image.tag=1.1</code>. O que acontece?</p>',
    alternativas: [
      { texto: 'A release <code>loja</code> é atualizada para a 1.1.', explicacao: 'Isso é o <code>helm upgrade</code>. O <code>install</code> só cria release nova.' },
      { texto: 'Erro: o nome <code>loja</code> já está em uso, e nada muda.', certa: true, explicacao: 'Isso. Para mudar uma release que existe: <code>helm upgrade</code> (ou <code>helm upgrade --install</code>, que instala se ainda não existir).' },
      { texto: 'Nasce uma segunda <code>loja</code>, ao lado da primeira.', explicacao: 'No mesmo namespace, o nome da release é único. Para uma segunda, outro nome.' },
      { texto: 'A release é apagada e instalada de novo.', explicacao: 'O Helm não apaga nada sem um <code>helm uninstall</code>.' },
    ],
  }),
  novoQuiz('n10-overlay-prod', {
    id: 'n10-quiz-overlay',
    titulo: 'Quiz: o overlay mexe na base?',
    vidaReal: 'A folha da filial diz "aqui, 3 atendentes": a planta original continua na gaveta, igual, para as outras cidades.',
    limite: 'Uma folha de papel fica arquivada; o resultado do Kustomize não fica em lugar nenhum. Para ver o que foi para o cluster, rode kubectl kustomize de novo.',
    pergunta: '<p>O <code>overlays/prod</code> pede 3 réplicas e a tag 1.1. Você roda <code>kubectl apply -k overlays/prod</code>. O que acontece com o <code>base/deployment.yaml</code>?</p>',
    alternativas: [
      { texto: 'É reescrito com <code>replicas: 3</code> e a tag 1.1, para guardar o que foi aplicado.', explicacao: 'O Kustomize nunca escreve nos seus arquivos: ele só lê.' },
      { texto: 'Nada: o Kustomize junta tudo na hora e só manda o resultado.', certa: true, explicacao: 'Isso. A base fica igual, e os outros overlays (dev, homologação) continuam partindo dela.' },
      { texto: 'Continua igual, mas o overlay de dev também passa a ter 3 réplicas.', explicacao: 'Cada overlay só enxerga a base e os próprios ajustes: o de dev nem sabe que o de prod existe.' },
    ],
  }),
  novoQuiz('n10-crd', {
    id: 'n10-quiz-crd-sem-operador',
    titulo: 'Quiz: o formulário sem especialista',
    vidaReal: 'O pedido de backup é aceito no protocolo e arquivado, mas o especialista ainda não foi contratado: o pedido fica na pilha.',
    limite: 'Quando o especialista chega, ele lê a pilha inteira: o operador atende também os pedidos que já existiam.',
    pergunta: '<p>Num cluster com o CRD <code>backups.kube-learn.dev</code>, mas sem o operador de backup, você aplica o Backup <code>noturno</code>. O que acontece?</p>',
    alternativas: [
      { texto: 'O apply é recusado: falta o operador que entende o tipo Backup.', explicacao: 'O CRD já ensinou o tipo à API: o Backup é aceito (e validado pelo esquema).' },
      { texto: 'O Kubernetes cria o CronJob do backup sozinho, a partir do CRD.', explicacao: 'O Kubernetes não sabe o que um Backup quer dizer: quem cria o CronJob é o operador.' },
      { texto: 'O Backup fica guardado, mas nenhum backup é feito.', certa: true, explicacao: 'Isso: o CRD só guarda o pedido (o <code>kubectl get backups</code> mostra o <code>noturno</code>). Quem age é o operador.' },
    ],
  }),

  // Nível 11
  novoQuiz('n11-zero-5', {
    id: 'n11-quiz-pdb-rollout',
    titulo: 'Quiz: quem segura a troca de versão?',
    vidaReal: 'O combinado dos elevadores é com a administração, para a manutenção dos prédios; a reforma da loja segue as regras da própria loja.',
    limite: 'Na vida real, um combinado de "pelo menos 3" valeria para tudo. No cluster, cada regra só vale para quem a consulta.',
    pergunta: '<p>A <code>loja</code> tem 4 réplicas, o PDB com <code>minAvailable: 3</code> e o rolling update com <code>maxUnavailable: 0</code>. Durante a troca de versão, quem garante os pods prontos?</p>',
    alternativas: [
      { texto: 'O PDB, que conta os pods prontos durante a troca.', explicacao: 'O PDB só vale para despejos pela API de eviction (o drain). O rollout nem consulta o PDB.' },
      { texto: 'Os dois juntos: o mais rígido vence.', explicacao: 'Não se somam: o rollout não consulta o PDB, e o drain não olha a estratégia.' },
      { texto: 'A estratégia do Deployment (<code>maxUnavailable: 0</code>).', certa: true, explicacao: 'Isso. Cada um protege um momento: a estratégia, a troca de versão; o PDB, a manutenção dos nodes.' },
    ],
  }),
  novoQuiz('n11-cofre-5', {
    id: 'n11-quiz-normas-e-pods-antigos',
    titulo: 'Quiz: a norma nova e quem já mora',
    vidaReal: 'A norma nova dos bombeiros vale para quem se muda daqui para a frente; quem já mora fica, até sair.',
    limite: 'Os bombeiros de verdade poderiam interditar um apartamento irregular. O Pod Security não: ele só barra na porta.',
    pergunta: `
      <p>O namespace <code>legado</code> tem pods rodando como root. Você põe nele a label
         <code>pod-security.kubernetes.io/enforce=restricted</code>. O que acontece com esses pods?</p>`,
    alternativas: [
      { texto: 'São despejados na hora.', explicacao: 'Os bombeiros não despejam ninguém: a norma vale na criação dos pods.' },
      { texto: 'O <code>kubectl label</code> é recusado enquanto houver pod fora da norma.', explicacao: 'A label é aceita; a resposta só vem com um aviso.' },
      { texto: 'Continuam rodando; o <code>kubectl label</code> só avisa (Warning).', certa: true, explicacao: 'Isso: o aviso lista os pods que violam a norma. Cuidado: se um deles cair ou for trocado, o pod novo é recusado. Ajuste os pods antes de pôr a norma.' },
      { texto: 'São reiniciados como um usuário comum, para cumprir a norma.', explicacao: 'O Pod Security não muda os pods: ele só aceita ou recusa.' },
    ],
  }),
];
