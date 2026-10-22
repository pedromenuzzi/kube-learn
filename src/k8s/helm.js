// O helm do terminal (Helm 4): o projeto padrão da construtora. Os charts vêm prontos (charts.js); cada release
// guarda as revisões no cluster (um Secret sh.helm.release.v1.NOME.vN por revisão, como o Helm de verdade) e os
// objetos são aplicados com as annotations meta.helm.sh/release-*.
import { parseAllDocuments, parse } from 'yaml';
import { palavras } from './kubectl/argv.js';
import { CHARTS } from './charts.js';
import { paraYaml } from './kubectl/formatos.js';
import { tabelaDe } from './kubectl/tabelas.js';
import { tabela } from './tabwriter.js';
import { recursoDoKind } from './recursos.js';
import { btoaUtf8 } from './esquema.js';

export const REPO_PADRAO = 'https://pedromenuzzi.github.io/kube-learn/charts';

// A ordem em que o Helm instala (e mostra) os objetos.
const ORDEM = ['Namespace', 'NetworkPolicy', 'ResourceQuota', 'LimitRange', 'PodDisruptionBudget', 'ServiceAccount', 'Secret', 'ConfigMap', 'StorageClass', 'PersistentVolume',
  'PersistentVolumeClaim', 'CustomResourceDefinition', 'ClusterRole', 'ClusterRoleBinding', 'Role', 'RoleBinding', 'Service', 'DaemonSet', 'Pod', 'ReplicaSet', 'Deployment',
  'HorizontalPodAutoscaler', 'StatefulSet', 'Job', 'CronJob', 'IngressClass', 'Ingress'];
const posicao = (kind) => (ORDEM.includes(kind) ? ORDEM.indexOf(kind) : ORDEM.length);

const estado = (c) => (c.helm ??= { repos: new Map(), releases: new Map() });
const chave = (ns, nome) => `${ns}/${nome}`;

