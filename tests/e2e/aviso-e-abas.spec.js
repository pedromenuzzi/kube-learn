// A tela da missão pelo teclado: fechar o aviso (ou ele sumir sozinho) devolve o foco ao botão que o pediu, e a aba
// escolhida fica inteira à vista na faixa de abas do celular.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

test('fechar o aviso pelo teclado devolve o foco ao botão que o pediu', async ({ page }) => {
  await page.goto('#/ex/n0-primeiro-pod');
  const fechar = page.getByRole('button', { name: 'Fechar o aviso' });
  await page.locator('[data-acao=entregar]').click(); // falha: nada aplicado ainda
  await expect(page.locator('.ex-aviso')).not.toBeEmpty();
  await fechar.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ex-aviso')).toBeEmpty();
  await expect(page.locator('[data-acao=entregar]')).toBeFocused();
  // Pelo atalho, o aviso é do Entregar (e não do +30s, o último botão clicado).
  await page.getByRole('button', { name: '+30s' }).click();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(page.locator('.ex-aviso')).not.toContainText('30');
  await fechar.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-acao=entregar]')).toBeFocused();
});

test('o aviso que some sozinho com o foco nele devolve o foco ao +30s', async ({ page }) => {
  await page.goto('#/ex/n0-primeiro-pod');
  await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Fechar o aviso' }).focus();
  await expect(page.locator('.ex-aviso')).toBeEmpty({ timeout: 8000 });
  await expect(page.getByRole('button', { name: '+30s' })).toBeFocused();
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const inteira = (aba) => aba.evaluate((a) => {
    const faixa = a.parentElement.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    return r.left >= faixa.left - 0.5 && r.right <= faixa.right + 0.5;
  });

  test('a aba escolhida (pelo Entregar ou pelas setas) fica inteira na faixa de abas', async ({ page }) => {
    await page.goto('#/ex/kubectl-escalar');
    const missao = page.locator('#lado-aba-missao');
    const testes = page.locator('#lado-aba-testes');
    await page.locator('[data-acao=entregar]').click(); // falha e abre a aba Testes
    await expect(testes).toHaveAttribute('aria-selected', 'true');
    expect(await inteira(testes)).toBe(true);
    await missao.click();
    expect(await inteira(missao)).toBe(true);
    await page.keyboard.press('End');
    await expect(testes).toBeFocused();
    expect(await inteira(testes)).toBe(true);
    await page.keyboard.press('Home');
    await expect(missao).toBeFocused();
    expect(await inteira(missao)).toBe(true);
  });
});
