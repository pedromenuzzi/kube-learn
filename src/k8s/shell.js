// Um shell mínimo, só com o que as missões usam. Roda o processo principal de contêineres com shell
// (`sh -c 'while true; do echo oi; sleep 5; done'`) e os comandos do `kubectl exec`.
// O processo é um gerador: `yield { dormir: ms }` devolve o controle ao kubelet, que acorda o processo
// quando o relógio do cluster chega lá. Assim o `sleep` usa o tempo simulado.

const LITERAL = '\u0000'; // marca um "$" que veio entre aspas simples (não expande)

/** Quebra o script em palavras e separadores, respeitando aspas. */
function tokens(script) {
  const saida = [];
  let palavra = null;
  const fechar = () => {
    if (palavra !== null) saida.push({ palavra });
    palavra = null;
  };
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (c === "'") {
      const fim = script.indexOf("'", i + 1);
      const trecho = script.slice(i + 1, fim === -1 ? undefined : fim);
      palavra = (palavra ?? '') + trecho.replaceAll('$', LITERAL);
      i = fim === -1 ? script.length : fim;
    } else if (c === '"') {
      let j = i + 1;
      let trecho = '';
      while (j < script.length && script[j] !== '"') {
        if (script[j] === '\\' && '"\\$'.includes(script[j + 1])) j++;
        trecho += script[j++];
      }
      palavra = (palavra ?? '') + trecho;
      i = j;
    } else if (c === '\\' && i + 1 < script.length) {
      palavra = (palavra ?? '') + script[++i];
    } else if (c === ' ' || c === '\t') {
      fechar();
    } else if (c === ';' || c === '\n') {
      fechar();
      saida.push({ sep: ';' });
    } else if (c === '>') {
      // Redirecionamento: "2>&1" e "2>arquivo" (o erro) são ignorados; "> arquivo" e ">> arquivo" gravam a saída.
      if (palavra === '2') {
        palavra = null;
        i++;
        while (i < script.length && ' \t;\n'.includes(script[i])) i++;
        while (i < script.length && !' \t;\n'.includes(script[i])) i++;
        i--;
        continue;
      }
      fechar();
      const anexar = script[i + 1] === '>';
      if (anexar) i++;
      saida.push({ redir: anexar ? '>>' : '>' });
    } else if ((c === '&' || c === '|') && script[i + 1] === c) {
      fechar();
      saida.push({ sep: c + c });
      i++;
    } else if (c === '#' && palavra === null) {
      while (i < script.length && script[i] !== '\n') i++;
      i--;
    } else {
      palavra = (palavra ?? '') + c;
    }
  }
  fechar();
  return saida;
}

/** Script → lista de nós { argv, sep } e { enquanto: [nós], condicao: [nós], ate } (while/until COND; do ...; done). */
export function analisar(script) {
  const lista = tokens(script);
  let i = 0;
  const bloco = (fim) => {
    const nos = [];
    let argv = [];
    let sep = ';';
    let redir = null;
    const empurrar = (proximoSep) => {
      if (argv.length) nos.push({ argv, sep, ...(redir ? { redir } : {}) });
      argv = [];
      redir = null;
      sep = proximoSep;
    };
    while (i < lista.length) {
      const t = lista[i++];
      if (t.sep) {
        empurrar(t.sep);
        continue;
      }
      if (t.redir) {
        redir = { anexar: t.redir === '>>', alvo: lista[i]?.palavra ?? '' };
        if (lista[i]?.palavra !== undefined) i++;
        continue;
      }
      if (argv.length === 0 && t.palavra === fim) return nos;
      if (argv.length === 0 && (t.palavra === 'while' || t.palavra === 'until')) {
        const condicao = bloco('do');
        nos.push({ enquanto: bloco('done'), condicao, ate: t.palavra === 'until', sep });
        continue;
      }
      argv.push(t.palavra);
    }
    empurrar(';');
    return nos;
  };
  return bloco(null);
}

/** Troca $VAR e ${VAR} pelo valor (`valor(nome)`); o "$" que veio entre aspas simples fica. */
const expandir = (palavra, valor) => (palavra.includes('$') || palavra.includes(LITERAL)
  ? palavra.replace(/\$\{(\w+)\}|\$(\w+|\?)/g, (_, a, b) => valor(a ?? b) ?? '').replaceAll(LITERAL, '$')
  : palavra);

