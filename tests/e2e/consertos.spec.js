// Os defeitos que a revisão achou, para não voltarem.
import { test, expect } from './base.js';

test('depois de visitar duas missões, um clique abre um diálogo só (os ouvintes saem junto com a missão)', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('#/ex/n3-ramal');
  await expect(page.locator('input.term-entrada')).toBeVisible();
  await page.goto('#/ex/n3-expose');
  await expect(page.locator('input.term-entrada')).toBeVisible();
  await page.getByRole('button', { name: 'Feedback' }).click();
  await expect(page.locator('dialog.feedback')).toHaveCount(1);
});

test('o link de dentro da página leva o foco para o conteúdo novo (o leitor de tela anuncia a página)', async ({ page }) => {
  // (uma lição de nível aberto: a de um nível fechado o abre, e a página fica para a faixa aparecer inteira)
  await page.goto('#/ex/n0-funciona-na-minha-maquina');
  await page.locator('a.proxima').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/ex\/n0-quiz-vm/);
  await expect(page.locator('main#conteudo')).toBeFocused();
});

test('mudar o tema não apaga o idioma escolhido', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('button', { name: 'EN' }).click();
  await page.getByRole('button', { name: 'Accessibility' }).click();
  await page.getByLabel('Dark').check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
});

test('um endereço com escape quebrado mostra a página não encontrada (não fica em branco)', async ({ page }) => {
  await page.goto('#/ex/%');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
