// Catálogo de imagens falsas. Nenhum contêiner de verdade roda: cada imagem descreve como o programa dela
// se comporta (portas, respostas HTTP, logs, o que exige para subir, como cai). É isso que deixa o
// simulador realista. Imagem fora do catálogo dá ErrImagePull, como um nome errado no cluster real.

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

const BINARIOS_DEBIAN = ['sh', 'bash', 'cat', 'ls', 'env', 'printenv', 'echo', 'hostname', 'sleep', 'date', 'pwd', 'whoami', 'true', 'false', 'exit', 'id'];
const BINARIOS_BUSYBOX = [...BINARIOS_DEBIAN.filter((b) => b !== 'bash'), 'wget', 'nslookup', 'ps', 'top', 'ping'];

const dataNginx = (ms) => new Date(ms).toISOString().replace(/^(\d+)-(\d+)-(\d+)T([\d:]+)\..*$/, '$1/$2/$3 $4');
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dataAcesso = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
};

const nginx = (versao) => ({
  versao,
  env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', NGINX_VERSION: versao, NJS_VERSION: '0.8.10', NJS_RELEASE: '1~bookworm', PKG_RELEASE: '1~bookworm', DYNPKG_RELEASE: '1~bookworm' },
  entrypoint: ['/docker-entrypoint.sh'],
  comando: ['/docker-entrypoint.sh', 'nginx', '-g', 'daemon off;'],
  binarios: [...BINARIOS_DEBIAN, 'curl', 'nginx', '/docker-entrypoint.sh'],
  servidor: {
    portas: [80],
    http: (caminho) => (caminho === '/' || caminho === '/index.html'
      ? { status: 200, corpo: NGINX_HTML, tipo: 'text/html' }
      : { status: 404, corpo: NGINX_404(versao), tipo: 'text/html' }),
    acesso: ({ agora, ip, metodo, caminho, status, tamanho, agente }) => `${ip} - - [${dataAcesso(agora)}] "${metodo} ${caminho} HTTP/1.1" ${status} ${tamanho} "-" "${agente}" "-"`,
    cabecalhoServidor: `nginx/${versao}`,
  },
  logs: ({ agora, cpus, kernel }) => [
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
  paraEm: 1500, // o nginx fecha as conexões e sai: o pod aparece como Terminating por um instante
});

const busybox = {
  env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' },
  comando: ['sh'],
  binarios: BINARIOS_BUSYBOX,
  busybox: true,
  paraEm: 30_000, // o sh não trata o SIGTERM: espera o prazo de 30s inteiro
};

/** O "app da loja" usado nos exercícios: responde JSON com a versão e o nome do pod (bom para ver o rodízio). */
const loja = (versao, extra = {}) => ({
  versao,
  env: { PATH: '/usr/local/bin:/usr/bin:/bin', APP_VERSION: versao },
  entrypoint: ['/loja'],
  comando: ['/loja'],
  binarios: ['/loja'], // distroless: sem shell
  servidor: {
    portas: [8080],
    http: (caminho, { hostname }) => (caminho === '/' || caminho === '/api'
      ? { status: 200, corpo: `${JSON.stringify({ app: 'loja', versao, pod: hostname })}\n`, tipo: 'application/json' }
      : caminho === '/healthz'
        ? { status: 200, corpo: 'ok\n', tipo: 'text/plain' }
        : { status: 404, corpo: '404 page not found\n', tipo: 'text/plain' }),
    acesso: ({ caminho, status }) => `{"level":"info","msg":"request","path":"${caminho}","status":${status}}`,
  },
  logs: () => [`{"level":"info","msg":"loja ${versao} ouvindo na porta 8080"}`],
  paraEm: 0,
  ...extra,
});

/**
 * repositório → { tamanho (bytes), puxaEm (ms), digest, tags: { tag: comportamento } }.
 * O comportamento pode ter: env, entrypoint (ENTRYPOINT), comando (ENTRYPOINT+CMD), binarios (o que existe para o exec),
 * servidor { portas, http, acesso }, logs(ctx), exigeEnv, semEnv { codigo, log }, quebraApos/codigo/log,
 * arquivos, paraEm (ms para terminar depois do SIGTERM).
 */
export const IMAGENS = {
  'docker.io/library/nginx': {
    tamanho: 72406859, puxaEm: 3200, digest: '6784fb0834aa7dbbe12e3d7471e69c290df3e6ba810dc38b34ae33d3c1c05f7d',
    tags: { '1.27': nginx('1.27.5'), '1.28': nginx('1.28.0'), '1.29': nginx('1.29.1'), latest: nginx('1.29.1') },
  },
  'docker.io/library/busybox': {
    tamanho: 2217006, puxaEm: 1400, digest: '73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662',
    tags: { '1.36': busybox, '1.37': busybox, latest: busybox },
  },
  'docker.io/library/httpd': {
    tamanho: 58471230, puxaEm: 2800, digest: '4564ca7604957765bd2598e14134a1c6812067f0daddd7dc76909f8ce4b5a5b2',
    tags: Object.fromEntries(['2.4', 'latest'].map((t) => [t, {
      env: { PATH: '/usr/local/apache2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HTTPD_VERSION: '2.4.65' },
      comando: ['httpd-foreground'],
      binarios: [...BINARIOS_DEBIAN, 'httpd-foreground'],
      servidor: { portas: [80], http: () => ({ status: 200, corpo: '<html><body><h1>It works!</h1></body></html>\n', tipo: 'text/html' }) },
      logs: () => ['AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name, using 10.244.1.2. Set the \'ServerName\' directive globally to suppress this message'],
      paraEm: 0,
    }])),
  },
  'docker.io/library/redis': {
    tamanho: 52123874, puxaEm: 2500, digest: '1b835e5a8d5db58e8b718850bf43a68ef5a576fc68301fd08a789b20b4eecb61',
    tags: Object.fromEntries(['7', '7.4', '8', 'latest'].map((t) => [t, {
      env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', REDIS_VERSION: t === '7' || t === '7.4' ? '7.4.5' : '8.2.1' },
      entrypoint: ['docker-entrypoint.sh'],
      comando: ['docker-entrypoint.sh', 'redis-server'],
      binarios: [...BINARIOS_DEBIAN, 'redis-server', 'redis-cli', 'docker-entrypoint.sh'],
      servidor: { portas: [6379] },
      logs: () => ['1:C 16 Oct 2026 12:00:00.000 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo', '1:M 16 Oct 2026 12:00:00.001 * Server initialized', '1:M 16 Oct 2026 12:00:00.001 * Ready to accept connections tcp'],
      paraEm: 0,
    }])),
  },
  'docker.io/library/postgres': {
    tamanho: 158921463, puxaEm: 6000, digest: '29e0bb09c8e7e7fc265ea9f4367de9622e55bae6b0b97e7cce740c2d63c2ebc0',
    tags: Object.fromEntries(['16', '17', 'latest'].map((t) => [t, {
      env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin', PG_MAJOR: t === '16' ? '16' : '17', PGDATA: '/var/lib/postgresql/data' },
      entrypoint: ['docker-entrypoint.sh'],
      comando: ['docker-entrypoint.sh', 'postgres'],
      binarios: [...BINARIOS_DEBIAN, 'postgres', 'psql', 'docker-entrypoint.sh'],
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
      logs: () => ['PostgreSQL init process complete; ready for start up.', '', 'LOG:  database system is ready to accept connections'],
      paraEm: 0,
    }])),
  },
  'docker.io/kubelearn/loja': {
    tamanho: 8412331, puxaEm: 1200, digest: 'c0ffee0d5e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80910a1b',
    tags: {
      '1.0': loja('1.0'),
      '1.1': loja('1.1'),
      '2.0': loja('2.0'),
      '2.0-bugada': loja('2.0-bugada', {
        quebraApos: 0,
        codigo: 2,
        log: ['panic: runtime error: invalid memory address or nil pointer dereference', '[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x4a2f1c]'],
      }),
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
  ...Object.fromEntries(['etcd:3.6.4-0', 'kube-apiserver:v1.37.0', 'kube-controller-manager:v1.37.0', 'kube-scheduler:v1.37.0', 'coredns/coredns:v1.12.4']
    .map((ref) => {
      const [repo, tag] = ref.split(':');
      return [`registry.k8s.io/${repo}`, {
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

/**
 * Procura a imagem. Devolve { ok, comportamento, info } ou { ok: false, erro } com a mensagem do containerd.
 */
export function buscarImagem(imagem) {
  const ref = referencia(imagem);
  const info = IMAGENS[ref.repo];
  const base = `failed to pull and unpack image "${ref.completo}": failed to resolve reference "${ref.completo}"`;
  if (!info) {
    return { ok: false, erro: `${base}: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed` };
  }
  const comportamento = info.tags[ref.tag];
  if (!comportamento) return { ok: false, erro: `rpc error: code = NotFound desc = ${base}: ${ref.completo}: not found` };
  return { ok: true, comportamento, info, ref };
}