// ---------- horas, como o Go ----------
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = (n) => String(n).padStart(2, '0');
/** time.ANSIC: "Wed Oct 21 08:12:57 2026". */
const ansic = (ms) => {
  const d = new Date(ms);
  return `${DIAS[d.getUTCDay()]} ${MESES[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} ${d.getUTCFullYear()}`;
};
/** time.Time.String(): "2026-10-21 08:12:57.11143624 +0000 UTC" (fração sem zeros no fim). */
const horaGo = (ms) => {
  const d = new Date(ms);
  const frac = d.getUTCMilliseconds() ? `.${String(d.getUTCMilliseconds()).padStart(3, '0').replace(/0+$/, '')}` : '';
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}${frac} +0000 UTC`;
};

/** A tabela do uitable do Helm: cada coluna no tamanho da maior célula, separadas por tab. */
const tabelaHelm = (linhas) => {
  const largura = linhas[0].map((_, i) => Math.max(...linhas.map((l) => String(l[i]).length)));
  return linhas.map((l) => l.map((x, i) => String(x).padEnd(largura[i])).join('\t')).join('\n') + '\n';
};

// ---------- valores ----------
const ehMapa = (v) => v && typeof v === 'object' && !Array.isArray(v);
function mesclar(base, por) {
  const r = structuredClone(base ?? {});
  for (const [k, v] of Object.entries(por ?? {})) r[k] = ehMapa(v) && ehMapa(r[k]) ? mesclar(r[k], v) : structuredClone(v);
  return r;
}

/** --set a.b=c,d=e (os tipos do strvals: inteiro, true/false, null; o resto é texto). */
function lerSet(texto, comoTexto = false) {
  const saida = {};
  for (const par of texto.split(/,(?=[\w.-]+=)/)) {
    const [caminho, ...resto] = par.split('=');
    const bruto = resto.join('=');
    const valor = comoTexto ? bruto : /^-?\d+$/.test(bruto) ? Number(bruto) : bruto === 'true' ? true : bruto === 'false' ? false : bruto === 'null' ? null : bruto;
    const partes = caminho.split('.');
    let alvo = saida;
    for (const p of partes.slice(0, -1)) alvo = (alvo[p] ??= {});
    alvo[partes.at(-1)] = valor;
  }
  return saida;
}

// ---------- argumentos ----------
const COM_VALOR = new Set(['-n', '--namespace', '--set', '--set-string', '-f', '--values', '--version', '--description', '-o', '--output', '--timeout', '--revision']);
function lerArgs(args) {
  const flags = { set: [], valores: [] };
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    let valor = null;
    if (a.startsWith('--') && a.includes('=')) [a, valor] = [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)];
    if (!a.startsWith('-')) {
      pos.push(a);
      continue;
    }
    if (COM_VALOR.has(a) && valor === null) {
      if (i + 1 >= args.length) return { flags, pos, erro: `flag needs an argument: ${a.startsWith('--') ? a : `'${a.slice(1)}' in ${a}`}` };
      valor = args[++i];
    }
    if (a === '-n' || a === '--namespace') flags.ns = valor;
    else if (a === '--set') flags.set.push(lerSet(valor));
    else if (a === '--set-string') flags.set.push(lerSet(valor, true));
    else if (a === '-f' || a === '--values') flags.valores.push(valor);
    else if (a === '-A' || a === '--all-namespaces') flags.todos = true;
    else flags[a.replace(/^-+/, '')] = valor ?? true;
  }
  return { flags, pos };
}

// ---------- renderizar ----------
function acharChart(c, ref) {
  const nome = ref.replace(/\/$/, '').split('/').pop();
  const local = /^(\.{0,2}\/|\/)/.test(ref);
  if (!local) {
    const [repo] = ref.split('/');
    if (!ref.includes('/')) return { erro: `non-absolute URLs should be in form of repo_name/path_to_chart, got: ${ref}` };
    if (!estado(c).repos.has(repo)) return { erro: `repo ${repo} not found` };
  }
  const chart = CHARTS[nome];
  if (!chart) return { erro: local ? `path "${ref}" not found` : `chart "${nome}" not found in ${ref.split('/')[0]} index. (try 'helm repo update'): no chart name found` };
  return { chart };
}

/** Os valores do usuário: os arquivos -f (do editor) e os --set, nessa ordem. → { valores } | { erro } */
function valoresDoUsuario(flags, arquivos) {
  let v = {};
  for (const f of flags.valores) {
    const texto = arquivos[f.replace(/^\.\//, '')];
    if (texto === undefined) return { erro: `open ${f}: no such file or directory` };
    v = mesclar(v, parse(texto) ?? {});
  }
  for (const s of flags.set) v = mesclar(v, s);
  return { valores: v };
}

/** Renderiza o chart: → { manifestos: [{ arquivo, texto, objeto }], notas }. */
function renderizar(chart, nome, ns, usuario) {
  const v = mesclar(parse(chart.valoresTexto), usuario);
  const r = { nome, ns };
  const manifestos = chart.modelos
    .map(([arquivo, f]) => ({ arquivo: `${chart.nome}/${arquivo}`, texto: f(r, chart, v).trim() }))
    .filter((m) => m.texto)
    .map((m) => ({ ...m, objeto: parseAllDocuments(m.texto)[0].toJS() }))
    .sort((a, b) => posicao(a.objeto.kind) - posicao(b.objeto.kind));
  return { manifestos, notas: chart.notas(r, chart, v), computados: v };
}

// ---------- aplicar no cluster ----------
function aplicar(c, ns, nome, manifestos, anteriores = []) {
  const vivos = [];
  for (const { objeto } of manifestos) {
    const r = recursoDoKind(objeto.kind);
    const o = structuredClone(objeto);
    o.metadata.annotations = { ...(o.metadata.annotations ?? {}), 'meta.helm.sh/release-name': nome, 'meta.helm.sh/release-namespace': ns };
    if (r?.namespaced) o.metadata.namespace = ns;
    const atual = c.obter(o.kind, r?.namespaced ? ns : null, o.metadata.name);
    if (atual) c.substituir(atual, { ...o, metadata: { ...atual.metadata, labels: o.metadata.labels, annotations: { ...(atual.metadata.annotations ?? {}), ...o.metadata.annotations } } });
    else c.criar(o);
    vivos.push(`${o.kind}/${o.metadata.name}`);
  }
  // O que saiu do chart nesta revisão (ex.: o Ingress desligado) é apagado.
  for (const { objeto } of anteriores) {
    if (vivos.includes(`${objeto.kind}/${objeto.metadata.name}`)) continue;
    const r = recursoDoKind(objeto.kind);
    const atual = c.obter(objeto.kind, r?.namespaced ? ns : null, objeto.metadata.name);
    if (atual) c.remover(atual);
  }
  c.reconciliar();
}

/** Guarda a revisão (e o Secret dela) e marca a anterior como superseded. */
function guardar(c, ns, nome, rev) {
  const lista = estado(c).releases.get(chave(ns, nome)) ?? [];
  for (const antiga of lista.filter((x) => x.status === 'deployed')) {
    antiga.status = 'superseded';
    const s = c.obter('Secret', ns, `sh.helm.release.v1.${nome}.v${antiga.revisao}`);
    if (s) {
      s.metadata.labels.status = 'superseded';
      c.salvar(s);
    }
  }
  lista.push(rev);
  estado(c).releases.set(chave(ns, nome), lista);
  c.criar({
    apiVersion: 'v1', kind: 'Secret', type: 'helm.sh/release.v1',
    metadata: { name: `sh.helm.release.v1.${nome}.v${rev.revisao}`, namespace: ns, labels: { name: nome, owner: 'helm', status: rev.status, version: String(rev.revisao) } },
    data: { release: btoaUtf8(JSON.stringify({ name: nome, version: rev.revisao, chart: `${rev.chart.nome}-${rev.chart.versao}` })) },
  });
}

const resumo = (rel, rev, extra = '') => `NAME: ${rel}
LAST DEPLOYED: ${ansic(rev.atualizado)}
NAMESPACE: ${rev.ns}
STATUS: ${rev.status}
REVISION: ${rev.revisao}
DESCRIPTION: ${rev.descricao}
${extra}TEST SUITE: None
${rev.notas ? `NOTES:\n${rev.notas}` : ''}`;

/** A parte RESOURCES do helm status: as tabelas do kubectl de cada tipo, e os pods dos Deployments. */
function recursos(c, rev) {
  const blocos = [];
  const pods = [];
  for (const { objeto } of rev.manifestos) {
    const r = recursoDoKind(objeto.kind);
    const o = c.obter(objeto.kind, r?.namespaced ? rev.ns : null, objeto.metadata.name);
    if (!o) continue;
    const t = tabelaDe(r);
    blocos.push(`==> ${r.versao}/${r.kind}\n${tabela([t.colunas, t.linha(o, c.agora)])}`);
    if (o.spec?.selector?.matchLabels && ['Deployment', 'StatefulSet', 'DaemonSet'].includes(o.kind)) {
      const sel = o.spec.selector.matchLabels;
      pods.push(...c.listar('Pod', rev.ns).filter((p) => Object.entries(sel).every(([k, v]) => p.metadata.labels?.[k] === v)));
    }
  }
  if (pods.length) {
    const t = tabelaDe(recursoDoKind('Pod'));
    blocos.push(`==> v1/Pod(related)\n${tabela([t.colunas, ...pods.map((p) => t.linha(p, c.agora))])}`);
  }
  return `RESOURCES:\n${blocos.map((b) => `${b}\n`).join('')}\n`;
}

// ---------- os comandos ----------
/** Roda uma linha do helm. → { saida, stdout, stderr, codigo }. */
export function helm(c, linha, { arquivos = {} } = {}) {
  const out = [];
  const err = [];
  let codigo = 0;
  const falha = (msg) => {
    err.push(`Error: ${msg}\n`);
    codigo = 1;
  };
  const args = palavras(linha).slice(1);
  const [sub, ...resto] = args;
  const { flags, pos, erro } = lerArgs(resto);
  const ns = flags.ns ?? c.contexto.namespace;
  const releases = estado(c).releases;
  const atual = (n, nsx = ns) => releases.get(chave(nsx, n))?.at(-1);

  if (erro) falha(erro);
  else switch (sub) {
    case 'version':
      out.push('version.BuildInfo{Version:"v4.3.1", GitCommit:"c0d08d0d6d9424d4a14febb5e8a3e51b0dd00dff", GitTreeState:"clean", GoVersion:"go1.27.2", KubeClientVersion:"v1.37"}\n');
      break;
    case 'repo': {
      const [acao, nome, url] = pos;
      if (acao === 'add') {
        if (!nome || !url) {
          falha('"helm repo add" requires 2 arguments');
          break;
        }
        estado(c).repos.set(nome, url);
        out.push(`"${nome}" has been added to your repositories\n`);
      } else if (acao === 'list' || acao === 'ls') {
        if (!estado(c).repos.size) falha('no repositories to show');
        else out.push(tabelaHelm([['NAME', 'URL'], ...[...estado(c).repos].map(([n, u]) => [n, u])]));
      } else if (acao === 'update') {
        out.push(`Hang tight while we grab the latest from your chart repositories...\n${[...estado(c).repos.keys()].map((n) => `...Successfully got an update from the "${n}" chart repository\n`).join('')}Update Complete. ⎈Happy Helming!⎈\n`);
      } else falha(`unknown command "${acao ?? ''}" for "helm repo"`);
      break;
    }
    case 'search': {
      const termo = pos[1] ?? '';
      const linhas = [...estado(c).repos.keys()].flatMap((repo) => Object.values(CHARTS).filter((ch) => `${repo}/${ch.nome}`.includes(termo)).map((ch) => [`${repo}/${ch.nome}`, ch.versao, ch.appVersion, ch.descricao]));
      if (!linhas.length) out.push('No results found\n');
      else out.push(tabelaHelm([['NAME', 'CHART VERSION', 'APP VERSION', 'DESCRIPTION'], ...linhas]));
      break;
    }
    case 'show': {
      const r = acharChart(c, pos[1] ?? '');
      if (r.erro) falha(r.erro);
      else if (pos[0] === 'values') out.push(`${r.chart.valoresTexto}\n`);
      else if (pos[0] === 'chart') out.push(r.chart.chartYaml);
      else falha(`unknown command "${pos[0] ?? ''}" for "helm show"`);
      break;
    }
    case 'template':
    case 'install': {
      const [nome, ref] = pos;
      if (!nome || !ref) {
        falha(`"helm ${sub}" requires at least 1 argument`);
        break;
      }
      const prefixo = sub === 'install' ? 'INSTALLATION FAILED: ' : '';
      const ch = acharChart(c, ref);
      if (ch.erro) {
        falha(`${prefixo}${ch.erro}`);
        break;
      }
      const u = valoresDoUsuario(flags, arquivos);
      if (u.erro) {
        falha(`${prefixo}${u.erro}`);
        break;
      }
      const render = renderizar(ch.chart, nome, ns, u.valores);
      if (sub === 'template') {
        out.push(`${render.manifestos.map((m) => `---\n# Source: ${m.arquivo}\n${m.texto}\n`).join('\n')}`);
        break;
      }
      if (atual(nome) && atual(nome).status !== 'uninstalled') {
        err.push('level=ERROR msg="release name check failed" error="cannot reuse a name that is still in use"\n');
        falha('INSTALLATION FAILED: release name check failed: cannot reuse a name that is still in use');
        break;
      }
      if (!c.obter('Namespace', null, ns)) {
        if (!flags['create-namespace']) {
          falha(`INSTALLATION FAILED: create: failed to create: namespaces "${ns}" not found`);
          break;
        }
        c.criar({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: ns } });
      }
      aplicar(c, ns, nome, render.manifestos);
      const rev = { revisao: 1, ns, status: 'deployed', descricao: 'Install complete', atualizado: c.agora, chart: ch.chart, usuario: u.valores, manifestos: render.manifestos, notas: render.notas, computados: render.computados };
      guardar(c, ns, nome, rev);
      out.push(resumo(nome, rev));
      break;
    }
    case 'upgrade': {
      const [nome, ref] = pos;
      const anterior = atual(nome);
      if (!anterior && !flags.install) {
        falha(`UPGRADE FAILED: "${nome}" has no deployed releases`);
        break;
      }
      if (!anterior) return helm(c, linha.replace(/\bupgrade\b/, 'install').replace(/\s--install\b|\s-i\b/, ''), { arquivos });
      const ch = acharChart(c, ref ?? '');
      if (ch.erro) {
        falha(`UPGRADE FAILED: ${ch.erro}`);
        break;
      }
      const u = valoresDoUsuario(flags, arquivos);
      if (u.erro) {
        falha(`UPGRADE FAILED: ${u.erro}`);
        break;
      }
      // Sem valores novos (nem --reset-values), o Helm reaproveita os da revisão anterior; com --reuse-values, mescla.
      const semNovos = !flags.valores.length && !flags.set.length;
      const usuario = flags['reset-values'] ? u.valores : flags['reuse-values'] ? mesclar(anterior.usuario, u.valores) : semNovos ? anterior.usuario : u.valores;
      const render = renderizar(ch.chart, nome, ns, usuario);
      aplicar(c, ns, nome, render.manifestos, anterior.manifestos);
      const rev = { revisao: anterior.revisao + 1, ns, status: 'deployed', descricao: 'Upgrade complete', atualizado: c.agora, chart: ch.chart, usuario, manifestos: render.manifestos, notas: render.notas, computados: render.computados };
      guardar(c, ns, nome, rev);
      out.push(`Release "${nome}" has been upgraded. Happy Helming!\n${resumo(nome, rev)}`);
      break;
    }
    case 'rollback': {
      const [nome, alvo] = pos;
      const lista = releases.get(chave(ns, nome));
      if (!lista) {
        falha('release: not found');
        break;
      }
      const n = alvo ? Number(alvo) : lista.at(-1).revisao - 1;
      const destino = lista.find((r) => r.revisao === n);
      if (!destino) {
        falha(`release has no ${alvo ?? n} version`);
        break;
      }
      aplicar(c, ns, nome, destino.manifestos, lista.at(-1).manifestos);
      guardar(c, ns, nome, { ...destino, revisao: lista.at(-1).revisao + 1, status: 'deployed', descricao: `Rollback to ${n}`, atualizado: c.agora });
      out.push('Rollback was a success! Happy Helming!\n');
      break;
    }
    case 'uninstall':
    case 'delete': {
      const [nome] = pos;
      const lista = releases.get(chave(ns, nome));
      if (!lista) {
        falha(`uninstall: Release not loaded: ${nome}: release: not found`);
        break;
      }
      for (const { objeto } of [...lista.at(-1).manifestos].reverse()) {
        const r = recursoDoKind(objeto.kind);
        const o = c.obter(objeto.kind, r?.namespaced ? ns : null, objeto.metadata.name);
        if (o) c.remover(o);
      }
      for (const rev of lista) {
        const s = c.obter('Secret', ns, `sh.helm.release.v1.${nome}.v${rev.revisao}`);
        if (s) c.remover(s);
      }
      releases.delete(chave(ns, nome));
      c.reconciliar();
      out.push(`release "${nome}" uninstalled\n`);
      break;
    }
    case 'list':
    case 'ls': {
      const linhas = [...releases].filter(([k]) => flags.todos || k.startsWith(`${ns}/`)).sort(([a], [b]) => a.split('/')[1].localeCompare(b.split('/')[1]))
        .map(([k, lista]) => {
          const r = lista.at(-1);
          return [k.split('/')[1], r.ns, r.revisao, horaGo(r.atualizado), r.status, `${r.chart.nome}-${r.chart.versao}`, r.chart.appVersion];
        });
      out.push(tabelaHelm([['NAME', 'NAMESPACE', 'REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION'], ...linhas]));
      break;
    }
    case 'history':
    case 'hist': {
      const lista = releases.get(chave(ns, pos[0]));
      if (!lista) {
        falha('release: not found');
        break;
      }
      out.push(tabelaHelm([['REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION', 'DESCRIPTION'], ...lista.map((r) => [r.revisao, ansic(r.atualizado), r.status, `${r.chart.nome}-${r.chart.versao}`, r.chart.appVersion, r.descricao])]));
      break;
    }
    case 'status': {
      const r = atual(pos[0] ?? '');
      if (!r) {
        falha('release: not found');
        break;
      }
      out.push(resumo(pos[0], r, recursos(c, r)));
      break;
    }
    case 'get': {
      const [oque, nome] = pos;
      const r = atual(nome ?? '');
      if (!r) {
        falha('release: not found');
        break;
      }
      if (oque === 'values') {
        out.push(flags.all ? `COMPUTED VALUES:\n${paraYaml(r.computados)}` : `USER-SUPPLIED VALUES:\n${Object.keys(r.usuario).length ? paraYaml(r.usuario) : 'null\n'}`);
      } else if (oque === 'manifest') out.push(r.manifestos.map((m) => `---\n# Source: ${m.arquivo}\n${m.texto}\n`).join(''));
      else if (oque === 'notes') out.push(`NOTES:\n${r.notas}`);
      else falha(`unknown command "${oque ?? ''}" for "helm get"`);
      break;
    }
    case undefined:
    case 'help':
      out.push('O helm deste simulador entende: repo add/list/update, search repo, show values/chart, install, upgrade, rollback, list, history, status, get values/manifest/notes, template e uninstall.\n');
      break;
    default:
      falha(`unknown command "${sub}" for "helm"\nRun 'helm --help' for usage.`);
  }
  const stdout = out.join('');
  const stderr = err.join('');
  return { saida: stdout + stderr, stdout, stderr, partes: [...(stdout ? [{ fluxo: 'out', texto: stdout }] : []), ...(stderr ? [{ fluxo: 'err', texto: stderr }] : [])], codigo };
}

