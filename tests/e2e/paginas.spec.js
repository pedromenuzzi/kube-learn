// Fase 3: o navio, o progresso, o glossário, as preferências e a acessibilidade (axe, WCAG 2.2 AA).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGINAS = ['#/', '#/trilha', '#/glossario', '#/livre', '#/ex/deploy-rolling-sem-indisponibilidade', '#/ex/n0-imagem-e-conteiner', '#/ex/n0-quiz-latest', '#/ex/n1-diario', '#/ex/n3-ingress-caminho'];
const TEMAS = ['claro', 'escuro', 'contraste'];

for (const tema of TEMAS) {
  test(`axe sem violações (tema ${tema})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t, texto: '100', movimento: 'normal' })), tema);
    for (const url of PAGINAS) {
      await page.goto(url);
      await page.waitForSelector('main#conteudo > *');
      if (url.includes('deploy-') || url.includes('livre') || url.includes('n3-')) await page.waitForSelector('.cm-content');
      // .cm-scroller fica de fora: o editor é alcançado pelo teclado pela caixa de texto dele (contenteditable),
      // que rola junto com o cursor; o axe não reconhece isso como conteúdo focável.
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.cm-scroller').analyze();
      const resumo = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(resumo, `${url} (${tema})`).toEqual([]);
    }
  });
}

test('nível 0: lição lida e quiz certo contam na trilha', async ({ page }) => {
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-2')).toContainText('Bloqueado');
  await page.locator('#nivel-0').getByRole('link', { name: /Funciona na minha máquina/ }).click();
  await page.getByRole('button', { name: '✅ Marquei como lida' }).click();
  await expect(page.getByRole('status')).toContainText('+5 XP');
  await page.goto('#/ex/n0-quiz-latest');
  await page.getByLabel(/a versão mais nova publicada/).check();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.quiz-retorno')).toContainText('Ainda não');
  await page.getByLabel(/tag comum/).check();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.quiz-retorno')).toContainText('Certo! +5 XP');
  await page.goto('#/ex/n0-quiz-referencia');
  await page.getByLabel('Sua resposta').fill('nginx:1.27');
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.quiz-retorno')).toContainText('Certo!');
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-0')).toContainText('2 de 8 missões (25%)');
  await expect(page.locator('.placar')).toContainText('15');
});

test('resolver uma missão embarca um contêiner: o nível mostra o progresso e o placar soma XP', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  // Níveis 0 e 1 já resolvidos, para o nível da missão estar aberto.
  await page.addInitScript(() => {
    if (localStorage.getItem('kube-learn:progresso')) return;
    const ids = ['n0-quiz-imagem-conteiner', 'n0-quiz-quantos', 'n0-quiz-referencia', 'n0-quiz-partes', 'n0-quiz-latest', 'n0-quiz-dockerfile',
      'n1-quantos-nodes', 'n1-primeiro-pod', 'n1-kubectl-run', 'n1-em-que-node', 'n1-diario', 'n1-cofre', 'n1-labels', 'n1-seletor', 'n1-namespaces', 'n1-contexto', 'n1-dry-run', 'n1-explain'];
    localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(ids.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
  });
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-2')).toContainText('0 de 12 missões');
  await expect(page.locator('#nivel-4')).toContainText('Em breve');
  await page.locator('#nivel-2').getByRole('link', { name: /Atualizar sem derrubar ninguém/ }).click();
  await page.getByRole('tab', { name: '💡 Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: '⬆ Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
  await page.getByRole('link', { name: '← Trilha' }).click();
  await expect(page.locator('#nivel-2')).toContainText('1 de 12 missões (8%)');

  await expect(page.locator('.placar')).toContainText('🔥 Dias seguidos');
  await expect(page.locator('#nivel-2').getByRole('link', { name: /resolvida/ })).toHaveCount(1);
  await expect(page.locator('canvas.navio')).toBeVisible();
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
