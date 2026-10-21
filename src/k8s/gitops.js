// GitOps: a planta registrada em cartório. O cluster ganha um repositório git (os arquivos do editor) e um fiscal
// (como o Argo CD com self-heal): a cada 30 s, e logo depois de um git push, ele aplica o que está publicado e
// desfaz o que alguém mudou à mão nos campos que a planta declara. O terminal entende o git que se usa no dia a dia.
import { kubectl } from './kubectl/index.js';
import { lerYaml } from './kubectl/manifestos.js';
import { recursoDoKind } from './recursos.js';
import { sha256 } from './kustomize.js';
import { palavras } from './kubectl/argv.js';

const INTERVALO = 30_000;
const ehYaml = (k) => /^[^/]+\.(ya?ml|json)$/.test(k);
const soYaml = (arquivos) => Object.fromEntries(Object.entries(arquivos).filter(([k]) => ehYaml(k)));

/** Liga o repositório e o fiscal no cluster, com a primeira versão da planta. */
export function criarRepositorio(c, inicial, { url = 'https://git.kube-learn.dev/condominio/loja.git' } = {}) {
  const primeiro = { hash: hashDe('primeira versão', inicial, 0), msg: 'primeira versão da planta', arquivos: { ...inicial }, em: c.agora };
  c.gitops = {
    url,
    commits: [primeiro],
    publicado: primeiro,
    preparados: new Set(),
    proximaSync: c.agora,
    tique: () => {
      if (c.agora >= c.gitops.proximaSync) sincronizar(c);
    },
  };
  sincronizar(c);
}

const hashDe = (msg, arquivos, n) => sha256(`${n}\n${msg}\n${JSON.stringify(arquivos)}`);

/** Aplica o que está publicado e força os campos declarados (o "self-heal"). */
function sincronizar(c) {
  const g = c.gitops;
  g.proximaSync = c.agora + INTERVALO;
  kubectl(c, 'kubectl apply -f .', { arquivos: g.publicado.arquivos });
  for (const texto of Object.values(g.publicado.arquivos)) {
    for (const doc of lerYaml(texto, 'git').docs ?? []) {
      const r = recursoDoKind(doc.kind);
      const vivo = r && c.obter(doc.kind, r.namespaced ? doc.metadata?.namespace ?? 'default' : null, doc.metadata?.name);
      if (!vivo || !doc.spec) continue;
      if (forcar(vivo.spec, doc.spec)) c.salvar(vivo, { spec: true });
    }
  }
  c.reconciliar();
}

/** Copia os valores declarados por cima dos vivos (listas inteiras). → se mudou algo. */
function forcar(vivo, desejado) {
  let mudou = false;
  for (const [k, v] of Object.entries(desejado)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && vivo[k] && typeof vivo[k] === 'object') mudou = forcar(vivo[k], v) || mudou;
    else if (JSON.stringify(vivo[k]) !== JSON.stringify(v) && !Array.isArray(v)) {
      vivo[k] = structuredClone(v);
      mudou = true;
    }
  }
  return mudou;
}

/** As linhas que mudaram entre duas versões de um arquivo (para o resumo do commit e o git diff). */
function diferenca(antes = '', depois = '') {
  const a = antes.split('\n');
  const b = depois.split('\n');
  const resta = (de, menos) => {
    const conta = new Map();
    for (const x of menos) conta.set(x, (conta.get(x) ?? 0) + 1);
    return de.filter((x) => {
      const n = conta.get(x) ?? 0;
      if (n) conta.set(x, n - 1);
      return !n;
    });
  };
  return { saiu: resta(a, b), entrou: resta(b, a) };
}

function mudancas(g, arquivos) {
  const atual = soYaml(arquivos);
  const ultimo = g.commits.at(-1).arquivos;
  return [...new Set([...Object.keys(atual), ...Object.keys(ultimo)])].sort()
    .filter((k) => atual[k] !== ultimo[k])
    .map((k) => ({ arquivo: k, tipo: !(k in ultimo) ? 'new file' : !(k in atual) ? 'deleted' : 'modified', ...diferenca(ultimo[k], atual[k]) }));
}

