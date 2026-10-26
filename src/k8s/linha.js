// Uma linha do terminal do aluno: o kubectl (com redirecionamento para arquivo, `... > pod.yaml`, que grava a
// saída no editor), o curl do computador do aluno (fora do cluster: port-forward, NodePort, LoadBalancer,
// Ingress e Gateway), o helm, o git, o echo, o ls e o cat dos arquivos do editor. Por cima, o que o bash junta:
// `a && b`, `a || b`, `a ; b`, os canos para os filtros de sempre (grep, head, tail, wc, sort, awk '{print $N}' e
// base64, para ver o que um Secret guarda), o `> /tmp/x.yaml 2>&1` e os reflexos de quem faz o exame: `export
// do="--dry-run=client -o yaml"` (com o $do e o ${do} expandidos) e `alias k=kubectl`, guardados por cluster.
// Usado pela tela do exercício e pelo teste da trilha (as soluções de terminal).
import { kubectl } from './kubectl/index.js';
import { helm } from './helm.js';
import { git } from './gitops.js';
import { palavras } from './kubectl/argv.js';
import { executarComando } from './shell.js';
import { httpDeFora } from './rede.js';
import { atobUtf8, btoaUtf8 } from './esquema.js';
import { t } from '../i18n.js';

const EXTENSAO = /\.(ya?ml|json|txt)$/;

/** O que o bash do aluno guarda de uma linha para outra (as variáveis e os aliases), por cluster: o Resetar, que cria outro cluster, zera tudo. */
const SHELLS = new WeakMap();
function shellDe(cluster) {
  if (!SHELLS.has(cluster)) SHELLS.set(cluster, { vars: new Map(), aliases: new Map() });
  return SHELLS.get(cluster);
}

/**
 * $VAR e ${VAR} fora das aspas simples, como o bash. O valor entra escapado: sem aspas, só se quebra nos espaços (o
 * "$do" vira várias palavras, e um | ou > de dentro dele não vale como operador); nas aspas duplas, fica uma palavra.
 */
function expandir(texto, vars) {
  let saida = '';
  let aspas = null;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas === "'") {
      if (ch === "'") aspas = null;
    } else if (ch === '\\') {
      saida += ch + (texto[++i] ?? '');
      continue;
    } else if (ch === '"') aspas = aspas ? null : '"';
    else if (ch === "'" && !aspas) aspas = "'";
    else if (ch === '$') {
      const m = texto.slice(i).match(/^\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/);
      if (m) {
        saida += (vars.get(m[1] ?? m[2]) ?? '').replace(aspas ? /["\\$`]/g : /[^\s\w=,.:/@%+-]/g, '\\$&');
        i += m[0].length - 1;
        continue;
      }
    }
    saida += ch;
  }
  return saida;
}

const NOME_DE_VARIAVEL = /^[A-Za-z_]\w*$/;

/** export A=1 B=2 (export sozinho lista, como o declare -x do bash). */
function exportar(cluster, args) {
  const { vars } = shellDe(cluster);
  if (!args.length) return resultado(0, [...vars].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `declare -x ${k}="${v.replace(/["\\$`]/g, '\\$&')}"\n`).join(''), '');
  let err = '';
  for (const a of args) {
    const i = a.indexOf('=');
    const nome = i < 0 ? a : a.slice(0, i);
    if (!NOME_DE_VARIAVEL.test(nome)) err += `bash: export: \`${a}': not a valid identifier\n`;
    else if (i >= 0) vars.set(nome, a.slice(i + 1));
  }
  return resultado(err ? 1 : 0, '', err);
}

/** alias k=kubectl; alias k mostra um; alias sozinho lista todos. */
function apelidar(cluster, args) {
  const { aliases } = shellDe(cluster);
  const mostrar = (k) => `alias ${k}='${aliases.get(k).replaceAll("'", "'\\''")}'\n`;
  if (!args.length) return resultado(0, [...aliases.keys()].sort().map(mostrar).join(''), '');
  let out = '';
  let err = '';
  for (const a of args) {
    const i = a.indexOf('=');
    if (i > 0) aliases.set(a.slice(0, i), a.slice(i + 1));
    else if (aliases.has(a)) out += mostrar(a);
    else err += `bash: alias: ${a}: not found\n`;
  }
  return resultado(err ? 1 : 0, out, err);
}

