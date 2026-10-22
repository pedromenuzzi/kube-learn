// O Plantão do dia e o Diário de bordo: o chamado de hoje se resolve, a página marca como atendido, e o diário conta.
import { test, expect } from '@playwright/test';

test('o plantão de hoje: abrir, consertar com a solução, entregar, e o diário conta o atendimento', async ({ page }) => {
  await page.goto('#/plantao');
  await expect(page.getByRole('heading', { name: 'Plantão do dia', level: 1 })).toBeVisible();
  await expect(page.locator('ol.plantoes li')).toHaveCount(7);
  await page.locator('ul.chamados h2 a').click();
  await expect(page.locator('input.term-entrada')).toBeVisible();

  // A aba Solução diz o que estava quebrado e traz os arquivos consertados.
  await page.getByRole('tab', { name: 'Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await expect(page.locator('.solucao')).toContainText('O que estava quebrado');
  page.once('dialog', (d) => d.accept()); // "Trocar seus arquivos pela solução?"
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Incidente resolvido');

  await page.getByRole('link', { name: 'Voltar ao Plantão do dia' }).click();
  await expect(page.locator('ul.chamados')).toContainText('Resolvido');
  await expect(page.locator('.nota').first()).toContainText('1 plantão atendido');

  await page.goto('#/diario');
  await expect(page.getByRole('heading', { name: 'Diário de bordo' })).toBeVisible();
  await expect(page.locator('.diario-numeros div', { hasText: 'Plantões atendidos' })).toContainText('1');
  await expect(page.locator('.diario-recentes')).toContainText('Plantão do dia');
  await expect(page.locator('.calendario .cal-semana')).toHaveCount(18);
});

test('o diário de quem ainda não começou convida para a trilha', async ({ page }) => {
  await page.goto('#/diario');
  await expect(page.getByText('O diário começa na primeira missão.')).toBeVisible();
  await expect(page.locator('.diario-numeros div', { hasText: 'Dias de estudo' })).toContainText('0');
});
