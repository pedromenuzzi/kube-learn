// Sorteio com semente: o mesmo cluster com os mesmos passos gera os mesmos nomes, IPs e UIDs.

/** Alfabeto que o Kubernetes usa nos sufixos de nomes (sem vogais nem 0, 1, 3, para não formar palavras). */
export const ALFABETO = 'bcdfghjklmnpqrstvwxz2456789';

function hashTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** `n` dígitos hexadecimais fixos, derivados de um texto (o digest de uma imagem, por exemplo). */
export const hexDe = (texto, n = 64) => Array.from({ length: n / 8 }, (_, i) => hashTexto(`${texto}#${i}`).toString(16).padStart(8, '0')).join('');

/** Um UID fixo, derivado de um texto: para objetos do sistema, que não gastam o sorteio dos nomes e lugares. */
export function uuidDe(texto) {
  const h = hexDe(texto, 32).split('');
  h[12] = '4';
  h[16] = '8';
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** JSON com as chaves em ordem: dois objetos iguais dão sempre o mesmo texto. */
export const canonico = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
  : x));

/**
 * pod-template-hash como o do Deployment: FNV-32a do template, escrito em decimal e codificado no alfabeto.
 * Guardado pelo JSON comum do template (bem mais barato que o canônico, e o mesmo JSON dá sempre o mesmo canônico).
 */
const hashes = new Map();
export function hashTemplate(template, colisoes = 0) {
  const chave = `${colisoes}#${JSON.stringify(template)}`;
  let hash = hashes.get(chave);
  if (hash === undefined) {
    const decimal = String(hashTexto(canonico(template) + (colisoes ? `#${colisoes}` : '')));
    hash = [...decimal].map((c) => ALFABETO[c.charCodeAt(0) % ALFABETO.length]).join('');
    if (hashes.size >= 1000) hashes.clear();
    hashes.set(chave, hash);
  }
  return hash;
}

export function criarAleatorio(semente = 'kube-learn') {
  let estado = hashTexto(String(semente)) || 1;
  // mulberry32
  const proximo = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (n) => Math.floor(proximo() * n);
  const de = (alfabeto, n) => Array.from({ length: n }, () => alfabeto[inteiro(alfabeto.length)]).join('');
  return {
    proximo,
    inteiro,
    sufixo: (n = 5) => de(ALFABETO, n),
    hex: (n) => de('0123456789abcdef', n),
    uuid: () => {
      const h = de('0123456789abcdef', 32).split('');
      h[12] = '4';
      h[16] = '89ab'[inteiro(4)];
      const s = h.join('');
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    },
  };
}