/** O alias na primeira palavra: o valor entra no lugar dela e é lido de novo (o mesmo alias não se expande duas vezes). */
function semAlias(cluster, texto) {
  const { aliases, vars } = shellDe(cluster);
  const vistos = new Set();
  for (;;) {
    const m = texto.match(/^(\s*)([^\s'"\\|&;<>=$`]+)(?=\s|$)/);
    if (!m || vistos.has(m[2]) || !aliases.has(m[2])) return texto;
    vistos.add(m[2]);
    texto = `${m[1]}${expandir(aliases.get(m[2]), vars)}${texto.slice(m[0].length)}`;
  }
}

const resultado = (codigo, out, err) => {
  const partes = [...(out ? [{ fluxo: 'out', texto: out }] : []), ...(err ? [{ fluxo: 'err', texto: err }] : [])];
  return { saida: out + err, stdout: out, stderr: err, partes, codigo };
};

/** Junta as partes de vários comandos (a && b, a | b) num resultado só; o código é o do último que rodou. */
function juntar(partes, codigo, extra = {}) {
  const de = (fluxo) => partes.filter((p) => p.fluxo === fluxo).map((p) => p.texto).join('');
  return { saida: partes.map((p) => p.texto).join(''), stdout: de('out'), stderr: de('err'), partes, codigo, ...extra };
}

/** O que um resultado traz além da saída: observar (-w, -f), sessao (exec -it), editar (kubectl edit)... */
const BASICOS = new Set(['saida', 'stdout', 'stderr', 'partes', 'codigo', 'arquivoGravado']);
const extras = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !BASICOS.has(k)));

/** O curl rodando no computador do aluno: só alcança o cluster pelas entradas de fora. */
function curlDeFora(cluster, linha) {
  const ctx = {
    env: {}, binarios: ['curl'], agenteCurl: 'curl/8.7.1',
    rede: { http: (u, op) => httpDeFora(cluster, u, op), dns: () => null },
  };
  const r = executarComando(palavras(linha), ctx);
  return r.codigo === 0 ? resultado(0, r.saida ?? '', '') : resultado(r.codigo, '', r.saida ?? '');
}

function eco(args) {
  const semQuebra = args[0] === '-n';
  return resultado(0, `${(semQuebra ? args.slice(1) : args).join(' ')}${semQuebra ? '' : '\n'}`, '');
}

/**
 * "... | base64" codifica a saída (em linhas de 76, como o GNU; -w 0 não quebra); "... | base64 -d" decodifica (é
 * assim que se lê um Secret). Se o comando de antes falhou, fica o código dele (o erro dele já foi para a tela).
 */
function base64(anterior, args) {
  if (anterior.codigo) return resultado(anterior.codigo, '', '');
  const quebra = args.join(' ').match(/^-w\s*(\d+)$|^--wrap=(\d+)$/);
  if (args.length && !['-d', '--decode'].includes(args[0]) && !quebra) return naoEntende('base64', args[0], '-d -w');
  if (!args.length || quebra) {
    const largura = Number(quebra?.[1] ?? quebra?.[2] ?? 76);
    const b = btoaUtf8(anterior.stdout);
    return resultado(0, b ? `${largura ? b.match(new RegExp(`.{1,${largura}}`, 'g')).join('\n') : b}\n` : '', '');
  }
  try {
    return resultado(0, atobUtf8(anterior.stdout.trim()), '');
  } catch {
    return resultado(1, '', 'base64: invalid input\n');
  }
}

// ---------- os filtros (o que vem depois do |) ----------
const linhasDe = (texto) => (texto ? texto.replace(/\n$/, '').split('\n') : []);
const comQuebra = (ls) => ls.map((l) => `${l}\n`).join('');

/** O que cada um diz quando o arquivo não existe (e o código de saída), como o GNU. */
const SEM_ARQUIVO = {
  cat: [1, (f) => `cat: ${f}: No such file or directory`],
  grep: [2, (f) => `grep: ${f}: No such file or directory`],
  wc: [1, (f) => `wc: ${f}: No such file or directory`],
  head: [1, (f) => `head: cannot open '${f}' for reading: No such file or directory`],
  tail: [1, (f) => `tail: cannot open '${f}' for reading: No such file or directory`],
  sort: [2, (f) => `sort: cannot read: ${f}: No such file or directory`],
  awk: [2, (f) => `awk: cannot open ${f} (No such file or directory)`],
};

const naoEntende = (cmd, opcao, opcoes) => resultado(2, '', `${t('{cmd}: este terminal ainda não entende a opção {opcao}. Aqui o {cmd} entende: {opcoes}.', { cmd, opcao, opcoes })}\n`);

/**
 * O que o filtro lê: os arquivos do editor citados ou, sem arquivo, a saída do comando de antes do |.
 * → { textos: [[nome do arquivo ou null, texto]], erro, codigo }
 */
function ler(cmd, operandos, entrada, arquivos) {
  if (!operandos.length) {
    if (entrada === null) return { textos: [], erro: `${t('{cmd}: aqui o {cmd} lê a saída de outro comando (depois de um |) ou um arquivo do editor.', { cmd })}\n`, codigo: 2 };
    return { textos: [[null, entrada]], erro: '', codigo: 0 };
  }
  const [codigo, msg] = SEM_ARQUIVO[cmd];
  const faltam = operandos.filter((f) => !(f in arquivos));
  return { textos: operandos.filter((f) => f in arquivos).map((f) => [f, arquivos[f]]), erro: faltam.map((f) => `${msg(f)}\n`).join(''), codigo: faltam.length ? codigo : 0 };
}

/** Separa as opções de letra (-n, -rn) dos operandos; as que levam valor (como o -n do head) pegam o próximo. */
function opcoes(args, letras, comValor = '') {
  const op = {};
  const resto = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      resto.push(...args.slice(i + 1));
      break;
    }
    if (!/^-./.test(a)) {
      resto.push(a);
      continue;
    }
    if (a.startsWith('--')) return { invalida: a };
    for (let j = 1; j < a.length; j++) {
      const l = a[j];
      if (comValor.includes(l)) {
        op[l] = a.slice(j + 1) || args[++i];
        break;
      }
      if (!letras.includes(l)) return { invalida: `-${l}` };
      op[l] = true;
    }
  }
  return { op, resto };
}

