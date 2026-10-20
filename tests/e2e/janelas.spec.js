// Janelas: mudar de lugar (botões e arrastando), mudar de tamanho (arrastando e teclado) e lembrar.
import { test, expect } from '@playwright/test';

const ordem = (page) => page.locator('.ex-janelas > .coluna').evaluateAll((cols) => cols.map((c) => [...c.querySelectorAll(':scope > .janela')].map((j) => j.dataset.janela)));

test('mover, arrastar, redimensionar e lembrar a arrumação', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('#/livre');
  await expect.poll(() => ordem(page)).toEqual([['missao', 'cluster'], ['arquivos', 'terminal']]);

  // Terminal em cima, arquivos embaixo (pelo botão, que também serve ao teclado).
  await page.getByRole('button', { name: 'Mover Terminal para cima' }).click();
  await expect.poll(() => ordem(page)).toEqual([['missao', 'cluster'], ['terminal', 'arquivos']]);

  // Arrastar a janela Cluster pelo topo até a borda direita do Terminal: vira uma coluna nova.
  const topo = page.locator('[data-janela=cluster] .janela-topo h2');
  const alvo = await page.locator('[data-janela=terminal]').boundingBox();
  const de = await topo.boundingBox();
  await page.mouse.move(de.x + 10, de.y + 5);
  await page.mouse.down();
  await page.mouse.move(alvo.x + alvo.width - 10, alvo.y + alvo.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['terminal', 'arquivos'], ['cluster']]);

  // Mudar a largura arrastando o divisor e pelo teclado.
  const primeira = page.locator('.ex-janelas > .coluna').first();
  const antes = (await primeira.boundingBox()).width;
  const div = page.locator('.divisor-v').first();
  const d = await div.boundingBox();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + 140, d.y + d.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await primeira.boundingBox()).width).toBeGreaterThan(antes + 100);
  const valor = Number(await page.locator('.divisor-v').first().getAttribute('aria-valuenow'));
  await page.locator('.divisor-v').first().focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.divisor-v').first()).toHaveAttribute('aria-valuenow', String(valor - 2));

  // A arrumação fica salva e o editor e o terminal continuam funcionando.
  await page.reload();
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['terminal', 'arquivos'], ['cluster']]);
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill('kubectl apply -f .');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('deployment.apps/nginx created');

  await page.getByRole('button', { name: '🪟 Arrumação padrão' }).click();
  await expect.poll(() => ordem(page)).toEqual([['missao', 'cluster'], ['arquivos', 'terminal']]);
});
