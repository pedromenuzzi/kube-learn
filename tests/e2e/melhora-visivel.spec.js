// A melhora que se vê: a meta e a medalha da Oficina (que nunca rebaixa, e o Diário conta os ouros), o placar do
// Plantão que sobrevive ao recarregar (e não anda com a aba escondida), um relógio só, e a Revisão no celular e a 200%.
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';

const tempoNaTela = async (page) => {
  const [m, s] = (await page.locator('.cronometro-tempo').textContent()).trim().split(':').map(Number);
  return m * 60 + s;
};
const esconderAba = (page, escondida) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, escondida);

test('Oficina: bronze devagar, ouro rápido, e a medalha não rebaixa; o Diário conta o ouro', async ({ page }) => {
  await page.clock.install();
  await page.goto('#/oficina');
  await expect(page.locator('ol.oficina li', { hasText: 'Volta, volta!' })).toContainText('Meta: 0:25 · Sem recorde ainda');
  await page.getByRole('link', { name: /Volta, volta!/ }).click();
  await expect(page.locator('.chip-meta')).toHaveText('Meta: 0:25');
  const terminal = page.locator('input.term-entrada');
  const resolver = async (espera) => {
    await expect(terminal).toBeVisible();
    await page.clock.fastForward(espera);
    await terminal.fill('kubectl rollout undo deployment/loja');
    await terminal.press('Enter');
    await page.getByRole('button', { name: '+30s' }).click();
    await page.getByRole('button', { name: 'Entregar' }).click();
  };
  const aviso = page.locator('.ex-aviso');

  // Devagar (mais que o dobro da meta): bronze, e quanto falta para a prata. Na primeira vez, a medalha (não "recorde").
  await resolver(70_000);
  await expect(aviso).toContainText(/Bronze! Feito em 1:1\d\. Faltam 0:\d\d para a prata\./);
  await expect(aviso).not.toContainText('recorde');
  await expect(page.locator('.chip-recorde')).toContainText(/Bronze · Recorde: 1:1\d/);

  // Rápido: ouro, dentro da meta.
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await resolver(5_000);
  await expect(aviso).toContainText(/Ouro! Novo recorde: 0:0\d! \(era 1:1\d\) Dentro da meta de 0:25\./);
  await expect(page.locator('.chip-recorde')).toContainText(/Ouro · Recorde: 0:0\d/);

  // Devagar de novo: o aviso diz bronze, mas o recorde (e a medalha da lista) continua o ouro.
  await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
  await resolver(80_000);
  await expect(aviso).toContainText(/Bronze! Feito em 1:2\d\. O recorde continua 0:0\d\./);
  await expect(page.locator('.chip-recorde')).toContainText(/Ouro · Recorde: 0:0\d/);

  await page.getByRole('link', { name: 'Voltar à Oficina' }).click();
  await expect(page.locator('ol.oficina li', { hasText: 'Volta, volta!' })).toContainText(/Meta: 0:25 · Ouro · Recorde: 0:0\d/);
  await expect(page.getByText('1 de 15 com recorde · 1 ouro')).toBeVisible();
  await page.goto('#/diario');
  await expect(page.locator('.diario-numeros div', { hasText: 'Ouros na Oficina' })).toContainText('1 de 15');
});

