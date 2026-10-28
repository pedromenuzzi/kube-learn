// Conquistas permanentes: o lacre, o navio e o certificado ficam guardados. Missão nova que chega depois vira convite,
// nunca perda; quem já tinha os níveis a 100% ganha os lacres no primeiro boot, sem festa.
import { test, expect } from './base.js';
import { NIVEIS } from '../../src/conteudo/index.js';

const conta = (n) => n.itens.filter((i) => i.tipo !== 'licao').map((i) => i.id);
const ids = (n) => n.itens.map((i) => i.id);
const TRILHA = NIVEIS.flatMap(ids);

/** Começa com este localStorage (só na primeira carga: recarregar mantém o que o site gravou) e "reduzir movimento". */
const semear = (page, dados) => page.addInitScript((d) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: 'claro', texto: '100', movimento: 'reduzido', ...d.preferencias }));
  for (const [k, v] of Object.entries(d)) if (k !== 'preferencias') localStorage.setItem(`kube-learn:${k}`, JSON.stringify(v));
}, dados);
const resolvidos = (lista, em) => Object.fromEntries(lista.map((id) => [id, { status: 'resolvido', em }]));
const conquistas = (page) => page.evaluate(() => localStorage.getItem('kube-learn:conquistas'));

test('primeiro boot: os níveis a 100% ganham o lacre datado, sem festa; o segundo boot não muda nada', async ({ page }) => {
  const progresso = Object.assign({}, ...NIVEIS.slice(0, 4).map((n, k) => resolvidos(ids(n), `2026-08-0${k + 1}`)));
  progresso[ids(NIVEIS[1])[0]].em = '2026-08-09'; // a data é a da última missão do nível
  await semear(page, { progresso, preferencias: { movimento: 'normal', som: true } });
  await page.goto('#/');
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.festa-embarque, .festa-faixa')).toHaveCount(0);
  const salvo = await conquistas(page);
  expect(JSON.parse(salvo)).toEqual({ lacres: { 0: '2026-08-01', 1: '2026-08-09', 2: '2026-08-03', 3: '2026-08-04' } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:progresso')))).toEqual(progresso); // nada apagado
  await page.reload();
  await page.waitForTimeout(600);
  expect(await conquistas(page)).toBe(salvo);
});

test('lacrar pela trilha grava o lacre de hoje, e a festa não repete depois de recarregar', async ({ page }) => {
  // O último a resolver é um quiz de alternativas (clica na certa).
  const ultimo = NIVEIS[0].itens.find((i) => i.alternativas);
  await semear(page, { progresso: resolvidos(conta(NIVEIS[0]).filter((id) => id !== ultimo.id), '2026-10-20') });
  await page.goto(`#/ex/${ultimo.id}`);
  await page.locator(`.alternativa input[value="${ultimo.alternativas.findIndex((a) => a.certa)}"]`).check();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.getByRole('dialog', { name: 'Nível 0 lacrado!' })).toBeVisible();
  const hoje = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  expect(JSON.parse(await conquistas(page))).toEqual({ lacres: { 0: hoje } });
  await page.keyboard.press('Enter');
  for (const rota of [`#/ex/${ultimo.id}`, '#/trilha']) {
    await page.goto(rota);
    await page.reload();
    await page.waitForTimeout(600);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(JSON.parse(await conquistas(page))).toEqual({ lacres: { 0: hoje } });
});

test('nível lacrado que ganhou missão: o lacre fica e a missão nova é um convite; navio e certificado continuam', async ({ page }) => {
  // Toda a trilha lacrada em 2026-09-01; a última missão do nível 1 "chegou depois" (não resolvida).
  const nova = conta(NIVEIS[1]).at(-1);
  const lacres = Object.fromEntries(NIVEIS.map((n) => [n.numero, '2026-09-01']));
  await semear(page, {
    progresso: resolvidos(TRILHA.filter((id) => id !== nova), '2026-09-01'),
    conquistas: { lacres, navio: '2026-09-01' },
    nome: 'Ana Pereira',
  });
  await page.goto('#/trilha');
  const nivel = page.locator('#nivel-1');
  await expect(nivel.getByRole('img', { name: /Lacre do nível 1/ })).toBeVisible();
  await expect(nivel).toContainText('Lacrado');
  await expect(nivel).toContainText('1 missão nova');
  await expect(nivel).not.toContainText(/perdeu|incompleto/i);
  await expect(nivel.locator('details')).toHaveAttribute('open', ''); // aberto: a missão nova está à mão
  await expect(nivel.locator(`a[href="#/ex/${nova}"]`)).toBeVisible();
  await page.goto('#/certificado');
  await expect(page.getByRole('heading', { name: 'Certificado' })).toBeVisible();
  await expect(page.locator('.certificado')).toContainText('01/09/2026');
});

test('o certificado é datado pela trilha, não pelo Plantão de hoje', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'));
  await semear(page, {
    progresso: { ...resolvidos(TRILHA, '2026-09-01'), 'plantao-2026-10-27': { status: 'resolvido', em: '2026-10-27' } },
    nome: 'Ana Pereira',
  });
  await page.goto('#/certificado');
  await expect(page.locator('.certificado')).toContainText('01/09/2026');
  expect(JSON.parse(await conquistas(page)).navio).toBe('2026-09-01');
});

for (const [idioma, rotulo] of [['pt', 'Privacidade'], ['en', 'Privacy']]) {
  test(`privacidade (${idioma}): conquistas logo depois de progresso`, async ({ page }) => {
    await semear(page, { preferencias: { idioma } });
    await page.goto('#/privacidade');
    await expect(page.getByRole('heading', { name: rotulo })).toBeVisible();
    const chaves = await page.locator('.tabela-simples tbody td:first-child').allTextContents();
    expect(chaves.slice(0, 2)).toEqual(['progresso', 'conquistas']);
  });
}
