// O prédio da trilha em pixel art, de baixo para cima: cada nível é um andar; cada exercício é uma janela que
// acende quando resolvido. Andar bloqueado = planta com andaime; em obra = concreto; pronto (≥ 70%) = fachada
// colorida; Habite-se (100%) = placa dourada. O guindaste fica no andar em construção; com tudo pronto, antena.
// É só enfeite (aria-hidden): a lista de níveis ao lado é o que o teclado e o leitor de tela usam.
import { desenharSprite, NUVEM, GUINDASTE, OPERARIO, ANTENA, ARVORE } from './pixel.js';

const L = 112; // largura em pixels de arte
const ANDAR = 14;
const X0 = 26; // a parede do prédio vai de X0 a X0 + LARGURA
const LARGURA = 60;
const FACHADAS = ['#c96f4a', '#d9a05b', '#7fa6c9', '#9cc08a', '#c98bb0', '#8fb5b0', '#d6c06a', '#a99bd1', '#cf8f6b', '#86a8d8', '#b9b38a', '#e0b0a0'];

const cor = (nome, padrao) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

/** Desenha o prédio da jornada (calcularJornada) num <canvas>. */
export function desenharPredio(canvas, jornada) {
  const niveis = jornada.niveis;
  const topoLivre = 34;
  const altura = topoLivre + niveis.length * ANDAR + 22;
  canvas.width = L;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const r = (c, x, y, w, h) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  // Céu (das cores do tema) e nuvens.
  const g = ctx.createLinearGradient(0, 0, 0, altura);
  g.addColorStop(0, cor('--ceu-topo', '#5b8fd6'));
  g.addColorStop(1, cor('--ceu-baixo', '#cfe6fb'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, altura);
  for (const [x, y] of [[4, 18], [86, 50], [2, 96], [90, 130], [6, 160]]) if (y < altura - 40) desenharSprite(ctx, NUVEM, x, y);

  // Chão: grama e calçada.
  const chao = altura - 22;
  r('#4f9a45', 0, chao, L, 6);
  r('#9a9a9a', 0, chao + 6, L, 4);
  r('#6d6d6d', 0, chao + 10, L, 12);
  desenharSprite(ctx, ARVORE, 4, chao - 13);
  desenharSprite(ctx, ARVORE, L - 20, chao - 13);

  let topoConstruido = null;
  const ultimoConstruido = niveis.findLastIndex((n) => n.andar !== 'planta');
  niveis.forEach((n, i) => {
    const y = chao - (i + 1) * ANDAR;
    if (n.andar === 'planta' && i < ultimoConstruido) { // a estrutura já existe, o conteúdo ainda não
      r('#8d9196', X0, y, LARGURA, ANDAR);
      r('#00000033', X0, y + ANDAR - 1, LARGURA, 1);
      for (let x = X0 + 4; x < X0 + LARGURA - 4; x += 8) r('#6f7378', x, y + 3, 4, 7);
      topoConstruido = y;
      return;
    }
    if (n.andar === 'planta') {
      // Planta: só o contorno pontilhado (azul de planta) e o andaime.
      for (let x = X0; x < X0 + LARGURA; x += 2) {
        r('#2f6db5', x, y, 1, 1);
        r('#2f6db5', x, y + ANDAR - 1, 1, 1);
      }
      for (let yy = y; yy < y + ANDAR; yy += 2) {
        r('#2f6db5', X0, yy, 1, 1);
        r('#2f6db5', X0 + LARGURA - 1, yy, 1, 1);
      }
      return;
    }
    topoConstruido = y;
    const parede = n.andar === 'obra' ? '#a7aaad' : FACHADAS[i % FACHADAS.length];
    r(parede, X0, y, LARGURA, ANDAR);
    r('#00000033', X0, y + ANDAR - 1, LARGURA, 1); // laje
    // Janelas: uma por exercício (no mínimo 4, para o andar não ficar careca), em uma ou duas fileiras.
    const itens = n.itens.length ? n.itens : [];
    const total = Math.max(4, itens.length);
    const fileiras = total > 9 ? 2 : 1;
    const porFileira = Math.ceil(total / fileiras);
    const w = Math.max(2, Math.floor((LARGURA - 4 - (porFileira - 1) * 2) / porFileira));
    const h = fileiras === 2 ? 4 : 7;
    for (let k = 0; k < total; k++) {
      const linha = Math.floor(k / porFileira);
      const col = k % porFileira;
      const wx = X0 + 2 + col * (w + 2);
      const wy = y + 3 + linha * (h + 2);
      const estado = itens[k]?.estado;
      const vidro = estado === 'concluido' ? '#ffd75e' : estado === 'tentado' ? '#e3a33b' : '#2e3440';
      r(vidro, wx, wy, w, h);
      if (estado === 'concluido' && h >= 6 && w >= 3) r('#8a5a00', wx + Math.floor(w / 2), wy + h - 3, 1, 3); // alguém lá dentro
    }
    if (i === 0) { // térreo: porta
      r('#5a3b22', X0 + LARGURA / 2 - 3, y + 4, 6, ANDAR - 4);
      r('#ffd75e', X0 + LARGURA / 2 + 1, y + 9, 1, 1);
    }
    if (n.andar === 'obra') { // andaime nas laterais
      r('#8b5a2b', X0 - 3, y, 1, ANDAR);
      r('#8b5a2b', X0 + LARGURA + 2, y, 1, ANDAR);
      r('#8b5a2b', X0 - 3, y + 6, LARGURA + 6, 1);
    }
    if (n.andar === 'habite-se') { // placa dourada
      r('#f5c518', X0 - 4, y + 4, 3, 3);
      r('#fff3b0', X0 - 3, y + 5, 1, 1);
    }
  });

  if (jornada.arranhaCeu) {
    desenharSprite(ctx, ANTENA, X0 + LARGURA / 2 - 8, chao - niveis.length * ANDAR - 16);
  } else if (topoConstruido !== null) {
    desenharSprite(ctx, GUINDASTE, X0 + LARGURA - 14, topoConstruido - 16);
  }
  desenharSprite(ctx, OPERARIO, X0 + LARGURA / 2 + 6, chao - 15);
}