const CLASSES = { digit: '0-9', alpha: 'A-Za-z', alnum: '0-9A-Za-z', upper: 'A-Z', lower: 'a-z', space: '\\s', xdigit: '0-9A-Fa-f' };

/** O padrão do grep como RegExp: no básico (sem -E), | + ? ( ) { } são letras comuns e só valem com a barra. */
function regexDoGrep(padroes, op) {
  const um = (p) => {
    if (op.F) return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let fonte = '';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === '\\' && i + 1 < p.length) {
        const n = p[++i];
        fonte += n === '<' || n === '>' ? '\\b' : !op.E && '|+?(){}'.includes(n) ? n : `\\${n}`;
      } else fonte += !op.E && '|+?(){}'.includes(ch) ? `\\${ch}` : ch;
    }
    return fonte.replace(/\[:(\w+):\]/g, (m, nome) => CLASSES[nome] ?? m);
  };
  let fonte = padroes.map((p) => `(?:${um(p)})`).join('|');
  if (op.w) fonte = `(?<!\\w)(?:${fonte})(?!\\w)`;
  return new RegExp(fonte, op.i ? 'i' : '');
}

function grep({ args, entrada, arquivos }) {
  const padroes = [];
  const semE = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-e') padroes.push(args[++i] ?? '');
    else if (/^-e./.test(args[i])) padroes.push(args[i].slice(2));
    else semE.push(args[i]);
  }
  const { op, resto, invalida } = opcoes(semE, 'ivcEwnqFo');
  if (invalida) return naoEntende('grep', invalida, '-i -v -c -E -w -n -q -F -o -e');
  if (!padroes.length) {
    if (!resto.length) return resultado(2, '', "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n");
    padroes.push(...resto.shift().split('\n'));
  }
  let re;
  try {
    re = regexDoGrep(padroes, op);
  } catch (e) {
    const msg = /class/.test(e.message) ? 'Unmatched [, [^, [:, [., or [=' : /group|paren/i.test(e.message) ? 'Unmatched ( or \\(' : 'Invalid regular expression';
    return resultado(2, '', `grep: ${msg}\n`);
  }
  const fonte = ler('grep', resto, entrada, arquivos);
  const comNome = resto.length > 1;
  let out = '';
  let achou = 0;
  for (const [nome, texto] of fonte.textos) {
    const pre = comNome ? `${nome}:` : '';
    let n = 0;
    linhasDe(texto).forEach((l, i) => {
      if (re.test(l) === !!op.v) return;
      n++;
      const marca = `${pre}${op.n ? `${i + 1}:` : ''}`;
      if (op.c || op.q) return;
      if (op.o && !op.v) for (const m of l.matchAll(new RegExp(re.source, `${re.flags}g`))) out += m[0] ? `${marca}${m[0]}\n` : '';
      else out += `${marca}${l}\n`;
    });
    if (op.c) out += `${pre}${n}\n`;
    achou += n;
  }
  if (op.q) return resultado(achou ? 0 : fonte.codigo || 1, '', fonte.erro);
  return resultado(fonte.codigo || (achou ? 0 : 1), out, fonte.erro);
}

