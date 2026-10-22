// A caixa "🏠 Na vida real" que aparece embaixo de um erro ou de um status problemático no terminal:
// o que aconteceu, a comparação com o condomínio e onde mexer. O kubectl continua em inglês, como o real.
import { pacoteIngles } from '../i18n.js';

export const REGRAS = [
  {
    re: /forbidden: User "([^"]+)" cannot (\w+) resource "([^"]+)" in API group "([^"]*)" (in the namespace "[^"]+"|at the cluster scope)/,
    t: (m) => ({ titulo: `"${m[1]}" não tem crachá para isso`, texto: `Ninguém deu a ele permissão de <code>${m[2]}</code> em <code>${m[3]}</code> ${m[5].startsWith('in') ? m[5].replace('in the namespace', 'no namespace') : 'no cluster'}. A permissão vem de uma Role (ou ClusterRole) entregue por um RoleBinding (ou ClusterRoleBinding). Teste com <code>kubectl auth can-i ${m[2]} ${m[3]} --as=${m[1]}</code>.`, vidaReal: 'A catraca não reconhece o crachá: ele não abre essa porta.' }),
  },
  {
    re: /error looking up service account ([\w-]+)\/([\w.-]+)/,
    t: (m) => ({ titulo: `A ServiceAccount "${m[2]}" não existe`, texto: `O pod pede o crachá <code>${m[2]}</code> no namespace <code>${m[1]}</code>, e ele não foi criado. Crie antes do pod (no mesmo arquivo, a ServiceAccount vem primeiro): <code>kubectl create serviceaccount ${m[2]} -n ${m[1]}</code>.`, vidaReal: 'O morador chegou com um crachá que a administração nunca emitiu.' }),
  },
  {
    re: /violates PodSecurity "(\w+):/,
    t: (m) => ({ titulo: `As normas do namespace (${m[1]}) recusaram o pod`, texto: 'A mensagem lista o que falta, item por item (o campo e o valor esperado). No <code>restricted</code>, quase sempre: <code>runAsNonRoot</code>, <code>allowPrivilegeEscalation: false</code>, <code>capabilities.drop: ["ALL"]</code> e <code>seccompProfile.type: RuntimeDefault</code>.', vidaReal: 'Os bombeiros do bloco barraram a mudança: falta equipamento de segurança.' }),
  },
  {
    re: /metadata\.labels\[pod-security\.kubernetes\.io\/(\w+)(-version)?\]: Invalid value: "([^"]*)"/,
    t: (m) => ({ titulo: `"${m[3]}" não vale no rótulo de PodSecurity`, texto: m[2] ? 'A versão das normas é <code>latest</code> ou <code>v1.N</code> (como <code>v1.37</code>). O namespace ficou como estava.' : 'O nível vai em minúsculas e é um destes três: <code>privileged</code>, <code>baseline</code> ou <code>restricted</code>. O namespace ficou como estava.', vidaReal: 'O regulamento do prédio só tem três graus de rigor; um quarto, inventado, a administração não registra.' }),
  },
  {
    re: /Error from server \(NotFound\): (?:error when \w+ "[^"]+": )?([\w.]+) "([^"]+)" not found/,
    t: (m) => m[1].startsWith('namespaces')
      ? { titulo: `O namespace "${m[2]}" não existe`, texto: `Crie com <code>kubectl create namespace ${m[2]}</code> ou confira o nome.`, vidaReal: 'Mandar uma carta para uma empresa que não tem sala no prédio.' }
      : { titulo: `Não existe ${m[1].split('.')[0]} chamado "${m[2]}"`, texto: `Confira o nome com <code>kubectl get ${m[1].split('.')[0]}</code> e o namespace (<code>-n</code>).`, vidaReal: 'O porteiro (API Server) procurou no livro e não achou ninguém com esse nome.' },
  },
  {
    re: /AlreadyExists\).*?([\w.]+) "([^"]+)" already exists/,
    t: (m) => ({ titulo: `"${m[2]}" já existe`, texto: 'O <code>create</code> só cria. Para atualizar um objeto que já existe, use <code>kubectl apply -f</code>: ele compara e muda só o que for diferente.', vidaReal: 'Pedir para construir um apartamento que já está construído.' }),
  },
  {
    re: /strict decoding error: (unknown field .*)/,
    t: (m) => ({ titulo: 'Campo que não existe', texto: `O Kubernetes não conhece ${m[1].replace(/unknown field "([^"]+)"/g, '<code>$1</code>')}. Costuma ser erro de digitação (<code>replica</code> em vez de <code>replicas</code>) ou recuo errado, que põe o campo dentro do bloco errado. A aba Manual mostra os nomes certos.`, vidaReal: 'Um formulário com um campo inventado: a administração devolve sem processar.' }),
  },
  {
    re: /cannot unmarshal (\w+) into Go struct field \w+\.([\w.]+) of type (\S+)/,
    t: (m) => ({ titulo: `Tipo errado em ${m[2]}`, texto: `O campo espera <code>${m[3]}</code> e veio ${m[1] === 'string' ? 'texto (tire as aspas)' : m[1] === 'number' ? 'um número (ponha entre aspas)' : m[1]}.`, vidaReal: 'Escrever "três" no campo que pede um número.' }),
  },
  {
    re: /`selector` does not match template `labels`/,
    t: () => ({ titulo: 'O seletor não bate com as labels do template', texto: 'O <code>spec.selector.matchLabels</code> precisa estar dentro das <code>labels</code> do template. Senão, o Deployment criaria pods que ele mesmo não reconhece.', vidaReal: 'O contrato diz "equipe: suporte", mas as plaquinhas das portas dizem outra coisa: a fiscal nunca acharia as salas.' }),
  },
  {
    re: /exceeded quota: ([\w-]+)/,
    t: (m) => ({ titulo: `Estoura a cota "${m[1]}" do namespace`, texto: 'A soma do que os pods do namespace pedem passaria do teto. Veja o uso com <code>kubectl describe quota</code>: diminua os requests/limits, as réplicas, ou peça mais cota.', vidaReal: 'A empresa já usou a cota de energia que o condomínio deu.' }),
  },
  {
    re: /failed quota: ([\w-]+): must specify ([^\n]+)/,
    t: (m) => ({ titulo: 'A cota exige declarar o consumo', texto: `Com cota de CPU ou memória, todo contêiner precisa dizer quanto pede e quanto pode usar. Falta: <code>${m[2]}</code>. Ponha em <code>resources</code>, ou crie um LimitRange com valores padrão.`, vidaReal: 'Aparelho sem etiqueta de consumo não entra no condomínio.' }),
  },
  {
    re: /maximum (\w+) usage per Container is ([\w.]+), but limit is ([\w.]+)/,
    t: (m) => ({ titulo: `Passou do teto de ${m[1]} por contêiner`, texto: `O LimitRange do namespace aceita no máximo ${m[2]} e o contêiner pediu ${m[3]}. Diminua o <code>limits.${m[1]}</code>.`, vidaReal: 'A regra do condomínio proíbe disjuntor maior que o permitido.' }),
  },
  {
    re: /resources\.requests: Invalid value: "([^"]+)": must be less than or equal to ([\w./-]+) limit of (\S+)/,
    t: (m) => ({ titulo: `O request de ${m[2]} passa do limit`, texto: `O <code>requests.${m[2]}</code> (${m[1]}) é o que o contêiner tem garantido; o <code>limits.${m[2]}</code> (${m[3]}) é o teto. Garantir mais do que o teto não faz sentido, e o API Server recusa: diminua o request ou aumente o limit.`, vidaReal: 'Contratar 10 kW de potência com um disjuntor de 5 kW: ele desarmaria antes de chegar ao contratado.' }),
  },
  {
    re: /resources\.(?:requests|limits)\[([^\]]+)\]: Invalid value: "[^"]*": must be a standard resource for containers/,
    t: (m) => ({ titulo: `"${m[1]}" não é um recurso de contêiner`, texto: 'Sem domínio na frente, um contêiner só pede <code>cpu</code>, <code>memory</code>, <code>ephemeral-storage</code> e <code>hugepages-*</code>, assim, no singular e em minúsculas. Placas (como GPU) vêm com o nome do fabricante: <code>nvidia.com/gpu</code>.', vidaReal: 'O formulário de consumo só tem as linhas luz, água e gás: "luzes" não é uma delas.' }),
  },
  {
    re: /Metrics API not available/,
    t: () => ({ titulo: 'Não há quem meça o consumo', texto: 'O <code>kubectl top</code> e o HPA dependem do metrics-server, que o kind não traz. Num cluster de verdade: <code>kubectl apply -f</code> o components.yaml do metrics-server.', vidaReal: 'Pedir a leitura do medidor num prédio sem leiturista.' }),
  },
  {
    re: /restartPolicy: Required value: valid values: "OnFailure", "Never"/,
    t: () => ({ titulo: 'Job não aceita restartPolicy Always', texto: 'Um Job precisa terminar: use <code>restartPolicy: Never</code> (cada falha vira um pod novo) ou <code>OnFailure</code> (o contêiner reinicia no mesmo pod). Always é para o que não pode parar.', vidaReal: 'Contrato de empreitada com cláusula "se acabar, comece de novo": isso é emprego fixo, não empreitada.' }),
  },
  {
    re: /spec\.schedule: Invalid value: "([^"]*)": (.*)/,
    t: (m) => ({ titulo: 'O horário do CronJob não está no formato do cron', texto: `São 5 campos separados por espaço: minuto hora dia mês dia-da-semana (ex.: <code>*/5 * * * *</code>, <code>0 3 * * *</code>). O apiserver disse: ${m[2]}.`, vidaReal: 'Marcar a coleta "lá pela manhã": o caminhão precisa de dia e hora.' }),
  },
  {
    re: /volumeMounts\[\d+\]\.name: Not found: "([^"]+)"/,
    t: (m) => ({ titulo: `O contêiner monta o volume "${m[1]}", que o pod não tem`, texto: 'Cada <code>volumeMounts[].name</code> precisa ser o nome de um volume em <code>spec.volumes</code> (no mesmo pod). Confira a grafia nos dois lugares.', vidaReal: 'Pedir para instalar no apartamento um armário que não está na lista da mudança.' }),
  },
  {
    re: /PersistentVolumeClaim "[^"]+" is invalid: spec: Forbidden: spec is immutable/,
    t: () => ({ titulo: 'O pedido de disco não muda depois de feito', texto: 'Num PVC, só dá para aumentar o tamanho. Para trocar classe ou modo de acesso: <code>kubectl delete pvc NOME</code> e crie de novo (com cuidado: os dados vão junto, se a política for Delete).', vidaReal: 'O contrato do box já foi assinado: para trocar de box, cancela e faz outro.' }),
  },
  {
    re: /field is immutable|Forbidden: updates to statefulset spec/,
    t: () => ({ titulo: 'Esse campo não muda depois de criado', texto: 'Alguns campos ficam fixos. No StatefulSet, os <code>volumeClaimTemplates</code> e o <code>serviceName</code> não mudam: apague (<code>kubectl delete sts NOME</code>; os PVCs ficam) e crie de novo.', vidaReal: 'A planta do prédio já foi aprovada: mudar a garagem pede outro projeto.' }),
  },
  {
    re: /pod updates may not change fields/,
    t: () => ({ titulo: 'Um pod não muda depois de criado', texto: 'Num pod só a imagem pode mudar. Para mudar o resto (volumes, comando, portas): <code>kubectl delete pod NOME</code> e aplique de novo. Com Deployment, isso acontece sozinho.', vidaReal: 'O apartamento já está mobiliado: para mudar a planta, o morador sai e o apartamento é refeito.' }),
  },
  {
    re: /Read-only file system/,
    t: () => ({ titulo: 'Esse volume é só de leitura', texto: 'ConfigMap e Secret montados como volume são sempre só leitura (mudanças vêm do objeto, não de dentro do pod). Para gravar, use um <code>emptyDir</code> ou um PVC.', vidaReal: 'O quadro de avisos fica atrás do vidro: só a administração troca o papel.' }),
  },
  {
    re: /nonexistent directory|Directory nonexistent/,
    t: () => ({ titulo: 'A pasta não existe no contêiner', texto: 'A imagem não tem essa pasta. Monte um volume ali (<code>volumeMounts</code>) ou grave numa pasta que exista, como <code>/tmp</code>.', vidaReal: 'Guardar a caixa num box que ninguém alugou.' }),
  },
  {
    re: /is invalid: .*?([\w.[\]]+): Required value/,
    t: (m) => ({ titulo: `Falta um campo obrigatório: ${m[1]}`, texto: 'Esse campo não pode ficar vazio. A aba Manual (ou <code>kubectl explain</code>) mostra o que vai nele.', vidaReal: 'Um formulário sem um campo obrigatório preenchido.' }),
  },
  {
    re: /([\w.[\]]+): Unsupported value: "([^"]*)": supported values: (.+)/,
    t: (m) => ({ titulo: `"${m[2]}" não é um valor aceito em ${m[1].split('.').pop()}`, texto: `O campo <code>${m[1]}</code> só aceita estes valores, escritos assim mesmo (com as maiúsculas): ${m[3].replace(/&quot;([^&]*)&quot;/g, '<code>$1</code>')}.`, vidaReal: 'Marcar "talvez" num formulário que só tem as caixas sim e não.' }),
  },
  {
    re: /found character that cannot start any token/,
    t: () => ({ titulo: 'Tem um TAB no YAML', texto: 'O YAML só aceita espaços para recuar. Troque o TAB por 2 espaços.', vidaReal: 'A planta foi desenhada com uma régua de outro tamanho: o fiscal não consegue ler.' }),
  },
  {
    re: /mapping values are not allowed|did not find expected key/,
    t: () => ({ titulo: 'O recuo do YAML está torto', texto: 'No YAML, o recuo diz quem está dentro de quem. Confira os espaços da linha indicada e a de cima, e se não faltou um espaço depois de <code>:</code>.', vidaReal: 'Uma planta com as paredes desalinhadas: não dá para saber qual cômodo fica dentro de qual.' }),
  },
  {
    re: /the server doesn't have a resource type "([^"]+)"/,
    t: (m) => ({ titulo: `Não existe o tipo "${m[1]}"`, texto: 'Veja os tipos (e os apelidos, como <code>po</code>, <code>deploy</code>, <code>svc</code>) com <code>kubectl api-resources</code>.', vidaReal: 'Pedir na portaria um serviço que o condomínio não oferece.' }),
  },
  {
    re: /no matches for kind "(\w+)" in version "([^"]+)"/,
    t: (m) => ({ titulo: `apiVersion e kind não combinam: ${m[1]} não é ${m[2]}`, texto: 'Cada tipo mora numa versão da API: Pod e Service em <code>v1</code>; Deployment e ReplicaSet em <code>apps/v1</code>. Veja em <code>kubectl api-resources</code>.', vidaReal: 'Mandar o pedido para o setor errado da administração.' }),
  },
  {
    re: /unknown command "([^"]+)" for "kubectl"/,
    t: (m) => ({ titulo: `O kubectl não tem o comando "${m[1]}"`, texto: 'Digite <code>kubectl help</code> para ver os comandos.', vidaReal: 'Falar com o porteiro numa língua que ele não entende.' }),
  },
  {
    re: /is waiting to start: (ContainerCreating|trying and failing to pull image|CreateContainerConfigError)/,
    t: (m) => ({ titulo: 'O contêiner ainda não começou', texto: m[1] === 'ContainerCreating' ? 'Espere uns segundos (a imagem está sendo baixada) e tente de novo.' : 'Ele nem chegou a rodar, então não tem log. Veja o motivo em <code>kubectl describe pod NOME</code>, nas Events.', vidaReal: 'Ler o diário de um morador que ainda nem se mudou.' }),
  },
  {
    re: /executable file not found in \$PATH/,
    t: () => ({ titulo: 'A imagem não tem esse programa', texto: 'Cada imagem traz só o que precisa. Imagens mínimas (<i>distroless</i>) nem têm shell. Tente outro comando (<code>wget</code> no busybox, <code>curl</code> no nginx) ou use um pod de teste.', vidaReal: 'Procurar uma ferramenta num apartamento mobiliado só com o básico.' }),
  },
  {
    re: /unable to upgrade connection: container not found/,
    t: () => ({ titulo: 'O contêiner não está rodando', texto: 'Só dá para entrar num contêiner em execução. Veja o status com <code>kubectl get pod</code>.', vidaReal: 'Tocar a campainha de um apartamento vazio.' }),
  },
  {
    re: /cannot delete DaemonSet-managed Pods/,
    t: () => ({ titulo: 'O drain não mexe nos pods de DaemonSet sem você dizer', texto: 'Pods de DaemonSet (kube-proxy, kindnet...) existem um por node, de propósito: tirados, voltariam na hora. Diga ao drain para deixá-los: <code>--ignore-daemonsets</code>. O node já ficou interditado (cordon).', vidaReal: 'O extintor é do prédio: na mudança, ele fica.' }),
  },
  {
    re: /cannot delete Pods that declare no controller/,
    t: () => ({ titulo: 'Pod sem dono: se sair, não volta', texto: 'Esse pod não tem Deployment (nem outro controlador) por trás: despejado, ele some para sempre. Se é isso mesmo, use <code>--force</code>; melhor ainda, rode-o num Deployment.', vidaReal: 'Um morador sem contrato: se sair na reforma, ninguém guarda o lugar dele.' }),
  },
  {
    re: /cannot delete Pods with local storage/,
    t: () => ({ titulo: 'O pod tem dados num emptyDir', texto: 'O que está no emptyDir some com o pod. Se pode perder, use <code>--delete-emptydir-data</code>.', vidaReal: 'A mesa de trabalho não vai na mudança: o que estiver em cima dela se perde.' }),
  },
  {
    re: /global timeout reached/,
    t: () => ({ titulo: 'O drain desistiu de esperar', texto: 'Algum pod não saiu a tempo: um PodDisruptionBudget sem folga (minAvailable igual às réplicas, ou réplicas sem lugar para ir) ou um pod num node que não responde. Veja <code>kubectl get pdb</code> e <code>kubectl get pods -o wide</code>.', vidaReal: 'A mudança parou: o combinado não deixa tirar mais ninguém, e não há para onde ir.' }),
  },
  {
    re: /already has ([\w./-]+) taint\(s\) with same effect/,
    t: (m) => ({ titulo: `O node já tem a placa "${m[1]}"`, texto: `Para trocar o valor, use <code>--overwrite</code>; para tirar, ponha um "-" no fim: <code>kubectl taint nodes NODE ${m[1]}-</code>.`, vidaReal: 'Pendurar uma placa onde já tem uma igual.' }),
  },
  {
    re: /taint "([^"]+)" not found/,
    t: (m) => ({ titulo: `O node não tem a placa "${m[1]}"`, texto: 'Veja as placas na linha <code>Taints</code> do <code>kubectl describe node NOME</code>.', vidaReal: 'Tirar uma placa que não está na porta.' }),
  },
  {
    re: /invalid taint (?:spec|effect)/,
    t: () => ({ titulo: 'O taint está mal escrito', texto: 'O formato é <code>chave=valor:Efeito</code> (ou <code>chave:Efeito</code>), com Efeito NoSchedule, PreferNoSchedule ou NoExecute. Para tirar, <code>chave-</code>.', vidaReal: 'Uma placa sem dizer o que ela proíbe.' }),
  },
  {
    re: /no PriorityClass with name ([\w.-]+) was found/,
    t: (m) => ({ titulo: `A PriorityClass "${m[1]}" não existe`, texto: 'Crie a classe antes do pod (no mesmo arquivo, ela pode vir antes, separada por <code>---</code>). <code>kubectl get priorityclass</code> lista as que existem.', vidaReal: 'Mostrar um crachá de "prioridade" que a administração nunca emitiu.' }),
  },
  {
    re: /namespaces "[^"]+" is forbidden: this namespace may not be deleted/,
    t: () => ({ titulo: 'Esse namespace é do sistema', texto: '<code>default</code>, <code>kube-system</code> e <code>kube-public</code> não podem ser apagados.', vidaReal: 'Tentar demolir a administração do condomínio.' }),
  },
  {
    re: /spec\.timeZone: Invalid value: "([^"]+)": unknown time zone/,
    t: (m) => ({ titulo: `"${m[1]}" não é um fuso horário`, texto: 'O <code>timeZone</code> do CronJob usa os nomes da base de fusos (IANA), com a região e a cidade: <code>America/Sao_Paulo</code>, <code>Europe/Lisbon</code>, <code>Etc/UTC</code>. Sem o campo, vale o fuso do kube-controller-manager (quase sempre UTC).', vidaReal: 'Marcar a reunião "às 9h no horário de Marte": ninguém sabe que horas são lá.' }),
  },
  {
    re: /^error: ([\w.]+) "([^"]+)" is invalid$/m,
    t: (m) => ({ titulo: 'O kubectl edit abriu o arquivo de novo', texto: `O servidor recusou a mudança em <code>${m[2]}</code>, e o motivo está no topo do arquivo, nas linhas que começam com <code># *</code>. Conserte e salve; ou saia sem salvar para desistir (aí nada muda no cluster).`, vidaReal: 'A administração devolveu o formulário com um bilhete grampeado dizendo o que corrigir.' }),
  },
  {
    re: /Edit cancelled, no valid changes were saved/,
    t: () => ({ titulo: 'Nada foi salvo', texto: 'O servidor recusou a mudança e o editor fechou sem conserto: o objeto continua como estava. O kubectl guardou o que você escreveu num arquivo em <code>/tmp</code> (num terminal de verdade, dá para reaproveitar). Rode o <code>kubectl edit</code> de novo.', vidaReal: 'Você desistiu do formulário devolvido: o pedido fica como estava antes.' }),
  },
  {
    re: /At least one of apiVersion, kind and name was changed/,
    t: () => ({ titulo: 'O edit não troca o nome nem o tipo', texto: 'O <code>kubectl edit</code> muda o objeto que já existe; <code>name</code>, <code>kind</code> e <code>apiVersion</code> dizem qual é ele. Para um objeto com outro nome, crie um novo: <code>kubectl get deploy web -o yaml &gt; novo.yaml</code>, mude o nome no editor e <code>kubectl apply -f novo.yaml</code>.', vidaReal: 'Pedir uma reforma no apartamento 101 e, no formulário, trocar o número para 102: a administração não sabe mais de que apartamento se trata.' }),
  },
];

