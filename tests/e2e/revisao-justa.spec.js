// A Revisão do dia só cobra o que a trilha já ensinou, marca a resposta certa (com texto, não só cor), atravessa a troca
// de idioma no meio da sessão e, feita a sessão, não traz termo novo nem fica cobrando na aba.
import { test, expect } from '@playwright/test';

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