/** head e tail: -n N, -N; head -n -N (tudo menos as N últimas), tail -n +N (da linha N em diante). */
function pontas(cmd, { args, entrada, arquivos }) {
  const { op, resto, invalida } = opcoes(args.map((a) => a.replace(/^-(\d+)$/, '-n$1')), 'qv', 'n');
  if (invalida) return naoEntende(cmd, invalida, '-n N');
  const n = String(op.n ?? '10');
  if (!/^[-+]?\d+$/.test(n)) return resultado(1, '', `${cmd}: invalid number of lines: ‘${n}’\n`);
  const fonte = ler(cmd, resto, entrada, arquivos);
  const ls = fonte.textos.flatMap(([, texto]) => linhasDe(texto));
  const k = Math.abs(Number(n));
  const escolhidas = cmd === 'head' ? (n.startsWith('-') ? ls.slice(0, Math.max(0, ls.length - k)) : ls.slice(0, k))
    : n.startsWith('+') ? ls.slice(Math.max(0, k - 1)) : ls.slice(Math.max(0, ls.length - k));
  return resultado(fonte.codigo, comQuebra(escolhidas), fonte.erro);
}

/** wc -l conta as quebras de linha (como o GNU: sem \n no fim, a última não conta); -w palavras; -c bytes. */
function wc({ args, entrada, arquivos }) {
  const { op, resto, invalida } = opcoes(args, 'lwcm');
  if (invalida) return naoEntende('wc', invalida, '-l -w -c');
  const pedidos = ['l', 'w', 'c', 'm'].filter((l) => op[l]);
  const quais = pedidos.length ? pedidos : ['l', 'w', 'c'];
  const fonte = ler('wc', resto, entrada, arquivos);
  const contar = (texto) => quais.map((q) => ({ l: (texto.match(/\n/g) ?? []).length, w: texto.split(/\s+/).filter(Boolean).length, c: new TextEncoder().encode(texto).length, m: [...texto].length }[q]));
  const linhas = fonte.textos.map(([nome, texto]) => [contar(texto), nome]);
  if (linhas.length > 1) linhas.push([quais.map((_, i) => linhas.reduce((s, [ns]) => s + ns[i], 0)), 'total']);
  const largura = quais.length === 1 && linhas.length === 1 ? 0 : resto.length ? Math.max(...linhas.flatMap(([ns]) => ns.map((x) => String(x).length))) : 7;
  const out = linhas.map(([ns, nome]) => `${ns.map((x) => String(x).padStart(largura)).join(' ')}${nome ? ` ${nome}` : ''}\n`).join('');
  return resultado(fonte.codigo, out, fonte.erro);
}

