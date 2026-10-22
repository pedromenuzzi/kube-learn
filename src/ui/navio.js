// O navio da trilha em pixel art: começa com o convés vazio e cada item resolvido embarca um contêiner, na ordem
// da trilha e com a cor do nível (lição, quiz e fácil são de 20 pés; médio e difícil, de 40). A pilha só sobe, e
// quando fica alta demais começa a entortar. O mar, a fumaça e as nuvens se mexem. O helicóptero traz o contêiner da próxima missão; nível lacrado
// (100%) ganha o lacre dourado nos contêineres. É só enfeite (aria-hidden): a lista de níveis é o que o teclado e
// o leitor de tela usam.
import { desenharSprite, NUVEM } from './pixel.js';

export const VAGAS = 8; // contêineres de 20 pés por fileira (convés estreito: a pilha sobe rápido)
const C = 10; // largura de uma vaga
const COMPRIMENTO = 30 + VAGAS * C + 16; // ponte, convés e proa
const A = 6; // altura de uma fileira
export const CORES = ['#c0392b', '#2e86c1', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#d35400', '#34495e', '#e84393', '#795548', '#7f8c8d', '#f1c40f'];

const cor = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;
export const tamanho = (item) => (item.dificuldade === 'medio' || item.dificuldade === 'dificil' ? 2 : 1);

/**
 * Um contêiner de `largura` vagas (1 = 20 pés, 2 = 40 pés) com o canto em (x, y), na cor do nível, com o lacre dourado
 * se o nível fechou. `r(cor, x, y, w, h)` pinta um retângulo. Ocupa a fileira inteira (A pixels): assenta no convés e no
 * contêiner de baixo; a linha escura embaixo separa os dois.
 */
export function pintarConteiner(r, x, y, largura, cor, comLacre = false) {
  const w = largura * C - 1;
  r(cor, x, y, w, A);
  for (let k = x + 1; k < x + w - 1; k += 2) r('#00000030', k, y + 1, 1, A - 2);
  r('#ffffff40', x, y, w, 1);
  r('#00000040', x, y + A - 1, w, 1);
  if (comLacre) r('#f5c518', x + w - 2, y + 2, 1, 2);
}

/** O helicóptero com o centro em cx e o topo da cabine em hy; `gira` alterna a hélice. O cabo fica com quem chama. */
export function pintarHelicoptero(r, cx, hy, gira) {
  r('#e9c46a', cx - 5, hy, 10, 4);
  r('#a8dadc', cx + 2, hy + 1, 3, 2);
  r('#e9c46a', cx - 11, hy + 1, 6, 1);
  r('#3a3a3a', cx - 12, hy - (gira ? 1 : 0), 1, gira ? 3 : 1);
  r('#3a3a3a', gira ? cx - 8 : cx - 4, hy - 2, gira ? 17 : 9, 1);
  r('#3a3a3a', cx, hy - 1, 1, 1);
  r('#3a3a3a', cx - 4, hy + 5, 9, 1);
}

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

const mod = (a, n) => ((a % n) + n) % n;
const QUADROS_POR_SEGUNDO = 12; // movimento de videogame antigo (e pouca CPU)
export const semMovimento = () => document.documentElement.dataset.movimento === 'reduzido' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Desenha o navio da jornada (calcularJornada) num <canvas>, estreito no celular e largo com mar dos lados, e anima:
 * ondas, esteira, fumaça, nuvens, gaivotas, o balanço do casco e a hélice do helicóptero. Com "reduzir movimento",
 * fica parado. Devolve a função que para a animação.
 */
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
  const ceu = ctx.createLinearGradient(0, 0, 0, H);
  ceu.addColorStop(0, cor('--ceu-topo', '#5b8fd6'));
  ceu.addColorStop(1, cor('--ceu-baixo', '#cfe6fb'));
  const janelas = cor('--janelas-navio', '#2b3a55');

  const mar = H - 30;
  const x0 = W > 300 ? W - 160 : W - COMPRIMENTO - 14;
  const xc = x0 + 30;
  const posicao = (l) => [xc + l.vaga * C + desvio(l.fileira), mar - 10 - (l.fileira + 1) * A];
  const conteiner = (x, y, l) => pintarConteiner(r, x, y, l.largura, corDoNivel[l.item.nivel], lacrado[l.item.nivel]);

  // O casco, a ponte e a pilha só mudam com o balanço (dy = -1, 0 ou 1): pintados uma vez numa tela fora da página, para
  // cada dy, e copiados a cada quadro (com o navio cheio, são centenas de contêineres).
  const navioPronto = {};
  const navioEm = (dy) => {
    if (navioPronto[dy]) return navioPronto[dy];
    const tela = document.createElement('canvas');
    tela.width = W;
    tela.height = H;
    const c2 = tela.getContext('2d');
    const r2 = (c, x, y, w, h) => {
      c2.fillStyle = c;
      c2.fillRect(x, y, w, h);
    };
    const conves = mar - 10 + dy;
    for (let i = 0; i < 16; i++) {
      const esq = x0 + Math.floor(i / 2);
      const dir = x0 + COMPRIMENTO - i;
      r2(conves + i >= mar - 2 ? '#b23a48' : '#1d3557', esq, conves + i, dir - esq, 1);
    }
    r2('#e8e8e8', x0, conves + 3, COMPRIMENTO - 2, 1);
    r2('#f1f1f1', x0 + 4, conves - 22, 20, 22);
    r2('#d0d0d0', x0 + 4, conves - 22, 20, 1);
    for (let k = 0; k < 4; k++) r2(janelas, x0 + 6 + k * 4, conves - 19, 3, 3);
    for (let k = 0; k < 4; k++) r2(janelas, x0 + 6 + k * 4, conves - 12, 3, 2);
    r2('#326ce5', x0 + 9, conves - 31, 8, 9);
    r2('#ffffff', x0 + 12, conves - 28, 2, 2);
    for (const l of pilha) {
      const [x, y] = posicao(l);
      pintarConteiner(r2, x, y + dy, l.largura, corDoNivel[l.item.nivel], lacrado[l.item.nivel]);
    }
    return (navioPronto[dy] = tela);
  };

  // Um quadro no instante t (em segundos). O navio segue para a direita: o cenário escorrega para a esquerda.
  const quadro = (t) => {
    const f = Math.floor(t * QUADROS_POR_SEGUNDO);

    // Céu, nuvens (devagar) e gaivotas batendo as asas.
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, W, H);
    [[8, 16, 1.5], [W * 0.42, 34, 2.5], [W - 40, 8, 1], [W * 0.2, H * 0.45, 2]].forEach(([x, y, v]) => {
      desenharSprite(ctx, NUVEM, Math.round(mod(x - t * v, W + 20) - 18), Math.round(y));
    });
    [[W * 0.3, 20], [W * 0.34, 26]].forEach(([x0g, y0g], k) => {
      const x = Math.round(mod(x0g + t * 3, W + 10) - 5);
      const y = Math.round(y0g + Math.sin(t * 1.3 + k) * 2);
      const asaAlta = Math.floor(t * 4 + k * 0.5) % 2 === 0;
      r('#2b2b2b', x, y + (asaAlta ? 0 : 1), 1, 1);
      r('#2b2b2b', x + 1, y + (asaAlta ? 1 : 0), 1, 1);
      r('#2b2b2b', x + 2, y + (asaAlta ? 0 : 1), 1, 1);
    });

    // Fumaça: três baforadas que sobem, crescem e somem para trás do navio.
    for (let k = 0; k < 3; k++) {
      const p = mod(t / 2.4 + k / 3, 1);
      const lado = 2 + Math.round(p * 4);
      ctx.globalAlpha = 1 - p * 0.75;
      r('#c9ced5', x0 + 12 - Math.round(p * 16), mar - 10 - 33 - Math.round(p * 20), lado, lado);
    }
    ctx.globalAlpha = 1;

    // Mar: as fileiras de onda de perto andam mais rápido.
    r('#2a6fb0', 0, mar, W, H - mar);
    r('#1d4f80', 0, mar + 16, W, H - mar - 16);
    for (let y = mar + 3, k = 0; y < H; y += 5, k++) {
      const desloca = mod((y * 7) - t * (4 + k * 3), 12);
      for (let x = Math.round(desloca) - 12; x < W; x += 12) r('#ffffff55', x, y, 4, 1);
    }

    // O navio balança um pixel para cima e para baixo.
    const dy = Math.round(Math.sin(t * 1.6));
    ctx.drawImage(navioEm(dy), 0, 0);
    const topo = pilha.at(-1);
    if (topo) {
      const [x, y0t] = posicao(topo);
      const y = y0t + dy;
      if (jornada.navioCheio) {
        r('#3a3a3a', x + 3, y - 10, 1, 10);
        r('#f5c518', x + 4, y - 10 + (f % 6 < 3 ? 0 : 1), 6, 4); // a bandeira tremula
      } else {
        r('#ffffff', x + 2, y - 2, 4, 2);
        r('#9aa0a6', x + 3, y - 2, 2, 1);
        r('#ffffff', x + 5, y - 3, 2, 1);
        r('#f39c12', x + 7, y - 3, 1, 1);
      }
    }

    // A água por cima do casco, a onda da proa e a esteira atrás da popa.
    for (let x = Math.round(mod(4 - t * 6, 9)) - 9; x < W; x += 9) r('#ffffff77', x, mar + 1, 3, 1);
    const proa = x0 + COMPRIMENTO - 10;
    r('#ffffffcc', proa + (f % 4 < 2 ? 0 : 1), mar - 1, 3, 1);
    r('#ffffff99', proa + 2, mar + (f % 4 < 2 ? 1 : 0), 3, 1);
    for (let k = 0; k < 6; k++) {
      const d = mod(t * 10 + k * 7, 42);
      ctx.globalAlpha = 1 - d / 42;
      r('#ffffff', x0 + 3 - Math.round(d), mar + 1 + (k % 2), 3, 1);
    }
    ctx.globalAlpha = 1;

    // O helicóptero trazendo o contêiner da próxima missão, pairando acima do lugar dele.
    if (vindo) {
      const [x, y] = posicao(vindo);
      const cy = y - 12 + Math.round(Math.sin(t * 2.2 + 1));
      conteiner(x, cy, vindo);
      const cx = x + Math.floor((vindo.largura * C) / 2);
      const hy = cy - 9;
      r('#3a3a3a', cx, hy + 4, 1, 5); // cabo
      pintarHelicoptero(r, cx, hy, f % 2 === 0);
    }
  };

  quadro(0);
  if (semMovimento()) return () => {};
  let pedido = 0;
  let ultimo = -1;
  const inicio = performance.now();
  const laco = (agora) => {
    const t = (agora - inicio) / 1000;
    const f = Math.floor(t * QUADROS_POR_SEGUNDO);
    if (f !== ultimo) {
      ultimo = f;
      quadro(t);
    }
    pedido = requestAnimationFrame(laco);
  };
  // Fora da tela (a trilha rolada para baixo), o mar para: nada de gastar bateria com uma animação que ninguém vê.
  const visivel = new IntersectionObserver(([e]) => {
    cancelAnimationFrame(pedido);
    if (e.isIntersecting) pedido = requestAnimationFrame(laco);
  });
  visivel.observe(canvas);
  return () => {
    visivel.disconnect();
    cancelAnimationFrame(pedido);
  };
}
