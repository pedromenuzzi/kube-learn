// A Revisão do dia só cobra o que a trilha já ensinou, marca a resposta certa (com texto, não só cor), atravessa a troca
// de idioma no meio da sessão e, feita a sessão, não traz termo novo nem fica cobrando na aba.
import { test, expect } from './base.js';

const comProgresso = (page, ids) => page.addInitScript((lista) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(lista.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
}, ids);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00')); // o sorteio dos cartões é pelo dia
});

test('só o primeiro pod: nenhum cartão ainda (Registry e Tag vêm depois da lição deles)', async ({ page }) => {
  await comProgresso(page, ['n0-primeiro-pod']);
  await page.goto('#/revisao');
  await expect(page.getByText('Ainda não há cartões')).toBeVisible();
  await expect(page.locator('.nav .contagem')).toBeHidden();
});

test('a sessão atravessa a troca de idioma, marca a certa e, feita, não volta a cobrar', async ({ page }) => {
  // nível 0 até o quiz das tags (4 termos) e a 1ª lição do nível 1 (10 termos): uma sessão de 10
  await comProgresso(page, ['n0-quiz-latest', 'n1-licao-condominio']);
  await page.goto('#/revisao');
  await expect(page.locator('.nav .contagem')).toContainText('10');
  let errou = false;
  for (let n = 1; n <= 10; n++) {
    if (n === 4) {
      await expect(page.getByText('Cartão 4 de 10')).toBeVisible();
      await page.getByRole('button', { name: 'EN' }).click();
      await expect(page.getByText('Card 4 of 10')).toBeVisible();
    }
    const opcoes = page.locator('.cartao-revisao input[type=radio]');
    await opcoes.nth(n % 2 ? 0 : (await opcoes.count()) - 1).check();
    await page.locator('.cartao-revisao button[type=submit]').click();
    await expect(page.locator('.alternativa.certa')).toHaveCount(1);
    const pt = n < 4;
    await expect(page.locator('.alternativa.certa')).toContainText(`✓ ${pt ? 'resposta certa' : 'right answer'}`);
    if (await page.locator('.alternativa.errada').count()) {
      errou = true;
      await expect(page.locator('.alternativa.errada')).toContainText(`✗ ${pt ? 'sua resposta' : 'your answer'}`);
      // o leitor de tela ouve o texto (o ✓ e o ✗ são enfeite)
      await expect(page.getByRole('radio', { name: pt ? /, sua resposta$/ : /, your answer$/ })).toHaveCount(1);
      await expect(page.getByRole('radio', { name: pt ? /, resposta certa$/ : /, right answer$/ })).toHaveCount(1);
    }
    await page.locator('[data-proximo]').click();
  }
  expect(errou).toBe(true);
  await expect(page.getByText(/Review done: \d+ of 10 right\./)).toBeVisible();

  // Reabrir: nada de termo novo; a aba e o painel Hoje dizem que está em dia.
  await page.getByRole('link', { name: 'Back to the path' }).click();
  await page.goto('#/revisao');
  await expect(page.getByText('All reviewed for today.')).toBeVisible();
  await expect(page.locator('.nav .contagem')).toBeHidden();
  await page.goto('#/');
  await expect(page.getByText('Daily review all caught up.')).toBeVisible();
});

test('trocar o idioma depois de responder não deixa responder de novo', async ({ page }) => {
  await comProgresso(page, ['n0-quiz-latest', 'n1-licao-condominio']);
  await page.goto('#/revisao');
  await page.locator('.cartao-revisao input[type=radio]').first().check();
  await page.locator('.cartao-revisao button[type=submit]').click();
  await expect(page.locator('.alternativa.certa')).toHaveCount(1);
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByText('Card 1 of 10')).toBeVisible();
  await expect(page.locator('.alternativa.certa')).toContainText('right answer');
  await expect(page.locator('.cartao-revisao button[type=submit]')).toBeDisabled();
  await page.locator('[data-proximo]').click();
  await expect(page.getByText('Card 2 of 10')).toBeVisible();
});

/** A caixa de `el` fica entre o topo e a barra de abas do celular (ou o pé da tela). */
const entreAsBarras = (page, seletor) => page.locator(seletor).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  const nav = document.querySelector('.nav');
  const pe = getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight;
  return r.top >= document.querySelector('.topo').getBoundingClientRect().bottom && r.bottom <= pe;
});

// Cartões ímpares pelo teclado, pares com o dedo (clique). Com o dedo não há anel de foco: as alternativas com o ✓ e o ✗
// vêm primeiro. Pelo teclado, o Próximo (com o foco) fica à vista; no desktop cabem os dois.
for (const tamanho of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`${tamanho.width}x${tamanho.height}: a resposta e o cartão novo ficam à vista, e a aba conta junto`, async ({ page }) => {
    await page.setViewportSize(tamanho);
    await page.emulateMedia({ reducedMotion: 'reduce' }); // a rolagem é na hora: a posição medida já é a final
    await comProgresso(page, ['n0-quiz-latest', 'n1-licao-condominio']);
    await page.goto('#/revisao');
    const contagem = page.locator('.nav .contagem');
    await expect(contagem).toContainText('10');
    const proximo = page.locator('[data-proximo]');
    for (let n = 1; n <= 10; n++) {
      const teclado = n % 2 === 1;
      // O cartão novo: "Cartão N de 10" e a pergunta abaixo do topo, com o foco no primeiro rádio.
      await expect(page.locator('.progresso-revisao')).toContainText(`Cartão ${n} de 10`);
      await expect(page.locator('.cartao-revisao input[type=radio]').first()).toBeFocused();
      expect(await entreAsBarras(page, '.progresso-revisao'), `cartão ${n}`).toBe(true);
      expect(await entreAsBarras(page, '.cartao-revisao legend'), `pergunta ${n}`).toBe(true);
      // Responde a 2ª alternativa.
      if (teclado) {
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: 'Responder' })).toBeFocused();
        await page.keyboard.press('Enter');
      } else {
        await page.locator('.cartao-revisao input[type=radio]').nth(1).check();
        await page.getByRole('button', { name: 'Responder' }).click();
      }
      await expect(proximo).toBeFocused();
      if (teclado) expect(await entreAsBarras(page, '[data-proximo]'), `Próximo no cartão ${n}`).toBe(true);
      if (!teclado || tamanho.width > 1000) {
        for (const s of ['.alternativa.certa', '.alternativa.errada']) {
          if (await page.locator(s).count()) expect(await entreAsBarras(page, s), `${s} no cartão ${n}`).toBe(true);
        }
      }
      // A aba Revisão conta junto, sem precisar trocar de página.
      if (n < 10) await expect(contagem).toHaveText(new RegExp(`^${10 - n},`));
      else await expect(contagem).toBeHidden();
      if (teclado) await page.keyboard.press('Enter');
      else await proximo.click();
    }
    await expect(page.getByText(/Revisão feita: \d+ de 10 certos\./)).toBeVisible();
  });
}