const ordem = new Intl.Collator('en').compare;

function sort({ args, entrada, arquivos }) {
  const { op, resto, invalida } = opcoes(args, 'rnu');
  if (invalida) return naoEntende('sort', invalida, '-r -n -u');
  const fonte = ler('sort', resto, entrada, arquivos);
  const numero = (l) => Number.parseFloat(l.trim()) || 0;
  let ls = fonte.textos.flatMap(([, texto]) => linhasDe(texto)).sort((a, b) => (op.n ? numero(a) - numero(b) : 0) || ordem(a, b));
  if (op.r) ls.reverse();
  if (op.u) ls = ls.filter((l, i) => i === 0 || (op.n ? numero(l) !== numero(ls[i - 1]) : l !== ls[i - 1]));
  return resultado(fonte.codigo, comQuebra(ls), fonte.erro);
}

/** O awk do dia a dia: '{print $1}', '{print $1, $3}', '{print $NF}' e um NR>1 na frente (pula o cabeçalho). */
function awk({ args, entrada, arquivos }) {
  let separador = null;
  const resto = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-F') separador = args[++i];
    else if (args[i].startsWith('-F')) separador = args[i].slice(2);
    else resto.push(args[i]);
  }
  const [programa, ...operandos] = resto;
  const m = programa?.trim().match(/^(?:NR\s*(==|!=|>=|<=|>|<)\s*(\d+))?\s*(?:\{\s*print\b([^}]*)\}\s*)?$/);
  const itens = [];
  const sobra = m ? (m[3] ?? '').replace(/\$(\d+|NF)|"([^"]*)"|,|\s+/g, (x, campo, texto) => {
    if (x === ',') itens.push(',');
    else if (campo !== undefined) itens.push({ campo });
    else if (texto !== undefined) itens.push({ texto });
    return '';
  }) : null;
  if (!m || sobra) return resultado(2, '', `${t("awk: aqui o awk só entende programas como '{print $1}', '{print $1, $3}', '{print $NF}' e 'NR>1 {print $1}'.")}\n`);
  const fonte = ler('awk', operandos, entrada, arquivos);
  const vale = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b };
  const campos = (l) => (separador && separador !== ' ' ? l.split(separador.length === 1 ? separador : new RegExp(separador)) : l.trim().split(/\s+/).filter(Boolean));
  const out = fonte.textos.flatMap(([, texto]) => linhasDe(texto)).flatMap((l, i) => {
    if (m[1] && !vale[m[1]](i + 1, Number(m[2]))) return [];
    if (m[3] === undefined) return m[1] ? [l] : []; // só o padrão: imprime a linha; programa vazio: nada
    const cs = campos(l);
    const valor = (c) => (c === '0' ? l : c === 'NF' ? cs.at(-1) ?? '' : cs[Number(c) - 1] ?? '');
    return [itens.length ? itens.map((x) => (x === ',' ? ' ' : x.campo !== undefined ? valor(x.campo) : x.texto)).join('') : l];
  });
  return resultado(fonte.codigo, comQuebra(out), fonte.erro);
}

function cat({ args, entrada, arquivos }) {
  if (!args.length && entrada !== null) return resultado(0, entrada, '');
  const fonte = ler('cat', args, entrada, arquivos);
  return resultado(fonte.codigo ? 1 : 0, fonte.textos.map(([, texto]) => texto).join(''), fonte.erro);
}

