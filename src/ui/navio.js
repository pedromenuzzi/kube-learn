// O navio da trilha em pixel art: começa com o convés vazio e cada item resolvido embarca um contêiner, na ordem
// da trilha e com a cor do nível (lição, quiz e fácil são de 20 pés; médio e difícil, de 40). A pilha só sobe, e
// quando fica alta demais começa a entortar. O helicóptero traz o contêiner da próxima missão; nível lacrado
// (100%) ganha o lacre dourado nos contêineres. É só enfeite (aria-hidden): a lista de níveis é o que o teclado e
// o leitor de tela usam.
import { desenharSprite, NUVEM } from './pixel.js';

export const VAGAS = 8; // contêineres de 20 pés por fileira (convés estreito: a pilha sobe rápido)
const C = 10; // largura de uma vaga
const COMPRIMENTO = 30 + VAGAS * C + 16; // ponte, convés e proa
const A = 6; // altura de uma fileira
export const CORES = ['#c0392b', '#2e86c1', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#d35400', '#34495e', '#e84393', '#795548', '#7f8c8d', '#f1c40f'];

const cor = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;
const tamanho = (item) => (item.dificuldade === 'medio' || item.dificuldade === 'dificil' ? 2 : 1);

/** Arruma os contêineres no convés, da esquerda para a direita e de baixo para cima: [{ item, fileira, vaga, largura }]. */
export function empilhar(itens) {
  let fileira = 0;
  let vaga = 0;
  return itens.map((item) => {
    const largura = tamanho(item);
    if (vaga + largura > VAGAS) {
      fileira++;
      vaga = 0;
    }
    const lugar = { item, fileira, vaga, largura };
    vaga += largura;
    return lugar;
  });
}

// Quanto a fileira entorta para a direita: nada até a 6ª, depois cada vez mais (a graça é ver até onde vai).
const desvio = (fileira) => Math.round(Math.max(0, fileira - 5) ** 1.5 * 0.25);

/** Desenha o navio da jornada (calcularJornada) num <canvas>; estreito no celular, largo com mar dos lados. */
export function desenharNavio(canvas, jornada) {
  const W = canvas.clientWidth && canvas.clientWidth < 640 ? 170 : 400;
  const corDoNivel = Object.fromEntries(jornada.niveis.map((n) => [n.numero, CORES[n.numero % CORES.length]]));
  const lacrado = Object.fromEntries(jornada.niveis.map((n) => [n.numero, n.concluido]));
  const feitos = jornada.niveis.flatMap((n) => n.itens.filter((i) => i.estado === 'concluido'));
  const pilha = empilhar(jornada.proximo ? [...feitos, jornada.proximo] : feitos);
  const vindo = jornada.proximo ? pilha.pop() : null;
  const fileiras = Math.max(pilha.at(-1)?.fileira ?? -1, vindo?.fileira ?? -1) + 1;

  const H = Math.max(W > 300 ? 190 : 170, 70 + fileiras * A + 60);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const r = (c, x, y, w, h) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  // Céu (das cores do tema), nuvens e gaivotas.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, cor('--ceu-topo', '#5b8fd6'));
  g.addColorStop(1, cor('--ceu-baixo', '#cfe6fb'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y] of [[8, 16], [W * 0.42, 34], [W - 40, 8], [W * 0.2, H * 0.45]]) desenharSprite(ctx, NUVEM, Math.round(x), Math.round(y));
  for (const [x, y] of [[W * 0.3, 20], [W * 0.34, 26]]) {
    r('#2b2b2b', Math.round(x), y, 1, 1);
    r('#2b2b2b', Math.round(x) + 1, y + 1, 1, 1);
    r('#2b2b2b', Math.round(x) + 2, y, 1, 1);
  }

  // Mar, com as ondas.
  const mar = H - 30;
  r('#2a6fb0', 0, mar, W, H - mar);
  r('#1d4f80', 0, mar + 16, W, H - mar - 16);
  for (let y = mar + 3; y < H; y += 5) for (let x = (y * 7) % 12; x < W; x += 12) r('#ffffff55', x, y, 4, 1);

  // Casco: azul em cima, vermelho na linha d'água, a proa inclinada à direita.
  const x0 = W > 300 ? W - 160 : W - COMPRIMENTO - 14;
  const conves = mar - 10;
  for (let i = 0; i < 16; i++) {
    const esq = x0 + Math.floor(i / 2);
    const dir = x0 + COMPRIMENTO - i;
    r(conves + i >= mar - 2 ? '#b23a48' : '#1d3557', esq, conves + i, dir - esq, 1);
  }
  r('#e8e8e8', x0, conves + 3, COMPRIMENTO - 2, 1);
  for (let x = 4; x < W; x += 9) r('#ffffff77', x, mar + 1, 3, 1); // a água por cima do casco

  // Ponte de comando na popa, com a chaminé azul (com o leme do Kubernetes) e a fumaça.
  const janelas = cor('--janelas-navio', '#2b3a55');
  r('#f1f1f1', x0 + 4, conves - 22, 20, 22);
  r('#d0d0d0', x0 + 4, conves - 22, 20, 1);
  for (let k = 0; k < 4; k++) r(janelas, x0 + 6 + k * 4, conves - 19, 3, 3);
  for (let k = 0; k < 4; k++) r(janelas, x0 + 6 + k * 4, conves - 12, 3, 2);
  r('#326ce5', x0 + 9, conves - 31, 8, 9);
  r('#ffffff', x0 + 12, conves - 28, 2, 2);
  r('#bfc5cc', x0 + 11, conves - 36, 4, 3);
  r('#d9dde2', x0 + 14, conves - 41, 5, 4);
  r('#e6e9ec', x0 + 18, conves - 47, 6, 4);

  // A pilha de contêineres.
  const xc = x0 + 30;
  const posicao = (l) => [xc + l.vaga * C + desvio(l.fileira), conves - (l.fileira + 1) * A];
  const conteiner = (x, y, l) => {
    const w = l.largura * C - 1;
    r(corDoNivel[l.item.nivel], x, y, w, A - 1);
    for (let k = x + 1; k < x + w - 1; k += 2) r('#00000030', k, y + 1, 1, A - 3);
    r('#ffffff40', x, y, w, 1);
    r('#00000040', x, y + A - 2, w, 1);
    if (lacrado[l.item.nivel]) r('#f5c518', x + w - 2, y + 2, 1, 2);
  };
  for (const l of pilha) conteiner(...posicao(l), l);

  // No topo: a bandeira, com tudo embarcado; senão, uma gaivota sentada.
  const topo = pilha.at(-1);
  if (topo) {
    const [x, y] = posicao(topo);
    if (jornada.navioCheio) {
      r('#3a3a3a', x + 3, y - 10, 1, 10);
      r('#f5c518', x + 4, y - 10, 6, 4);
    } else {
      r('#ffffff', x + 2, y - 2, 4, 2);
      r('#9aa0a6', x + 3, y - 2, 2, 1);
      r('#ffffff', x + 5, y - 3, 2, 1);
      r('#f39c12', x + 7, y - 3, 1, 1);
    }
  }

  // O helicóptero trazendo o contêiner da próxima missão, um pouco acima do lugar dele.
  if (vindo) {
    const [x, y] = posicao(vindo);
    const cy = y - 12;
    conteiner(x, cy, vindo);
    const cx = x + Math.floor((vindo.largura * C) / 2);
    const hy = cy - 9;
    r('#3a3a3a', cx, hy + 4, 1, 5); // cabo
    r('#e9c46a', cx - 5, hy, 10, 4);
    r('#a8dadc', cx + 2, hy + 1, 3, 2);
    r('#e9c46a', cx - 11, hy + 1, 6, 1);
    r('#3a3a3a', cx - 12, hy - 1, 1, 3);
    r('#3a3a3a', cx - 8, hy - 2, 17, 1);
    r('#3a3a3a', cx, hy - 1, 1, 1);
    r('#3a3a3a', cx - 4, hy + 5, 9, 1);
  }
}
