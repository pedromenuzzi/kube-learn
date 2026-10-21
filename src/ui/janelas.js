// As janelas da tela do exercício (missão, arquivos, terminal, cluster): o aluno arrasta para mudar de lugar
// e arrasta os divisores para mudar o tamanho. Também dá pelo teclado: botões ↑ ↓ ← → em cada janela e
// setas nos divisores. A arrumação fica salva no navegador. No celular, as janelas ficam empilhadas.
import { ler, gravar, CHAVES } from '../armazenamento.js';
import { escapar } from './util.js';
import { t } from '../i18n.js';

export const MAX_COLUNAS = 3;
const MIN_LARGURA = 15;
const MIN_ALTURA = 12;

/** Arrumação: { colunas: [{ largura (%), janelas: [{ id, altura (%) }] }] }. */
export const ARRUMACAO_PADRAO = {
  colunas: [
    { largura: 40, janelas: [{ id: 'missao', altura: 100 }] },
    { largura: 60, janelas: [{ id: 'arquivos', altura: 50 }, { id: 'paineis', altura: 50 }] },
  ],
};

const copiar = (a) => structuredClone(a);
const somar = (l, k) => l.reduce((s, x) => s + x[k], 0);
const escalar = (l, k) => {
  const total = somar(l, k);
  for (const x of l) x[k] = total ? (x[k] / total) * 100 : 100 / l.length;
};

/**
 * Deixa a arrumação válida para as janelas que existem nesta tela: tira as que não existem, põe as que faltam
 * na última coluna, apaga colunas vazias e faz larguras e alturas somarem 100.
 */
export function normalizar(arrumacao, ids) {
  const a = copiar(arrumacao?.colunas ? arrumacao : ARRUMACAO_PADRAO);
  const vistos = new Set();
  for (const c of a.colunas) {
    c.janelas = c.janelas.filter((j) => ids.includes(j.id) && !vistos.has(j.id) && vistos.add(j.id));
  }
  a.colunas = a.colunas.filter((c) => c.janelas.length).slice(0, MAX_COLUNAS);
  const faltam = ids.filter((id) => !a.colunas.some((c) => c.janelas.some((j) => j.id === id)));
  if (!a.colunas.length) a.colunas.push({ largura: 100, janelas: [] });
  const ultima = a.colunas.at(-1);
  for (const id of faltam) ultima.janelas.push({ id, altura: 100 / (ultima.janelas.length + 1) });
  for (const c of a.colunas) {
    for (const j of c.janelas) j.altura = Math.max(j.altura || 0, 1);
    escalar(c.janelas, 'altura');
    c.largura = Math.max(c.largura || 0, 1);
  }
  escalar(a.colunas, 'largura');
  return a;
}

const onde = (a, id) => {
  for (let c = 0; c < a.colunas.length; c++) {
    const j = a.colunas[c].janelas.findIndex((x) => x.id === id);
    if (j >= 0) return { c, j };
  }
  return null;
};

/** Tira a janela de onde está (e a devolve); a coluna que ficar vazia some depois, no normalizar. */
function tirar(a, id) {
  const p = onde(a, id);
  return p ? a.colunas[p.c].janelas.splice(p.j, 1)[0] : null;
}

/** Põe a janela numa coluna, na posição dada, com uma altura justa em relação às outras. */
function por(coluna, janela, posicao) {
  janela.altura = coluna.janelas.length ? 100 / coluna.janelas.length : 100;
  coluna.janelas.splice(posicao, 0, janela);
}

function novaColuna(a, indice) {
  const largura = 100 / (a.colunas.length + 1);
  const coluna = { largura, janelas: [] };
  a.colunas.splice(indice, 0, coluna);
  return coluna;
}

