// O axe (WCAG 2.2 AA) nos diálogos e nas páginas fora da trilha, nos 3 temas: falha em violação serious ou critical.
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';

const TEMAS = ['claro', 'escuro', 'contraste'];

// Cada alvo abre a página e devolve o seletor que o axe analisa (o diálogo modal deixa o resto inerte).
const ALVOS = {
  'diálogo de preferências': async (page) => {
    await page.goto('#/');
    await page.getByRole('button', { name: 'Acessibilidade' }).click();
    await expect(page.getByRole('dialog', { name: 'Acessibilidade' })).toBeVisible();
    return 'dialog[open]';
  },
  'diálogo do kubectl edit': async (page) => {
    await page.goto('#/livre');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.locator('.term-saida')).toContainText('deployment.apps/nginx created');
    await page.locator('input.term-entrada').fill('kubectl edit deployment nginx');
    await page.locator('input.term-entrada').press('Enter');
    await expect(page.getByRole('dialog', { name: 'kubectl edit deployment.apps/nginx' }).locator('.cm-content')).toBeFocused();
    return 'dialog[open]';
  },
  ...Object.fromEntries(['#/plantao', '#/oficina', '#/diario', '#/troubleshooting'].map((rota) => [rota, async (page) => {
    await page.goto(rota);
    await page.waitForSelector('main#conteudo h1');
    return 'body';
  }])),
};

for (const tema of TEMAS) {
  for (const [nome, abrir] of Object.entries(ALVOS)) {
    test(`axe: ${nome} (tema ${tema})`, async ({ page }) => {
      // Reduzir movimento: o contraste é medido sem fade no meio do caminho.
      await page.addInitScript((t) => localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t, texto: '100', movimento: 'reduzido' })), tema);
      const alvo = await abrir(page);
      // .cm-scroller fica de fora, como no paginas.spec: o editor é alcançado pela caixa de texto dele.
      const r = await new AxeBuilder({ page }).include(alvo).exclude('.cm-scroller').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const graves = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
        .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(graves).toEqual([]);
    });
  }
}