/**
 * Roda o script. ctx: { env, saida(texto), comandos: executarComando }.
 * Gerador: yield { dormir: ms } e return código de saída.
 */
export function* rodar(nos, ctx) {
  let codigo = 0;
  let semDormir = 0;
  for (const no of nos) {
    if (no.sep === '&&' && codigo !== 0) continue;
    if (no.sep === '||' && codigo === 0) continue;
    if (no.enquanto) {
      for (;;) {
        // while: repete enquanto a condição dá certo; until: enquanto ela falha.
        const c = yield* rodar(no.condicao, ctx);
        if (c?.sair) return c;
        if ((c.codigo === 0) === no.ate) break;
        const r = yield* rodar(no.enquanto, ctx);
        if (r?.sair) return r;
        if (++semDormir > 200) { // laço sem sleep: não trava o simulador
          semDormir = 0;
          yield { dormir: 1000 };
        }
      }
      codigo = 0;
      continue;
    }
    const valor = (nome) => (nome === '?' ? String(codigo) : ctx.env[nome]);
    const argv = no.argv.map((p) => expandir(p, valor)).filter((p) => !/^\d?>&?\S*$|^2>&1$/.test(p));
    const [cmd, ...args] = argv;
    if (cmd === 'sleep') {
      const n = args[0] === 'infinity' ? Infinity : Number.parseFloat(args[0]);
      if (Number.isNaN(n)) {
        ctx.saida(`sleep: invalid number '${args[0] ?? ''}'\n`);
        codigo = 1;
        continue;
      }
      yield { dormir: n * 1000 };
      semDormir = 0;
      codigo = 0;
      continue;
    }
    if (cmd === 'exit') return { sair: true, codigo: Number(args[0] ?? codigo) || 0 };
    const r = ctx.comandos(argv, ctx);
    codigo = r.codigo;
    if (no.redir) {
      const alvo = expandir(no.redir.alvo, (nome) => ctx.env[nome]);
      if (r.erro) ctx.saida(r.erro);
      const falha = ctx.fs ? ctx.fs.escrever(alvo, r.saida ?? '', no.redir.anexar) : null;
      if (falha) { // as mensagens do sh do busybox e do dash (Debian) são diferentes
        const motivo = { 'somente-leitura': 'Read-only file system', 'sem-pasta': ctx.busybox ? 'nonexistent directory' : 'Directory nonexistent', pasta: 'Is a directory' }[falha];
        ctx.saida(ctx.busybox ? `sh: can't create ${alvo}: ${motivo}\n` : `sh: 1: cannot create ${alvo}: ${motivo}\n`);
        codigo = ctx.busybox ? 1 : 2;
      }
      continue;
    }
    if (r.saida) ctx.saida(r.saida);
    if (r.erro) ctx.saida(r.erro);
  }
  return { codigo };
}

/** Roda um script até o fim, sem esperar os sleeps (para o `kubectl exec`). */
export function rodarAteOFim(script, ctx) {
  const gerador = rodar(analisar(script), ctx);
  for (let i = 0; i < 1000; i++) {
    const { value, done } = gerador.next();
    if (done) return value?.codigo ?? 0;
    if (value?.dormir === Infinity) return 0;
  }
  return 0;
}

// ---------- comandos ----------

const ENV_NAO_IMPRIMIR = new Set(['?']);

/**
 * Executa um comando simples. ctx: { env, hostname, arquivos, binarios, busybox, rede }.
 * rede: { http(url, opcoes) → { status, corpo, cabecalhos } | { erro: 'dns'|'recusada'|'timeout', ip }, dns(nome) }.
 */
export function executarComando(argv, ctx) {
  const [cmd, ...args] = argv;
  const nomeShell = ctx.busybox ? 'sh' : 'sh';
  if (!cmd) return { codigo: 0 };
  const existe = ctx.binarios.includes(cmd) || ctx.binarios.includes(cmd.split('/').pop()) || ['echo', 'exit', 'true', 'false', 'cd', 'export', 'pwd'].includes(cmd);
  if (!existe) return { saida: `${nomeShell}: ${cmd}: not found\n`, codigo: 127 };
  const c = COMANDOS[cmd.split('/').pop()];
  if (!c) return { codigo: 0 };
  return c(args, ctx);
}

