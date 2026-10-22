// O que faz voltar: o painel Hoje de quem volta, o número de cartões na aba Revisão e a escada de ajuda depois de errar.
import { test, expect } from '@playwright/test';

const QUIZZES = ['n0-quiz-imagem-conteiner', 'n0-quiz-quantos', 'n0-quiz-referencia'];
const comProgresso = (page, ids, dias = []) => page.addInitScript(([lista, d]) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(lista.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
  localStorage.setItem('kube-learn:dias', JSON.stringify(d));
}, [ids, dias]);

test('quem chega pela primeira vez vê a apresentação; quem volta vê o painel Hoje', async ({ page }) => {
  await page.goto('#/');
  await expect(page.locator('.cartoes')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bom te ver de volta' })).toHaveCount(0);

  await comProgresso(page, QUIZZES, ['2026-10-01', '2026-10-02', '2026-10-03']);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bom te ver de volta' })).toBeVisible();
  await expect(page.locator('.hoje-numeros')).toContainText('Melhor sequência');
  await expect(page.locator('.hoje-numeros')).toContainText('3'); // os 3 dias de estudo (e a melhor sequência)
  await expect(page.locator('.cartoes')).toHaveCount(0);
  // os termos do nível 0 já vistos: a revisão do dia tem cartões, e a aba mostra quantos
  await expect(page.locator('.hoje-cartoes')).toContainText('cartões');
  await expect(page.getByRole('navigation').first().getByRole('link', { name: /Revisão.*cartões para hoje/ })).toBeVisible();
});

test('a segunda entrega errada mostra a dica; a terceira, o caminho para a solução', async ({ page }) => {
  await page.goto('#/ex/n3-ramal');
  await expect(page.locator('.cm-content')).toBeVisible();
  const entregar = () => page.getByRole('button', { name: 'Entregar' }).click();
  await entregar();
  await expect(page.locator('.ex-aviso')).toContainText('Veja o que faltou');
  await expect(page.locator('.ex-aviso .aviso-ajuda')).toHaveCount(0);
  await entregar();
  await expect(page.locator('.ex-aviso .aviso-ajuda')).toContainText('Dica:');
  await expect(page.locator('#lado-missao details')).toHaveAttribute('open', '');
  await entregar();
  await expect(page.locator('.ex-aviso .aviso-ajuda')).toContainText(/Manual|Solução/);
  await page.locator('.ex-aviso').getByRole('button', { name: /Abrir/ }).click();
  await expect(page.getByRole('tab', { selected: true }).first()).toHaveText(/Manual|Solução/);
});
