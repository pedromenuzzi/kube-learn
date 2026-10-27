// A Oficina do kubectl: o exercício contra o relógio guarda o recorde e mostra na lista.
import { test, expect } from '@playwright/test';

test('resolver um exercício da oficina vira recorde, e a lista mostra o tempo', async ({ page }) => {
  await page.goto('#/oficina');
  await expect(page.getByRole('heading', { name: 'Oficina do kubectl' })).toBeVisible();
  await expect(page.locator('ol.oficina li').first()).toContainText('Sem recorde ainda');
  await page.getByRole('link', { name: /Um ramal num comando/ }).click();
  await expect(page.locator('.chip-meta')).toContainText('Meta: 0:35');
  const terminal = page.locator('input.term-entrada');
  await terminal.fill('kubectl expose deployment loja --type=NodePort --port=80 --target-port=8080');
  await terminal.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('service/loja exposed');
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText(/^(Ouro|Prata|Bronze)! Feito em \d+:\d\d\./);
  await expect(page.locator('.ex-aviso').getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar à Oficina' }).click();
  await expect(page.locator('ol.oficina li', { hasText: 'Um ramal num comando' })).toContainText(/Meta: 0:35 · (Ouro|Prata|Bronze) · Recorde: \d+:\d\d/);
});