/** Uma linha "git ..." do terminal. → { saida, stdout, stderr, codigo }. */
export function git(c, linha, arquivos) {
  const res = (codigo, out = '', err = '') => ({ saida: out + err, stdout: out, stderr: err, partes: [...(out ? [{ fluxo: 'out', texto: out }] : []), ...(err ? [{ fluxo: 'err', texto: err }] : [])], codigo });
  const g = c.gitops;
  if (!g) return res(128, '', 'fatal: not a git repository (or any of the parent directories): .git\n');
  const [, sub, ...args] = palavras(linha);
  const m = mudancas(g, arquivos);
  switch (sub) {
    case 'status': {
      const novos = g.commits.length - 1 - g.commits.indexOf(g.publicado);
      const cabeca = `On branch main\n${novos ? `Your branch is ahead of 'origin/main' by ${novos} commit${novos > 1 ? 's' : ''}.\n  (use "git push" to publish your local commits)\n` : "Your branch is up to date with 'origin/main'.\n"}`;
      if (!m.length) return res(0, `${cabeca}\nnothing to commit, working tree clean\n`);
      const prep = m.filter((x) => g.preparados.has(x.arquivo));
      const fora = m.filter((x) => !g.preparados.has(x.arquivo));
      const lista = (xs) => xs.map((x) => `\t${`${x.tipo}:`.padEnd(12)}${x.arquivo}\n`).join('');
      return res(0, `${cabeca}\n${prep.length ? `Changes to be committed:\n  (use "git restore --staged <file>..." to unstage)\n${lista(prep)}\n` : ''}${fora.length ? `Changes not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n${lista(fora)}\n` : ''}${prep.length ? '' : 'no changes added to commit (use "git add" and/or "git commit -a")\n'}`);
    }
    case 'add': {
      const todos = args.some((a) => ['.', '-A', '--all'].includes(a));
      for (const x of m) if (todos || args.includes(x.arquivo)) g.preparados.add(x.arquivo);
      return res(0);
    }
    case 'diff': {
      const texto = m.map((x) => `diff --git a/${x.arquivo} b/${x.arquivo}\n--- a/${x.arquivo}\n+++ b/${x.arquivo}\n${x.saiu.map((l) => `-${l}\n`).join('')}${x.entrou.map((l) => `+${l}\n`).join('')}`).join('');
      return res(0, texto);
    }
    case 'commit': {
      const tudo = args.some((a) => /^-[a-z]*a/.test(a));
      const iMsg = args.findIndex((a) => /^-[a-z]*m$/.test(a) || a === '--message');
      const msg = iMsg >= 0 ? args[iMsg + 1] : null;
      if (!msg) return res(1, '', 'error: switch `m\' requires a value (use git commit -m "mensagem")\n');
      const entram = m.filter((x) => tudo ? x.tipo !== 'new file' || g.preparados.has(x.arquivo) : g.preparados.has(x.arquivo));
      if (!entram.length) return res(1, `On branch main\n${m.length ? 'Changes not staged for commit:\n\tuse "git add" para preparar os arquivos\n' : 'nothing to commit, working tree clean\n'}`);
      const novos = { ...g.commits.at(-1).arquivos };
      for (const x of entram) {
        if (x.tipo === 'deleted') delete novos[x.arquivo];
        else novos[x.arquivo] = arquivos[x.arquivo];
      }
      const commit = { hash: hashDe(msg, novos, g.commits.length), msg, arquivos: novos, em: c.agora };
      g.commits.push(commit);
      g.preparados.clear();
      const ins = entram.reduce((t, x) => t + x.entrou.length, 0);
      const del = entram.reduce((t, x) => t + x.saiu.length, 0);
      return res(0, `[main ${commit.hash.slice(0, 7)}] ${msg}\n ${entram.length} file${entram.length > 1 ? 's' : ''} changed${ins ? `, ${ins} insertion${ins > 1 ? 's' : ''}(+)` : ''}${del ? `, ${del} deletion${del > 1 ? 's' : ''}(-)` : ''}\n`);
    }
    case 'push': {
      const ultimo = g.commits.at(-1);
      if (ultimo === g.publicado) return res(0, '', 'Everything up-to-date\n');
      const antes = g.publicado;
      g.publicado = ultimo;
      g.proximaSync = c.agora; // o fiscal vê o push e sincroniza na próxima volta do relógio
      return res(0, '', `To ${g.url}\n   ${antes.hash.slice(0, 7)}..${ultimo.hash.slice(0, 7)}  main -> main\n`);
    }
    case 'log': {
      const linhas = [...g.commits].reverse();
      if (args.includes('--oneline')) return res(0, linhas.map((x, i) => `${x.hash.slice(0, 7)} ${i === 0 ? `(HEAD -> main${x === g.publicado ? ', origin/main' : ''}) ` : x === g.publicado ? '(origin/main) ' : ''}${x.msg}\n`).join(''));
      return res(0, linhas.map((x) => `commit ${x.hash.slice(0, 40)}\nAuthor: aluno <aluno@kube-learn.dev>\nDate:   ${new Date(x.em).toUTCString()}\n\n    ${x.msg}\n`).join('\n'));
    }
    default:
      return res(1, '', `git: '${sub ?? ''}' não existe neste simulador. Use: status, add, diff, commit, push e log.\n`);
  }
}
