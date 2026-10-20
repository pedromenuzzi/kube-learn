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
  await expect(page.locator('#nivel-2').getByRole('link', { name: 'Atualizar sem derrubar ninguém (resolvida)' })).toBeVisible();
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

  await page.getByRole('tab', { name: '🗺️ Mapa' }).click();
  await expect(page.locator('.mapa .pod-ok')).toHaveCount(2, { timeout: 15_000 });
});

test('nível 1: ler o log, guardar a resposta e conferir', async ({ page }) => {
  await page.goto('#/ex/n1-diario');
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill('kubectl logs diario');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('a senha do Wi-Fi da obra é: tijolo-azul-42');
  await page.getByLabel('A senha').fill('tijolo-azul-42');
  await page.getByRole('button', { name: '✔ Conferir' }).click();
  await expect(page.locator('#lado-testes')).toContainText('1 de 1 teste passou');
});

test('nível 1: o > grava a saída do kubectl num arquivo do editor', async ({ page }) => {
  await page.goto('#/ex/n1-dry-run');
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill('kubectl run rascunho --image=nginx:1.27 --dry-run=client -o yaml > rascunho.yaml');
  await entrada.press('Enter');
  await expect(page.getByRole('button', { name: 'rascunho.yaml', exact: true })).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('image: nginx:1.27');
  await entrada.fill('kubectl apply -f rascunho.yaml');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('pod/rascunho created');
  await page.getByRole('button', { name: '⬆ Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
});

test('nível 3: o curl do seu computador chega pela entrada do Ingress', async ({ page }) => {
  await page.goto('#/ex/n3-ingress-caminho');
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill('curl http://praca.kube-learn.local/');
  await entrada.press('Enter');
  await expect(page.locator('.term-erro')).toContainText('Could not resolve host: praca.kube-learn.local');
  await page.getByRole('button', { name: '▶ Aplicar' }).click();
  await expect(page.locator('.term-saida')).toContainText('ingress.networking.k8s.io/praca created');
  await entrada.fill('curl -s http://praca.kube-learn.local/');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('It works!');
  await entrada.fill('curl http://loja');
  await entrada.press('Enter');
  await expect(page.locator('.term-erro').last()).toContainText('Could not resolve host: loja');
  await page.getByRole('tab', { name: '💡 Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: '▶ Aplicar' }).click();
  await expect(page.locator('.term-saida')).toContainText('ingress.networking.k8s.io/praca configured');
  await entrada.fill('curl -s http://praca.kube-learn.local/api');
  await entrada.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('"app":"loja"');
  await page.getByRole('button', { name: '⬆ Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
});
