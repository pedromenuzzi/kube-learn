// Dado torto por dentro (a forma de fora certa: um objeto onde vai objeto, com uma entrada torta): nenhuma rota cai,
// nenhum NaN nem Invalid Date, nenhum lacre de graça; a #/privacidade sempre abre com o "Apagar meus dados"; e o arquivo
// do "Baixar meus dados" com uma chave torta volta pelo "Restaurar".
import { test, expect } from './base.js';

const ROTAS = ['#/', '#/trilha', '#/glossario', '#/revisao', '#/certificado', '#/troubleshooting', '#/oficina', '#/plantao', '#/diario', '#/livre', '#/ex/n0-quiz-latest', '#/ex/n1-diario', '#/privacidade'];

/** Grava os valores (texto cru) só na primeira carga. `{hoje}` vira a data local de hoje (o id do Plantão do dia). */
const semear = (page, valores) => page.addInitScript((v) => {
  if (sessionStorage.getItem('semeado')) return;
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (const [k, x] of Object.entries(v)) localStorage.setItem(`kube-learn:${k}`, x.replaceAll('{hoje}', hoje));
  sessionStorage.setItem('semeado', '1');
}, valores);

const abreLimpa = async (page, rota) => {
  await page.goto(rota);
  const main = page.locator('main#conteudo');
  await expect(main.locator('h1').first(), rota).toBeVisible();
  await expect(main, rota).not.toContainText('Algo quebrou');
  await expect(main, rota).not.toContainText(/NaN|Invalid Date|undefined/);
};

const CASOS = [
  ['um cartão da revisão vazio', { revisao: '{"pod":{}}' }, ROTAS],
  ['um cartão na caixa 6', { revisao: '{"pod":{"caixa":6,"proxima":"2026-01-01"}}' }, ['#/', '#/revisao', '#/diario']],
  ['um recorde em texto', { recordes: '{"of-desfazer":"abc"}' }, ['#/oficina', '#/diario', '#/ex/of-desfazer']],
  ['um plantão sem número', { plantoes: '{"plantao-{hoje}":{"ms":"a"}}' }, ['#/plantao', '#/diario']],
  ['dias que não são datas', { dias: '[null,5]' }, ['#/', '#/diario']],
  ['uma missão com data em número', { progresso: '{"n0-quiz-latest":{"status":"resolvido","em":123}}' }, ['#/', '#/diario', '#/ex/n0-quiz-latest']],
  ['o navio em número', { conquistas: '{"navio":5}' }, ['#/certificado']],
  ['uma coluna de janelas vazia', { janelas: '{"colunas":[{}]}' }, ['#/ex/n1-diario']],
  ['os arquivos da etapa anterior em número', { progresso: '{"n11-loja-1":{"status":"resolvido"}}', 'arquivos:n11-loja-1': '5' }, ['#/ex/n11-loja-2']],
];

for (const [nome, valores, rotas] of CASOS) {
  test(`${nome}: as rotas abrem sem NaN, e a privacidade tem o "Apagar meus dados"`, async ({ page }) => {
    await semear(page, valores);
    for (const rota of [...rotas, '#/privacidade']) await abreLimpa(page, rota);
    await expect(page.getByRole('button', { name: 'Apagar meus dados' })).toBeVisible();
  });
}

test('lacres em texto não lacram nível nenhum', async ({ page }) => {
  await semear(page, { conquistas: '{"lacres":"abc"}' });
  await abreLimpa(page, '#/trilha');
  await expect(page.locator('main#conteudo')).not.toContainText('Lacrado');
});

test('o arquivo baixado com chaves tortas volta pelo "Restaurar"', async ({ page }, info) => {
  await semear(page, {
    dias: '{}', progresso: 'null', revisao: '{"pod":{}}', recordes: '{"of-get":"abc","of-desfazer":12000}', nome: '"Ana"',
  });
  await page.goto('#/privacidade');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar meus dados' }).click()]);
  const arquivo = info.outputPath('meus-dados.json');
  await download.saveAs(arquivo);
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Apagar meus dados' }).click()]);
  await page.getByLabel('Restaurar de um arquivo').setInputFiles(arquivo);
  await expect(page.getByRole('status')).toContainText('Pronto: seus dados voltaram');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:recordes')))).toEqual({ 'of-desfazer': 12000 });
});
