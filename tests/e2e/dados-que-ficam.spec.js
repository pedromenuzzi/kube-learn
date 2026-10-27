// Dados que ficam: o site não cai com um valor torto no localStorage, uma exceção numa página vira a página 'Algo
// quebrou aqui', e o arquivo do 'Baixar meus dados' volta pelo 'Restaurar de um arquivo' (só com o teclado).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';

const ROTAS = ['#/', '#/trilha', '#/glossario', '#/revisao', '#/certificado', '#/troubleshooting', '#/oficina', '#/plantao', '#/diario', '#/livre', '#/ex/n0-quiz-latest', '#/ex/n1-diario', '#/privacidade'];

/** Grava os valores (texto cru, como estão no localStorage) só na primeira carga: recarregar não semeia de novo. */
const semear = (page, valores) => page.addInitScript((v) => {
  if (sessionStorage.getItem('semeado')) return;
  for (const [k, x] of Object.entries(v)) localStorage.setItem(`kube-learn:${k}`, x);
  sessionStorage.setItem('semeado', '1');
}, valores);

/** O localStorage do site, byte a byte. */
const instantaneo = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('kube-learn:')).sort().map((k) => [k, localStorage.getItem(k)])));

const PERFIL = {
  progresso: JSON.stringify({ 'n0-quiz-latest': { status: 'resolvido', em: '2026-01-02' }, 'n0-imagem-e-conteiner': { status: 'resolvido', em: '2026-01-02' }, 'n1-diario': { status: 'tentado', em: '2026-01-03' } }),
  dias: JSON.stringify(['2026-01-02', '2026-01-03']),
  conquistas: JSON.stringify({ lacres: { 0: '2026-01-02' } }),
  recordes: JSON.stringify({ 'of-get-pods': 12000 }),
  nome: JSON.stringify('Ana'),
  preferencias: JSON.stringify({ tema: 'contraste', texto: '100', movimento: 'normal' }),
  'arquivos:n1-diario': JSON.stringify({ 'pod.yaml': 'apiVersion: v1\nkind: Pod\n' }),
};

let erros;
test.beforeEach(({ page }) => {
  erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
});
test.afterEach(() => expect(erros).toEqual([]));

for (const [nome, valores] of [
  ['valores de outra forma', { preferencias: 'null', progresso: 'null', dias: '{}', revisao: 'null', recordes: 'null', plantoes: '[]', conquistas: '"x"' }],
  ['uma missão null no progresso', { progresso: '{"x":null}' }],
]) {
  test(`${nome}: todas as rotas abrem, e a privacidade apaga`, async ({ page }) => {
    await semear(page, valores);
    for (const rota of ROTAS) {
      await page.goto(rota);
      await expect(page.locator('main#conteudo h1').first(), rota).toBeVisible();
      await expect(page.locator('main#conteudo'), rota).not.toContainText('Algo quebrou');
    }
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Apagar meus dados' }).click();
    await page.waitForLoadState('load');
    await expect(page.locator('main#conteudo h1')).toHaveText('Privacidade');
    expect(await instantaneo(page)).toEqual({});
  });
}

test("uma exceção numa página: 'Algo quebrou aqui', com o título do endereço, sem a página anterior", async ({ page }) => {
  const consoleErros = [];
  page.on('console', (m) => m.type() === 'error' && consoleErros.push(m.text()));
  await page.addInitScript(() => {
    const original = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function (...filhos) {
      if (this.id === 'conteudo' && location.hash === '#/glossario') throw new Error('defeito de propósito');
      return original.apply(this, filhos);
    };
  });
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-0')).toBeVisible();
  await page.getByRole('link', { name: 'Glossário' }).first().click();
  const main = page.locator('main#conteudo');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Algo quebrou aqui.');
  await expect(main).toContainText('Isso é um defeito nosso');
  await expect(page.locator('#nivel-0')).toHaveCount(0);
  await expect(page).toHaveTitle('Glossário · kube-learn');
  await expect(main.getByRole('link', { name: 'Contar no Feedback' })).toHaveAttribute('href', /github\.com\/pedromenuzzi\/kube-learn\/issues\/new\?.*defeito\+de\+prop/);
  await expect(main.getByRole('link', { name: /Ir para o início/ })).toHaveAttribute('href', '#/');
  await expect(main.getByRole('link', { name: /Ver ou apagar seus dados/ })).toHaveAttribute('href', '#/privacidade');
  expect(consoleErros.join('\n')).toContain('defeito de propósito');
});

