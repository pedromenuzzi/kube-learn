// O que faz voltar: o painel Hoje de quem volta, o número de cartões na aba Revisão e a escada de ajuda depois de errar.
import { test, expect } from './base.js';
import { NIVEIS } from '../../src/conteudo/index.js';
import { GLOSSARIO } from '../../src/conteudo/glossario.js';

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

test('mais vencidos que a revisão do dia: a sessão e a aba dizem o mesmo, e feitos os 10 não vem uma segunda sessão', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00'));
  // os níveis 0 a 2 feitos (24 termos vistos), 15 deles vencidos desde o dia 20
  await page.addInitScript(([ids, vencidos]) => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(ids.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
    localStorage.setItem('kube-learn:revisao', JSON.stringify(Object.fromEntries(vencidos.map((id) => [id, { caixa: 2, proxima: '2026-10-20' }]))));
  }, [NIVEIS.slice(0, 3).flatMap((n) => n.itens.map((i) => i.id)), GLOSSARIO.filter((g) => g.nivel <= 2).slice(0, 15).map((g) => g.id)]);
  const responder = async (n) => {
    for (let k = 0; k < n; k++) {
      await page.locator('.cartao-revisao input[type=radio]').first().check();
      await page.locator('.cartao-revisao button[type=submit]').click();
      await page.locator('[data-proximo]').click();
    }
  };
  const contagem = page.locator('.nav .contagem');
  await page.goto('#/revisao');
  await expect(page.getByText('Cartão 1 de 10')).toBeVisible();
  await expect(contagem).toContainText('10');
  await responder(3);
  await page.reload(); // parou no meio: o resto da mesma sessão, e a aba conta o mesmo
  await expect(page.getByText('Cartão 1 de 7')).toBeVisible();
  await expect(contagem).toContainText('7');
  await responder(7);
  await expect(page.getByText(/Revisão feita: \d+ de 7 certos\./)).toBeVisible();
  await page.goto('#/');
  await page.goto('#/revisao'); // os 5 vencidos que sobraram esperam amanhã
  await expect(page.getByText('Tudo revisado por hoje.')).toBeVisible();
  await expect(contagem).toBeHidden();
});
