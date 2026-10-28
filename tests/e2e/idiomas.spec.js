// O idioma: o botão PT | EN troca na hora, em qualquer tela, e fica salvo; a missão aberta continua com o mesmo cluster.
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';

const nav = (page) => page.getByRole('navigation').first();

test('o botão EN troca o site para o inglês e a escolha fica salva', async ({ page }) => {
  await page.goto('#/trilha');
  await expect(nav(page).getByRole('link', { name: 'Trilha' })).toBeVisible();
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(nav(page).getByRole('link', { name: 'Path' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(nav(page).getByRole('link', { name: 'Path' })).toBeVisible();
  await page.getByRole('button', { name: 'PT' }).click();
  await expect(nav(page).getByRole('link', { name: 'Trilha' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});

test('no meio da missão, a troca mantém o cluster e o histórico do terminal', async ({ page }) => {
  await page.goto('#/livre');
  const terminal = page.locator('input.term-entrada');
  await terminal.fill('kubectl run fica --image=nginx:1.27');
  await terminal.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('pod/fica created');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('.term-saida')).toContainText('Your cluster is just as you left it');
  await page.locator('input.term-entrada').press('ArrowUp');
  await expect(page.locator('input.term-entrada')).toHaveValue('kubectl run fica --image=nginx:1.27');
  await page.locator('input.term-entrada').fill('kubectl get pod fica');
  await page.locator('input.term-entrada').press('Enter');
  await expect(page.locator('.term-saida')).toContainText(/fica\s+\d\/1/);
});

test.describe('num navegador em inglês', () => {
  test.use({ locale: 'en-US' });
  test('a primeira visita já abre em inglês, e o axe passa', async ({ page }) => {
    await page.goto('#/');
    await expect(nav(page).getByRole('link', { name: 'Path' })).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});