const ok = (saida = '') => ({ saida, codigo: 0 });

const COMANDOS = {
  echo: (args) => (args[0] === '-n' ? ok(args.slice(1).join(' ')) : ok(`${args.join(' ')}\n`)),
  true: () => ok(),
  false: () => ({ codigo: 1 }),
  pwd: () => ok('/\n'),
  cd: () => ok(),
  whoami: (_, ctx) => (ctx.nomeUsuario ? ok(`${ctx.nomeUsuario}\n`)
    : { erro: ctx.busybox ? `whoami: unknown uid ${ctx.uid}\n` : `whoami: cannot find name for user ID ${ctx.uid}\n`, codigo: 1 }),
  id: (_, ctx) => {
    const uid = ctx.uid ?? 0;
    const gid = ctx.gid ?? 0;
    const nome = (n, quem) => (n === 0 ? `${n}(root)` : quem ? `${n}(${quem})` : String(n));
    const grupos = gid === 0 && uid === 0 && ctx.busybox ? '0(root),10(wheel)' : nome(gid, uid === gid ? ctx.nomeUsuario : null);
    return ok(`uid=${nome(uid, ctx.nomeUsuario)} gid=${nome(gid, uid === gid ? ctx.nomeUsuario : null)} groups=${grupos}\n`);
  },
  hostname: (_, ctx) => ok(`${ctx.hostname}\n`),
  date: (_, ctx) => ok(`${new Date(ctx.agora).toUTCString().replace('GMT', 'UTC')}\n`),
  export: (args, ctx) => {
    for (const a of args) {
      const [k, ...v] = a.split('=');
      ctx.env[k] = v.join('=');
    }
    return ok();
  },
  env: (_, ctx) => ok(Object.entries(ctx.env).filter(([k]) => !ENV_NAO_IMPRIMIR.has(k)).map(([k, v]) => `${k}=${v}\n`).join('')),
  printenv: (args, ctx) => {
    if (!args.length) return COMANDOS.env(args, ctx);
    const v = ctx.env[args[0]];
    return v === undefined ? { codigo: 1 } : ok(`${v}\n`);
  },
  cat: (args, ctx) => {
    let saida = '';
    for (const a of args) {
      const texto = ctx.fs.ler(a);
      if (texto === undefined) {
        const erro = ctx.busybox ? `cat: can't open '${a}': No such file or directory\n` : `cat: ${a}: No such file or directory\n`;
        return { saida, erro, codigo: 1 };
      }
      saida += texto;
    }
    return ok(saida);
  },
  ls: (args, ctx) => {
    const alvo = args.find((a) => !a.startsWith('-')) ?? '/';
    if (ctx.fs.ler(alvo) !== undefined) return ok(`${alvo}\n`);
    const nomes = ctx.fs.listar(alvo);
    if (!nomes) return ctx.busybox ? { saida: `ls: ${alvo}: No such file or directory\n`, codigo: 1 } : { saida: `ls: cannot access '${alvo}': No such file or directory\n`, codigo: 2 };
    const visiveis = args.some((x) => /^-\w*a/.test(x)) ? nomes : nomes.filter((n) => !n.startsWith('.'));
    return ok(visiveis.length ? `${visiveis.join('\n')}\n` : '');
  },
  ps: () => ok('PID   USER     TIME  COMMAND\n    1 root      0:00 sh\n'),
  touch: (args, ctx) => {
    for (const a of args.filter((x) => !x.startsWith('-'))) {
      if (ctx.fs.ler(a) !== undefined) continue;
      const falha = ctx.fs.escrever(a, '', true);
      if (falha) return { erro: ctx.busybox ? `touch: ${a}: ${falha === 'somente-leitura' ? 'Read-only file system' : 'No such file or directory'}\n` : `touch: cannot touch '${a}': ${falha === 'somente-leitura' ? 'Read-only file system' : 'No such file or directory'}\n`, codigo: 1 };
    }
    return ok();
  },
  rm: (args, ctx) => {
    const forcar = args.some((x) => /^-\w*f/.test(x));
    for (const a of args.filter((x) => !x.startsWith('-'))) {
      const falha = ctx.fs.remover(a);
      if (falha === 'nao-existe' && !forcar) return { erro: ctx.busybox ? `rm: can't remove '${a}': No such file or directory\n` : `rm: cannot remove '${a}': No such file or directory\n`, codigo: 1 };
      if (falha === 'somente-leitura') return { erro: `rm: can't remove '${a}': Read-only file system\n`, codigo: 1 };
    }
    return ok();
  },
  mkdir: (args, ctx) => {
    for (const a of args.filter((x) => !x.startsWith('-'))) ctx.fs.escrever(`${a.replace(/\/$/, '')}/.keep`, '', true);
    return ok();
  },
  curl: (args, ctx) => curl(args, ctx),
  wget: (args, ctx) => wget(args, ctx),
  nslookup: (args, ctx) => nslookup(args, ctx),
};