/** Move pelo teclado: 'cima' e 'baixo' na coluna; 'esquerda' e 'direita' para a coluna ao lado (ou uma nova). */
export function mover(arrumacao, id, direcao, ids) {
  const a = copiar(arrumacao);
  const p = onde(a, id);
  if (!p) return normalizar(a, ids);
  const coluna = a.colunas[p.c];
  if (direcao === 'cima' || direcao === 'baixo') {
    const alvo = p.j + (direcao === 'cima' ? -1 : 1);
    if (alvo < 0 || alvo >= coluna.janelas.length) return normalizar(a, ids);
    const [j] = coluna.janelas.splice(p.j, 1);
    coluna.janelas.splice(alvo, 0, j);
    return normalizar(a, ids);
  }
  const esquerda = direcao === 'esquerda';
  const vizinha = p.c + (esquerda ? -1 : 1);
  const sozinha = coluna.janelas.length === 1;
  if (vizinha < 0 || vizinha >= a.colunas.length) {
    if (sozinha || a.colunas.length >= MAX_COLUNAS) return normalizar(a, ids);
    const j = tirar(a, id);
    por(novaColuna(a, esquerda ? 0 : a.colunas.length), j, 0);
    return normalizar(a, ids);
  }
  const destino = a.colunas[vizinha];
  const j = tirar(a, id);
  por(destino, j, Math.min(p.j, destino.janelas.length));
  return normalizar(a, ids);
}

/**
 * Solta a janela arrastada perto de outra: 'antes'/'depois' (na mesma coluna da outra) ou
 * 'esquerda'/'direita' (numa coluna nova ao lado da coluna da outra).
 */
export function soltar(arrumacao, id, alvoId, lado, ids) {
  if (id === alvoId) return normalizar(arrumacao, ids);
  const a = copiar(arrumacao);
  const j = tirar(a, id);
  if (!j) return normalizar(a, ids);
  const p = onde(a, alvoId);
  if (!p) return normalizar(arrumacao, ids);
  if (lado === 'antes' || lado === 'depois') {
    por(a.colunas[p.c], j, p.j + (lado === 'depois' ? 1 : 0));
    return normalizar(a, ids);
  }
  const vazias = a.colunas.filter((c) => !c.janelas.length).length;
  if (a.colunas.length - vazias >= MAX_COLUNAS) {
    // Já há 3 colunas: em vez de criar outra, entra na coluna vizinha.
    const vizinha = a.colunas[p.c + (lado === 'esquerda' ? -1 : 1)] ?? a.colunas[p.c];
    por(vizinha, j, vizinha.janelas.length);
    return normalizar(a, ids);
  }
  por(novaColuna(a, p.c + (lado === 'direita' ? 1 : 0)), j, 0);
  return normalizar(a, ids);
}

/** Muda a largura entre a coluna i e a i+1 (delta em pontos percentuais). */
export function redimensionarColunas(arrumacao, i, delta) {
  const a = copiar(arrumacao);
  const [x, y] = [a.colunas[i], a.colunas[i + 1]];
  const d = Math.max(MIN_LARGURA - x.largura, Math.min(delta, y.largura - MIN_LARGURA));
  x.largura += d;
  y.largura -= d;
  return a;
}

/** Muda a altura entre as janelas j e j+1 da coluna c. */
export function redimensionarJanelas(arrumacao, c, j, delta) {
  const a = copiar(arrumacao);
  const [x, y] = [a.colunas[c].janelas[j], a.colunas[c].janelas[j + 1]];
  const d = Math.max(MIN_ALTURA - x.altura, Math.min(delta, y.altura - MIN_ALTURA));
  x.altura += d;
  y.altura -= d;
  return a;
}

// ---------- DOM ----------
const CHAVE = CHAVES.janelas;
const SETAS = { cima: '↑', baixo: '↓', esquerda: '←', direita: '→' };
const NOMES = {
  cima: (janela) => t('Mover {janela} para cima', { janela }),
  baixo: (janela) => t('Mover {janela} para baixo', { janela }),
  esquerda: (janela) => t('Mover {janela} para a esquerda', { janela }),
  direita: (janela) => t('Mover {janela} para a direita', { janela }),
};

/**
 * Monta as janelas. `janelas`: { id: { titulo, corpo (elemento) } }. Os corpos são movidos, nunca recriados
 * (o editor e o terminal continuam como estavam).
 */
