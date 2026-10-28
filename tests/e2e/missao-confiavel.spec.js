// A tela da missão confiável: comemora o XP certo (e não comemora duas vezes), o Aplicar não esconde os passos, voltar
// de outra página (ou trocar o idioma) não perde o cluster nem o cronômetro, e o shell do exec -it não vaza.
import { test, expect } from './base.js';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

const terminal = (page) => page.locator('input.term-entrada');
const digitar = async (page, linha) => {
  await terminal(page).fill(linha);
  await terminal(page).press('Enter');
};

for (const ingles of [false, true]) {
  test(`a primeira lição: o Aplicar mantém os passos e o Entregar diz +5 XP, uma vez só${ingles ? ' (em inglês)' : ''}`, async ({ page }) => {
    if (ingles) {
      await page.goto('#/');
      await page.locator('[data-idioma=en]').click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    }
    await page.goto('#/ex/n0-primeiro-pod');
    await expect(page.locator('[data-acao=aplicar]')).toContainText(ingles ? 'Apply' : 'Aplicar');
    await expect(page.locator('.ex-topo')).toContainText('5 XP');
    await page.locator('[data-acao=aplicar]').click();
    await expect(page.locator('.term-saida')).toContainText('pod/primeiro-pod created');
    await expect(page.locator('.ex-aviso')).toContainText(ingles ? 'Now follow the mission’s steps' : 'Agora siga os passos da missão');
    await expect(page.locator('#lado-missao')).toBeVisible();
    await expect(page.locator('#lado-missao')).toContainText('kubectl get pods');

    await page.locator('[data-acao=entregar]').click();
    await expect(page.locator('.ex-aviso')).toContainText('+5 XP');
    await expect(page.locator('.placar-item.xp')).toHaveText(/^\s*5\s*XP/);
    await page.locator('[data-acao=entregar]').click();
    await expect(page.locator('.ex-aviso')).toContainText(ingles ? 'Solved again' : 'Resolvida de novo');
    await expect(page.locator('.ex-aviso')).not.toContainText(/\+\d+ XP/);
    await expect(page.locator('.placar-item.xp')).toHaveText(/^\s*5\s*XP/);
  });
}

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('depois do Aplicar, a saída do terminal está à vista', async ({ page }) => {
    await page.goto('#/ex/n0-primeiro-pod');
    await page.locator('[data-acao=aplicar]').click();
    await expect(page.locator('.term-saida pre', { hasText: 'pod/primeiro-pod created' })).toBeInViewport();
  });
});

test('ir ao Glossário e voltar: o cluster, o histórico e o Entregar continuam', async ({ page }) => {
  await page.goto('#/ex/kubectl-escalar');
  await digitar(page, 'kubectl scale deployment loja --replicas=5');
  await expect(page.locator('.term-saida')).toContainText('deployment.apps/loja scaled');
  await page.getByRole('button', { name: '+30s' }).click();
  await page.goto('#/glossario');
  await expect(page.locator('h1')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.term-saida')).toContainText('Seu cluster continua como você deixou');
  await digitar(page, 'kubectl get deploy loja');
  await expect(page.locator('.term-saida')).toContainText(/loja\s+5\/5/);
  await terminal(page).press('ArrowUp');
  await terminal(page).press('ArrowUp');
  await expect(terminal(page)).toHaveValue('kubectl scale deployment loja --replicas=5');
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
});

test('Oficina: trocar o idioma no meio não zera o cronômetro (sem recorde falso)', async ({ page }) => {
  await page.goto('#/ex/of-desfazer');
  await expect(page.locator('.chip-cronometro')).toContainText('0:03', { timeout: 10_000 });
  await page.locator('[data-idioma=en]').click();
  await expect(page.locator('.term-saida')).toContainText('Your cluster is just as you left it');
  const [m, s] = (await page.locator('.cronometro-tempo').textContent()).trim().split(':').map(Number);
  expect(m * 60 + s).toBeGreaterThanOrEqual(3);
  await digitar(page, 'kubectl rollout undo deployment/loja');
  await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Done in');
  const recorde = await page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:recordes'))['of-desfazer']);
  expect(recorde).toBeGreaterThanOrEqual(3000);
});

test('exec -it: o shell tem histórico próprio, Ctrl+C fica nele e o Resetar fecha o shell do cluster velho', async ({ page }) => {
  await page.goto('#/ex/n1-cofre');
  await digitar(page, 'kubectl get pods');
  await digitar(page, 'kubectl exec -it cofre -- sh');
  await expect(page.locator('.term-prompt')).toHaveText('/ #');
  await terminal(page).press('ArrowUp');
  await expect(terminal(page)).toHaveValue(''); // o ↑ não traz um comando do host para dentro do contêiner
  await digitar(page, 'echo segredo > /tmp/marca');
  await digitar(page, 'ls /tmp');
  await expect(page.locator('.term-saida')).toContainText('marca');
  await terminal(page).press('ArrowUp');
  await expect(terminal(page)).toHaveValue('ls /tmp');
  await terminal(page).fill('abc');
  await terminal(page).press('Control+c');
  await expect(page.locator('.term-saida pre').last()).toHaveText('/ # abc^C');

  await page.getByRole('button', { name: 'Resetar cluster' }).click();
  await expect(page.locator('.term-prompt')).toHaveText('aluno@kube-learn:~$');
  await page.getByRole('button', { name: '+30s' }).click();
  await digitar(page, 'kubectl exec cofre -- ls /tmp');
  await expect(page.locator('.term-saida pre').last()).toHaveText('aluno@kube-learn:~$ kubectl exec cofre -- ls /tmp');
  await terminal(page).press('ArrowUp');
  await expect(terminal(page)).toHaveValue('kubectl exec cofre -- ls /tmp');
  await expect(page.locator('.term-saida')).not.toContainText('marca');
});

test('a saudação não entrega quantos nodes há', async ({ page }) => {
  await page.goto('#/ex/n1-quantos-nodes');
  await expect(page.locator('.term-saida')).toContainText('Cluster pronto. Digite help para ajuda.');
  await expect(page.locator('.term-saida')).not.toContainText(/workers|control plane/);
});

test('o Tab respeita o -n', async ({ page }) => {
  await page.goto('#/ex/n3-dns-namespace');
  await terminal(page).fill('kubectl logs -n estoque ');
  await terminal(page).press('Tab');
  await expect(terminal(page)).toHaveValue(/^kubectl logs -n estoque estoque-\w+-/);
});

test('um comando no Playground já conta como dia de estudo', async ({ page }) => {
  await page.goto('#/livre');
  await expect(terminal(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kube-learn:dias'))).toBeNull();
  await digitar(page, 'kubectl get pods');
  await expect(page.locator('.term-saida')).toContainText('No resources found');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('kube-learn:dias')))).toHaveLength(1);
});
