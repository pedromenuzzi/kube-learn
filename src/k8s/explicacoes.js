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
