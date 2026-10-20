// Adaptado de sertaoseracloud/terraform-playground: src/ui/cenarios/pixel.js (AGPL-3.0, Sertão será cloud).
// Pixel art: cada sprite tem 16×16 pixels, escritos como 16 linhas de 16 letras (cada letra é uma cor da
// paleta; "." é transparente), e é desenhado ampliado, sem suavização.
export const LADO = 16;

/** Cria um sprite a partir do texto (16 linhas × 16 letras); avisa se o desenho estiver errado. */
export function sprite(paleta, texto) {
  const linhas = texto.trim().split('\n').map((l) => l.trim());
  if (linhas.length !== LADO || linhas.some((l) => l.length !== LADO)) throw new Error('o sprite precisa ser 16×16');
  for (const linha of linhas) {
    for (const ch of linha) if (ch !== '.' && !(ch in paleta)) throw new Error(`a cor "${ch}" está fora da paleta`);
  }
  return { paleta, linhas };
}

/** Desenha o sprite no canvas (em unidades de pixel; quem amplia é o CSS). */
export function desenharSprite(ctx, s, x, y, { espelhar = false } = {}) {
  for (let i = 0; i < LADO; i++) {
    for (let j = 0; j < LADO; j++) {
      const ch = s.linhas[i][espelhar ? LADO - 1 - j : j];
      if (ch === '.') continue;
      ctx.fillStyle = s.paleta[ch];
      ctx.fillRect(x + j, y + i, 1, 1);
    }
  }
}

export const NUVEM = sprite({ b: '#ffffff', c: '#d7e3f0' }, `
................
................
................
................
......bbbb......
....bbbbbbbb....
...bbbbbbbbbbb..
..bbbbbbbbbbbbb.
.bbbbbbbbbbbbbbb
.bbbbbbbbbbbbbbb
..cccccccccccccc
................
................
................
................
................`);