test('Plantão: errar 2 vezes, recarregar e resolver dá 3 entregas e um tempo que não voltou; a aba escondida não conta', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.clock.install();
  await page.goto('#/plantao');
  await page.locator('.plantao-hoje').getByRole('link', { name: 'Atender agora' }).click();
  await expect(page.locator('input.term-entrada')).toBeVisible();

  // Um relógio só, com rótulo, e sem anunciar a cada segundo.
  await expect(page.locator('.relogio')).toHaveCount(0);
  await expect(page.locator('.chip-cronometro')).toHaveCount(1);
  await expect(page.locator('.chip-cronometro')).toContainText('Seu tempo');
  expect(await page.locator('.chip-cronometro').evaluate((el) => !!el.closest('[aria-live], [role=status], [role=alert], [aria-hidden=true]'))).toBe(false);

  for (let n = 1; n <= 2; n++) {
    await page.clock.fastForward(10_000);
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.locator('.ex-aviso.falha')).toBeVisible();
    await page.locator('[data-acao=fechar-aviso]').click();
  }
  // A aba escondida por 30 s: o tempo não anda.
  await page.clock.fastForward(1_000);
  const antesDeEsconder = await tempoNaTela(page);
  await esconderAba(page, true);
  await page.clock.fastForward(30_000);
  await esconderAba(page, false);
  await page.clock.fastForward(1_000);
  expect(await tempoNaTela(page)).toBeLessThanOrEqual(antesDeEsconder + 2);

  const anotado = await tempoNaTela(page);
  expect(anotado).toBeGreaterThanOrEqual(20);
  await page.reload();
  await expect(page.locator('input.term-entrada')).toBeVisible();
  expect(await tempoNaTela(page)).toBeGreaterThanOrEqual(anotado);
  const aberto = await page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:plantaoAberto')));
  expect(Object.values(aberto)).toEqual([{ ms: expect.any(Number), entregas: 2 }]);

  await page.getByRole('tab', { name: 'Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText(/Incidente resolvido em \d+:\d\d · 3 entregas/);
  const [resultado] = Object.values(await page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:plantoes'))));
  expect(resultado.entregas).toBe(3);
  expect(resultado.ms).toBeGreaterThanOrEqual(anotado * 1000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:plantaoAberto')))).toEqual({});

  // Já resolvido: recarregar, reabrir e sair não deixa um "em andamento" para trás.
  await page.reload();
  await expect(page.locator('input.term-entrada')).toBeVisible();
  await page.clock.fastForward(5_000);
  await page.getByRole('link', { name: 'Voltar ao Plantão do dia' }).click();
  await expect(page.locator('.plantao-hoje')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:plantaoAberto')))).toEqual({});
});

for (const tema of ['claro', 'escuro', 'contraste']) {
  test(`axe sem violações na Oficina com medalhas e no Plantão em andamento (tema ${tema})`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t, texto: '100', movimento: 'normal' }));
      localStorage.setItem('kube-learn:recordes', JSON.stringify({ 'of-expor': 20_000, 'of-desfazer': 40_000, 'of-rotulos': 200_000 }));
    }, tema);
    for (const rota of ['#/oficina', '#/plantao']) {
      await page.goto(rota);
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.map((v) => `${rota} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
  });
}

// A Revisão só com o teclado, no celular e a 200% (1280x800 com zoom de 200% = 640x400 em CSS): com a explicação maior
// que a tela, o ✓/✗ e o Próximo ficam à vista, entre o topo e a barra de abas.
const comProgresso = (page, ids) => page.addInitScript((lista) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(lista.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
}, ids);
const entreAsBarras = (page, seletor) => page.locator(seletor).evaluateAll((els) => els.every((el) => {
  const r = el.getBoundingClientRect();
  const nav = document.querySelector('.nav');
  const pe = getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight;
  return r.top >= document.querySelector('.topo').getBoundingClientRect().bottom && r.bottom <= pe;
}));

for (const [nome, tela] of [['390x844', { viewport: { width: 390, height: 844 } }], ['200%', { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 }]]) {
  test.describe(nome, () => {
    test.use(tela);
    test(`Revisão a ${nome}, só com o teclado: o ✓/✗ e o Próximo à vista`, async ({ page }, info) => {
      await page.clock.setFixedTime(new Date('2026-10-26T12:00:00'));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await comProgresso(page, ['n0-quiz-latest', 'n1-licao-condominio']);
      await page.goto('#/revisao');
      let longa = false;
      for (let n = 1; n <= 10; n++) {
        await expect(page.locator('.progresso-revisao')).toContainText(`Cartão ${n} de 10`);
        await expect(page.locator('.cartao-revisao input[type=radio]').first()).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: 'Responder' })).toBeFocused();
        expect(await entreAsBarras(page, '.cartao-revisao button[type=submit]'), `Responder no cartão ${n}`).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-proximo]')).toBeFocused();
        for (const s of ['[data-proximo]', '.alternativa.certa', '.alternativa.errada']) {
          expect(await entreAsBarras(page, s), `${s} no cartão ${n}`).toBe(true);
        }
        // A explicação não cabe na tela: passa da barra de abas (a "explicação longa"), e mesmo assim o Próximo está à vista.
        longa ||= await page.locator('.quiz-retorno').evaluate((el) => el.getBoundingClientRect().bottom > document.querySelector('.nav').getBoundingClientRect().top);
        if (n === 1) await info.attach(`revisao-${nome}`, { body: await page.screenshot(), contentType: 'image/png' });
        await page.keyboard.press('Enter');
      }
      if (nome === '200%') expect(longa).toBe(true);
      await expect(page.getByText(/Revisão feita: \d+ de 10 certos\./)).toBeVisible();
    });
  });
}
