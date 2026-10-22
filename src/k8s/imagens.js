// Catálogo de imagens falsas. Nenhum contêiner de verdade roda: cada imagem descreve como o programa dela
// se comporta (portas, respostas HTTP, logs, o que exige para subir, como cai). É isso que deixa o
// simulador realista. Imagem fora do catálogo dá ErrImagePull, como um nome errado no cluster real.
import { hexDe } from './aleatorio.js';

const NGINX_HTML = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
`;

const NGINX_404 = (versao) => `<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/${versao}</center>
</body>
</html>
`;

const BINARIOS_DEBIAN = ['sh', 'bash', 'cat', 'ls', 'env', 'printenv', 'echo', 'hostname', 'sleep', 'date', 'pwd', 'whoami', 'true', 'false', 'exit', 'id', 'touch', 'rm', 'mkdir'];
const BINARIOS_BUSYBOX = [...BINARIOS_DEBIAN.filter((b) => b !== 'bash'), 'wget', 'nslookup', 'ps', 'top', 'ping', 'touch', 'rm', 'mkdir'];

const dataNginx = (ms) => new Date(ms).toISOString().replace(/^(\d+)-(\d+)-(\d+)T([\d:]+)\..*$/, '$1/$2/$3 $4');
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dataAcesso = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
};

const emergencia = (msg) => ({ agora }) => [
  '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
  '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/',
  '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh',
  '10-listen-on-ipv6-by-default.sh: info: can not modify /etc/nginx/conf.d/default.conf (read-only file system?)',
  '/docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh',
  '/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh',
  '/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh',
  '/docker-entrypoint.sh: Configuration complete; ready for start up',
  `${dataNginx(agora)} [emerg] 1#1: ${msg}`,
  `nginx: [emerg] ${msg}`,
];

const nginx = (versao, variante = '') => {
  const alpino = variante.startsWith('alpine');
  // Antes do 1.19, a imagem não tinha o /docker-entrypoint.sh nem o curl, e o nginx.conf só logava de "warn" para cima:
  // a partida sai muda (como o nginx:1.14.2 dos exemplos da documentação, no kind).
  const antigo = Number(versao.split('.')[1]) < 19;
  return {
    versao,
    env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', NGINX_VERSION: versao, NJS_VERSION: '0.8.10', NJS_RELEASE: '1~bookworm', PKG_RELEASE: '1~bookworm', DYNPKG_RELEASE: '1~bookworm' },
    ...(antigo ? {} : { entrypoint: ['/docker-entrypoint.sh'] }),
    comando: [...(antigo ? [] : ['/docker-entrypoint.sh']), 'nginx', '-g', 'daemon off;'],
    // A variante alpine tem o sh do busybox (sem bash); a alpine-slim nem curl.
    binarios: [...(alpino ? BINARIOS_BUSYBOX : BINARIOS_DEBIAN), ...(variante === 'alpine-slim' || (antigo && !alpino) ? [] : ['curl']), 'nginx', ...(antigo ? [] : ['/docker-entrypoint.sh'])],
    // O tamanho que o kind mostrou para o nginx:alpine e o nginx:1.14.2 (aproximado para as outras tags da família).
    ...(alpino ? { busybox: true, tamanho: 26354394 } : antigo ? { tamanho: 44710204 } : {}),
    servidor: {
      portas: [80],
      // Serve os arquivos da pasta html do contêiner (a da imagem, ou um volume montado por cima).
      http: (caminho, { ler }) => {
        const arquivo = `/usr/share/nginx/html${caminho.endsWith('/') ? `${caminho}index.html` : caminho}`;
        const corpo = ler(arquivo);
        return corpo !== undefined
          ? { status: 200, corpo, tipo: /\.html?$/.test(arquivo) ? 'text/html' : /\.(txt|conf)$/.test(arquivo) ? 'text/plain' : 'application/octet-stream' }
          : { status: 404, corpo: NGINX_404(versao), tipo: 'text/html' };
      },
      acesso: ({ agora, ip, metodo, caminho, status, tamanho, agente }) => `${ip} - - [${dataAcesso(agora)}] "${metodo} ${caminho} HTTP/1.1" ${status} ${tamanho} "-" "${agente}" "-"`,
      cabecalhoServidor: `nginx/${versao}`,
    },
    logs: antigo ? () => [] : ({ agora, cpus, kernel }) => [
      '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
      '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/',
      '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh',
      '10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf',
      '10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf',
      '/docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh',
      '/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh',
      '/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh',
      '/docker-entrypoint.sh: Configuration complete; ready for start up',
      ...[
        'using the "epoll" event method',
        `nginx/${versao}`,
        'built by gcc 12.2.0 (Debian 12.2.0-14) ',
        `OS: Linux ${kernel}`,
        'getrlimit(RLIMIT_NOFILE): 1073741816:1073741816',
        'start worker processes',
        ...Array.from({ length: cpus }, (_, i) => `start worker process ${33 + i}`),
      ].map((l) => `${dataNginx(agora)} [notice] 1#1: ${l}`),
    ],
    arquivos: { '/usr/share/nginx/html/index.html': NGINX_HTML },
    // Com o disco só leitura (readOnlyRootFilesystem), o nginx precisa de volumes onde gravar o cache e o pid.
    gravaEm: [
      { caminho: '/var/cache/nginx', log: emergencia('mkdir() "/var/cache/nginx/client_temp" failed (30: Read-only file system)') },
      { caminho: '/var/run', log: emergencia('open() "/var/run/nginx.pid" failed (30: Read-only file system)') },
    ],
    memoria: '11Mi', cpu: 1, custoReq: 1,
    paraEm: 1500, // o nginx fecha as conexões e sai: o pod aparece como Terminating por um instante
  };
};

