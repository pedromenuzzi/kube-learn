// Os reflexos de quem faz o exame, no terminal da tela: o alias e o export valem nas linhas seguintes (a tela não
// recusa o alias como "command not found"), o > /tmp/x.yaml grava, e o Resetar cluster começa um shell novo.
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
