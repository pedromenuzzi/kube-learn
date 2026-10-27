// Nível 0 mão na massa: as duas práticas (três cópias de uma imagem e a tag que não existe) nas posições certas, com a
// armadilha da tag; e o perfil de antes delas, que mantém o lacre do nível 0 e as recebe como convite.
import { test, expect } from '@playwright/test';
import { NIVEIS } from '../../src/conteudo/index.js';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

/** Começa com este localStorage (só na primeira carga) e "reduzir movimento". */
const semear = (page, dados) => page.addInitScript((d) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: 'claro', texto: '100', movimento: 'reduzido', ...d.preferencias }));
  for (const [k, v] of Object.entries(d)) if (k !== 'preferencias') localStorage.setItem(`kube-learn:${k}`, JSON.stringify(v));
}, dados);

/** Troca o arquivo aberto no editor por este texto (como colar por cima de tudo). */
async function escrever(page, texto) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(texto);
}

async function rodar(page, linha) {
  const entrada = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await entrada.fill(linha);
  await entrada.press('Enter');
}

const POD = (nome, imagem) => `apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${nome}\nspec:\n  containers:\n  - name: ${nome === 'vitrine' ? 'vitrine' : 'web'}\n    image: ${imagem}\n`;
const nivel0 = (page) => page.locator('#nivel-0');
const missoes = (page) => nivel0(page).locator('a[href^="#/ex/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href').slice(5)));

test('perfil de antes das práticas (os 8 quizzes em 2026-09-01, sem conquistas): lacre, 2 missões novas e nenhuma festa', async ({ page }) => {
  const quizzes = NIVEIS[0].itens.filter((i) => i.tipo === 'quiz').map((i) => i.id);
  expect(quizzes).toHaveLength(8);
  await semear(page, { progresso: Object.fromEntries(quizzes.map((id) => [id, { status: 'resolvido', em: '2026-09-01' }])) });
  await page.goto('#/trilha');
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.festa-embarque, .festa-faixa')).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('kube-learn:conquistas')))).toEqual({ lacres: { 0: '2026-09-01' } });
  await expect(nivel0(page).getByRole('img', { name: /Lacre do nível 0/ })).toBeVisible();
  await expect(nivel0(page)).toContainText('Lacrado');
  await expect(nivel0(page)).toContainText('2 missões novas');
  for (const id of ['n0-tres-conteineres', 'n0-tag-que-nao-existe']) await expect(nivel0(page).locator(`a[href="#/ex/${id}"]`)).toBeVisible();
  await expect(page.locator('#nivel-1')).not.toContainText('Bloqueado');
});

for (const [idioma, titulos] of [['pt', ['Três contêineres, uma imagem', 'A tag que não existe']], ['en', ['Three containers, one image', 'The tag that doesn’t exist']]]) {
  test(`perfil novo (${idioma}): as práticas vêm logo depois das lições de imagem e de registry`, async ({ page }) => {
    await semear(page, { preferencias: { idioma } });
    await page.goto('#/trilha');
    const ids = await missoes(page);
    expect(ids[ids.indexOf('n0-imagem-e-conteiner') + 1]).toBe('n0-tres-conteineres');
    expect(ids[ids.indexOf('n0-registry-e-tags') + 1]).toBe('n0-tag-que-nao-existe');
    await page.goto('#/ex/n0-tag-que-nao-existe');
    await expect(page.getByRole('heading', { name: titulos[1] })).toBeVisible();
    await page.goto('#/ex/n0-tres-conteineres');
    await expect(page.getByRole('heading', { name: titulos[0] })).toBeVisible();
  });
}

test('três contêineres, uma imagem: as três cópias aplicam e a missão é entregue', async ({ page }) => {
  await page.goto('#/ex/n0-tres-conteineres');
  await expect(page.locator('.cm-content')).toContainText('copia-1');
  await escrever(page, [1, 2, 3].map((n) => POD(`copia-${n}`, 'nginx:1.27')).join('---\n'));
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.term-saida')).toContainText('pod/copia-3 created');
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
});

test('a tag que não existe: latest e apagar o pod caem na armadilha; a tag fixa passa', async ({ page }) => {
  await page.goto('#/ex/n0-tag-que-nao-existe');
  await rodar(page, 'kubectl get pods');
  await expect(page.locator('.term-saida')).toContainText(/vitrine\s+0\/1\s+(ErrImagePull|ImagePullBackOff)/);
  const entregar = async () => {
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.locator('.ex-aviso')).toContainText('Veja o que faltou na aba Testes');
  };

  // trocar para latest: roda, mas a tag muda sem avisar
  await escrever(page, POD('vitrine', 'nginx:latest'));
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await entregar();
  await expect(page.locator('#lado-testes')).toContainText('latest (ou stable) muda de versão sem avisar');

  // consertar o arquivo e apagar o pod: a vitrine sai do ar
  await escrever(page, POD('vitrine', 'nginx:1.27'));
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await rodar(page, 'kubectl delete pod vitrine');
  await expect(page.locator('.term-saida')).toContainText('pod "vitrine" deleted');
  await entregar();
  await expect(page.locator('#lado-testes')).toContainText('apagar o pod tira a vitrine do ar');

  // a tag fixa, aplicada no cluster: passa
  await page.getByRole('button', { name: 'Aplicar' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+30s' }).click();
  await rodar(page, 'kubectl get pods');
  await expect(page.locator('.term-saida')).toContainText(/vitrine\s+1\/1\s+Running/);
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
});