/** O host de uma URL que o separarUrl não aceitou ("http://" e "/healthz" não têm host). */
const hostDaUrl = (url) => url.replace(/^[a-z]+:\/\//i, '').split('/')[0];

function separarUrl(url) {
  const m = url.match(/^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/);
  if (!m) return null;
  return { esquema: m[1] ?? 'http', host: m[2], porta: Number(m[3] ?? (m[1] === 'https' ? 443 : 80)), caminho: m[4] ?? '/' };
}

function curl(args, ctx) {
  let silencioso = false;
  let mostrarErro = false;
  let soCabecalho = false;
  let incluirCabecalho = false;
  let formato = null;
  let descartar = false;
  let limite = null;
  let url = null;
  let host;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--output') descartar = args[++i] === '/dev/null';
    else if (a === '-w' || a === '--write-out') formato = args[++i];
    else if (a === '-m' || a === '--max-time' || a === '--connect-timeout') limite = Number(args[++i]);
    else if (a === '-H' || a === '--header') {
      const m = (args[++i] ?? '').match(/^host:\s*(\S+)/i);
      if (m) host = m[1];
    } else if (a === '-X' || a === '-d' || a === '--data') i++;
    else if (a.startsWith('-') && !a.startsWith('--')) {
      if (a.includes('s')) silencioso = true;
      if (a.includes('S')) mostrarErro = true;
      if (a.includes('I')) soCabecalho = true;
      if (a.includes('i')) incluirCabecalho = true;
    } else if (a === '--silent') silencioso = true;
    else if (!a.startsWith('-')) url = a;
  }
  if (!url) return { saida: "curl: try 'curl --help' or 'curl --manual' for more information\n", codigo: 2 };
  const u = separarUrl(url);
  const falhar = (codigo, msg) => ({ saida: !silencioso || mostrarErro ? `curl: (${codigo}) ${msg}\n` : '', codigo });
  if (!u) {
    const h = hostDaUrl(url);
    const curl8 = ctx.agenteCurl?.startsWith('curl/8'); // o curl 7.88 dos contêineres só tem a mensagem genérica
    return falhar(3, curl8 && !h ? 'URL rejected: No host part in the URL' : curl8 && /:\d*\D/.test(h) ? 'URL rejected: Port number was not a decimal number between 0 and 65535' : 'URL using bad/illegal format or missing URL');
  }
  const r = ctx.rede.http(u, { agente: ctx.agenteCurl ?? 'curl/7.88.1', metodo: soCabecalho ? 'HEAD' : 'GET', host });
  if (r.erro === 'dns') return falhar(6, `Could not resolve host: ${u.host}`);
  if (r.erro === 'recusada') return falhar(7, `Failed to connect to ${u.host} port ${u.porta} after 1 ms: Couldn't connect to server`);
  if (r.erro === 'timeout') {
    return limite
      ? falhar(28, `Connection timed out after ${limite * 1000 + 1} milliseconds`)
      : falhar(28, `Failed to connect to ${u.host} port ${u.porta} after 133970 ms: Couldn't connect to server`);
  }
  if (r.erro === 'vazia') return falhar(52, 'Empty reply from server');
  const cabecalhos = `HTTP/1.1 ${r.status} ${r.frase}\r\n${Object.entries(r.cabecalhos).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\n`;
  let saida = '';
  if (!descartar) saida = soCabecalho ? cabecalhos : (incluirCabecalho ? cabecalhos : '') + r.corpo;
  if (formato) saida += formato.replaceAll('%{http_code}', String(r.status)).replaceAll('\\n', '\n');
  return ok(saida);
}

