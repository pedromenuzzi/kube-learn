// O Plantão do dia: um incidente novo a cada dia, o mesmo para todo mundo (um rodízio pela data). A aplicação de um
// morador chega com dois defeitos de tipos diferentes; tests/plantao.test.js confere todas as duplas (a correção passa
// e o começo falha). Fica fora da trilha, como o Troubleshooting: não vale XP.
import { incidente } from '../conteudo/nivel9.js';
import { yaml } from '../conteudo/util.js';
import { t } from '../i18n.js';

/** Os clusters de partida dos plantões já montados (clusters.js procura aqui o que não está na lista fixa). */
export const PARTIDA_PL = {};

/** As aplicações dos moradores (todas rodam a loja virtual kubelearn/loja). */
export const CENARIOS = [
  { app: 'padaria', titulo: () => t('A padaria fora do ar'), morador: () => t('Dona Rosa, da padaria do térreo'), relato: () => t('Atualizei o sistema de encomendas ontem à noite, seguindo um tutorial, e hoje de manhã ninguém consegue fazer pedido. O pão está esfriando!') },
  { app: 'farmacia', titulo: () => t('A farmácia sem sistema'), morador: () => t('Seu Antônio, da farmácia'), relato: () => t('O sistema da farmácia parou depois que o meu sobrinho "deu uma arrumada" nos arquivos. Tenho receita para separar e nada funciona.') },
  { app: 'academia', titulo: () => t('O app da academia não abre'), morador: () => t('Carla, da academia do 2º andar'), relato: () => t('Mexeram na configuração do app da academia para a promoção de verão, e agora ele não abre. Os alunos estão reclamando na porta.') },
  { app: 'biblioteca', titulo: () => t('O catálogo da biblioteca sumiu'), morador: () => t('Seu Benedito, da biblioteca do condomínio'), relato: () => t('O catálogo sumiu depois da manutenção de domingo. Os leitores não conseguem reservar livro nenhum.') },
  { app: 'lavanderia', titulo: () => t('A lavanderia parada'), morador: () => t('Dona Lúcia, da lavanderia'), relato: () => t('Desde a mudança de servidor, o painel de pedidos da lavanderia não responde. As roupas estão se acumulando!') },
];

/** A aplicação sem defeito; cada defeito troca um campo. */
const CERTO = { tag: '1.0', sonda: '/healthz', vida: 8080, memoria: '64Mi', reserva: '32Mi', chave: 'cor', cpu: '100m', nodeSelector: false, alvo: 8080, sufixo: '' };

/**
 * Os tipos de defeito (um por plantão, no máximo): cada variante muda a aplicação e diz o que estava errado.
 * O `diagnostico` aparece na aba Solução.
 */
export const DEFEITOS = {
  imagem: [
    { muda: { tag: '1.0.1' }, diagnostico: () => t('A imagem <code>kubelearn/loja:1.0.1</code> não existe (ErrImagePull): a tag certa é <code>1.0</code>.') },
    { muda: { tag: '2.0-bugada' }, diagnostico: () => t('A versão <code>2.0-bugada</code> cai assim que liga (CrashLoopBackOff; o <code>kubectl logs --previous</code> mostra o panic): volte para a <code>1.0</code>.') },
  ],
  prontidao: [
    { muda: { sonda: '/health' }, diagnostico: () => t('A readinessProbe pede <code>/health</code>, que responde 404: os pods nunca ficam prontos e o Service fica sem endpoints. O caminho certo é <code>/healthz</code>.') },
  ],
  vida: [
    { muda: { vida: 8081 }, diagnostico: () => t('A livenessProbe confere a porta <code>8081</code>, onde ninguém ouve: o kubelet mata o contêiner a cada meio minuto. A porta é a <code>8080</code>.') },
  ],
  memoria: [
    // O request desce junto: request maior que o limit o API Server nem aceita (o pod nem chegaria a ser OOMKilled).
    { muda: { memoria: '8Mi', reserva: '8Mi' }, diagnostico: () => t('O limite de memória é <code>8Mi</code>, menos do que a loja usa: OOMKilled (código 137). Com <code>64Mi</code>, sobra.') },
  ],
  config: [
    { muda: { chave: 'cores' }, diagnostico: () => t('O <code>env</code> pede a chave <code>cores</code> do ConfigMap, que só tem <code>cor</code>: CreateContainerConfigError.') },
  ],
  agenda: [
    { muda: { nodeSelector: true }, diagnostico: () => t('O <code>nodeSelector</code> pede <code>disco: ssd</code>, e nenhum node tem essa label: os pods ficam Pending. Tire o nodeSelector (ou ponha a label num node).') },
    { muda: { cpu: '4' }, diagnostico: () => t('Cada pod pede <code>4</code> CPUs inteiras (era para ser <code>400m</code>?), e os nodes têm 2: Pending, com <i>Insufficient cpu</i>.') },
  ],
  porta: [
    { muda: { alvo: 80 }, diagnostico: () => t('O Service entrega na porta <code>80</code> dos pods, mas a loja ouve na <code>8080</code>: a conexão é recusada. O <code>targetPort</code> certo é <code>8080</code>.') },
  ],
  seletor: [
    { muda: { sufixo: '-web' }, diagnostico: ({ app }) => t('O seletor do Service procura <code>app: {app}-web</code>, e os pods têm <code>app: {app}</code>: o Service fica sem endpoints.', { app }) },
  ],
};

