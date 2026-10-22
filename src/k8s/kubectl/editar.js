// kubectl edit. O kubectl de verdade grava o objeto num arquivo temporário (o mesmo YAML do get -o yaml, debaixo de um
// cabeçalho de comentários), abre o editor e, quando o editor fecha, manda ao servidor um patch do original para o
// editado. Se o servidor recusa, o editor abre de novo com o motivo no topo; fechar sem mudar nada desiste.
// Aqui o comando devolve um pedido de edição, { editar: { arquivo, titulo, texto, concluir(texto) } }: quem tem tela (o
// terminal) mostra um editor e chama concluir com o que o aluno salvou (sair sem salvar = o mesmo texto de volta). O
// concluir devolve o resultado do comando, que pode trazer outro pedido (o editor reaberto com o erro).
// Sem tela: KUBE_EDITOR="sed -i 's/de/para/'" kubectl edit ... (ou KUBE_EDITOR=cat), como num terminal de verdade, ou
// editarSemTela(cluster, linha, editor), com o editor numa função.
import { palavras } from './argv.js';
import { paraYaml, paraJson } from './formatos.js';
import { lerYaml } from './manifestos.js';
import { diferenca, estrategico, mesclarJson } from './patch.js';
import { sprint } from './colunas.js';
import { negado } from './seguranca.js';
import { kubectl, Saida, selecionar, SEM_RECURSOS } from './index.js';
import { decodificar, validar } from '../esquema.js';
import { recursoDoKind, nomeQualificado, pluralQualificado } from '../recursos.js';
import { canonico, hexDe } from '../aleatorio.js';
import { t } from '../../i18n.js';

const CABECALHO = `# Please edit the object below. Lines beginning with a '#' will be ignored,
# and an empty file will abort the edit. If an error occurs while saving this file will be
# reopened with the relevant failures.
#
`;