function wget(args, ctx) {
  let url = null;
  let saidaPadrao = false;
  let quieto = false;
  let espera = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-O') saidaPadrao = args[++i] === '-';
    else if (a === '-T') espera = Number(args[++i]);
    else if (a.startsWith('-') && !a.startsWith('--')) {
      if (a.includes('q')) quieto = true;
      if (a.includes('O') && a.endsWith('O-')) saidaPadrao = true;
      else if (a.endsWith('O')) saidaPadrao = args[++i] === '-';
    } else if (!a.startsWith('-')) url = a;
  }
  if (!url) return { saida: 'BusyBox v1.36.1 (2023-05-18 22:34:17 UTC) multi-call binary.\n\nUsage: wget [-cqS] [--spider] [-O FILE] [-o LOGFILE] [--header STR]\n', codigo: 1 };
  const u = separarUrl(url);
  if (!u) return { saida: `wget: bad address '${hostDaUrl(url)}'\n`, codigo: 1 };
  const r = ctx.rede.http(u, { agente: 'Wget', metodo: 'GET' });
  if (r.erro === 'dns') return { saida: `wget: bad address '${u.host}'\n`, codigo: 1 };
  if (r.erro === 'recusada') return { saida: `wget: can't connect to remote host (${r.ip}): Connection refused\n`, codigo: 1 };
  if (r.erro === 'timeout') return { saida: 'wget: download timed out\n', codigo: 1 };
  if (r.erro === 'vazia') return { saida: 'wget: error getting response\n', codigo: 1 };
  const inicio = quieto ? '' : `Connecting to ${u.host}${u.porta === 80 ? '' : `:${u.porta}`} (${r.ip}:${u.porta})\n`;
  if (r.status >= 400) return { saida: `${inicio}wget: server returned error: HTTP/1.1 ${r.status} ${r.frase}\n`, codigo: 1 };
  if (saidaPadrao) return ok(inicio + r.corpo + (quieto ? '' : "writing to stdout\n-                    100% |********************************|   615  0:00:00 ETA\nwritten to stdout\n"));
  void espera;
  return ok(`${inicio}saving to 'index.html'\nindex.html           100% |********************************|   615  0:00:00 ETA\n'index.html' saved\n`);
}

function nslookup(args, ctx) {
  const nome = args.find((a) => !a.startsWith('-'));
  if (!nome) return { saida: 'BusyBox v1.36.1 (2023-05-18 22:34:17 UTC) multi-call binary.\n\nUsage: nslookup [-type=QUERY_TYPE] [-debug] HOST [DNS_SERVER]\n', codigo: 1 };
  if (ctx.rede.semDns) return { saida: ';; connection timed out; no servers could be reached\n\n', codigo: 1 }; // a catraca não deixa chegar ao DNS
  const r = ctx.rede.dns(nome);
  const cab = 'Server:\t\t10.96.0.10\nAddress:\t10.96.0.10:53\n\n';
  const nx = (n) => `** server can't find ${n}: NXDOMAIN\n\n`;
  const enderecos = (x) => (x.ips ?? [x.ip]).map((ip) => `Name:\t${x.nome}\nAddress: ${ip}\n`).join('');
  // Nome com ponto (db-0.db, web.default): o nslookup do busybox pergunta só por ele, sem os domínios de busca.
  if (nome.includes('.')) {
    const n = nome.replace(/\.$/, '');
    const x = ctx.rede.dns(`${n}.`);
    return x ? ok(`${cab}\n${enderecos(x)}\n`) : { saida: `${cab}${nx(n)}${nx(n)}`, codigo: 1 };
  }
  // O busybox pergunta por todos os domínios de busca (ndots:5) e mostra o que achou e o que não achou.
  const busca = (ctx.buscaDns ?? []).map((d) => `${nome}.${d}`);
  if (!r) return { saida: cab + busca.flatMap((n) => [nx(n), nx(n)]).join('') + nx(nome) + nx(nome), codigo: 1 };
  const outros = busca.filter((n) => n !== r.nome);
  const [antes, ...depois] = outros.length ? [outros.at(-1), ...outros.slice(0, -1)] : [];
  let saida = cab;
  if (antes) saida += nx(antes) + nx(antes);
  saida += `\n${enderecos(r)}\n`;
  for (const n of depois) saida += nx(n) + nx(n);
  return { saida, codigo: outros.length ? 1 : 0 };
}
