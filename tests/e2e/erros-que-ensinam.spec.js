// O YAML pela metade e o campo com nome errado viram explicação na tela da missão (nunca "erro interno do simulador"),
// em português e em inglês.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

/** Troca o arquivo aberto no editor por este texto (como colar por cima de tudo). */
async function escrever(page, texto) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(texto);
}

const POD = (containers) => `apiVersion: v1\nkind: Pod\nmetadata:\n  name: recepcao\nspec:\n${containers}`;

test('campo com nome errado: a caixa diz qual é o certo, em português e em inglês', async ({ page }) => {
  await page.goto('#/ex/n1-primeiro-pod');
  await escrever(page, POD('  container:\n  - name: web\n    image: nginx:1.27\n'));
  await page.getByRole('button', { name: 'Aplicar' }).click();
  const caixa = page.locator('.term-caixa').last();
  await expect(caixa).toContainText('O Kubernetes não conhece o campo spec.container');
  await expect(caixa).toContainText('Você quis dizer containers?');
  await expect(caixa).not.toContainText('unknown field');

  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.term-caixa').last()).toContainText('Did you mean containers?');
});

test('um `-` ainda sem nada em containers: Required value no terminal, sem erro interno', async ({ page }) => {
  await page.goto('#/ex/n1-primeiro-pod');
  await escrever(page, POD('  containers:\n  -\n'));
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.term-erro').last()).toContainText('spec.containers[0].name: Required value');
  await expect(page.locator('.term-erro').last()).toContainText('spec.containers[0].image: Required value');
  await expect(page.locator('.term-saida')).not.toContainText('erro interno');
});

test('LimitRange com `limits:` vazio: o Entregar mostra o resultado dos testes', async ({ page }) => {
  await page.goto('#/ex/n6-regras-padrao');
  await escrever(page, 'apiVersion: v1\nkind: LimitRange\nmetadata:\n  name: padrao\n  namespace: compras\nspec:\n  limits:\n');
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('#lado-testes')).toContainText(/0 de 1 teste/);
  await expect(page.locator('.term-saida')).not.toContainText('erro interno');
});
