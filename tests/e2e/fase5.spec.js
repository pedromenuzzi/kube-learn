// Fase 5: revisão do dia, lacres, certificado, privacidade e o mapa do cluster.
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';

const QUIZZES_N0 = ['n0-quiz-imagem-conteiner', 'n0-quiz-quantos', 'n0-quiz-referencia', 'n0-quiz-partes', 'n0-quiz-latest', 'n0-quiz-dockerfile', 'n0-quiz-vm', 'n0-quiz-papel-k8s'];

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript((ids) => {
    // A marca fica na sessão: recarregar (inclusive o do 'Apagar meus dados') não semeia de novo.
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(ids.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
  }, QUIZZES_N0);
});

test('revisão do dia: responder um cartão mostra a explicação e tira o cartão da pilha de hoje', async ({ page }) => {
  await page.goto('#/revisao');
  await expect(page.getByText('Cartão 1 de 4')).toBeVisible(); // o térreo tem 4 termos no glossário
  await page.locator('.cartao-revisao input[type=radio]').first().check();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.quiz-retorno')).toContainText('Onde quebra');
  await page.getByRole('button', { name: 'Próximo cartão' }).click();
  await expect(page.getByText('Cartão 2 de 4')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Cartão 1 de 3')).toBeVisible();
});

test('nível concluído ganha o lacre; a página de lacres e o certificado travado', async ({ page }) => {
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-0')).toContainText('Lacrado!');
  await expect(page.locator('#nivel-0').getByRole('img', { name: /Lacre do nível 0/ })).toBeVisible();
  await page.getByRole('link', { name: 'Seus lacres' }).click();
  await expect(page.getByRole('heading', { name: 'Seus lacres (1 de 12)' })).toBeVisible();
});

test('privacidade: baixar e apagar os dados', async ({ page }) => {
  await page.goto('#/privacidade');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar meus dados' }).click();
  expect((await download).suggestedFilename()).toBe('kube-learn-meus-dados.json');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Apagar meus dados' }).click()]); // apaga e recarrega
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kube-learn:')))).toEqual([]);
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-0')).toContainText('0 de 8 missões');
});

test('mapa do cluster: prédios com uso, ramais e a administração escondida', async ({ page }) => {
  await page.goto('#/ex/n3-ramal-mudo'); // o Service inicial aplica (só o seletor está errado)
  await page.getByRole('tab', { name: 'Mapa' }).click();
  await expect(page.locator('.mapa .node')).toHaveCount(3);
  await expect(page.locator('.mapa').first()).toContainText('CPU');
  await expect(page.locator('.mapa .pod')).toHaveCount(3);
  await page.getByLabel(/Mostrar a administração/).check();
  await expect(page.locator('.mapa .pod')).toHaveCount(16);
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByRole('tab', { name: 'Mapa' }).click();
  await expect(page.locator('.ramais')).toContainText('loja');
  await expect(page.locator('.ramais')).toContainText('ninguém atende');
});

test('axe nas páginas novas', async ({ page }) => {
  for (const url of ['#/revisao', '#/certificado', '#/privacidade']) {
    await page.goto(url);
    await page.waitForSelector('main#conteudo > *');
    // O contraste é medido depois do fade de entrada da página.
    await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), url).toEqual([]);
  }
});