export const STATUS = [
  { re: /^Forwarding from 127\.0\.0\.1:(\d+)/m, titulo: 'Port-forward ativo', texto: 'Uma passagem do seu computador direto para o pod. Teste com <code>curl http://localhost:PORTA</code> aqui mesmo no terminal (o <code>curl</code> sem kubectl roda no seu computador). No terminal de verdade este comando fica preso (Ctrl+C encerra) e você testa em outro terminal.', vidaReal: 'Uma passagem temporária da sua casa direto até o apartamento.' },
  { re: /\bCrashLoopBackOff\b/, titulo: 'CrashLoopBackOff: o contêiner cai e é reiniciado', texto: 'O programa termina logo depois de subir, e o kubelet espera cada vez mais antes de tentar de novo (10s, 20s, 40s... até 5 min). Veja o motivo em <code>kubectl logs NOME --previous</code> e em <code>kubectl describe pod NOME</code>.', vidaReal: 'O morador desmaia toda vez que entra, e o síndico espera cada vez mais antes de tentar de novo.' },
  { re: /\b(ImagePullBackOff|ErrImagePull)\b/, titulo: 'A imagem não foi baixada', texto: 'Nome ou tag errado, ou imagem privada. Confira a imagem e veja o erro exato em <code>kubectl describe pod NOME</code>, nas Events.', vidaReal: 'O pré-moldado não chegou: o pedido tinha o modelo errado.' },
  { re: /\bCreateContainerConfigError\b/, titulo: 'Falta configuração para criar o contêiner', texto: 'Algum ConfigMap ou Secret usado no <code>env</code> não existe (ou não tem a chave). O <code>kubectl describe pod NOME</code> diz qual.', vidaReal: 'A mudança travou porque o envelope com a senha não chegou.' },
  { re: /\bOOMKilled\b/, titulo: 'OOMKilled: passou do limite de memória', texto: 'O contêiner usou mais memória que o <code>limits.memory</code> e foi morto (código 137). Ou o limite está baixo para o programa, ou o programa vaza memória.', vidaReal: 'O disjuntor desarmou: ligaram aparelhos demais ao mesmo tempo.' },
  { re: /<unknown>\/\d+%/, titulo: 'O HPA ainda não sabe o uso', texto: 'Nos primeiros segundos é normal. Se continuar: os pods precisam de <code>resources.requests</code> (a porcentagem é sobre o request) e o metrics-server precisa estar rodando. <code>kubectl describe hpa</code> diz o motivo.', vidaReal: 'O gerente não sabe a capacidade de cada atendente: não consegue calcular se está cheio.' },
  { re: /\bInit:(Error|CrashLoopBackOff)\b/, titulo: 'Um init container falhou', texto: 'O pod não passa da preparação: o init container terminou com erro e o kubelet tenta de novo. Veja o log dele: <code>kubectl logs POD -c NOME_DO_INIT</code>.', vidaReal: 'A vistoria reprovou: a mudança espera do lado de fora até a vistoria passar.' },
  { re: /\bBackoffLimitExceeded\b|reached the specified backoff limit/, titulo: 'O Job desistiu', texto: 'Falhou mais vezes que o <code>backoffLimit</code>. Os logs dos pods (<code>kubectl logs job/NOME</code>) contam o motivo; conserte e crie o Job de novo.', vidaReal: 'O pedreiro tentou, tentou, e o contrato acabou antes da parede ficar de pé.' },
  { re: /MountVolume\.SetUp failed for volume/, titulo: 'O volume não montou', texto: 'O ConfigMap ou o Secret que o volume usa não existe (ou tem outro nome). O pod fica em ContainerCreating até ele aparecer: crie o objeto ou corrija o nome em <code>spec.volumes</code>.', vidaReal: 'A mudança espera o armário que nunca chegou.' },
  { re: /pod has unbound immediate PersistentVolumeClaims|ProvisioningFailed/, titulo: 'O pedido de disco não foi atendido', texto: 'O PVC está Pending: a StorageClass pedida não existe (veja <code>kubectl get sc</code>) ou nenhum PV serve. <code>kubectl describe pvc NOME</code> mostra o motivo.', vidaReal: 'Pediram um box "climatizado", mas o condomínio só tem box comum.' },
  { re: /had untolerated taint/, titulo: 'Placa de restrição: taint', texto: 'Algum node tem um taint que o pod não tolera (o do control plane é normal). A linha <code>Taints</code> do <code>kubectl describe node</code> mostra a placa; ou o pod ganha uma toleration, ou o taint sai.', vidaReal: 'Prédio restrito: só entra quem tem autorização.' },
  { re: /didn't match Pod's node affinity\/selector/, titulo: 'Nenhum node tem as labels pedidas', texto: 'O nodeSelector (ou a nodeAffinity) pede labels que o node não tem. Compare com <code>kubectl get nodes --show-labels</code>: ou a label vai para o node, ou o pedido muda.', vidaReal: 'Pediu um prédio com gerador, e nenhum tem a placa de gerador na porta.' },
  { re: /didn't match pod anti-affinity rules|didn't satisfy existing pods anti-affinity rules/, titulo: 'A antiafinidade não deixa', texto: 'Todo node possível já tem um pod de quem este quer ficar longe. Com <code>required</code>, ele espera (Pending) até aparecer um node livre; com <code>preferred</code>, iria assim mesmo.', vidaReal: 'As duas cópias do backup não podem dividir prédio, e não sobrou prédio.' },
  { re: /didn't match pod topology spread constraints/, titulo: 'O espalhamento não deixa', texto: 'Pôr o pod ali passaria do <code>maxSkew</code>. Atenção: nodes com taint (como o control plane) contam como domínio vazio. Com <code>whenUnsatisfiable: ScheduleAnyway</code>, ele iria assim mesmo.', vidaReal: 'A regra é não deixar um bairro com muito mais lojas que outro.' },
  { re: /node\(s\) were unschedulable/, titulo: 'Node interditado', texto: 'Algum node está com cordon (<code>SchedulingDisabled</code>): não recebe pods novos. <code>kubectl uncordon NODE</code> libera.', vidaReal: 'Prédio interditado para a reforma.' },
  { re: /\d+ Insufficient (?:cpu|memory)/, titulo: 'Falta CPU ou memória nos nodes', texto: 'A soma dos <b>requests</b> passaria do que o node tem. Veja o "Allocated resources" do <code>kubectl describe node</code>: diminua os requests, as réplicas, ou dê prioridade (PriorityClass) a quem importa mais.', vidaReal: 'A potência contratada de todos os apartamentos já usou a do prédio.' },
  { re: /violate the pod's disruption budget/, titulo: 'O PDB segurou o despejo', texto: 'O PodDisruptionBudget não deixa sair mais ninguém agora: o drain tenta de novo a cada 5 s, enquanto os substitutos sobem em outro node. Sem folga nunca (minAvailable igual às réplicas), ele espera para sempre.', vidaReal: 'Pelo menos 2 elevadores funcionando: o terceiro só para quando o reserva estiver pronto.' },
  { re: /^\S+\s+Ready,SchedulingDisabled\s/m, titulo: 'Node interditado (cordon)', texto: 'Não recebe pods novos; quem está lá continua. <code>kubectl uncordon NODE</code> libera.', vidaReal: 'Prédio interditado para novos moradores.' },
  { re: /^\S+\s+NotReady(?:,SchedulingDisabled)?\s/m, titulo: 'O node parou de dar notícias', texto: 'O kubelet não responde (luz, rede, máquina). Uns 5 minutos depois, os pods de lá são despejados: os que têm dono (Deployment, StatefulSet) renascem em outros nodes; os soltos ficam Terminating e não voltam.', vidaReal: 'Queda de energia no prédio.' },
  { re: /would violate PodSecurity/, titulo: 'Aviso: os pods vão ser recusados', texto: 'O objeto foi criado, mas os pods dele não passam nas normas do namespace: o ReplicaSet vai tentar e ser recusado (READY 0/1). <code>kubectl describe rs -n NAMESPACE</code> mostra o FailedCreate.', vidaReal: 'O contrato foi assinado, mas os bombeiros não vão deixar ninguém entrar assim.' },
  { re: /container has runAsNonRoot and image will run as root/, titulo: 'A imagem roda como root', texto: 'O pod pede <code>runAsNonRoot: true</code>, mas a imagem roda como root (usuário 0). Diga um usuário comum (<code>runAsUser: 1000</code>) ou use uma imagem feita para rodar sem root.', vidaReal: 'A regra é "sem chave mestra", e o morador só tem a chave mestra.' },
  { re: /wget: bad address '[^']+'|Could not resolve host/, titulo: 'O nome não resolveu', texto: 'Ou o nome está errado (o Service existe? no mesmo namespace?), ou uma NetworkPolicy fecha a saída do pod e esqueceu do DNS (porta 53, UDP e TCP, para o kube-dns).', vidaReal: 'A telefonista não atendeu: sem o número, não dá para ligar.' },
  { re: /download timed out|Connection timed out|connection timed out; no servers could be reached/, titulo: 'A conexão não completou', texto: 'Nada respondeu: uma NetworkPolicy descartando o pedido (veja <code>kubectl get netpol -A</code>), um programa travado ou um endereço que não existe.', vidaReal: 'A catraca não deixou passar e ninguém avisou: o visitante fica esperando na porta.' },
  { re: /Read-only file system/, titulo: 'O disco é só leitura', texto: 'O contêiner tem <code>readOnlyRootFilesystem: true</code> (ou o volume foi montado como só leitura). Para gravar, monte um volume (um <code>emptyDir</code>) na pasta onde o programa escreve.', vidaReal: 'As paredes estão lacradas: para trabalhar, só na mesa (o volume).' },
  { re: /\bPending\b/, titulo: 'Pending: o pod ainda não tem lugar', texto: 'Ou o scheduler não achou um node que caiba (veja <code>kubectl describe pod NOME</code>, em Events: <i>FailedScheduling</i>), ou ele está só começando.', vidaReal: 'Esperando no lobby: a corretora ainda não achou um prédio com espaço.' },
  { re: /\bErrImageNeverPull\b/, titulo: 'A imagem não está no node, e o pod proibiu baixar', texto: 'Com <code>imagePullPolicy: Never</code>, o kubelet só usa a imagem que já estiver no node (no kind, carregada com <code>kind load docker-image</code>). Tire o <code>Never</code> (o padrão <code>IfNotPresent</code> baixa quando falta) ou ponha a imagem no node.', vidaReal: 'A regra é "só móveis que já estão no depósito", e o sofá nunca foi para o depósito.' },
  { re: /existing pods in namespace "[^"]+" violate the new PodSecurity enforce level/, titulo: 'A norma nova vale para os próximos pods', texto: 'A label foi aplicada, mas os pods que já rodam não passam nela. Eles continuam rodando (a norma é conferida só quando um pod é criado); o próximo pod igual, numa troca de versão ou num reinício pelo Deployment, vai ser recusado. Ajuste o <code>securityContext</code> antes que isso aconteça.', vidaReal: 'O regulamento novo do prédio não despeja quem já mora, mas a próxima mudança tem de seguir as regras.' },
  { re: /^Warning: unknown field "[^"]+"/m, titulo: 'O campo foi ignorado', texto: 'O patch tinha um campo que o Kubernetes não conhece (erro de digitação, como <code>replica</code> em vez de <code>replicas</code>, ou o caminho no lugar errado). Ele foi jogado fora, e por isso o resto pode dizer <code>patched (no change)</code>: nada mudou. Confira o nome com <code>kubectl explain</code>.', vidaReal: 'O formulário voltou carimbado, mas a linha com o campo inventado foi riscada.' },
  { re: /is missing the kubectl\.kubernetes\.io\/last-applied-configuration annotation/, titulo: 'Aviso: o objeto não nasceu de um apply', texto: 'Ele foi criado com <code>kubectl create</code> (ou <code>run</code>, <code>expose</code>), que não guarda a última versão aplicada. O kubectl avisa e grava essa memória neste mesmo apply: daqui em diante, siga com o <code>apply</code>. Sem ela, este primeiro apply não sabe que campos você tirou do YAML (eles ficam).', vidaReal: 'A obra foi feita sem planta: o arquiteto desenhou a planta agora, a partir do que já estava construído.' },
];

/** Explicações para a saída de um comando: erros (se falhou) e status problemáticos (numa tabela). */
// O que vem da saída (nomes, campos) entra no HTML da caixa: escapado aqui, uma vez, para as regras dos dois idiomas.
const html = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function explicar(saida, { falhou }) {
  const caixas = [];
  const en = pacoteIngles()?.explicacoes; // em inglês, o gêmeo de src/i18n/en/explicacoes.js (enquanto houver)
  const regras = en?.REGRAS ?? REGRAS;
  const status = en?.STATUS ?? STATUS;
  if (falhou) {
    for (const r of regras) {
      const m = saida.match(r.re);
      if (m) {
        caixas.push({ chave: r.re.source, ...r.t(m.map(html)) });
        break;
      }
    }
  }
  for (const s of status) if (s.re.test(saida)) caixas.push({ chave: s.re.source, titulo: s.titulo, texto: s.texto, vidaReal: s.vidaReal });
  return caixas;
}
