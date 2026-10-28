// Lição e quiz com um próximo passo só, e a tela da missão usável só com o teclado (a alça das janelas, a dica do
// editor, o recuo das linhas quebradas e o placar do topo para o leitor de tela).
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';
import { ITENS, NIVEIS } from '../../src/conteudo/index.js';

const placar = (page, nome) => expect(page.locator('.placar-topo')).toHaveAccessibleName(nome);
const alternativaCerta = (id) => ITENS.find((i) => i.id === id).alternativas.findIndex((a) => a.certa);
const ordem = (page) => page.locator('.ex-janelas > .coluna').evaluateAll((cols) => cols.map((c) => [...c.querySelectorAll(':scope > .janela')].map((j) => j.dataset.janela)));

test('nível 0 só com o teclado: lição → quiz → lição, com o XP no topo a cada passo', async ({ page }) => {
  await page.goto('#/ex/n0-funciona-na-minha-maquina');
  await placar(page, '0 XP, 0 dias seguidos de estudo');
  // Um botão principal só, que marca a lição como lida e abre a próxima.
  const acoes = page.locator('.leitura-acoes');
  await expect(acoes.locator('.botao, .botao-secundario')).toHaveCount(1);
  const lida = acoes.getByRole('link', { name: /^Lida · Próxima: / });
  await lida.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/ex\/n0-quiz-vm$/);
  await placar(page, '5 XP, 1 dia seguido de estudo');

  // O quiz: errou, o foco fica no formulário; acertou, vai para a próxima, que vira o botão principal.
  const alternativas = page.locator('.alternativa input');
  const responder = async (n) => {
    await alternativas.nth(n).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Responder' })).toBeFocused();
    await page.keyboard.press('Enter');
  };
  await responder((alternativaCerta('n0-quiz-vm') + 1) % 2);
  await expect(page.locator('.quiz-retorno')).toContainText('Ainda não');
  await expect(page.getByRole('button', { name: 'Responder' })).toBeFocused();
  await responder(alternativaCerta('n0-quiz-vm'));
  await expect(page.locator('.quiz-retorno')).toContainText('Certo! +5 XP');
  const proxima = page.locator('.leitura-acoes .proxima');
  await expect(proxima).toBeFocused();
  await expect(proxima).toHaveClass(/\bbotao\b/);
  await placar(page, '10 XP, 1 dia seguido de estudo');

  // Responder de novo um quiz já resolvido não soma XP (nem diz que somou).
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('.quiz-retorno')).toContainText('Certo! (Você já tinha acertado este.)');
  await expect(page.locator('.quiz-retorno')).not.toContainText('XP');
  await placar(page, '10 XP, 1 dia seguido de estudo');

  await proxima.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/ex\/n0-imagem-e-conteiner$/);
  await expect(page.locator('.leitura-acoes').getByRole('link', { name: /^Lida · Próxima: / })).toBeVisible();

  // A lição já lida não soma de novo: a próxima é o botão principal, sem o "Lida ·".
  await page.goto('#/ex/n0-funciona-na-minha-maquina');
  await expect(page.locator('.ex-topo')).toContainText('Lida');
  await expect(page.locator('.leitura-acoes .botao')).toHaveText(/^\s*Próxima: /);
  await placar(page, '10 XP, 1 dia seguido de estudo');

  // O placar: o nome vem do texto (sem aria-label), e o axe não acusa diferença entre o que se vê e o que se ouve.
  await expect(page.locator('.placar-topo')).not.toHaveAttribute('aria-label');
  const r = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
  expect(r.violations).toEqual([]);
});

test('no celular, acertar o quiz leva o foco à próxima sem esconder o "Certo!" embaixo do topo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // rolagem na hora: a posição medida já é a final
  for (const id of ['n0-quiz-vm', 'n3-quiz-sorteio', 'n4-quiz-aviso-mudou']) {
    await page.goto(`#/ex/${id}`);
    await page.locator('.alternativa input').nth(alternativaCerta(id)).check();
    await page.getByRole('button', { name: 'Responder' }).click();
    await expect(page.locator('.quiz-retorno')).toContainText('Certo!');
    // O retorno começa abaixo do topo fixo e dentro da tela.
    const { topo, retorno, altura } = await page.evaluate(() => ({
      topo: document.querySelector('.topo').getBoundingClientRect().bottom,
      retorno: document.querySelector('.quiz-retorno').getBoundingClientRect().top,
      altura: innerHeight,
    }));
    expect(retorno, id).toBeGreaterThanOrEqual(topo);
    expect(retorno, id).toBeLessThan(altura);
    await expect(page.locator('.leitura-acoes .proxima')).toBeFocused();
  }
});

