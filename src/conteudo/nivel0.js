// Nível 0: contêineres, antes do Kubernetes. Só lições e quizzes, sem cluster.
import { licao, quiz } from './util.js';

export const NIVEL0 = [
  licao({
    id: 'n0-funciona-na-minha-maquina',
    titulo: '"Funciona na minha máquina"',
    vidaReal: 'Uma casa construída tijolo por tijolo no terreno de cada cliente: cada obra sai um pouco diferente, porque o terreno, o pedreiro e o material mudam.',
    limite: 'Um programa não "desmorona" aos poucos como uma casa: ou ele acha o que precisa, ou para de funcionar de uma vez.',
    conteudo: `
      <p>Todo programa depende de coisas ao redor: uma versão da linguagem (Node 22, Python 3.12), bibliotecas, arquivos de
         configuração, variáveis de ambiente. No computador de quem escreveu, tudo isso está lá. No servidor, pode faltar
         uma peça, ou ter outra versão dela. Aí nasce a frase mais famosa da computação: <b>"na minha máquina funciona"</b>.</p>
      <p>O <b>contêiner</b> resolve isso empacotando o programa <b>junto</b> com tudo de que ele precisa. O pacote roda igual
         no seu notebook, no servidor da empresa e na nuvem, porque leva o próprio "terreno" junto.</p>
      <h2>O que vai dentro</h2>
      <ul>
        <li>o programa (o seu código, já compilado ou pronto para rodar);</li>
        <li>o que ele usa: a linguagem, as bibliotecas e os arquivos;</li>
        <li>o comando que inicia tudo.</li>
      </ul>
      <p>O que <b>não</b> vai: um sistema operacional inteiro. O contêiner usa o núcleo (kernel) da máquina onde roda; por
         isso ele sobe em segundos e ocupa megabytes, não gigabytes como uma máquina virtual.</p>`,
  }),

  licao({
    id: 'n0-imagem-e-conteiner',
    titulo: 'Imagem e contêiner',
    vidaReal: 'A imagem é o módulo pré-fabricado que sai da fábrica sempre igual; o contêiner é esse módulo instalado e funcionando na obra.',
    limite: 'De um módulo de verdade sai uma casa só; de uma imagem saem quantos contêineres você quiser, ao mesmo tempo.',
    conteudo: `
      <p>Duas palavras que todo mundo confunde no começo:</p>
      <ul>
        <li><b>Imagem</b>: o pacote pronto, parado, que não muda. É um arquivo (na verdade, um conjunto de camadas) guardado
            num registry.</li>
        <li><b>Contêiner</b>: a imagem <b>rodando</b>. Tem um processo vivo, memória ocupada, um endereço de rede.</li>
      </ul>
      <p>Da mesma imagem <code>nginx:1.27</code> você pode rodar 1, 3 ou 300 contêineres. Se um contêiner quebra, ninguém
         conserta: joga fora e cria outro a partir da mesma imagem. É isso que o Kubernetes faz o dia inteiro.</p>
      <h2>Camadas</h2>
      <p>Uma imagem é feita de camadas empilhadas: o sistema básico, depois a linguagem, depois as bibliotecas, depois o seu
         código. Camadas iguais são baixadas uma vez só e reaproveitadas, como lajes pré-moldadas que servem para vários
         prédios.</p>
      <h2>O Dockerfile</h2>
      <p>A receita da imagem se chama <b>Dockerfile</b>. Cada instrução vira uma camada:</p>
      <pre><code>FROM node:22-alpine        # a base: Linux mínimo com Node 22
WORKDIR /app
COPY package*.json ./
RUN npm ci                 # instala as dependências
COPY . .                   # o seu código
CMD ["node", "server.js"]  # o comando que roda quando o contêiner sobe</code></pre>`,
  }),

  licao({
    id: 'n0-registry-e-tags',
    titulo: 'Registry e tags: o endereço da imagem',
    vidaReal: 'O registry é a fábrica e depósito de pré-moldados; a tag é o modelo ou o lote que você pede.',
    limite: 'A fábrica de verdade não troca o modelo "lote atual" sem avisar; no registry, a tag latest pode mudar a qualquer hora.',
    conteudo: `
      <p>Toda imagem tem um endereço completo, no formato <code>registry/repositório:tag</code>:</p>
      <pre><code>ghcr.io/minha-empresa/api:2.3.1
└──┬──┘ └──────┬──────┘ └─┬─┘
registry   repositório    tag</code></pre>
      <ul>
        <li><b>Registry</b>: o servidor que guarda as imagens (Docker Hub, <code>ghcr.io</code>, <code>registry.k8s.io</code>...).
            Se você não escreve o registry, vale o Docker Hub (<code>docker.io</code>).</li>
        <li><b>Repositório</b>: o nome da imagem. No Docker Hub, as imagens oficiais ficam em <code>library/</code>:
            <code>nginx</code> é, por extenso, <code>docker.io/library/nginx</code>.</li>
        <li><b>Tag</b>: a versão. Sem tag, vale <code>latest</code>.</li>
      </ul>
      <h2>O perigo do <code>latest</code></h2>
      <p><code>latest</code> não quer dizer "a mais nova": é só uma tag como outra qualquer, que o dono da imagem pode
         apontar para outra versão quando quiser. Hoje <code>nginx:latest</code> é uma versão; amanhã, outra. Em produção,
         use sempre uma tag fixa (<code>nginx:1.27</code>), para saber exatamente o que está rodando.</p>`,
  }),

  licao({
    id: 'n0-por-que-orquestrar',
    titulo: 'Por que orquestrar?',
    vidaReal: 'Uma casinha você mesmo cuida. Um condomínio com 500 apartamentos precisa de uma administração: alguém para alocar, consertar, contar e trocar.',
    limite: 'A administração de um condomínio tem gente; a do Kubernetes são programas que agem sozinhos, em segundos, sem pedir licença.',
    conteudo: `
      <p>Rodar um contêiner é fácil. Rodar centenas, em várias máquinas, o tempo todo, é outra história:</p>
      <ul>
        <li><b>Onde</b> roda cada um? Em qual máquina cabe?</li>
        <li><b>Caiu</b> às 3 da manhã: quem sobe outro?</li>
        <li>Chegou a <b>versão nova</b>: como trocar sem tirar o site do ar?</li>
        <li>A <b>Black Friday</b> chegou: como passar de 3 para 30 cópias?</li>
        <li>Como um contêiner <b>acha o outro</b>, se eles mudam de endereço toda hora?</li>
      </ul>
      <p>Um <b>orquestrador</b> responde tudo isso. Você descreve o que quer ("3 cópias desta imagem, acessíveis por este
         nome") e ele faz acontecer, e continua fazendo: se algo foge do combinado, ele corrige.</p>
      <p>O orquestrador que venceu é o <b>Kubernetes</b>. Ele não cria imagens (isso é com o Docker, o Buildah...) e não
         escreve seu código: ele <b>administra</b> contêineres que já existem.</p>`,
  }),

  licao({
    id: 'n0-kubernetes-timoneiro',
    titulo: 'Kubernetes, o timoneiro',
    vidaReal: 'O timoneiro não rema nem constrói o navio: ele mantém o rumo combinado, corrigindo o leme o tempo todo.',
    limite: 'Um timoneiro decide para onde ir; no Kubernetes quem decide o rumo é você (no YAML). Ele só mantém.',
    conteudo: `
      <p><b>Kubernetes</b> vem do grego κυβερνήτης: <i>timoneiro</i>, quem segura o leme. Por isso o logo é um leme de navio
         e os contêineres viraram a metáfora de carga. Muita gente escreve <b>K8s</b>: um K, 8 letras no meio, um s.</p>
      <p>Ele nasceu no Google, inspirado num sistema interno chamado Borg, e virou projeto aberto em 2014. Hoje é cuidado
         pela CNCF (Cloud Native Computing Foundation) e roda em praticamente toda nuvem.</p>
      <h2>A ideia central: estado desejado</h2>
      <p>Você não manda o Kubernetes "subir um contêiner". Você <b>declara</b>: "quero 3 cópias da loja na versão 1.1". O
         Kubernetes compara o que você quer com o que existe e age para os dois ficarem iguais. E fica comparando para sempre.
         Essa ideia (desejado × real, corrige a diferença) aparece em <b>todo</b> o resto da trilha.</p>
      <p>No próximo nível você conhece o condomínio por dentro: a administração, os prédios e os apartamentos.</p>`,
  }),

  quiz({
    id: 'n0-quiz-imagem-conteiner',
    titulo: 'Quiz: imagem ou contêiner?',
    vidaReal: 'O módulo pré-fabricado (imagem) e o módulo instalado e funcionando (contêiner).',
    limite: 'Da mesma imagem saem vários contêineres ao mesmo tempo.',
    pergunta: '<p>Qual frase está <b>certa</b>?</p>',
    alternativas: [
      { texto: 'O contêiner é a imagem rodando: tem um processo vivo e ocupa memória.', certa: true, explicacao: 'Isso. A imagem é o pacote parado; o contêiner é ela em execução.' },
      { texto: 'A imagem é o contêiner depois que ele para.', explicacao: 'Não: a imagem existe antes (é de onde o contêiner nasce) e continua igual depois.' },
      { texto: 'Cada imagem só pode ter um contêiner de cada vez.', explicacao: 'Não: da mesma imagem saem quantos contêineres você quiser, ao mesmo tempo.' },
      { texto: 'Para mudar o programa, você edita a imagem que já existe.', explicacao: 'Não: imagem não se edita. Você gera uma imagem nova (outra tag).' },
    ],
  }),

  quiz({
    id: 'n0-quiz-quantos',
    titulo: 'Quiz: quantos contêineres?',
    vidaReal: 'De um mesmo projeto de módulo, a fábrica entrega quantos você pedir.',
    limite: 'Na fábrica cada módulo custa material; contêineres da mesma imagem dividem as camadas no disco.',
    pergunta: '<p>Você baixou a imagem <code>nginx:1.27</code> uma vez. Quantos contêineres dá para rodar com ela?</p>',
    alternativas: [
      { texto: 'Um: para outro, é preciso baixar de novo.', explicacao: 'Não precisa baixar de novo: a imagem já está no disco e é reaproveitada.' },
      { texto: 'Quantos a máquina aguentar, todos a partir da mesma imagem.', certa: true, explicacao: 'Isso. O limite é a memória e a CPU da máquina, não a imagem.' },
      { texto: 'Dois: um principal e um de reserva.', explicacao: 'Não existe esse limite. Reserva é uma decisão sua (réplicas), não da imagem.' },
    ],
  }),

  quiz({
    id: 'n0-quiz-referencia',
    titulo: 'Quiz: escreva a referência',
    vidaReal: 'O pedido à fábrica precisa dizer qual fábrica, qual módulo e qual modelo.',
    limite: 'Se você esquece o modelo (a tag), o registry entende latest, e não avisa.',
    pergunta: '<p>Escreva a referência da imagem do <b>nginx</b>, versão <b>1.27</b>, do Docker Hub, do jeito mais curto que funciona.</p>',
    resposta: /^(docker\.io\/(library\/)?)?nginx:1\.27$/,
    explicacao: '<code>nginx:1.27</code>. Por extenso seria <code>docker.io/library/nginx:1.27</code>, mas o registry e o <code>library/</code> podem ficar de fora.',
    dicaErro: 'O formato é nome:tag (o registry Docker Hub pode ficar de fora).',
    exemplos: ['nginx:1.27', 'docker.io/library/nginx:1.27', ' NGINX:1.27 '],
  }),

  quiz({
    id: 'n0-quiz-partes',
    titulo: 'Quiz: as partes do endereço',
    vidaReal: 'Fábrica (registry), módulo (repositório) e modelo (tag).',
    limite: 'Um endereço sem registry vai para o Docker Hub, mesmo que você quisesse outro.',
    pergunta: '<p>Em <code>ghcr.io/minha-empresa/api:2.3.1</code>, qual é o <b>registry</b>?</p>',
    alternativas: [
      { texto: '<code>ghcr.io</code>', certa: true, explicacao: 'Isso: o registry é o servidor (aqui, o do GitHub). <code>minha-empresa/api</code> é o repositório e <code>2.3.1</code> a tag.' },
      { texto: '<code>minha-empresa</code>', explicacao: 'Essa é a "pasta" (organização) dentro do registry: faz parte do repositório.' },
      { texto: '<code>api</code>', explicacao: 'Esse é o nome da imagem, a última parte do repositório.' },
      { texto: '<code>2.3.1</code>', explicacao: 'Essa é a tag (a versão).' },
    ],
  }),

  quiz({
    id: 'n0-quiz-latest',
    titulo: 'Quiz: o que é latest?',
    vidaReal: 'Pedir "o modelo do lote atual" e receber, a cada entrega, um modelo diferente.',
    limite: 'Algumas empresas configuram o registry para tags imutáveis; aí latest não muda. Mas não conte com isso.',
    pergunta: '<p>Sobre a tag <code>latest</code>, o que é verdade?</p>',
    alternativas: [
      { texto: 'É sempre a versão mais nova publicada.', explicacao: 'Esse é o erro clássico: ela aponta para o que o dono quiser, e pode ficar parada numa versão velha.' },
      { texto: 'É uma tag comum, que pode passar a apontar para outra versão a qualquer momento.', certa: true, explicacao: 'Isso. Por isso, em produção, use tags fixas, como <code>nginx:1.27</code>.' },
      { texto: 'O Kubernetes não aceita imagens com latest.', explicacao: 'Aceita, sim (e até baixa de novo a cada vez). Só não é uma boa ideia.' },
    ],
  }),

  quiz({
    id: 'n0-quiz-dockerfile',
    titulo: 'Quiz: leia o Dockerfile',
    vidaReal: 'A receita da fábrica: cada passo é uma camada do módulo.',
    limite: 'Rodar a receita (build) é com o Docker; o Kubernetes só usa a imagem pronta.',
    pergunta: `
      <pre><code>FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "app.py"]</code></pre>
      <p>Quando um contêiner dessa imagem sobe, qual comando ele roda?</p>`,
    alternativas: [
      { texto: '<code>pip install -r requirements.txt</code>', explicacao: 'O RUN roda na hora de <b>construir</b> a imagem, não a cada contêiner.' },
      { texto: '<code>python app.py</code>', certa: true, explicacao: 'Isso: o CMD é o comando padrão do contêiner. No Kubernetes, dá para trocá-lo com <code>command</code> e <code>args</code>.' },
      { texto: '<code>COPY . .</code>', explicacao: 'O COPY põe arquivos dentro da imagem durante o build.' },
    ],
  }),

  quiz({
    id: 'n0-quiz-vm',
    titulo: 'Quiz: contêiner ou máquina virtual?',
    vidaReal: 'Um apartamento divide a estrutura do prédio (fundação, água, luz); uma casa tem tudo próprio.',
    limite: 'O isolamento do contêiner é menor que o de uma máquina virtual: um bug grave no kernel afeta todos.',
    pergunta: '<p>Por que um contêiner sobe em segundos, e uma máquina virtual demora mais?</p>',
    alternativas: [
      { texto: 'Porque o contêiner usa o kernel da máquina onde roda, em vez de ligar um sistema operacional inteiro.', certa: true, explicacao: 'Isso: não há "boot" de sistema. O contêiner é um processo isolado.' },
      { texto: 'Porque o contêiner não tem arquivos.', explicacao: 'Tem, sim: os da imagem. O que ele não tem é um kernel próprio.' },
      { texto: 'Porque o contêiner só roda programas pequenos.', explicacao: 'Roda programas de qualquer tamanho (bancos de dados, inclusive).' },
    ],
  }),

  quiz({
    id: 'n0-quiz-papel-k8s',
    titulo: 'Quiz: o que o Kubernetes faz?',
    vidaReal: 'A administração do condomínio aloca, conserta e conta; ela não fabrica os módulos.',
    limite: 'Alguns serviços de nuvem juntam build e Kubernetes num pacote só, mas são ferramentas diferentes.',
    pergunta: '<p>Qual destas tarefas <b>não</b> é do Kubernetes?</p>',
    alternativas: [
      { texto: 'Recriar um contêiner que caiu.', explicacao: 'Essa é dele: manter o estado desejado.' },
      { texto: 'Distribuir os contêineres entre as máquinas.', explicacao: 'Essa é dele (o scheduler).' },
      { texto: 'Construir a imagem a partir do Dockerfile.', certa: true, explicacao: 'Isso: build de imagem é com Docker, Buildah, Kaniko... O Kubernetes usa a imagem pronta.' },
      { texto: 'Trocar a versão sem tirar o site do ar.', explicacao: 'Essa é dele (o rolling update do Deployment).' },
    ],
  }),
];
