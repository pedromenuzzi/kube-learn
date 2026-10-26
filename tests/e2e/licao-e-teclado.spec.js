// Lição e quiz com um próximo passo só, e a tela da missão usável só com o teclado (a alça das janelas, a dica do
// editor, o recuo das linhas quebradas e o placar do topo para o leitor de tela).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ITENS } from '../../src/conteudo/index.js';

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
  await alca.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => ordem(page)).toEqual([['missao', 'arquivos', 'paineis']]);
  await expect(alca).toBeFocused();
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
