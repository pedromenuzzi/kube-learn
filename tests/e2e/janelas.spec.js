// Janelas: mudar de lugar (botões e arrastando), mudar de tamanho (arrastando e teclado) e lembrar.
import { test, expect } from '@playwright/test';

const ordem = (page) => page.locator('.ex-janelas > .coluna').evaluateAll((cols) => cols.map((c) => [...c.querySelectorAll(':scope > .janela')].map((j) => j.dataset.janela)));

test('mover, arrastar, redimensionar e lembrar a arrumação', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('#/livre');
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['arquivos', 'paineis']]);

  // Terminal em cima, arquivos embaixo (pelo botão, que também serve ao teclado).
  await page.getByRole('button', { name: 'Mover Terminal e cluster para cima' }).click();
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['paineis', 'arquivos']]);

  // Arrastar a janela Missão pelo topo até a borda direita dos Arquivos: vira uma coluna nova à direita.
  const topo = page.locator('[data-janela=missao] .janela-topo h2');
  const alvo = await page.locator('[data-janela=arquivos]').boundingBox();
  const de = await topo.boundingBox();
  await page.mouse.move(de.x + 10, de.y + 5);
  await page.mouse.down();
  await page.mouse.move(alvo.x + alvo.width - 10, alvo.y + alvo.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => ordem(page)).toEqual([['paineis', 'arquivos'], ['missao']]);

  // Mudar a largura arrastando o divisor e pelo teclado.
  const primeira = page.locator('.ex-janelas > .coluna').first();
  const antes = (await primeira.boundingBox()).width;
  const div = page.locator('.divisor-v').first();
  const d = await div.boundingBox();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x - 140, d.y + d.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await primeira.boundingBox()).width).toBeLessThan(antes - 100);
  const valor = Number(await page.locator('.divisor-v').first().getAttribute('aria-valuenow'));
  await page.locator('.divisor-v').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.divisor-v').first()).toHaveAttribute('aria-valuenow', String(valor + 2));

  // A arrumação fica salva; o terminal e o mapa dividem a mesma janela, em abas.
  await page.reload();
  await expect.poll(() => ordem(page)).toEqual([['paineis', 'arquivos'], ['missao']]);
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill('kubectl apply -f .');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('deployment.apps/nginx created');
  await page.getByRole('tab', { name: 'Mapa' }).click();
  await expect(page.locator('.term-saida')).toBeHidden();
  await expect(page.locator('.mapa')).toBeVisible();

  await page.getByRole('button', { name: 'Arrumação padrão' }).click();
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['arquivos', 'paineis']]);
});

// Nenhuma seta visível sem efeito: na ponta da coluna (e sem coluna para ir), ela fica desabilitada.
test('as setas na ponta ficam desabilitadas, no celular e na tela larga', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('#/ex/n0-primeiro-pod');
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['arquivos', 'paineis']]);
  const seta = (nome) => page.getByRole('button', { name: nome });
  await expect(seta('Mover Missão para cima')).toBeDisabled();
  await expect(seta('Mover Missão para baixo')).toBeDisabled();
  await expect(seta('Mover Arquivos para cima')).toBeDisabled();
  await expect(seta('Mover Terminal e cluster para baixo')).toBeDisabled();
  await expect(seta('Mover Arquivos para baixo')).toBeEnabled();
  await seta('Mover Arquivos para baixo').click();
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['paineis', 'arquivos']]);
  await expect(seta('Mover Arquivos para baixo')).toBeDisabled();
  await expect(seta('Mover Arquivos para cima')).toBeEnabled();
  await expect(seta('Mover Arquivos para cima')).toBeFocused(); // a de volta: o foco não cai no body

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.getByRole('button', { name: 'Arrumação padrão' }).click();
  await expect.poll(() => ordem(page)).toEqual([['missao'], ['arquivos', 'paineis']]);
  await expect(seta('Mover Missão para a esquerda')).toBeDisabled(); // sozinha na primeira coluna
  await expect(seta('Mover Missão para a direita')).toBeEnabled();
  await expect(seta('Mover Arquivos para a direita')).toBeEnabled(); // vira a terceira coluna
});
