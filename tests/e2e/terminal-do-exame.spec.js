// Os reflexos de quem faz o exame, no terminal da tela: o alias e o export valem nas linhas seguintes (a tela não
// recusa o alias como "command not found"), o > /tmp/x.yaml grava, e o Resetar cluster começa um shell novo. E a
// entrega aceita o k e o $do como o kubectl escrito por extenso.
import { test, expect } from '@playwright/test';

test('alias, export e > /tmp: valem até o Resetar cluster', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('#/livre');
  const terminal = page.locator('input.term-entrada');
  const saida = page.locator('.term-saida');
  const rodar = async (linha) => {
    await terminal.fill(linha);
    await terminal.press('Enter');
  };
  await rodar('alias kk=kubectl');
  await rodar('export do="--dry-run=client -o yaml"');
  await rodar('kk run x --image=nginx:1.27 $do');
  await expect(saida.locator('pre').last()).toContainText('kind: Pod');
  await expect(saida).not.toContainText('command not found');
  await rodar('kk get pod x');
  await expect(saida.locator('pre').last()).toContainText('pods "x" not found');
  await rodar('kubectl get ns -o yaml > /tmp/ns.yaml');
  await rodar('cat /tmp/ns.yaml | head -2');
  await expect(saida.locator('pre').last()).toContainText('items:');

  await page.getByRole('button', { name: 'Resetar cluster' }).click();
  await rodar('echo "[$do]"');
  await expect(saida.locator('pre').last()).toHaveText('[]');
  await rodar('kk get pods');
  await expect(saida.locator('pre').last()).toContainText('bash: kk: command not found');
});

test('o k e o $do contam como o kubectl na entrega; o 2> grava o erro e o $? diz o código', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const terminal = page.locator('input.term-entrada');
  const saida = page.locator('.term-saida');
  const rodar = async (linha) => {
    await terminal.fill(linha);
    await terminal.press('Enter');
  };
  const entregar = async (aviso) => {
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '+30s' }).click();
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.locator('.ex-aviso')).toContainText(aviso);
  };
  await page.goto('#/ex/kubectl-escalar');
  await rodar('k scale deployment loja --replicas=5');
  await entregar('Missão cumprida');

  await page.goto('#/ex/of-gerar-yaml');
  await rodar('export do="--dry-run=client -o yaml"');
  await rodar('kubectl create deployment api --image=kubelearn/loja:1.0 --replicas=3 $do > api.yaml');
  await rodar('kubectl apply -f api.yaml');
  await entregar('Feito em'); // a Oficina comemora o tempo (e a medalha)

  await page.goto('#/livre');
  await rodar('kubectl get po nope 2> erro.txt; echo "codigo $?"');
  await expect(saida.locator('pre').last()).toHaveText('codigo 1');
  await expect(saida).not.toContainText('"2>"');
  await rodar('cat erro.txt');
  await expect(saida.locator('pre').last()).toContainText('pods "nope" not found');
});