// Nível 0 com 9 de 14 itens (5 dos 8 quizzes, 62%, logo abaixo dos 70%). Abre o nível 1, com a faixa embaixo do
// topo: acertar mais um quiz do nível 0 ou ler a primeira lição do nível 1 (a trilha abre o nível em que o aluno mexeu).
// 6 das 10 missões do nível 0 (as lições não contam): o n0-quiz-partes leva a 70%.
const N0_QUASE = NIVEIS[0].itens.filter((i) => i.tipo !== 'licao' && i.id !== 'n0-quiz-partes').slice(0, 6).map((i) => i.id);
const medir = (page) => page.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const nav = document.querySelector('.nav');
  return { topo: r('.topo').bottom, faixa: r('.festa-faixa')?.bottom ?? 0, retorno: r('.quiz-retorno').top, proxima: r('.leitura-acoes .proxima').bottom, altura: innerHeight, nav: getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight };
});

/** Responde (ou marca a lição como lida) com o dedo (clique) ou só com o teclado. */
const responder = async (page, alternativa, teclado) => {
  const alvo = alternativa ? page.getByRole('radio', { name: alternativa }) : page.locator('.leitura-acoes').getByRole('link', { name: /^Lida · Próxima: / });
  if (!teclado) {
    await (alternativa ? alvo.check() : alvo.click());
    if (alternativa) await page.getByRole('button', { name: 'Responder' }).click();
    return;
  }
  await alvo.focus();
  if (alternativa) {
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Responder' })).toBeFocused();
  }
  await page.keyboard.press('Enter');
};

// Com o dedo, não há anel de foco: o retorno fica inteiro abaixo da faixa. Pelo teclado, a próxima (com o foco) fica
// acima da barra de abas, mesmo que o retorno tenha de subir um pouco.
for (const teclado of [false, true]) {
  for (const [id, alternativa] of [['n1-licao-condominio', null], ['n0-quiz-partes', 'ghcr.io']]) {
    test(`390x664, ${teclado ? 'teclado' : 'dedo'}: ${id} abre o nível 1 e a faixa não cobre o retorno`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 664 });
      await page.emulateMedia({ reducedMotion: 'reduce' }); // rolagem na hora: a posição medida já é a final
      await page.addInitScript((ids) => {
        if (sessionStorage.getItem('semeado')) return;
        sessionStorage.setItem('semeado', '1');
        localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(ids.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
      }, N0_QUASE);
      await page.goto(`#/ex/${id}`);
      await responder(page, alternativa, teclado);
      await expect(page.locator('.festa-faixa')).toContainText('Nível 1 desbloqueado');
      await expect(page.locator('.leitura-acoes .proxima')).toBeFocused();
      const m = await medir(page);
      if (teclado) {
        expect(m.proxima).toBeLessThanOrEqual(m.nav);
        expect(m.retorno).toBeLessThan(m.nav);
      } else {
        expect(m.retorno).toBeGreaterThanOrEqual(m.faixa);
        expect(m.retorno).toBeLessThan(m.altura);
      }
    });
  }
}

test.describe('1280 px a 200%', () => {
  test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  test('640x400: acertar o quiz pelo teclado deixa a próxima, com o foco, acima da barra de abas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('#/ex/n0-quiz-vm');
    await responder(page, ITENS.find((i) => i.id === 'n0-quiz-vm').alternativas[alternativaCerta('n0-quiz-vm')].texto, true);
    await expect(page.locator('.quiz-retorno')).toContainText('Certo!');
    await expect(page.locator('.leitura-acoes .proxima')).toBeFocused();
    const m = await medir(page);
    expect(m.proxima).toBeLessThanOrEqual(m.nav);
    expect(m.retorno).toBeLessThan(m.nav);
  });
});

