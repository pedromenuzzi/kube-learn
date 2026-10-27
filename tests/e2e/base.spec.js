// Prova do fixture de base.js: um erro na página faz o teste falhar (test.fail: o vermelho esperado fica verde).
import { test } from './base.js';

test('um throw na página falha o teste', async ({ page }) => {
  test.fail();
  await page.goto('#/');
  await page.evaluate(() => setTimeout(() => { throw new Error('erro forçado'); }));
  await page.waitForTimeout(200);
});

test('um console.error na página falha o teste', async ({ page }) => {
  test.fail();
  await page.goto('#/');
  await page.evaluate(() => console.error('erro forçado'));
});
