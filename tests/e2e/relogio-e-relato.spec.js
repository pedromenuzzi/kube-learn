// O relato do 'Algo quebrou aqui' leva a mensagem do erro mesmo quando o stack não a traz (o do Firefox), e o relógio da
// Oficina mostra o tempo final no instante da entrega (o mesmo do aviso), sem esperar o próximo tique.
import { test, expect } from './base.js';

test('o relato do Feedback leva a mensagem do erro, com um stack sem ela (como o do Firefox)', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function (...filhos) {
      if (this.id === 'conteudo' && location.hash === '#/glossario') {
        const erro = new Error('defeito de propósito');
        erro.stack = 'pintar@http://localhost/assets/main.js:1:1';
        throw erro;
      }
      return original.apply(this, filhos);
    };
  });
  await page.goto('#/glossario');
  const link = page.locator('main#conteudo').getByRole('link', { name: 'Contar no Feedback' });
  const relato = new URL(await link.getAttribute('href')).searchParams.get('relato');
  expect(relato).toContain('defeito de propósito');
  expect(relato).toContain('pintar@http://localhost/assets/main.js:1:1');
});

test('Oficina: ao entregar, "Seu tempo" já mostra o tempo do aviso', async ({ page }) => {
  await page.clock.install();
  await page.goto('#/ex/of-desfazer');
  const terminal = page.locator('input.term-entrada');
  await terminal.fill('kubectl rollout undo deployment/loja');
  await terminal.press('Enter');
  await expect(page.locator('.term-saida')).toContainText('rolled back');
  // O relógio para; anda até logo depois de um tique (o "Seu tempo" muda) e mais 0,52 s: o tempo de verdade já arredonda
  // para o segundo seguinte, e o próximo tique (que acertaria o chip) só vem depois de o aviso aparecer.
  await page.clock.pauseAt(Date.now() + 60_000);
  const crono = page.locator('.cronometro-tempo');
  const antes = await crono.textContent();
  for (let i = 0; i < 12 && (await crono.textContent()) === antes; i++) await page.clock.runFor(100);
  await page.clock.runFor(520);
  await page.getByRole('button', { name: 'Entregar' }).click();
  for (let i = 0; i < 30 && !/Feito em/.test(await page.locator('.ex-aviso').textContent()); i++) await page.clock.runFor(10);
  const feito = (await page.locator('.ex-aviso').textContent()).match(/Feito em (\d+:\d\d)/)[1];
  await expect(crono).toHaveText(feito);
  await expect(page.locator('.chip-recorde')).toContainText(`Recorde: ${feito}`);
});
