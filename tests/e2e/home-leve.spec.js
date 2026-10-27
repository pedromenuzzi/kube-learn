// A home leve: a página inicial, a trilha e a privacidade desenham só com o pacote de entrada (o texto das missões, a tela
// do exercício e as descrições do explain chegam por import() na rota); com a rede lenta, a home aparece antes de qualquer
// pedaço lazy; um pedaço que não chega vira "Tentar de novo", nunca uma tela em branco.
import { test, expect } from './base.js';
import { ROTAS } from '../../src/rotas.js';

test.use({ errosPermitidos: [/^Failed to load resource: net::ERR_FAILED$/] }); // o route.abort() do pedaço lazy que não chega

/** Os .js que a página inicial baixa antes de desenhar: o de entrada e os que o index.html já pede (modulepreload). */
async function estaticos(request) {
  const html = await (await request.get('./')).text();
  return [...html.matchAll(/assets\/[^"]+\.js/g)].map((m) => m[0]);
}
const ehLazy = (url, fixos) => /\/assets\/[^/]+\.js$/.test(url) && !fixos.some((f) => url.endsWith(f));
const ESQUEMA = /\/assets\/esquema-[^/]+\.js$/; // as descrições do kubectl explain em inglês

/** Junta os erros do console e as exceções da página. */
function erros(page) {
  const lista = [];
  page.on('console', (m) => m.type() === 'error' && lista.push(m.text()));
  page.on('pageerror', (e) => lista.push(e.message));
  return lista;
}

const emIngles = (page) => page.addInitScript(() => {
  if (!localStorage.getItem('kube-learn:preferencias')) localStorage.setItem('kube-learn:preferencias', JSON.stringify({ idioma: 'en' }));
});

for (const ingles of [false, true]) {
  test(`a home, a trilha e a privacidade desenham sem esperar a tela do exercício nem o texto das missões (${ingles ? 'en' : 'pt'})`, async ({ page, request }) => {
    const fixos = await estaticos(request);
    // Os pedaços lazy ficam pendurados (nunca respondem); o pacote do inglês não, porque ele vem antes de desenhar.
    await page.route('**/assets/*.js', (rota) => (ehLazy(rota.request().url(), fixos) && !/\/assets\/en-/.test(rota.request().url()) ? undefined : rota.continue()));
    if (ingles) await emIngles(page);
    await page.goto('#/');
    await expect(page.locator('h1.titulo-heroi')).toHaveText(ingles ? /one container at a time/ : /contêiner por contêiner/);
    await expect(page.locator('.heroi .acoes a.botao')).toBeVisible();
    await page.goto('#/trilha');
    await expect(page.locator('#nivel-0 h2')).toBeVisible();
    await expect(page.locator('.salas a').first()).toBeVisible();
    await page.goto('#/privacidade');
    await expect(page.locator('main h1')).toHaveText(ingles ? 'Privacy' : 'Privacidade');
    await expect(page.getByRole('button', { name: ingles ? 'Download my data' : 'Baixar meus dados' })).toBeVisible();
  });
}

test('com a rede lenta (Slow 3G), o título e o botão principal aparecem antes de qualquer pedaço lazy terminar de baixar', async ({ page, request }) => {
  test.setTimeout(180_000);
  const fixos = await estaticos(request);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // O Slow 3G do DevTools: 400 kbit/s, 2 s de latência.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: (500 * 1024 * 0.8) / 8, uploadThroughput: (500 * 1024 * 0.8) / 8 });
  const lazyBaixados = [];
  page.on('requestfinished', (r) => ehLazy(r.url(), fixos) && lazyBaixados.push(r.url()));
  await page.goto('#/', { waitUntil: 'commit', timeout: 120_000 });
  await expect(page.locator('h1.titulo-heroi')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.heroi .acoes a.botao')).toBeVisible();
  // O que o navegador já terminou de baixar, contado lá dentro (sem a corrida dos eventos daqui).
  const noNavegador = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
  expect(noNavegador.filter((u) => ehLazy(u, fixos))).toEqual([]);
  expect(lazyBaixados).toEqual([]);
});

test('trocar para o inglês na home não baixa as descrições do explain; a tela do exercício em inglês baixa e usa', async ({ page }) => {
  const pedidos = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await page.goto('#/');
  await expect(page.locator('h1.titulo-heroi')).toBeVisible();
  // Espera a tela do exercício chegar adiantada (o requestIdleCallback da home), para ela estar inteira na conta.
  await expect.poll(() => pedidos.some((u) => /\/assets\/exercicio-/.test(u))).toBe(true);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('h1.titulo-heroi')).toHaveText(/one container at a time/);
  await page.goto('#/trilha');
  await expect(page.locator('h1')).toHaveText('Your ship');
  await page.waitForLoadState('networkidle');
  expect(pedidos.filter((u) => /\/assets\/en-/.test(u))).toHaveLength(1); // o inglês veio
  expect(pedidos.filter((u) => ESQUEMA.test(u))).toEqual([]); // o explain, não
  // Na missão, sim: o kubectl explain sai com a descrição de verdade, em inglês.
  await page.goto('#/livre');
  const terminal = page.locator('input.term-entrada');
  await terminal.fill('kubectl explain pod');
  await terminal.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('Pod is a collection of containers that can run on a host');
  expect(pedidos.filter((u) => ESQUEMA.test(u))).toHaveLength(1);
});

// Toda rota de ROTAS; a de missão, com uma prática (a tela do exercício) e um quiz (a tela de leitura).
const URLS = Object.entries(ROTAS).flatMap(([caminho, r]) => (r.comParametro ? [`#${caminho}/n1-primeiro-pod`, `#${caminho}/n0-quiz-latest`] : [`#${caminho}`]));
for (const ingles of [false, true]) {
  test(`todas as rotas abrem sem erro no console (${ingles ? 'en' : 'pt'})`, async ({ page }) => {
    test.setTimeout(120_000);
    const lista = erros(page);
    if (ingles) await emIngles(page);
    for (const url of URLS) {
      await page.goto(url);
      await expect(page.locator('main#conteudo h1'), url).toBeVisible();
      await expect(page.locator('main#conteudo .carregando'), url).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('lang', ingles ? 'en' : 'pt-BR');
    }
    expect(lista).toEqual([]);
  });
}

test('um pedaço lazy que não chega mostra "Tentar de novo", que abre a página quando a rede volta', async ({ page }) => {
  await page.goto('#/');
  await expect(page.locator('h1.titulo-heroi')).toBeVisible();
  await page.route('**/assets/revisao-*.js', (rota) => rota.abort());
  await page.goto('#/revisao');
  const aviso = page.getByRole('alert');
  await expect(aviso).toContainText('Esta página não carregou');
  await expect(page.locator('main#conteudo')).not.toBeEmpty();
  await page.unroute('**/assets/revisao-*.js');
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('main#conteudo h1')).toHaveText('Revisão do dia');
});
