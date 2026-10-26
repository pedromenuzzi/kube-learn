// Um dia com começo e fim: o primeiro dia mantém as boas-vindas, o painel Hoje só oferece o que já abriu, o ritual do dia
// fecha o dia e o lembrete diário sai num .ics feito no navegador.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { NIVEIS } from '../../src/conteudo/index.js';
import { GLOSSARIO } from '../../src/conteudo/glossario.js';

const QUIZZES = ['n0-quiz-imagem-conteiner', 'n0-quiz-quantos', 'n0-quiz-referencia'];
const ATE_O_NIVEL_5 = NIVEIS.slice(0, 6).flatMap((n) => n.itens.map((i) => i.id));
const TUDO = NIVEIS.flatMap((n) => n.itens.map((i) => i.id));

/**
 * Semeia o localStorage com as datas do navegador: `ontem` (resolvidos de ontem), `hoje` (resolvidos hoje), `tentados`,
 * `plantao` (o de hoje atendido) e `revisao` (todos os cartões respondidos hoje). O dia de ontem conta como dia de estudo,
 * menos com `primeiroDia` (hoje é o único dia de estudo).
 */
const semear = (page, perfil) => page.addInitScript(({ ontem = [], hoje = [], tentados = [], plantao = false, revisao = [], primeiroDia = false, idioma = 'pt' }) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  const dia = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const progresso = {};
  for (const id of tentados) progresso[id] = { status: 'tentado', em: dia(-1) };
  for (const id of ontem) progresso[id] = { status: 'resolvido', em: dia(-1) };
  for (const id of hoje) progresso[id] = { status: 'resolvido', em: dia(0) };
  if (plantao) progresso[`plantao-${dia(0)}`] = { status: 'resolvido', em: dia(0) };
  localStorage.setItem('kube-learn:progresso', JSON.stringify(progresso));
  localStorage.setItem('kube-learn:dias', JSON.stringify([...(primeiroDia ? [] : [dia(-1)]), ...(hoje.length ? [dia(0)] : [])]));
  localStorage.setItem('kube-learn:revisao', JSON.stringify(Object.fromEntries(revisao.map((id) => [id, { caixa: 1, proxima: dia(1) }]))));
  localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: 'claro', texto: '100', movimento: 'reduzido', idioma }));
}, perfil);

const heroi = (page) => page.locator('.heroi');