/** Os comandos do terminal. `entrada`: a saída do comando de antes do | (null no primeiro); `cano`: a saída vai para um |. */
const PROGRAMAS = {
  kubectl: ({ cluster, texto, arquivos, entrada }) => kubectl(cluster, texto, { arquivos: entrada === null ? arquivos : { ...arquivos, '-': entrada } }),
  helm: ({ cluster, texto, arquivos }) => helm(cluster, texto, { arquivos }),
  git: ({ cluster, texto, arquivos }) => git(cluster, texto, arquivos),
  curl: ({ cluster, texto }) => curlDeFora(cluster, texto),
  echo: ({ args }) => eco(args),
  ls: ({ arquivos, cano }) => resultado(0, `${Object.keys(arquivos).join(cano ? '\n' : '  ')}\n`, ''),
  cat,
  grep,
  head: (x) => pontas('head', x),
  tail: (x) => pontas('tail', x),
  wc,
  sort,
  awk,
  base64: ({ args, anterior }) => (anterior ? base64(anterior, args) : resultado(2, '', `${t('{cmd}: aqui o {cmd} lê a saída de outro comando (depois de um |) ou um arquivo do editor.', { cmd: 'base64' })}\n`)),
  export: ({ cluster, args }) => exportar(cluster, args),
  alias: ({ cluster, args }) => apelidar(cluster, args),
};
PROGRAMAS.k = PROGRAMAS.kubectl;

/** Os comandos que o terminal entende (a tela do exercício usa esta lista: o resto é "command not found"). */
export const COMANDOS = Object.keys(PROGRAMAS);

/** A primeira palavra da linha é algo que este terminal roda? Um comando, um alias que o aluno criou ou um VAR=valor. */
export const conhece = (cluster, cmd) => COMANDOS.includes(cmd) || shellDe(cluster).aliases.has(cmd) || /^[A-Za-z_]\w*=/.test(cmd ?? '');
const FILTROS = 'grep, head, tail, wc, sort, awk, cat, base64';

/** A primeira posição fora das aspas (e sem \\ na frente) em que `achar(i)` vale, ou -1. */
function foraDasAspas(texto, achar) {
  let aspas = null;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === aspas) aspas = null;
      else if (ch === '\\' && aspas === '"') i++;
    } else if (ch === '"' || ch === "'") aspas = ch;
    else if (ch === '\\') i++;
    else if (achar(i)) return i;
  }
  return -1;
}

/** O 2>&1 (o erro vai junto com a saída) e o 2>/dev/null (o erro some) de um comando. → [texto sem eles, desvio] */
function desvioDoErro(texto) {
  const i = foraDasAspas(texto, (k) => /(^|\s)$/.test(texto.slice(0, k)) && /^2>(&1|\/dev\/null)(\s|$)/.test(texto.slice(k)));
  if (i < 0) return [texto, null];
  const m = texto.slice(i).match(/^2>(&1|\/dev\/null)/);
  const [resto, outro] = desvioDoErro(texto.slice(0, i) + texto.slice(i + m[0].length));
  return [resto, outro ?? m[1]];
}

function rodarComando(cluster, bruto, arquivos, anterior, cano) {
  const [texto, desvio] = desvioDoErro(semAlias(cluster, bruto));
  const ps = palavras(texto);
  const i = ps.findIndex((p) => !/^[A-Za-z_]\w*=/.test(p)); // pula o VAR=valor da frente (KUBE_EDITOR=...)
  if (i < 0) { // só VAR=valor: a variável fica no shell
    for (const p of ps) shellDe(cluster).vars.set(p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1));
    return resultado(0, '', '');
  }
  const [nome, ...args] = ps.slice(i);
  const programa = PROGRAMAS[nome];
  let r;
  if (programa) r = programa({ cluster, texto, args, arquivos, entrada: anterior ? anterior.stdout : null, anterior, cano });
  else if (!anterior) r = resultado(127, '', `bash: ${nome}: command not found\n`);
  else r = resultado(127, '', `${t('bash: {cmd}: este terminal não tem esse comando. Depois de um | ele entende: {lista}.', { cmd: nome, lista: FILTROS })}\n`);
  if (!desvio) return r;
  const partes = desvio === '&1' ? r.partes.map((p) => ({ ...p, fluxo: 'out' })) : r.partes.filter((p) => p.fluxo === 'out');
  return juntar(partes, r.codigo, extras(r));
}