export function montarJanelas(raiz, janelas, { aoMudar } = {}) {
  const ids = Object.keys(janelas);
  let arrumacao = normalizar(ler(CHAVE), ids);
  const quadros = {};
  for (const id of ids) {
    const q = document.createElement('section');
    q.className = 'janela';
    q.dataset.janela = id;
    q.setAttribute('aria-labelledby', `janela-${id}`);
    q.innerHTML = `
      <header class="janela-topo">
        <span class="alca" aria-hidden="true" title="${t('Arraste para mudar de lugar')}">⠿</span>
        <h2 id="janela-${id}">${escapar(janelas[id].titulo)}</h2>
        <span class="janela-mover">${Object.entries(SETAS).map(([d, s]) => `<button type="button" class="mini" data-mover="${d}" aria-label="${NOMES[d](escapar(janelas[id].titulo))}">${s}</button>`).join('')}</span>
      </header>`;
    const corpo = document.createElement('div');
    corpo.className = 'janela-corpo';
    corpo.append(janelas[id].corpo);
    q.append(corpo);
    quadros[id] = q;
  }
  raiz.classList.add('janelas');

  function desenhar() {
    raiz.replaceChildren();
    arrumacao.colunas.forEach((col, c) => {
      if (c > 0) raiz.append(divisor('vertical', c - 1, t('Largura entre as colunas {a} e {b}', { a: c, b: c + 1 }), arrumacao.colunas[c - 1].largura));
      const coluna = document.createElement('div');
      coluna.className = 'coluna';
      coluna.style.flexBasis = `${col.largura}%`;
      col.janelas.forEach((j, i) => {
        if (i > 0) coluna.append(divisor('horizontal', i - 1, t('Altura entre {a} e {b}', { a: janelas[col.janelas[i - 1].id].titulo, b: janelas[j.id].titulo }), col.janelas[i - 1].altura, c));
        quadros[j.id].style.flexBasis = `${j.altura}%`;
        coluna.append(quadros[j.id]);
      });
      raiz.append(coluna);
    });
  }

  function mudar(nova, { salvar = true } = {}) {
    arrumacao = nova;
    if (salvar) gravar(CHAVE, arrumacao);
    desenhar();
    aoMudar?.();
  }

  // Divisores: arrastar (mouse, toque ou caneta) ou setas do teclado.
  function divisor(orientacao, i, rotulo, valor, c) {
    const d = document.createElement('div');
    d.className = `divisor divisor-${orientacao === 'vertical' ? 'v' : 'h'}`;
    d.setAttribute('role', 'separator');
    d.setAttribute('aria-orientation', orientacao);
    d.setAttribute('aria-label', rotulo);
    d.setAttribute('aria-valuenow', String(Math.round(valor)));
    d.setAttribute('aria-valuemin', '0');
    d.setAttribute('aria-valuemax', '100');
    d.tabIndex = 0;
    const aplicar = (delta) => (orientacao === 'vertical' ? redimensionarColunas(arrumacao, i, delta) : redimensionarJanelas(arrumacao, c, i, delta));
    d.addEventListener('keydown', (e) => {
      const passo = { ArrowLeft: -2, ArrowUp: -2, ArrowRight: 2, ArrowDown: 2 }[e.key];
      if (!passo) return;
      e.preventDefault();
      mudar(aplicar(passo));
      raiz.querySelectorAll('.divisor')[indiceDivisor(orientacao, i, c)]?.focus();
    });
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      d.setPointerCapture(e.pointerId);
      const inicio = orientacao === 'vertical' ? e.clientX : e.clientY;
      const tamanho = orientacao === 'vertical' ? raiz.clientWidth : d.parentElement.clientHeight;
      const base = arrumacao;
      d.classList.add('arrastando');
      const mover = (ev) => {
        arrumacao = orientacao === 'vertical'
          ? redimensionarColunas(base, i, (((ev.clientX - inicio) / tamanho) * 100))
          : redimensionarJanelas(base, c, i, (((ev.clientY - inicio) / tamanho) * 100));
        // Só ajusta os tamanhos (sem redesenhar) enquanto arrasta.
        raiz.querySelectorAll(':scope > .coluna').forEach((col, k) => { col.style.flexBasis = `${arrumacao.colunas[k].largura}%`; });
        for (const col of arrumacao.colunas) for (const j of col.janelas) quadros[j.id].style.flexBasis = `${j.altura}%`;
      };
      const fim = () => {
        d.removeEventListener('pointermove', mover);
        d.classList.remove('arrastando');
        mudar(arrumacao);
      };
      d.addEventListener('pointermove', mover);
      d.addEventListener('pointerup', fim, { once: true });
      d.addEventListener('pointercancel', fim, { once: true });
    });
    return d;
  }

  const indiceDivisor = (orientacao, i, c) => {
    // A posição do divisor na lista de todos os divisores, para devolver o foco a ele depois de redesenhar.
    let n = 0;
    for (let k = 0; k < arrumacao.colunas.length; k++) {
      if (k > 0) {
        if (orientacao === 'vertical' && k - 1 === i) return n;
        n++;
      }
      for (let j = 1; j < arrumacao.colunas[k].janelas.length; j++) {
        if (orientacao === 'horizontal' && k === c && j - 1 === i) return n;
        n++;
      }
    }
    return 0;
  };

  // Botões de mover (teclado e mouse).
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mover]');
    if (!b) return;
    const id = b.closest('.janela').dataset.janela;
    mudar(mover(arrumacao, id, b.dataset.mover, ids));
    quadros[id].querySelector(`[data-mover="${b.dataset.mover}"]`).focus();
  });

  // Arrastar a janela pelo topo: solta antes/depois de outra janela, ou numa coluna nova ao lado.
  const marca = document.createElement('div');
  marca.className = 'marca-soltar';
  marca.hidden = true;
  document.body.append(marca);
  raiz.addEventListener('pointerdown', (e) => {
    const topo = e.target.closest('.janela-topo');
    if (!topo || e.target.closest('button') || e.button !== 0) return;
    const id = topo.closest('.janela').dataset.janela;
    let alvo = null;
    let arrastou = false;
    const x0 = e.clientX;
    const y0 = e.clientY;
    topo.setPointerCapture(e.pointerId);
    const mexer = (ev) => {
      if (!arrastou && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      arrastou = true;
      quadros[id].classList.add('arrastada');
      const sob = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.classList?.contains('janela') && el.dataset.janela !== id);
      if (!sob) {
        alvo = null;
        marca.hidden = true;
        return;
      }
      const r = sob.getBoundingClientRect();
      const fx = (ev.clientX - r.left) / r.width;
      const fy = (ev.clientY - r.top) / r.height;
      const lado = fx < 0.2 ? 'esquerda' : fx > 0.8 ? 'direita' : fy < 0.5 ? 'antes' : 'depois';
      alvo = { id: sob.dataset.janela, lado };
      Object.assign(marca.style, {
        left: `${lado === 'direita' ? r.right - r.width * 0.2 : r.left}px`,
        top: `${lado === 'depois' ? r.top + r.height / 2 : r.top}px`,
        width: `${lado === 'esquerda' || lado === 'direita' ? r.width * 0.2 : r.width}px`,
        height: `${lado === 'antes' || lado === 'depois' ? r.height / 2 : r.height}px`,
      });
      marca.hidden = false;
    };
    const fim = () => {
      topo.removeEventListener('pointermove', mexer);
      marca.hidden = true;
      quadros[id].classList.remove('arrastada');
      if (arrastou && alvo) mudar(soltar(arrumacao, id, alvo.id, alvo.lado, ids));
    };
    topo.addEventListener('pointermove', mexer);
    topo.addEventListener('pointerup', fim, { once: true });
    topo.addEventListener('pointercancel', fim, { once: true });
  });

  desenhar();
  return {
    restaurar: () => mudar(normalizar(ARRUMACAO_PADRAO, ids)),
    get arrumacao() {
      return arrumacao;
    },
    destruir: () => marca.remove(),
  };
}
