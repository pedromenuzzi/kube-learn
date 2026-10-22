// Tempo e quantidades no formato do Kubernetes.

const SEG = 1000;
const MIN = 60 * SEG;
const HORA = 60 * MIN;

/** '30s', '2m', '1h30m', '500ms' → milissegundos. */
export function parseDuracao(texto) {
  if (typeof texto === 'number') return texto;
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let total = 0;
  let achou = false;
  for (const [, n, u] of texto.matchAll(re)) {
    achou = true;
    total += Number(n) * { ms: 1, s: SEG, m: MIN, h: HORA }[u];
  }
  if (!achou) throw new Error(`duração inválida: ${texto}`);
  return Math.round(total);
}

/** Idade como o kubectl mostra na coluna AGE (duration.HumanDuration do apimachinery). */
export function idade(ms) {
  const seg = Math.floor(ms / SEG);
  if (seg < -1) return '<invalid>';
  if (seg < 0) return '0s';
  if (seg < 120) return `${seg}s`;
  const min = Math.floor(ms / MIN);
  if (min < 10) {
    const s = seg % 60;
    return s === 0 ? `${min}m` : `${min}m${s}s`;
  }
  if (min < 180) return `${min}m`;
  const horas = Math.floor(ms / HORA);
  if (horas < 8) {
    const m = min % 60;
    return m === 0 ? `${horas}h` : `${horas}h${m}m`;
  }
  if (horas < 48) return `${horas}h`;
  if (horas < 24 * 8) {
    const h = horas % 24;
    return h === 0 ? `${Math.floor(horas / 24)}d` : `${Math.floor(horas / 24)}d${h}h`;
  }
  if (horas < 24 * 365 * 2) return `${Math.floor(horas / 24)}d`;
  const dias = Math.floor(horas / 24);
  if (horas < 24 * 365 * 8) {
    const d = dias % 365;
    return d === 0 ? `${Math.floor(dias / 365)}y` : `${Math.floor(dias / 365)}y${d}d`;
  }
  return `${Math.floor(dias / 365)}y`;
}

/** '2026-10-16T19:54:21Z' (sem milissegundos, como a API). Guardado: o laço pede os mesmos instantes o tempo todo. */
const isos = new Map();
export function iso(ms) {
  let t = isos.get(ms);
  if (t === undefined) {
    t = new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (isos.size >= 10_000) isos.clear();
    isos.set(ms, t);
  }
  return t;
}

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');

/** RFC1123Z do Go, usado no describe: 'Fri, 16 Oct 2026 19:54:21 +0000'. Sempre em UTC. */
export function rfc1123z(ms) {
  const d = new Date(ms);
  return `${DIAS[d.getUTCDay()]}, ${p2(d.getUTCDate())} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} `
    + `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} +0000`;
}

/** CPU em milicores: '100m' → 100, '0.5' → 500, 2 → 2000. */
export function cpuMili(q) {
  if (q === undefined || q === null) return 0;
  const t = String(q);
  if (t.endsWith('m')) return Number(t.slice(0, -1));
  return Math.round(Number(t) * 1000);
}

const BINARIOS = { Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40 };
const DECIMAIS = { k: 1e3, M: 1e6, G: 1e9, T: 1e12, m: 1e-3 };

/** Memória em bytes: '128Mi', '1G', 500. */
export function bytes(q) {
  if (q === undefined || q === null) return 0;
  const m = String(q).match(/^(\d+(?:\.\d+)?)([KMGT]i|[kMGTm])?$/);
  if (!m) return NaN;
  return Math.round(Number(m[1]) * (BINARIOS[m[2]] ?? DECIMAIS[m[2]] ?? 1));
}

/** Uma quantidade é válida? (o formato que o apiserver aceita, sem notação exponencial). */
export const quantidadeValida = (q) => /^[+]?(\d+(\.\d*)?|\.\d+)([KMGTPE]i|[mkMGTPE])?$/.test(String(q));

/** Milicores como o Kubernetes escreve: 1500 → '1500m', 2000 → '2', 0 → '0'. */
export const textoCpu = (m) => (m === 0 ? '0' : m % 1000 === 0 ? String(m / 1000) : `${m}m`);

/** Bytes como o Kubernetes escreve: na maior unidade exata (Gi, Mi, Ki). */
export function textoMemoria(b) {
  if (b === 0) return '0';
  for (const [suf, f] of [['Gi', 2 ** 30], ['Mi', 2 ** 20], ['Ki', 2 ** 10]]) if (b % f === 0) return `${b / f}${suf}`;
  return String(b);
}