/** Corta a linha nos operadores que estão fora das aspas (o `&&` de dentro de um sh -c '...' é do contêiner). → [[trecho, operador depois dele (ou null)]] */
function cortar(linha, operadores) {
  const trechos = [];
  let inicio = 0;
  for (;;) {
    let op;
    const i = foraDasAspas(linha.slice(inicio), (k) => (op = operadores.find((o) => linha.startsWith(o, inicio + k))));
    if (i < 0) break;
    trechos.push([linha.slice(inicio, inicio + i), op]);
    inicio += i + op.length;
  }
  trechos.push([linha.slice(inicio), null]);
  return trechos;
}

/**
 * O "> arquivo" (ou ">>"), se estiver fora de aspas (o de dentro de um sh -c '...' é do contêiner; o 2> é do erro).
 * O que vem depois do nome (o 2>&1 de "> x.txt 2>&1") volta para o comando. → [comando, operador, arquivo] ou null
 */
function redirecionamento(linha) {
  const i = foraDasAspas(linha, (k) => linha[k] === '>' && !/(^|\s)2$/.test(linha.slice(0, k)) && !linha.startsWith('>&', k));
  if (i < 0) return null;
  const m = linha.slice(i).match(/^(>>?)\s*(\S+)/);
  return m && linha.slice(0, i).trim() ? [linha.slice(0, i) + linha.slice(i + m[0].length), m[1], palavras(m[2]).join('')] : null;
}

/** Um cano (`a | b | c`), com o `> arquivo` do fim. → resultado (com `arquivoGravado` quando houve `>`) */
function rodarCano(cluster, bruto, arquivos) {
  const linha = expandir(bruto, shellDe(cluster).vars);
  const m = redirecionamento(linha);
  if (m && m[2] !== '/dev/null' && !EXTENSAO.test(m[2])) return resultado(1, '', `bash: ${m[2]}: só dá para gravar arquivos .yaml, .json ou .txt aqui\n`);
  const estagios = cortar(m ? m[0] : linha, ['|']).map(([x]) => x);
  if (estagios.length > 1 && estagios.some((x) => !x.trim())) return resultado(2, '', "bash: syntax error near unexpected token `|'\n");
  const erros = [];
  let r = null;
  estagios.forEach((estagio, i) => {
    if (r) erros.push(...r.partes.filter((p) => p.fluxo === 'err'));
    r = rodarComando(cluster, estagio, arquivos, r, i < estagios.length - 1);
  });
  if (estagios.length > 1) r = juntar([...erros, ...r.partes], r.codigo);
  if (!m) return r;
  const [, operador, nome] = m;
  const partes = r.partes.filter((p) => p.fluxo === 'err');
  if (nome === '/dev/null') return { ...r, saida: partes.map((p) => p.texto).join(''), stdout: '', partes };
  arquivos[nome] = (operador === '>>' ? arquivos[nome] ?? '' : '') + r.stdout;
  return { ...r, saida: partes.map((p) => p.texto).join(''), partes, arquivoGravado: nome };
}

/** → o resultado do último comando que rodou (com as partes de todos), ou o erro de sintaxe do bash. */
export function rodarLinha(cluster, linha, arquivos) {
  const trechos = cortar(linha, ['&&', '||', ';']);
  if (trechos.length === 1) return rodarCano(cluster, linha, arquivos);
  const partes = [];
  let codigo = 0;
  let gravado;
  let ultimo = {};
  let antes = null; // o operador antes do trecho
  for (const [trecho, depois] of trechos) {
    if (!trecho.trim()) {
      if (depois === null && antes === ';') break; // "a ;" vale
      return resultado(2, '', `bash: syntax error near unexpected token \`${depois ?? antes}'\n`);
    }
    if (!(antes === '&&' && codigo !== 0) && !(antes === '||' && codigo === 0)) {
      ultimo = rodarCano(cluster, trecho, arquivos);
      partes.push(...ultimo.partes);
      codigo = ultimo.codigo;
      gravado = ultimo.arquivoGravado ?? gravado;
    }
    antes = depois;
  }
  return juntar(partes, codigo, { ...(gravado ? { arquivoGravado: gravado } : {}), ...extras(ultimo) });
}
