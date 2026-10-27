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

test('um console.error logo depois do último passo também falha o teste', async ({ page }) => {
  test.fail();
  await page.goto('#/');
  await page.evaluate(() => setTimeout(() => console.error('erro tardio'), 50));
});

test('o erro que outro spec permite não passa aqui', async ({ page }) => {
  test.fail();
  await page.goto('#/');
  await page.evaluate(() => console.error(new Error('defeito de propósito')));
});

test.describe('com o erro permitido', () => {
  test.use({ errosPermitidos: [/erro esperado/] }); // a prova de que a permissão vale onde o spec a liga
  test('o console.error permitido não falha o teste', async ({ page }) => {
    await page.goto('#/');
    await page.evaluate(() => console.error('erro esperado'));
  });
});
