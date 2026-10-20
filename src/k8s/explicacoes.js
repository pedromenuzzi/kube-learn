// A caixa "🏠 Na vida real" que aparece embaixo de um erro ou de um status problemático no terminal:
// o que aconteceu, a comparação com o condomínio e onde mexer. O kubectl continua em inglês, como o real.

const REGRAS = [
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
    t: (m) => ({ titulo: 'Campo que não existe', texto: `O Kubernetes não conhece ${m[1].replace(/unknown field "([^"]+)"/g, '<code>$1</code>')}. Costuma ser erro de digitação (<code>replica</code> em vez de <code>replicas</code>) ou recuo errado, que põe o campo dentro do bloco errado. O 📘 Manual mostra os nomes certos.`, vidaReal: 'Um formulário com um campo inventado: a administração devolve sem processar.' }),
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
    t: (m) => ({ titulo: `Falta um campo obrigatório: ${m[1]}`, texto: 'Esse campo não pode ficar vazio. O 📘 Manual (ou <code>kubectl explain</code>) mostra o que vai nele.', vidaReal: 'Um formulário sem um campo obrigatório preenchido.' }),
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
    t: (m) => ({ titulo: 'O contêiner ainda não começou', texto: m[1] === 'ContainerCreating' ? 'Espere uns segundos (a imagem está sendo baixada) e tente de novo.' : 'Ele nem chegou a rodar, então não tem log. Veja o motivo em <code>kubectl describe pod</code>, nas Events.', vidaReal: 'Ler o diário de um morador que ainda nem se mudou.' }),
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
    re: /namespaces "[^"]+" is forbidden: this namespace may not be deleted/,
    t: () => ({ titulo: 'Esse namespace é do sistema', texto: '<code>default</code>, <code>kube-system</code> e <code>kube-public</code> não podem ser apagados.', vidaReal: 'Tentar demolir a administração do condomínio.' }),
  },
];

const STATUS = [
  { re: /^Forwarding from 127\.0\.0\.1:(\d+)/m, titulo: 'Port-forward ativo', texto: 'Uma passagem do seu computador direto para o pod. Teste com <code>curl http://localhost:PORTA</code> aqui mesmo no terminal (o <code>curl</code> sem kubectl roda no seu computador). No terminal de verdade este comando fica preso (Ctrl+C encerra) e você testa em outro terminal.', vidaReal: 'Uma passagem temporária da sua casa direto até o apartamento.' },
  { re: /\bCrashLoopBackOff\b/, titulo: 'CrashLoopBackOff: o contêiner cai e é reiniciado', texto: 'O programa termina logo depois de subir, e o kubelet espera cada vez mais antes de tentar de novo (10s, 20s, 40s... até 5 min). Veja o motivo em <code>kubectl logs NOME --previous</code> e em <code>kubectl describe pod NOME</code>.', vidaReal: 'O morador desmaia toda vez que entra, e o síndico espera cada vez mais antes de tentar de novo.' },
  { re: /\b(ImagePullBackOff|ErrImagePull)\b/, titulo: 'A imagem não foi baixada', texto: 'Nome ou tag errado, ou imagem privada. Confira a imagem e veja o erro exato em <code>kubectl describe pod NOME</code>, nas Events.', vidaReal: 'O pré-moldado não chegou: o pedido tinha o modelo errado.' },
  { re: /\bCreateContainerConfigError\b/, titulo: 'Falta configuração para criar o contêiner', texto: 'Algum ConfigMap ou Secret usado no <code>env</code> não existe (ou não tem a chave). O <code>kubectl describe pod</code> diz qual.', vidaReal: 'A mudança travou porque o envelope com a senha não chegou.' },
  { re: /\bOOMKilled\b/, titulo: 'OOMKilled: passou do limite de memória', texto: 'O contêiner usou mais memória que o <code>limits.memory</code> e foi morto (código 137). Ou o limite está baixo para o programa, ou o programa vaza memória.', vidaReal: 'O disjuntor desarmou: ligaram aparelhos demais ao mesmo tempo.' },
  { re: /<unknown>\/\d+%/, titulo: 'O HPA ainda não sabe o uso', texto: 'Nos primeiros segundos é normal. Se continuar: os pods precisam de <code>resources.requests</code> (a porcentagem é sobre o request) e o metrics-server precisa estar rodando. <code>kubectl describe hpa</code> diz o motivo.', vidaReal: 'O gerente não sabe a capacidade de cada atendente: não consegue calcular se está cheio.' },
  { re: /\bInit:(Error|CrashLoopBackOff)\b/, titulo: 'Um init container falhou', texto: 'O pod não passa da preparação: o init container terminou com erro e o kubelet tenta de novo. Veja o log dele: <code>kubectl logs POD -c NOME_DO_INIT</code>.', vidaReal: 'A vistoria reprovou: a mudança espera do lado de fora até a vistoria passar.' },
  { re: /\bBackoffLimitExceeded\b|reached the specified backoff limit/, titulo: 'O Job desistiu', texto: 'Falhou mais vezes que o <code>backoffLimit</code>. Os logs dos pods (<code>kubectl logs job/NOME</code>) contam o motivo; conserte e crie o Job de novo.', vidaReal: 'O pedreiro tentou, tentou, e o contrato acabou antes da parede ficar de pé.' },
  { re: /MountVolume\.SetUp failed for volume/, titulo: 'O volume não montou', texto: 'O ConfigMap ou o Secret que o volume usa não existe (ou tem outro nome). O pod fica em ContainerCreating até ele aparecer: crie o objeto ou corrija o nome em <code>spec.volumes</code>.', vidaReal: 'A mudança espera o armário que nunca chegou.' },
  { re: /pod has unbound immediate PersistentVolumeClaims|ProvisioningFailed/, titulo: 'O pedido de disco não foi atendido', texto: 'O PVC está Pending: a StorageClass pedida não existe (veja <code>kubectl get sc</code>) ou nenhum PV serve. <code>kubectl describe pvc NOME</code> mostra o motivo.', vidaReal: 'Pediram um box "climatizado", mas o condomínio só tem box comum.' },
  { re: /\bPending\b/, titulo: 'Pending: o pod ainda não tem lugar', texto: 'Ou o scheduler não achou um node que caiba (veja <code>kubectl describe pod</code>, em Events: <i>FailedScheduling</i>), ou ele está só começando.', vidaReal: 'Esperando no lobby: a corretora ainda não achou um prédio com espaço.' },
];

/** Explicações para a saída de um comando: erros (se falhou) e status problemáticos (numa tabela). */
export function explicar(saida, { falhou }) {
  const caixas = [];
  if (falhou) {
    for (const r of REGRAS) {
      const m = saida.match(r.re);
      if (m) {
        caixas.push({ chave: r.re.source, ...r.t(m) });
        break;
      }
    }
  }
  for (const s of STATUS) if (s.re.test(saida)) caixas.push({ chave: s.re.source, titulo: s.titulo, texto: s.texto, vidaReal: s.vidaReal });
  return caixas;
}
