// O kubectl edit no Playground: o editor abre num diálogo, salvar aplica a mudança, Esc desiste, e o foco volta ao terminal.
import { test, expect } from '@playwright/test';

test('kubectl edit: muda as réplicas no editor, salva, e o get mostra o número novo', async ({ page }) => {
  await page.goto('#/livre');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  const saida = page.locator('.term-saida');
  await expect(saida).toContainText('deployment.apps/nginx created');
  const terminal = page.locator('input.term-entrada');
  await terminal.fill('kubectl edit deployment nginx');
  await terminal.press('Enter');
  const dialogo = page.getByRole('dialog', { name: 'kubectl edit deployment.apps/nginx' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator('.cm-content')).toBeFocused();
  await expect(dialogo).toContainText('# Please edit the object below.');
  await dialogo.locator('.cm-line', { hasText: /^ {2}replicas: 2$/ }).first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('4');
  await dialogo.getByRole('button', { name: /Salvar e sair/ }).click();
  await expect(dialogo).toBeHidden();
  await expect(saida).toContainText('deployment.apps/nginx edited');
  await expect(terminal).toBeFocused();
  await terminal.fill('kubectl get deploy');
  await terminal.press('Enter');
  await expect(saida.locator('pre').last()).toContainText(/nginx\s+\d\/4/);

  // Esc sai sem salvar (o :q! do vim): nada muda.
  await terminal.fill('kubectl edit deploy/nginx');
  await terminal.press('Enter');
  await expect(dialogo).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(saida).toContainText('Edit cancelled, no changes made.');
  await expect(terminal).toBeFocused();
});

test('kubectl edit: o erro reabre o editor com o motivo no topo; Ctrl+S salva o conserto', async ({ page }) => {
  await page.goto('#/livre');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  const terminal = page.locator('input.term-entrada');
  await terminal.fill('kubectl edit deployment nginx');
  await terminal.press('Enter');
  const dialogo = page.getByRole('dialog', { name: 'kubectl edit deployment.apps/nginx' });
  await dialogo.locator('.cm-line', { hasText: /^ {2}replicas: 2$/ }).first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('-1');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.term-saida')).toContainText('error: deployments.apps "nginx" is invalid');
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText('# * spec.replicas: Invalid value: -1: must be greater than or equal to 0');
  await expect(dialogo.locator('.cm-content')).toBeFocused();
  await dialogo.locator('.cm-line', { hasText: /^ {2}replicas: -1$/ }).first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('3');
  await page.keyboard.press('Control+s');
  await expect(dialogo).toBeHidden();
  await expect(page.locator('.term-saida')).toContainText('deployment.apps/nginx edited');
});
