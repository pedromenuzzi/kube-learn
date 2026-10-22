// As missões resolvidas com helm e git, pelo terminal de verdade da tela (o teste da trilha chama o simulador direto e
// não pega um terminal que recusa o comando).
import { test, expect } from '@playwright/test';
import { ITENS } from '../../src/conteudo/index.js';

const MISSOES = ITENS.filter((i) => (i.solucaoTerminal ?? []).some((l) => /^(helm|git)\b/.test(l)));

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

for (const item of MISSOES) {
  test(`${item.id}: resolvida pelo terminal (${item.solucaoTerminal[0].split(' ').slice(0, 2).join(' ')})`, async ({ page }) => {
    await page.goto(`#/ex/${item.id}`);
    if (Object.keys(item.solucao ?? {}).length && JSON.stringify(item.solucao) !== JSON.stringify(item.inicial)) {
      await page.getByRole('tab', { name: 'Solução' }).click();
      await page.getByRole('button', { name: 'Ver a solução' }).click();
      await page.getByRole('button', { name: 'Copiar para o editor' }).click();
    }
    const terminal = page.locator('input.term-entrada');
    for (const linha of item.solucaoTerminal) {
      await terminal.fill(linha);
      await terminal.press('Enter');
      await expect(page.locator('.term-saida')).not.toContainText('command not found');
    }
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '+30s' }).click();
    if (typeof item.respostaCerta === 'string') await page.locator('#resposta-aluno').fill(item.respostaCerta);
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
  });
}