const configmap = (app) => yaml`
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: ${app}
  data:
    cor: azul
`;
const deployment = (app, c) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: ${app}
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: ${app}
    template:
      metadata:
        labels:
          app: ${app}
      spec:
${c.nodeSelector ? '        nodeSelector:\n          disco: ssd\n' : ''}        containers:
        - name: ${app}
          image: kubelearn/loja:${c.tag}
          ports:
          - containerPort: 8080
          env:
          - name: COR
            valueFrom:
              configMapKeyRef:
                name: ${app}
                key: ${c.chave}
          resources:
            requests:
              cpu: ${c.cpu}
              memory: ${c.reserva}
            limits:
              memory: ${c.memoria}
          readinessProbe:
            httpGet:
              path: ${c.sonda}
              port: 8080
          livenessProbe:
            tcpSocket:
              port: ${c.vida}
`;
const servico = (app, c) => yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: ${app}
  spec:
    selector:
      app: ${app}${c.sufixo}
    ports:
    - port: 80
      targetPort: ${c.alvo}
`;
const zelador = yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: zelador
  spec:
    containers:
    - name: zelador
      image: busybox:1.36
      command: ["sleep", "86400"]
`;
const arquivos = (app, c) => ({ 'deployment.yaml': deployment(app, c), 'service.yaml': servico(app, c), 'configmap.yaml': configmap(app) });

/** O plantão com estes ingredientes (os testes montam todas as duplas por aqui). */
export function montarPlantao(id, cenario, defeitos) {
  const { app } = cenario;
  const quebrado = Object.assign({}, CERTO, ...defeitos.map((d) => d.muda));
  const teste = `kubectl exec zelador -- wget -qO- http://${app}`;
  return {
    ...incidente({
      id,
      partidas: PARTIDA_PL,
      titulo: cenario.titulo(),
      dificuldade: 'medio',
      morador: cenario.morador(),
      relato: cenario.relato(),
      tarefa: t('<p>Faça <code>http://{app}</code> responder de dentro do cluster, com as <b>3 réplicas</b> prontas. Para testar, use o pod <code>zelador</code>: <code>{teste}</code>. São dois defeitos, de tipos diferentes.</p>', { app, teste }),
      vidaReal: t('O síndico de plantão: ouve o morador, lê o livro de ocorrências (os eventos), entra no apartamento (describe e logs) e só então conserta.'),
      limite: t('No plantão de verdade, ninguém avisa quantos defeitos são: aqui avisamos, para você saber quando parar.'),
      dica: t('kubectl get pods; kubectl describe pod NOME (Events); kubectl logs NOME; kubectl get endpoints {app}. Um defeito por vez.', { app }),
      comoSaber: t('<code>{teste}</code> devolve o JSON da loja, com as 3 réplicas prontas.', { teste }),
      extras: [zelador],
      arquivos: arquivos(app, quebrado),
      correcao: arquivos(app, CERTO),
      solucaoTerminal: ['kubectl apply -f .'],
      regras: [
        { pods: `app=${app}`, prontos: 3, reinicios: { max: 0 } },
        { requisicao: { de: 'pod/zelador', url: `http://${app}`, status: 200, corpo: '"app":"loja"' } },
      ],
    }),
    secao: 'plantao',
    morador: cenario.morador(),
    relato: cenario.relato(),
    diagnostico: defeitos.map((d) => `<p>${d.diagnostico(cenario)}</p>`).join(''),
  };
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const dataValida = (dia) => DATA.test(dia) && new Date(`${dia}T12:00:00Z`).toISOString().startsWith(dia);

const TIPOS = Object.keys(DEFEITOS);
/** As duplas de tipos de defeito (28, com 8 tipos). */
export const DUPLAS = TIPOS.flatMap((a, i) => TIPOS.slice(i + 1).map((b) => [a, b]));

/**
 * O plantão do dia 'AAAA-MM-DD' (o mesmo para todo mundo). Um rodízio em vez de sorteio: o morador muda todo dia, e as
 * duplas passam todas (embaralhadas: o passo 11 não divide 28) antes de alguma repetir; na volta seguinte, a outra
 * variante de cada defeito. Data inválida → null.
 */
export function plantaoDoDia(dia) {
  if (!dataValida(dia)) return null;
  const n = Date.parse(`${dia}T00:00:00Z`) / 86_400_000;
  const volta = Math.floor(n / DUPLAS.length);
  const defeitos = DUPLAS[(n * 11) % DUPLAS.length].map((tipo) => DEFEITOS[tipo][volta % DEFEITOS[tipo].length]);
  return montarPlantao(`plantao-${dia}`, CENARIOS[n % CENARIOS.length], defeitos);
}