/** O texto sem as linhas de comentário (o ManualStrip do kubectl). */
const semComentarios = (texto) => texto.split('\n').filter((l) => !/^#(?!!)/.test(l.trim())).join('\n');

/** O que o kubectl compara para saber se mudou (o StripComments): o YAML lido; o que não dá para ler, sem os comentários. */
const comparavel = (texto) => {
  const y = lerYaml(semComentarios(texto), 'edit');
  return y.erro ? semComentarios(texto) : canonico(y.docs);
};

// Os motivos no topo do arquivo reaberto: '# deployments.apps "web" was not valid:' e um '# * ' por causa.
const comentado = (s) => s.replace(/\n(?!#)/g, '\n# ');
const cabecalho = (motivos) => CABECALHO + motivos.map((m) => `# ${comentado(m.titulo)}${m.causas.length ? ':' : ''}\n${m.causas.map((c) => `# * ${comentado(c)}\n`).join('')}#\n`).join('');

/** O que o servidor diria do patch aplicado: a decodificação estrita (com o patch na mensagem) e a validação. */
function errosDoServidor(novo, atual, patch) {
  const d = decodificar(novo);
  const valor = JSON.stringify(sprint(patch));
  if (d.tipo) return [`patch: Invalid value: ${valor}: unrecognized type: ${d.tipo.match(/of type (\S+)$/)?.[1]}`];
  if (d.desconhecidos.length) return [`patch: Invalid value: ${valor}: strict decoding error: ${d.desconhecidos.map((c) => `unknown field "${c}"`).join(', ')}`];
  const semStatus = structuredClone(novo);
  delete semStatus.status;
  return validar(semStatus, atual);
}

/** Uma edição: os objetos como estavam quando o editor abriu e o pedido de cada vez que o editor abre. */
function sessao(cluster, a, originais) {
  const json = a.flags.output === 'json';
  const ns = a.flags.namespace ?? cluster.contexto.namespace;
  const original = (json ? paraJson : paraYaml)(originais.length === 1 ? originais[0] : { apiVersion: 'v1', items: originais, kind: 'List', metadata: {} });
  const titulo = `kubectl edit ${originais.map((o) => `${nomeQualificado(recursoDoKind(o.kind))}/${o.metadata.name}`).join(' ')}`;
  let anterior = null; // depois de um erro: o texto salvo, que volta ao editor com os motivos em cima

  // O arquivo temporário (o os.CreateTemp do Go sorteia um número): um número fixo por cluster e vez, sem gastar o sorteio dele.
  const pedido = (texto) => {
    cluster.edicoes = (cluster.edicoes ?? 0) + 1;
    const arquivo = `/tmp/kubectl-edit-${parseInt(hexDe(`edit#${cluster.edicoes}`, 8), 16)}.${json ? 'json' : 'yaml'}`;
    return { arquivo, titulo, texto, concluir: (editado) => concluir(editado, arquivo) };
  };

  function concluir(editado, arquivo) {
    const s = new Saida();
    const guardada = () => s.err(`A copy of your changes has been stored to "${arquivo}"\n`);
    const reabrir = (motivos) => {
      anterior = editado;
      s.codigo = 1;
      return s.resultado({ editar: pedido(cabecalho(motivos) + semComentarios(editado)) });
    };
    if (anterior !== null && comparavel(anterior) === comparavel(editado)) {
      guardada();
      s.falha('error: Edit cancelled, no valid changes were saved.');
      return s.resultado();
    }
    // O kubectl lê o arquivo antes de tudo; o que não é YAML (ou é vazio) reabre com o erro do validador.
    const lido = lerYaml(semComentarios(editado), arquivo);
    if (lido.erro || !lido.docs.length || lido.docs.some((d) => !d || typeof d !== 'object' || Array.isArray(d))) {
      const motivo = lido.erro?.replace(/^[\s\S]*?error converting YAML to JSON: /, '') ?? 'invalid object to validate';
      const recurso = `${pluralQualificado(recursoDoKind(originais[0].kind))} "${originais[0].metadata.name}"`;
      s.err(`error: ${recurso} is invalid\n`);
      return reabrir([{ titulo: `${recurso} was not valid`, causas: [`<nil>: Invalid value: "The edited file failed validation": ${motivo}`] }]);
    }
    if (comparavel(original) === comparavel(editado)) {
      s.err('Edit cancelled, no changes made.\n');
      return s.resultado();
    }
    const outroNs = lido.docs.find((d) => recursoDoKind(d.kind)?.namespaced && d.metadata?.namespace && d.metadata.namespace !== ns)?.metadata.namespace;
    if (outroNs) {
      guardada();
      s.falha(`error: the namespace from the provided object "${outroNs}" does not match the namespace "${ns}". You must pass '--namespace=${outroNs}' to perform this operation.`);
      return s.resultado();
    }
    const motivos = [];
    let repetir = 0;
    let sumiram = 0;
    for (const obj of lido.docs) {
      const orig = originais.find((o) => o.metadata.uid === obj.metadata?.uid);
      if (!orig) {
        guardada();
        s.falha(`error: no original object found for ${obj.kind}/${obj.metadata?.name ?? ''}`); // ponytail: o real escreve o objeto inteiro (%#v do Go)
        return s.resultado();
      }
      const r = recursoDoKind(orig.kind);
      const nome = orig.metadata.name;
      const recurso = `${pluralQualificado(r)} "${nome}"`;
      if (canonico(orig) === canonico(obj)) {
        s.out(`${nomeQualificado(r)}/${nome} skipped\n`);
        continue;
      }
      if (obj.apiVersion !== orig.apiVersion || obj.kind !== orig.kind || obj.metadata?.name !== nome) {
        guardada();
        s.falha('error: At least one of apiVersion, kind and name was changed');
        return s.resultado();
      }
      const nao = negado(cluster, a, r, 'patch', orig.metadata.namespace, nome);
      if (nao) {
        s.err(`error: ${recurso} could not be patched: ${nao}\n`);
        repetir++;
        continue;
      }
      const atual = cluster.obter(orig.kind, orig.metadata.namespace ?? null, nome);
      if (!atual) {
        s.err(`error: ${recurso} could not be found on the server\n`);
        sumiram++;
        continue;
      }
      // O servidor aplica o patch ao objeto de agora (o que mudou enquanto o editor estava aberto continua).
      const patch = diferenca(orig, obj, !!r.crd);
      const base = structuredClone(atual);
      delete base.status;
      const novo = r.crd ? mesclarJson(base, patch) : estrategico(base, patch);
      const causas = errosDoServidor(novo, atual, patch);
      if (causas.length) {
        s.err(`error: ${recurso} is invalid\n`);
        motivos.push({ titulo: `${recurso} was not valid`, causas });
        continue;
      }
      delete novo.status;
      cluster.substituir(atual, novo);
      for (const aviso of cluster.avisos.splice(0)) s.err(`Warning: ${aviso}\n`);
      s.out(`${nomeQualificado(r)}/${nome} edited\n`);
    }
    cluster.reconciliar();
    if (repetir) s.falha(`You can run \`kubectl replace -f ${arquivo}\` to try this update again.`);
    else if (sumiram) s.falha(`The edits you made on deleted resources have been saved to "${arquivo}"`);
    else if (motivos.length) return reabrir(motivos);
    return s.resultado();
  }

  return pedido(json ? original : CABECALHO + original);
}

// ---------- o editor sem tela ----------
/** Um s/de/para/g do sed: o padrão é BRE (\( e \+ são os especiais), e o & e o \1 valem na troca. → [RegExp, troca] | null */
function lerSed(expr) {
  const trocas = [];
  let i = 0;
  while (i < expr.length) {
    while (/[\s;]/.test(expr[i] ?? '')) i++;
    if (i >= expr.length) break;
    if (expr[i] !== 's' || !expr[i + 1]) return null;
    const d = expr[i + 1];
    const partes = [];
    let atual = '';
    for (i += 2; i < expr.length && partes.length < 2; i++) {
      if (expr[i] === '\\' && expr[i + 1] === d) atual += expr[++i];
      else if (expr[i] === '\\') atual += expr[i] + (expr[++i] ?? '');
      else if (expr[i] === d) {
        partes.push(atual);
        atual = '';
      } else atual += expr[i];
    }
    if (partes.length < 2) return null;
    const flags = expr.slice(i).match(/^[gI\d]*/)[0];
    i += flags.length;
    const padrao = partes[0].replace(/\\([(){}+?|])|([(){}+?|])/g, (m, especial, literal) => especial ?? `\\${literal}`);
    const troca = partes[1].replace(/\\(.)|&|\$/g, (m, c) => (m === '&' ? '$&' : m === '$' ? '$$' : /\d/.test(c) ? `$${c}` : c === 'n' ? '\n' : c));
    trocas.push([new RegExp(padrao, `${flags.includes('g') ? 'g' : ''}${flags.includes('I') ? 'i' : ''}`), troca]);
  }
  return trocas;
}

/**
 * O programa do KUBE_EDITOR: cat (mostra o arquivo e não muda nada), true, ou sed -i com uma ou mais trocas (linha a
 * linha). → o editor (texto → { texto, saida }) ou null, se não for um desses.
 */
export function kubeEditor(texto) {
  const [nome, ...args] = palavras(texto);
  if (nome === 'cat') return (arquivo) => ({ texto: arquivo, saida: arquivo });
  if (nome === 'true') return (arquivo) => ({ texto: arquivo });
  const trocas = nome === 'sed' && args.includes('-i') ? args.filter((x) => !['-i', '-e'].includes(x)).map(lerSed) : [null];
  if (!trocas.length || trocas.includes(null)) return null;
  return (arquivo) => ({ texto: arquivo.split('\n').map((l) => trocas.flat().reduce((x, [re, por]) => x.replace(re, por), l)).join('\n') });
}

/** Faz o papel do editor até o kubectl terminar (cada reabertura com erro chama o editor de novo), escrevendo em `s`. */
function ateOFim(pedido, editor, s) {
  for (let vezes = 0; pedido && vezes < 10; vezes++) { // o real reabre para sempre; aqui, 10 voltas
    const e = editor(pedido.texto);
    const { texto, saida } = typeof e === 'string' ? { texto: e } : e;
    s.out(saida);
    const r = pedido.concluir(texto);
    s.partes.push(...r.partes);
    s.codigo = r.codigo;
    pedido = r.editar;
  }
}

/** kubectl edit TIPO/NOME (ou TIPO [NOME...]): o pedido de edição, ou, com KUBE_EDITOR, a edição feita até o fim. */
export function edit(cluster, a, s) {
  if (!a.posicionais.length) return s.falha(SEM_RECURSOS);
  const editor = a.kubeEditor === undefined ? null : kubeEditor(a.kubeEditor);
  if (a.kubeEditor !== undefined && !editor) return s.falha(t("error: aqui o KUBE_EDITOR só pode ser cat, true ou sed -i 's/de/para/' (sem o KUBE_EDITOR, o kubectl edit abre o editor na tela)."));
  const sel = selecionar(cluster, a.posicionais, a.flags);
  for (const e of sel.erros) s.falha(e);
  if (sel.erros.length) return null;
  const objetos = sel.grupos.flatMap((g) => g.objetos).map((o) => structuredClone(o));
  if (!objetos.length) return s.falha('error: edit cancelled, no objects found');
  const pedido = sessao(cluster, a, objetos);
  if (!editor) return { editar: pedido };
  ateOFim(pedido, editor, s);
  return null;
}

/**
 * O kubectl edit sem tela, para os testes: `editor(texto)` faz o papel do editor e devolve o texto salvo (o mesmo texto =
 * sair sem salvar), ou { texto, saida } se também escreveu no terminal. → o resultado, como o terminal mostraria.
 */
export function editarSemTela(cluster, linha, editor, opcoes) {
  const s = new Saida();
  const r = kubectl(cluster, linha, opcoes);
  s.partes.push(...r.partes);
  s.codigo = r.codigo;
  ateOFim(r.editar, editor, s);
  return s.resultado();
}