test('a lição que abre um nível mostra a faixa inteira e não sai da página', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: 'claro', texto: '100', movimento: 'reduzido' })));
  // Nível 1 ainda fechado: ler uma lição dele o abre (a trilha abre o nível em que o aluno já mexeu).
  await page.goto('#/ex/n1-licao-condominio');
  const lida = page.locator('.leitura-acoes').getByRole('link', { name: /^Lida · Próxima: / });
  await lida.click();
  await expect(page.locator('.festa-faixa')).toContainText('Nível 1 desbloqueado');
  await expect(page).toHaveURL(/#\/ex\/n1-licao-condominio$/);
  await expect(page.locator('.quiz-retorno')).toContainText('+5 XP');
  const proxima = page.locator('.leitura-acoes .proxima');
  await expect(proxima).toHaveText(/^\s*Próxima: /);
  await expect(proxima).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/ex\/n1-licao-pod-yaml$/);
});

test('missão pelo teclado: o editor logo no começo do Tab, a alça move a janela e o editor diz como sair', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('#/ex/n0-primeiro-pod');
  const conteudo = page.locator('.ex-editor .cm-content');
  await expect(conteudo).toBeVisible();

  // Do começo do conteúdo até o editor, sem passar pelos botões ↑ ↓ ← →.
  await page.locator('#conteudo').focus();
  const paradas = [];
  for (let i = 0; i < 30 && !(await conteudo.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
    paradas.push(await page.evaluate(() => document.activeElement.getAttribute('aria-label') ?? document.activeElement.textContent.trim().slice(0, 40)));
  }
  await expect(conteudo).toBeFocused();
  expect(paradas.filter((p) => /^Mover .* para /.test(p))).toEqual([]);
  expect(paradas.length).toBeLessThanOrEqual(16); // eram 22

  // A alça: uma parada por janela, e as setas mudam a janela de lugar.
  const alca = page.getByRole('button', { name: 'Mover a janela Missão' });
  // A alça não herda o esmaecido dos botões ↑ ↓ ← → (o ⠿ e o anel de foco ficam com o contraste inteiro).
  expect(await alca.evaluate((b) => [getComputedStyle(b.parentElement).opacity, getComputedStyle(b).opacity])).toEqual(['1', '1']);
  await alca.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => ordem(page)).toEqual([['missao', 'arquivos', 'paineis']]);
  await expect(alca).toBeFocused();
  await page.keyboard.press('Control+ArrowLeft'); // com modificador, a tecla é do navegador
  await expect.poll(() => ordem(page)).toEqual([['missao', 'arquivos', 'paineis']]);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['arquivos', 'paineis']]);

  // A dica do editor está à mostra e é a descrição dele; Tab recua, Esc e depois Tab sai.
  await expect(conteudo).toHaveAccessibleDescription('Tab recua · Esc e depois Tab sai do editor');
  await expect(page.locator('.ex-editor .cm-dica')).toBeVisible();
  await conteudo.click();
  await page.keyboard.press('Tab');
  await expect(conteudo).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(conteudo).not.toBeFocused();
});

test('no celular, a continuação de uma linha quebrada fica recuada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/ex/n0-primeiro-pod');
  await page.locator('.ex-editor').scrollIntoViewIfNeeded(); // empilhadas, o editor fica abaixo da missão
  const linha = page.locator('.ex-editor .cm-line', { hasText: 'image: nginx:1.27' });
  await expect(linha).toBeVisible();
  const { recuo, ch, linhas } = await linha.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((x) => x.width);
    const topos = [...new Set(rects.map((x) => Math.round(x.top)))].sort((a, b) => a - b);
    const esquerda = (topo) => Math.min(...rects.filter((x) => Math.round(x.top) === topo).map((x) => x.left));
    const c = document.createElement('canvas').getContext('2d');
    c.font = getComputedStyle(el).font;
    return { recuo: esquerda(topos[1]) - esquerda(topos[0]), ch: c.measureText('0').width, linhas: topos.length };
  });
  expect(linhas).toBeGreaterThan(1);
  // "    image: ..." tem 4 espaços de recuo: a continuação começa 2 colunas depois deles, na coluna 6.
  expect(recuo / ch).toBeCloseTo(6, 0);
});