const busybox = {
  env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' },
  comando: ['sh'],
  binarios: BINARIOS_BUSYBOX,
  busybox: true,
  memoria: '1Mi', cpu: 0,
  paraEm: 30_000, // o sh não trata o SIGTERM: espera o prazo de 30s inteiro
};

// As imagens de sistema operacional: sem comando, o shell não tem o que ler e sai na hora (Completed; num Deployment,
// CrashLoopBackOff), como no cluster de verdade.
const alpine = { ...busybox, comando: ['/bin/sh'], binarios: [...BINARIOS_BUSYBOX, 'apk'], tamanho: 3_800_000 };
const ubuntu = { ...busybox, busybox: false, comando: ['/bin/bash'], binarios: [...BINARIOS_DEBIAN, 'apt'], tamanho: 29_700_000 };

const httpd = (versao, variante) => ({
  env: { PATH: '/usr/local/apache2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HTTPD_VERSION: versao },
  comando: ['httpd-foreground'],
  binarios: [...(variante ? BINARIOS_BUSYBOX : BINARIOS_DEBIAN), 'httpd-foreground'],
  ...(variante ? { busybox: true, tamanho: 21_000_000 } : {}),
  servidor: { portas: [80], http: () => ({ status: 200, corpo: '<html><body><h1>It works!</h1></body></html>\n', tipo: 'text/html' }) },
  logs: () => ['AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name, using 10.244.1.2. Set the \'ServerName\' directive globally to suppress this message'],
  paraEm: 0,
});

const redis = (versao, variante) => ({
  env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', REDIS_VERSION: versao },
  entrypoint: ['docker-entrypoint.sh'],
  comando: ['docker-entrypoint.sh', 'redis-server'],
  binarios: [...(variante ? BINARIOS_BUSYBOX : BINARIOS_DEBIAN), 'redis-server', 'redis-cli', 'docker-entrypoint.sh'],
  ...(variante ? { busybox: true, tamanho: 17_000_000 } : {}),
  servidor: { portas: [6379] },
  arquivos: { '/data/.keep': '' },
  memoria: '3Mi', cpu: 2, // a pasta de trabalho do redis (WORKDIR /data)
  logs: () => ['1:C 16 Oct 2026 12:00:00.000 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo', '1:M 16 Oct 2026 12:00:00.001 * Server initialized', '1:M 16 Oct 2026 12:00:00.001 * Ready to accept connections tcp'],
  paraEm: 0,
});

const postgres = (versao, variante) => {
  const maior = versao.split('.')[0];
  return {
    env: { PATH: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin${variante ? '' : `:/usr/lib/postgresql/${maior}/bin`}`, PG_MAJOR: maior, PG_VERSION: versao, PGDATA: '/var/lib/postgresql/data' },
    entrypoint: ['docker-entrypoint.sh'],
    comando: ['docker-entrypoint.sh', 'postgres'],
    binarios: [...(variante ? BINARIOS_BUSYBOX : BINARIOS_DEBIAN), 'postgres', 'psql', 'docker-entrypoint.sh'],
    ...(variante ? { busybox: true, tamanho: 105_000_000 } : {}),
    exigeEnv: ['POSTGRES_PASSWORD'],
    semEnv: {
      codigo: 1,
      log: [
        'Error: Database is uninitialized and superuser password is not specified.',
        '       You must specify POSTGRES_PASSWORD to a non-empty value for the',
        '       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".',
        '',
        '       You may also use "POSTGRES_HOST_AUTH_METHOD=trust" to allow all',
        '       connections without a password. This is *not* recommended.',
        '',
        '       See PostgreSQL documentation about "trust":',
        '       https://www.postgresql.org/docs/current/auth-trust.html',
      ],
    },
    servidor: { portas: [5432] },
    arquivos: { '/var/lib/postgresql/data/.keep': '' },
    memoria: '22Mi', cpu: 3,
    logs: () => ['PostgreSQL init process complete; ready for start up.', '', 'LOG:  database system is ready to accept connections'],
    paraEm: 0,
  };
};

// ---------- As tags de verdade ----------
// Uma tag só existe se existe no Docker Hub (as listas de /v2/library/<repo>/tags/list, conferidas em outubro de 2026).
// Em vez de milhares de tags, cada repositório diz as séries de versões, os patches que faltam no meio, as variantes e
// os apelidos (latest, stable, a versão maior). Fora disso, ErrImagePull, como um erro de digitação no cluster real.
// ponytail: só as variantes comuns (alpine, alpine-slim, perl, glibc...); -bookworm, -alpine3.22, -otel e cia. falham
// como tag inexistente. Acrescente aqui quando um exercício pedir.

/**
 * { 'X.Y': último patch, [primeiro, último] ou null (só a tag X.Y) }, menos os furos ('1.7.2 1.9.13')
 * → Map tag → versão completa ('1.27' → '1.27.5', '1.27.3' → '1.27.3').
 */
function versoes(series, furos = '') {
  const fora = new Set(furos.split(' '));
  const mapa = new Map();
  for (const [serie, faixa] of Object.entries(series)) {
    if (faixa === null) {
      mapa.set(serie, serie);
      continue;
    }
    const [de, ate] = Array.isArray(faixa) ? faixa : [0, faixa];
    mapa.set(serie, `${serie}.${ate}`);
    for (let p = de; p <= ate; p++) if (!fora.has(`${serie}.${p}`)) mapa.set(`${serie}.${p}`, `${serie}.${p}`);
  }
  return mapa;
}

/**
 * Cada versão com as variantes que ela tem (variantes(versão) → ['', 'alpine', ...]) e os apelidos ({ latest: [versão,
 * variantes] }; o apelido '' dá as tags só de variante, como 'alpine'). → Map tag → [versão, variante].
 */
function tagsReais(mapa, variantes, apelidos) {
  const tags = new Map();
  const por = (nome, versao, lista) => {
    for (const v of lista) if (nome || v) tags.set(nome && v ? `${nome}-${v}` : nome || v, [versao, v]);
  };
  for (const [tag, versao] of mapa) por(tag, versao, variantes(versao));
  for (const [nome, [versao, lista]] of Object.entries(apelidos)) por(nome, versao, lista);
  return tags;
}

const menor = (versao) => Number(versao.split('.')[1]);
const NGINX_MAINLINE = '1.31.8';
const NGINX_VARIANTES = ['', 'alpine', 'alpine-slim', 'alpine-perl', 'perl'];
const BUSYBOX_VARIANTES = ['', 'glibc', 'musl', 'uclibc'];
const COM_ALPINE = ['', 'alpine'];

/** O "app da loja" usado nos exercícios: responde JSON com a versão e o nome do pod (bom para ver o rodízio). */
const loja = (versao, extra = {}) => ({
  versao,
  env: { PATH: '/usr/local/bin:/usr/bin:/bin', APP_VERSION: versao },
  entrypoint: ['/loja'],
  comando: ['/loja'],
  binarios: ['/loja'], // distroless: sem shell
  servidor: {
    portas: [8080],
    // A cor da vitrine vem da variável COR (de um ConfigMap, nas missões do nível 4).
    http: (caminho, { hostname, env }) => (caminho === '/' || caminho === '/api'
      ? { status: 200, corpo: `${JSON.stringify({ app: 'loja', versao, pod: hostname, ...(env?.COR ? { cor: env.COR } : {}) })}\n`, tipo: 'application/json' }
      : caminho === '/healthz'
        ? { status: 200, corpo: 'ok\n', tipo: 'text/plain' }
        : { status: 404, corpo: '404 page not found\n', tipo: 'text/plain' }),
    acesso: ({ caminho, status }) => `{"level":"info","msg":"request","path":"${caminho}","status":${status}}`,
  },
  logs: () => [`{"level":"info","msg":"loja ${versao} ouvindo na porta 8080"}`],
  prontoApos: 2000,
  memoria: '9Mi', cpu: 1, custoReq: 3, // cada requisição/s custa 3 milicores (100 req/s ≈ 300m)
  paraEm: 0,
  ...extra,
});

/**
 * repositório → { tamanho (bytes), puxaEm (ms), digest, tags: { tag: comportamento } }, ou, nas imagens oficiais,
 * reais (Map tag → [versão, variante], de tagsReais) e criar(versão, variante) → comportamento (o digest sai da versão).
 * O comportamento pode ter: env, entrypoint (ENTRYPOINT), comando (ENTRYPOINT+CMD), binarios (o que existe para o exec),
 * servidor { portas, http, acesso }, logs(ctx), exigeEnv, semEnv { codigo, log }, quebraApos/codigo/log,
 * arquivos, paraEm (ms para terminar depois do SIGTERM), tamanho (bytes, quando difere do repositório).
 */
export const IMAGENS = {
  'docker.io/library/nginx': {
    tamanho: 72406859, puxaEm: 3200,
    reais: tagsReais(
      versoes({
        1.7: [1, 12], 1.8: [1, 1], 1.9: 15, '1.10': 3, 1.11: 13, 1.12: 2, 1.13: 12, 1.14: 2, 1.15: 12, 1.16: 1, 1.17: 10, 1.18: 0, 1.19: 10,
        '1.20': 2, 1.21: 6, 1.22: 1, 1.23: 4, 1.24: 0, 1.25: 5, 1.26: 3, 1.27: 5, 1.28: 3, 1.29: 8, '1.30': 6, 1.31: 8,
      }, '1.7.2 1.7.3 1.7.4 1.9.13 1.11.2 1.11.11 1.13.4 1.21.2'),
      // alpine desde o 1.10, perl desde o 1.12, alpine-slim desde o 1.24 (antes disso, só em algumas versões).
      (v) => NGINX_VARIANTES.filter((x) => !x || (x === 'alpine' && menor(v) >= 10) || (x === 'alpine-slim' ? menor(v) >= 24 : menor(v) >= 12)),
      { latest: [NGINX_MAINLINE, ['']], 1: [NGINX_MAINLINE, NGINX_VARIANTES], mainline: [NGINX_MAINLINE, NGINX_VARIANTES], stable: ['1.30.6', NGINX_VARIANTES], '': [NGINX_MAINLINE, NGINX_VARIANTES] },
    ),
    criar: nginx,
  },
  'docker.io/library/busybox': {
    tamanho: 2217006, puxaEm: 1400,
    reais: tagsReais(
      versoes({ 1.24: [1, 2], 1.25: 1, 1.26: 2, 1.27: 2, 1.28: 4, 1.29: [1, 3], '1.30': 1, 1.31: 1, 1.32: 1, 1.33: 1, 1.34: 1, 1.35: 0, 1.36: 1, 1.37: 0, 1.38: 0 }),
      () => BUSYBOX_VARIANTES,
      { latest: ['1.37.0', ['']], 1: ['1.37.0', BUSYBOX_VARIANTES], stable: ['1.36.1', BUSYBOX_VARIANTES], unstable: ['1.38.0', BUSYBOX_VARIANTES], '': ['1.37.0', BUSYBOX_VARIANTES] },
    ),
    criar: () => busybox,
  },
  'docker.io/library/alpine': {
    tamanho: 3_800_000, puxaEm: 1000,
    reais: tagsReais(
      versoes({ ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`3.${i + 1}`, null])), 3.19: 9, '3.20': 10, 3.21: 9, 3.22: 7, 3.23: 7, 3.24: 3 }, '3.23.1'),
      () => [''],
      { latest: ['3.24.3', ['']], 3: ['3.24.3', ['']], edge: ['edge', ['']] },
    ),
    criar: () => alpine,
  },
  'docker.io/library/ubuntu': {
    tamanho: 29_700_000, puxaEm: 1800,
    reais: tagsReais(
      new Map(Array.from({ length: 13 }, (_, i) => [`${14 + i}.04`, `${14 + i}.10`]).flat().map((v) => [v, v])),
      () => [''],
      Object.fromEntries(Object.entries({ latest: '24.04', rolling: '26.10', devel: '27.04', trusty: '14.04', xenial: '16.04', bionic: '18.04', focal: '20.04', jammy: '22.04', noble: '24.04' }).map(([k, v]) => [k, [v, ['']]])),
    ),
    criar: () => ubuntu,
  },
  'docker.io/library/httpd': {
    tamanho: 58471230, puxaEm: 2800,
    reais: tagsReais(versoes({ 2.4: [46, 69] }), () => COM_ALPINE, { latest: ['2.4.69', ['']], 2: ['2.4.69', COM_ALPINE], '': ['2.4.69', COM_ALPINE] }),
    criar: httpd,
  },
  'docker.io/library/redis': {
    tamanho: 52123874, puxaEm: 2500,
    reais: tagsReais(
      versoes({ '6.0': 20, 6.2: 24, '7.0': 15, 7.2: 16, 7.4: 11, '8.0': 6, 8.2: 10, 8.4: 7, 8.6: 7, 8.8: 3, '8.10': 2 }, '6.2.9 6.2.15'),
      () => COM_ALPINE,
      { latest: ['8.10.2', ['']], 6: ['6.2.24', COM_ALPINE], 7: ['7.4.11', COM_ALPINE], 8: ['8.10.2', COM_ALPINE], '': ['8.10.2', COM_ALPINE] },
    ),
    criar: redis,
  },
  'docker.io/library/postgres': {
    tamanho: 158921463, puxaEm: 6000,
    reais: tagsReais(versoes({ 13: 23, 14: 24, 15: 19, 16: 15, 17: 11, 18: 6 }, '18.5'), () => COM_ALPINE, { latest: ['18.6', ['']], '': ['18.6', COM_ALPINE] }),
    criar: postgres,
  },
  // O contêiner "pause" (o que segura a rede do pod): os exemplos de agendamento da documentação usam para ocupar lugar.
  'registry.k8s.io/pause': {
    tamanho: 320368, puxaEm: 800, digest: '7c38f24774e3cbd906d2d33c38354ccf787635581c122965132c9bd309754d4a',
    tags: Object.fromEntries(['3.1', '3.2', '3.3', '3.4.1', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10', '3.10.1', '3.10.2', 'latest'].map((t) => [t, {
      env: {}, entrypoint: ['/pause'], comando: ['/pause'], binarios: ['/pause'], servidor: { portas: [] }, logs: () => [], memoria: '0', cpu: 0, paraEm: 0,
    }])),
  },
  'docker.io/kubelearn/loja': {
    tamanho: 8412331, puxaEm: 1200, digest: 'c0ffee0d5e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80910a1b',
    tags: {
      '1.0': loja('1.0'),
      '1.1': loja('1.1'),
      '2.0': loja('2.0'),
      // Aquece por 20s antes de abrir a porta: sem readinessProbe, o Service manda clientes para quem ainda não atende.
      '2.1-aquece': loja('2.1-aquece', { ouveApos: 20_000, aquecendo: ['{"level":"info","msg":"aquecendo o cache de preços..."}'] }),
      // Depois de 40s no ar, trava: a porta continua aberta, mas nada responde (só uma livenessProbe percebe).
      '2.2-trava': loja('2.2-trava', { travaApos: 40_000, travou: ['{"level":"error","msg":"deadlock no carrinho: todas as threads esperando"}'] }),
      // Demora 45s para subir (migra o banco na partida): precisa de uma startupProbe, ou a liveness mata antes.
      '3.0-lenta': loja('3.0-lenta', { ouveApos: 45_000, aquecendo: ['{"level":"info","msg":"migrando o banco de dados (isso demora)..."}'] }),
      '2.0-bugada': loja('2.0-bugada', {
        quebraApos: 0,
        codigo: 2,
        log: ['panic: runtime error: invalid memory address or nil pointer dereference', '[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x4a2f1c]'],
      }),
    },
  },
  // A imagem do tutorial oficial de HPA: um PHP que gasta CPU a cada requisição e responde "OK!".
  'registry.k8s.io/hpa-example': {
    tamanho: 186328614, puxaEm: 4000, digest: 'a07ee6b56d39f1a5d0bd8fa8f8eb72ef4d5a0e1a7f8f9b9e7fd11f8e2e3d4c5b',
    tags: {
      latest: {
        env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }, entrypoint: ['docker-php-entrypoint'], comando: ['docker-php-entrypoint', 'apache2-foreground'],
        binarios: [...BINARIOS_DEBIAN, 'docker-php-entrypoint', 'apache2-foreground', 'php'],
        servidor: { portas: [80], http: () => ({ status: 200, corpo: 'OK!', tipo: 'text/html; charset=UTF-8' }) },
        logs: () => ['AH00558: apache2: Could not reliably determine the server\'s fully qualified domain name, using 10.244.1.2. Set the \'ServerName\' directive globally to suppress this message'],
        memoria: '12Mi', cpu: 1, custoReq: 3, paraEm: 0,
      },
    },
  },
  // O relatório pesado: carrega a planilha inteira na memória (300Mi).
  'docker.io/kubelearn/relatorio': {
    tamanho: 9120331, puxaEm: 1200, digest: 'feed0001feed0001feed0001feed0001feed0001feed0001feed0001feed0001',
    tags: {
      '1.0': {
        env: { PATH: '/usr/local/bin:/usr/bin:/bin' }, entrypoint: ['/relatorio'], comando: ['/relatorio'], binarios: ['/relatorio'],
        servidor: { portas: [] },
        logs: () => ['{"level":"info","msg":"carregando a planilha de medições (300Mi)..."}', '{"level":"info","msg":"relatório pronto; aguardando o próximo pedido"}'],
        memoria: '300Mi', cpu: 50, paraEm: 0,
      },
    },
  },
  // O painel da obra: só abre depois que a preparação deixou o arquivo /config/pronto (é a missão do init container).
  'docker.io/kubelearn/painel': {
    tamanho: 8412331, puxaEm: 1200, digest: 'ba1ae1000ba1ae1000ba1ae1000ba1ae1000ba1ae1000ba1ae1000ba1ae10001',
    tags: {
      '1.0': loja('1.0', {
        exigeArquivo: '/config/pronto',
        semArquivo: { codigo: 1, log: ['{"level":"fatal","msg":"/config/pronto não existe: a preparação ainda não rodou"}'] },
        logs: () => ['{"level":"info","msg":"painel da obra ouvindo na porta 8080"}'],
        servidor: { portas: [8080], http: (caminho, { hostname }) => ({ status: 200, corpo: `${JSON.stringify({ app: 'painel', obra: 'em dia', pod: hostname })}\n`, tipo: 'application/json' }) },
      }),
    },
  },
  // O caixa da loja: uma imagem particular (só baixa com o crachá do registro, num imagePullSecret).
  'docker.io/kubelearn/caixa': {
    tamanho: 8412331, puxaEm: 1200, digest: 'ca1a0000ca1a0000ca1a0000ca1a0000ca1a0000ca1a0000ca1a0000ca1a0000',
    credenciais: { usuario: 'condominio', senha: 'tijolo-azul-42' },
    tags: {
      '1.0': loja('1.0', {
        logs: () => ['{"level":"info","msg":"caixa ouvindo na porta 8080"}'],
        servidor: { portas: [8080], http: (caminho, { hostname }) => ({ status: 200, corpo: `${JSON.stringify({ app: 'caixa', aberto: true, pod: hostname })}\n`, tipo: 'application/json' }) },
      }),
    },
  },
  // O operador de backup: vigia os Backups (o CRD backups.kube-learn.dev) e cria um CronJob para cada um (crds.js).
  'docker.io/kubelearn/operador-backup': {
    tamanho: 14120331, puxaEm: 1200, digest: '0be4a7000be4a7000be4a7000be4a7000be4a7000be4a7000be4a7000be4a700',
    tags: {
      '1.0': {
        env: { PATH: '/usr/local/bin:/usr/bin:/bin' }, entrypoint: ['/operador'], comando: ['/operador'], binarios: ['/operador'],
        servidor: { portas: [] },
        logs: () => ['{"level":"info","msg":"operador de backup no ar: vigiando os Backups (kube-learn.dev/v1)"}'],
        memoria: '12Mi', cpu: 1, paraEm: 0,
      },
    },
  },
  // Imagens didáticas (busybox por baixo): um diário com uma senha no log e um cofre com um arquivo dentro.
  'docker.io/kubelearn/diario': {
    tamanho: 2217006, puxaEm: 1000, digest: 'd1a71000d1a71000d1a71000d1a71000d1a71000d1a71000d1a71000d1a71000',
    tags: {
      '1.0': {
        ...busybox,
        comando: ['sh', '-c', 'echo "[diário de obra] 07:00 chegou o caminhão de areia"; echo "[diário de obra] 07:30 a equipe de pintura começou no 3º andar"; echo "[diário de obra] 08:00 a senha do Wi-Fi da obra é: tijolo-azul-42"; echo "[diário de obra] 08:15 o elevador de carga parou de novo"; sleep infinity'],
      },
    },
  },
  'docker.io/kubelearn/cofre': {
    tamanho: 2217006, puxaEm: 1000, digest: 'c0f4e000c0f4e000c0f4e000c0f4e000c0f4e000c0f4e000c0f4e000c0f4e000',
    tags: {
      '1.0': {
        ...busybox,
        comando: ['sleep', 'infinity'],
        arquivos: { '/cofre/LEIA-ME.txt': 'A combinação do cofre está no outro arquivo desta pasta.\n', '/cofre/combinacao.txt': '7-3-9\n' },
      },
    },
  },
  // Componentes do control plane e do DNS (para o `get pods -A` parecer um cluster de verdade).
  ...Object.fromEntries(['etcd:3.6.4-0', 'kube-apiserver:v1.37.0', 'kube-controller-manager:v1.37.0', 'kube-scheduler:v1.37.0', 'coredns/coredns:v1.12.4', 'kube-proxy:v1.37.0', 'docker.io/kindest/kindnetd:v20260820-69b56db7', 'docker.io/kindest/local-path-provisioner:v20260820-69b56db7', 'metrics-server/metrics-server:v0.9.0']
    .map((ref) => {
      const [repo, tag] = ref.split(':');
      return [repo.startsWith('docker.io/') ? repo : `registry.k8s.io/${repo}`, {
        tamanho: 20_000_000, puxaEm: 1000, digest: 'a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5',
        tags: { [tag]: { env: {}, entrypoint: [repo.split('/').pop()], comando: [repo.split('/').pop()], binarios: [repo.split('/').pop()], servidor: { portas: repo.includes('coredns') ? [53, 9153] : [] }, logs: () => [], paraEm: 0 } },
      }];
    })),
};

/** 'nginx:1.27' → { registry, repo, tag, completo: 'docker.io/library/nginx:1.27' }. */
export function referencia(imagem) {
  let resto = imagem.split('@')[0];
  let tag = 'latest';
  const i = resto.lastIndexOf(':');
  if (i > resto.lastIndexOf('/')) {
    tag = resto.slice(i + 1);
    resto = resto.slice(0, i);
  }
  const partes = resto.split('/');
  const temRegistry = partes.length > 1 && (partes[0].includes('.') || partes[0].includes(':') || partes[0] === 'localhost');
  const registry = temRegistry ? partes.shift() : 'docker.io';
  if (registry === 'docker.io' && partes.length === 1) partes.unshift('library');
  const repo = `${registry}/${partes.join('/')}`;
  return { repo, tag, completo: `${repo}:${tag}` };
}

// O servidor de uma credencial ("https://index.docker.io/v1/", o padrão do kubectl) → o registry ("docker.io").
const DOCKER_HUB = new Set(['index.docker.io', 'registry-1.docker.io', 'docker.io']);
const registryDe = (servidor) => {
  const host = servidor.replace(/^\w+:\/\//, '').split('/')[0];
  return DOCKER_HUB.has(host) ? 'docker.io' : host;
};

/**
 * Procura a imagem. Devolve { ok, comportamento, info } ou { ok: false, erro } com a mensagem do containerd.
 * `chaves` (as credenciais dos imagePullSecrets, [{ servidor, usuario, senha }]) só conta no pull de uma imagem
 * particular: sem a do registry dela, o registro responde como se a imagem não existisse (é o que o Docker Hub faz).
 */
export function buscarImagem(imagem, chaves) {
  const ref = referencia(imagem);
  const info = IMAGENS[ref.repo];
  const base = `failed to pull and unpack image "${ref.completo}": failed to resolve reference "${ref.completo}"`;
  const negado = { ok: false, erro: `${base}: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed` };
  if (!info) return negado;
  if (info.credenciais && chaves) {
    // ponytail: só o Docker Hub tem imagem particular no catálogo; outro registry teria outra URL de token.
    const chave = chaves.find((k) => registryDe(k.servidor) === ref.repo.split('/')[0]);
    if (!chave) return negado;
    if (chave.usuario !== info.credenciais.usuario || chave.senha !== info.credenciais.senha) {
      const escopo = encodeURIComponent(`repository:${ref.repo.split('/').slice(1).join('/')}:pull`);
      return { ok: false, erro: `${base}: failed to authorize: failed to fetch oauth token: unexpected status from GET request to https://auth.docker.io/token?scope=${escopo}&service=registry.docker.io: 401 Unauthorized` };
    }
  }
  const achada = info.reais ? daFamilia(ref.repo, info, info.reais.get(ref.tag)) : info.tags[ref.tag] && { comportamento: info.tags[ref.tag], info };
  if (!achada) return { ok: false, erro: `rpc error: code = NotFound desc = ${base}: ${ref.completo}: not found` };
  return { ok: true, ...achada, ref };
}

// Uma versão de uma imagem oficial, criada na primeira vez: os apelidos (nginx:1.27 e nginx:1.27.5) dão a mesma
// imagem, com o mesmo digest; o tamanho é o da variante.
const feitas = new Map();
function daFamilia(repo, info, real) {
  if (!real) return null;
  const [versao, variante] = real;
  const chave = `${repo}:${versao}${variante ? `-${variante}` : ''}`;
  let r = feitas.get(chave);
  if (!r) {
    const comportamento = info.criar(versao, variante);
    feitas.set(chave, (r = { comportamento, info: { ...info, digest: hexDe(chave), tamanho: comportamento.tamanho ?? info.tamanho } }));
  }
  return r;
}
