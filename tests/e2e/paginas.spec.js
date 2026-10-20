// Fase 3: o prédio, o progresso, o glossário, as preferências e a acessibilidade (axe, WCAG 2.2 AA).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGINAS = ['#/', '#/trilha', '#/glossario', '#/livre', '#/ex/deploy-rolling-sem-indisponibilidade'];
const TEMAS = ['claro', 'escuro', 'contraste'];

for (const tema of TEMAS) {
  test(`axe sem violações (tema ${tema})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t, texto: '100', movimento: 'normal' })), tema);
    for (const url of PAGINAS) {
      await page.goto(url);
      await page.waitForSelector('main#conteudo > *');
      if (url.includes('ex/') || url.includes('livre')) await page.waitForSelector('.cm-content');
      // .cm-scroller fica de fora: o editor é alcançado pelo teclado pela caixa de texto dele (contenteditable),
      // que rola junto com o cursor; o axe não reconhece isso como conteúdo focável.
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.cm-scroller').analyze();
      const resumo = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(resumo, `${url} (${tema})`).toEqual([]);
    }
  });
}

test('resolver uma missão acende a janela: o andar mostra o progresso e o placar soma XP', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('#/trilha');
  await expect(page.locator('#andar-2')).toContainText('0 de 2 missões');
  await expect(page.locator('#andar-3')).toContainText('Em obra');
  await page.locator('#andar-2').getByRole('link', { name: /Atualizar sem derrubar ninguém/ }).click();
  await page.getByRole('tab', { name: '💡 Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: '⬆ Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
  await page.getByRole('link', { name: '← Trilha' }).click();
  await expect(page.locator('#andar-2')).toContainText('1 de 2 missões (50%)');
  await expect(page.locator('.placar')).toContainText('20');
  await expect(page.locator('.placar')).toContainText('🔥 Dias seguidos');
  await expect(page.getByRole('link', { name: /resolvida/ })).toHaveCount(1);
  await expect(page.locator('canvas.predio')).toBeVisible();
});

test('glossário: a busca filtra (sem precisar de acento)', async ({ page }) => {
  await page.goto('#/glossario');
  await page.getByLabel('Buscar').fill('disjuntor');
  await expect(page.locator('.termo:visible')).toHaveCount(1);
  await expect(page.locator('.termo:visible h3')).toHaveText('Limits');
  await page.getByLabel('Buscar').fill('reconciliacao');
  await expect(page.locator('.termo:visible h3')).toHaveText('Reconciliação');
});

test('preferências: tema e tamanho do texto ficam salvos', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('button', { name: 'Aa Acessibilidade' }).click();
  await page.getByLabel('Alto contraste').check();
  await page.getByLabel('Tamanho do texto').selectOption('125');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'contraste');
  await expect(page.locator('html')).toHaveAttribute('data-texto', '125');
});