test('primeiro dia: depois do primeiro pod e da primeira lição, as boas-vindas continuam, com o próximo passo e o ritual', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const status = (id) => page.evaluate((i) => JSON.parse(localStorage.getItem('kube-learn:progresso') ?? '{}')[i]?.status, id);
  await page.goto('#/ex/n0-primeiro-pod');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect.poll(() => status('n0-primeiro-pod')).toBe('resolvido');
  // a revisão só cobra o que a trilha ensinou (revisao-justa): a lição de imagem e contêiner traz os primeiros termos
  await page.goto('#/ex/n0-imagem-e-conteiner');
  await page.locator('.leitura-acoes').getByRole('link', { name: /^Lida · Próxima: / }).click();
  await expect.poll(() => status('n0-imagem-e-conteiner')).toBe('resolvido');

  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Aprenda Kubernetes contêiner por contêiner' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bom te ver de volta' })).toHaveCount(0);
  await expect(heroi(page)).toContainText('Continue de onde parou');
  await expect(heroi(page).getByRole('link', { name: /Próxima missão/ })).toBeVisible();
  await expect(heroi(page).getByRole('link', { name: /Plantão/ })).toHaveCount(0);
  await expect(heroi(page).getByRole('link', { name: /Oficina/ })).toHaveCount(0);
  // o ritual: a missão de hoje feita; a revisão (os termos da lição) esperando
  const ritual = page.getByRole('region', { name: /Ritual do dia/ });
  await expect(ritual.locator('li', { hasText: 'Uma missão da trilha' })).toContainText('Feito');
  await expect(ritual.getByRole('link', { name: /Revisão do dia: \d+ cartões/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Dia cumprido' })).toHaveCount(0);
});

test('primeiro dia cumprido (uma missão e a revisão): as boas-vindas fecham o dia, sem "Continue de onde parou"', async ({ page }) => {
  await semear(page, { hoje: ['n0-primeiro-pod'], revisao: GLOSSARIO.map((g) => g.id), primeiroDia: true });
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Aprenda Kubernetes contêiner por contêiner' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bom te ver de volta' })).toHaveCount(0);
  await expect(heroi(page)).not.toContainText('Continue de onde parou');
  await expect(heroi(page).getByRole('link', { name: /Próxima missão/ })).toHaveCount(0);
  await expect(heroi(page).getByRole('link', { name: /Ver a trilha/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Dia cumprido. Bom descanso, amanhã tem mais.' })).toBeVisible();
});

test('quem estudou ontem vê o painel Hoje; o Plantão avisa quando abre e a Oficina espera o Nível 2', async ({ page }) => {
  await semear(page, { ontem: QUIZZES });
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Bom te ver de volta' })).toBeVisible();
  await expect(heroi(page)).toContainText('Plantão do dia: abre no Nível 6');
  await expect(heroi(page).getByRole('link', { name: /Plantão/ })).toHaveCount(0);
  await expect(heroi(page).getByRole('link', { name: /Oficina/ })).toHaveCount(0);
  const ritual = page.getByRole('region', { name: /Ritual do dia/ });
  await expect(ritual.locator('li', { hasText: 'Uma missão da trilha' })).toContainText('A fazer');
  await expect(heroi(page).getByRole('link', { name: /Próxima missão/ })).toBeVisible();
});

test('o lembrete diário: só com o teclado, a hora escolhida vira um .ics que se repete todo dia', async ({ page }) => {
  await semear(page, { ontem: QUIZZES });
  await page.goto('#/');
  const resumo = page.locator('.lembrete summary');
  await resumo.focus();
  await page.keyboard.press('Enter');
  const hora = page.getByLabel('Horário');
  await expect(hora).toHaveValue('19:00');
  await hora.fill('07:30');
  await hora.focus();
  const [arquivo] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(arquivo.suggestedFilename()).toBe('kube-learn-lembrete.ics');
  const ics = readFileSync(await arquivo.path(), 'utf8');
  expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect(ics).toContain('\r\nRRULE:FREQ=DAILY\r\n');
  expect(ics).toMatch(/\r\nDTSTART:\d{8}T073000\r\n/);
  expect(ics).toContain('\r\nURL:https://pedromenuzzi.github.io/kube-learn/\r\n');
  await expect(page.locator('.lembrete-aviso')).toContainText('todo dia às 07:30');
});

test('sem termos vistos, a revisão espera a primeira missão (e não diz que está em dia)', async ({ page }) => {
  await semear(page, { tentados: ['n0-quiz-imagem-conteiner'] });
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Bom te ver de volta' })).toBeVisible();
  await expect(heroi(page)).toContainText('A revisão começa quando você resolver uma missão.');
  await expect(heroi(page)).not.toContainText('Revisão do dia em dia');
});

test('no Nível 6: o Plantão entra no ritual e a Oficina aparece', async ({ page }) => {
  await semear(page, { ontem: ATE_O_NIVEL_5 });
  await page.goto('#/');
  await expect(heroi(page).getByRole('link', { name: /Plantão do dia: / })).toBeVisible();
  await expect(heroi(page)).not.toContainText('abre no Nível 6');
  await expect(heroi(page).getByRole('link', { name: /Oficina do kubectl/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Ritual do dia/ }).locator('li')).toHaveCount(3);
});

test('com a missão, a revisão e o plantão de hoje, o dia se fecha: sem "mais uma"', async ({ page }) => {
  await semear(page, { ontem: ATE_O_NIVEL_5, hoje: [NIVEIS[6].itens[0].id], plantao: true, revisao: GLOSSARIO.map((g) => g.id) });
  await page.goto('#/');
  const ritual = page.getByRole('region', { name: /Ritual do dia/ });
  await expect(ritual.locator('li.ritual-feito')).toHaveCount(3);
  await expect(ritual.getByRole('heading')).toContainText('3 de 3');
  await expect(page.getByRole('status').filter({ hasText: 'Dia cumprido. Bom descanso, amanhã tem mais.' })).toBeVisible();
  await expect(heroi(page).getByRole('link', { name: /Próxima missão|Continuar/ })).toHaveCount(0);
  await page.locator('.lembrete summary').click();
  await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
  const r = await new AxeBuilder({ page }).include('.heroi').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});

test('com a trilha completa, o botão principal leva ao certificado', async ({ page }) => {
  await semear(page, { ontem: TUDO });
  await page.goto('#/');
  await expect(heroi(page).getByRole('link', { name: 'Pegar o seu certificado' })).toHaveAttribute('href', '#/certificado');
});

test('em inglês: o ritual e o lembrete', async ({ page }) => {
  await semear(page, { ontem: QUIZZES, idioma: 'en' });
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Good to see you again' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Today’s ritual/ })).toContainText('One path mission');
  await expect(heroi(page)).toContainText('Daily on-call: opens at Level 6');
  await page.locator('.lembrete summary').click();
  await expect(page.getByLabel('Time')).toHaveValue('19:00');
});
