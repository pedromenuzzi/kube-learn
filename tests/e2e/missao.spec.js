// Uma missão resolvida de ponta a ponta no navegador: o que define a Fase 2 como pronta.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

test('missão de YAML: copia a solução, aplica, passa nos visíveis e entrega', async ({ page }) => {
  await page.goto('#/ex/deploy-rolling-sem-indisponibilidade');
  await expect(page.getByRole('heading', { name: 'Atualizar sem derrubar ninguém' })).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('kubelearn/loja:1.0');

  await page.getByRole('tab', { name: '💡 Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await expect(page.locator('.cm-content')).toContainText('maxUnavailable: 0');

  await page.getByRole('button', { name: '▶ Aplicar' }).click();
  await expect(page.locator('.term-saida')).toContainText('deployment.apps/loja configured');
  await expect(page.locator('.ex-aviso')).toContainText('Testes visíveis: 1 de 1 passaram');

  await page.getByRole('button', { name: '⬆ Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
  await expect(page.locator('#lado-testes')).toContainText('2 de 2 testes passou');

  // O progresso fica salvo: a lista de missões mostra ✅.
  await page.goto('#/trilha');
  await expect(page.getByRole('link', { name: /✅ Atualizar sem derrubar ninguém/ })).toBeVisible();
});

test('missão de terminal: escala pelo kubectl e entrega', async ({ page }) => {
  await page.goto('#/ex/kubectl-escalar');
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill('kubectl get deploy loja');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('3/3');

  await entrada.fill('kubectl scale deployment loja --replicas=5');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('deployment.apps/loja scaled');
  await page.getByRole('button', { name: '⏩ +30s' }).click();
  await page.getByRole('button', { name: '⬆ Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
});

test('terminal: erro com a caixa "Na vida real", Tab completa e painel do cluster', async ({ page }) => {
  await page.goto('#/livre');
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill('kubectl get podz');
  await entrada.press('Enter');
  await expect(page.locator('.term-erro')).toContainText(`error: the server doesn't have a resource type "podz"`);
  await expect(page.locator('.term-caixa')).toContainText('Não existe o tipo "podz"');

  await entrada.fill('kubectl app');
  await entrada.press('Tab');
  await expect(entrada).toHaveValue('kubectl apply');
  await entrada.fill('kubectl apply -f .');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('deployment.apps/nginx created');

  await page.getByRole('tab', { name: '🗺️ Cluster' }).click();
  await expect(page.locator('.term-saida')).toBeHidden();
  await expect(page.locator('.mapa .pod-ok')).toHaveCount(2, { timeout: 15_000 });
});