test('baixar, apagar (o tema volta ao padrão) e restaurar pelo teclado: tudo volta, e o placar sem recarregar', async ({ page }, info) => {
  await semear(page, PERFIL);
  await page.goto('#/privacidade');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'contraste');
  const placar = await page.locator('.placar-topo .visualmente-oculto').textContent();
  const antes = await instantaneo(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar meus dados' }).click()]);
  const arquivo = info.outputPath('meus-dados.json');
  await download.saveAs(arquivo);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Apagar meus dados' }).click();
  await page.waitForLoadState('load');
  await expect(page.locator('html')).not.toHaveAttribute('data-tema');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  expect(await instantaneo(page)).toEqual({});
  await expect(page.locator('.placar-topo')).toHaveAccessibleName(/^0 XP/);

  // Só o teclado: Tab até o campo, Enter abre o seletor de arquivos.
  const entrada = page.getByLabel('Restaurar de um arquivo');
  await expect(entrada).toHaveAttribute('type', 'file');
  await expect(entrada).toHaveAttribute('accept', 'application/json');
  await page.getByRole('button', { name: 'Apagar meus dados' }).focus();
  await page.keyboard.press('Tab');
  await expect(entrada).toBeFocused();
  const [seletor] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
  await seletor.setFiles(arquivo);
  await expect(page.getByRole('status')).toContainText('Pronto: seus dados voltaram (2 missões, 2 dias, 1 lacre)');
  expect(await instantaneo(page)).toEqual(antes);
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'contraste');
  await expect(page.locator('.placar-topo .visualmente-oculto')).toHaveText(placar);
  await expect(page.locator('.placar-topo')).not.toHaveAccessibleName(/^0 XP/);
});

test('com progresso aqui: o resumo e a confirmação antes de trocar (cancelar não muda nada), e o axe nos 3 temas', async ({ page }, info) => {
  await semear(page, PERFIL);
  const arquivo = info.outputPath('outro.json');
  writeFileSync(arquivo, JSON.stringify({ progresso: { 'n0-quiz-latest': { status: 'resolvido', em: '2026-02-01' } }, dias: ['2026-02-01'], nome: 'Bia' }));
  await page.goto('#/privacidade');
  const antes = await instantaneo(page);
  const dialogo = page.getByRole('dialog', { name: 'Trocar os dados deste navegador?' });

  await page.getByLabel('Restaurar de um arquivo').setInputFiles(arquivo);
  await expect(dialogo).toContainText('Neste navegador: 2 missões, 2 dias, 1 lacre.');
  await expect(dialogo).toContainText('No arquivo: 1 missão, 1 dia, 0 lacres.');
  for (const tema of ['claro', 'escuro', 'contraste']) {
    await page.evaluate((t) => { document.documentElement.dataset.tema = t; }, tema);
    await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), tema).toEqual([]);
  }
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Nada mudou');
  expect(await instantaneo(page)).toEqual(antes);

  await page.getByLabel('Restaurar de um arquivo').setInputFiles(arquivo);
  await dialogo.getByRole('button', { name: 'Restaurar' }).press('Enter');
  await expect(page.getByRole('status')).toContainText('Pronto: seus dados voltaram');
  const depois = await instantaneo(page);
  expect(Object.keys(depois)).toEqual(['kube-learn:dias', 'kube-learn:nome', 'kube-learn:progresso']); // substitui, não mescla
  expect(JSON.parse(depois['kube-learn:nome'])).toBe('Bia');
});

test('axe limpo em #/privacidade, nos 3 temas', async ({ page }) => {
  for (const tema of ['claro', 'escuro', 'contraste']) {
    await page.addInitScript((t) => localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t })), tema);
    await page.goto('#/privacidade');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-tema', tema);
    await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), tema).toEqual([]);
  }
});

for (const [nome, conteudo, mensagem] of [
  ['uma chave estranha', JSON.stringify({ xyz: 1 }), 'uma chave que o kube-learn não conhece: xyz'],
  ['progresso em lista', JSON.stringify({ progresso: [] }), 'O valor de progresso no arquivo não tem a forma esperada'],
  ['um arquivo que não é JSON', 'isto não é json', 'Este arquivo não é um JSON'],
]) {
  test(`restaurar ${nome}: a mensagem é anunciada e o localStorage fica igual`, async ({ page }, info) => {
    await semear(page, PERFIL);
    const arquivo = info.outputPath('ruim.json');
    writeFileSync(arquivo, conteudo);
    await page.goto('#/privacidade');
    const antes = await instantaneo(page);
    await page.getByLabel('Restaurar de um arquivo').setInputFiles(arquivo);
    await expect(page.getByRole('status')).toContainText(mensagem);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await instantaneo(page)).toEqual(antes);
  });
}
