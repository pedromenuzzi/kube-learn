// O placar do Plantão do dia: o relógio e as entregas, o resultado guardado (vale a primeira vez), o Compartilhar (pelo
// menu do sistema ou pela área de transferência, só com o clique), a página com o chamado de hoje em destaque, a
// recomendação do Nível 6 e a data impossível.
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';
import { NIVEIS } from '../../src/conteudo/index.js';
import { NIVEL_DO_PLANTAO } from '../../src/jogo/plantao.js';

const RESULTADO = /^kube-learn · Plantão \d\d\/\d\d 🚒 [^·]+ · resolvido em \d+:\d\d · 2 entregas · https:\/\/pedromenuzzi\.github\.io\/kube-learn\/#\/plantao$/;
const guardado = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kube-learn:plantoes')));

/** O conserto da aba Solução, aplicado, com o cluster adiantado até as réplicas ficarem prontas (falta só entregar). */
async function consertar(page) {
  await page.getByRole('tab', { name: 'Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+30s' }).click();
}

/** Abre o plantão de hoje pela página, erra uma entrega e conserta: 2 entregas. */
async function resolverComUmErro(page) {
  page.on('dialog', (d) => d.accept()); // "Trocar seus arquivos pela solução?"
  await page.goto('#/plantao');
  await page.locator('.plantao-hoje').getByRole('link', { name: 'Atender agora' }).click();
  await expect(page.locator('input.term-entrada')).toBeVisible();
  await expect(page.locator('.chip-cronometro')).toBeAttached();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso.falha')).toBeVisible();
  await consertar(page);
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText(/Incidente resolvido em \d+:\d\d · 2 entregas/);
}

test('com o menu do sistema: o aviso mostra o tempo e as entregas, a primeira vez fica guardada e o texto vai para o share', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async (dados) => { window.compartilhado = dados; } }));
  await resolverComUmErro(page);
  const [[id, resultado]] = Object.entries(await guardado(page));
  expect(id).toMatch(/^plantao-\d{4}-\d{2}-\d{2}$/);
  expect(resultado).toEqual({ ms: expect.any(Number), entregas: 2 });
  expect(resultado.ms).toBeGreaterThan(0);
  // O cronômetro parou no tempo do resultado.
  await expect(page.locator('.chip-cronometro')).toHaveText(await page.locator('.ex-aviso').textContent().then((t) => t.match(/em (\d+:\d\d)/)[1]));

  expect(await page.evaluate(() => window.compartilhado)).toBeUndefined(); // nada sai sem o clique
  await page.locator('.ex-aviso').getByRole('button', { name: 'Compartilhar resultado' }).click();
  const { text } = await page.evaluate(() => window.compartilhado);
  expect(text).toMatch(RESULTADO);
  expect(text).not.toMatch(/kubectl|image|probe|selector|port|memory|cpu|configmap/i);

  // Resolver de novo, noutra visita, não troca o resultado guardado.
  await page.reload();
  await expect(page.locator('input.term-entrada')).toBeVisible();
  await page.getByRole('button', { name: 'Aplicar' }).click(); // os arquivos já são os consertados
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Vale o resultado da primeira vez');
  expect((await guardado(page))[id]).toEqual(resultado);

  // A página mostra o resultado de hoje, sem o "Atender agora", com o mesmo Compartilhar.
  await page.getByRole('link', { name: 'Voltar ao Plantão do dia' }).click();
  const destaque = page.locator('.plantao-hoje');
  await expect(destaque).toContainText(/Atendido em \d+:\d\d · 2 entregas/);
  await expect(destaque.getByRole('link', { name: 'Atender agora' })).toHaveCount(0);
  await page.evaluate(() => { window.compartilhado = undefined; });
  await destaque.getByRole('button', { name: 'Compartilhar resultado' }).click();
  expect((await page.evaluate(() => window.compartilhado)).text).toBe(text);
});

// Sair no meio do plantão (o Glossário, a troca de idioma) e voltar não zera o relógio nem as entregas: o tempo conta
// da primeira abertura até a entrega certa.
test('ir ao Glossário no meio do plantão e voltar: o tempo conta desde a primeira abertura e a entrega errada continua contando', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('#/plantao');
  await page.locator('.plantao-hoje').getByRole('link', { name: 'Atender agora' }).click();
  await expect(page.locator('input.term-entrada')).toBeVisible();
  const abriu = Date.now(); // a tela já estava aberta: o relógio dela começou antes
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso.falha')).toBeVisible();
  const relogio = page.locator('.chip-cronometro');
  await expect(relogio).toHaveText(/0:0[2-9]/);

  await page.goto('#/glossario');
  await expect(page.locator('h1')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.term-saida')).toContainText('Seu cluster continua como você deixou');
  expect(await relogio.textContent()).toMatch(/0:0[2-9]|0:[1-5]\d/); // continuou, não voltou a 0:00

  await consertar(page);
  const entregou = Date.now(); // antes do clique: a entrega certa vem depois
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText(/Incidente resolvido em \d+:\d\d · 2 entregas/);
  const [[, resultado]] = Object.entries(await guardado(page));
  expect(resultado.entregas).toBe(2);
  expect(resultado.ms).toBeGreaterThanOrEqual(entregou - abriu);
});

test('sem o menu do sistema (celular estreito): o texto vai para a área de transferência e o aviso diz "Copiado"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    delete Navigator.prototype.share;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (texto) => { window.copiado = texto; } } });
  });
  await resolverComUmErro(page);
  expect(await page.evaluate(() => window.copiado)).toBeUndefined();
  await page.locator('.ex-aviso').getByRole('button', { name: 'Compartilhar resultado' }).click();
  await expect(page.locator('.ex-aviso .compartilhado[role=status]')).toHaveText('Copiado');
  expect(await page.evaluate(() => window.copiado)).toMatch(RESULTADO);
});

test('a página: o chamado de hoje na largura toda, com "Atender agora", e a recomendação abaixo do Nível 6', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('#/plantao');
  await expect(page.getByText(`Recomendado a partir do Nível ${NIVEL_DO_PLANTAO}`)).toBeVisible();
  await expect(page.locator('.plantao-hoje').getByRole('link', { name: 'Atender agora' })).toBeVisible();
  const [hoje, lista] = await Promise.all([page.locator('.plantao-hoje .chamado').boundingBox(), page.locator('ol.plantoes').boundingBox()]);
  expect(Math.abs(hoje.width - lista.width)).toBeLessThan(2);
  await expect(page.locator('ol.plantoes li')).toHaveCount(7);
});

test('a página de quem já chegou ao Nível 6 abre sem a recomendação', async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem('kube-learn:progresso', JSON.stringify({ [id]: { status: 'tentado', em: '2026-10-20' } })), NIVEIS[NIVEL_DO_PLANTAO].itens[0].id);
  await page.goto('#/plantao');
  await expect(page.getByRole('heading', { name: 'Plantão do dia', level: 1 })).toBeVisible();
  await expect(page.getByText('Recomendado a partir')).toHaveCount(0);
});

test('data impossível no endereço: a página de missão não encontrada', async ({ page }) => {
  for (const id of ['plantao-2026-13-01', 'plantao-0001-01-01', 'plantao-2026-00-10']) {
    await page.goto(`#/ex/${id}`);
    await expect(page.getByRole('heading', { name: 'Missão não encontrada' })).toBeVisible();
  }
});

for (const tema of ['claro', 'escuro']) {
  test(`axe sem violações no Plantão atendido (tema ${tema})`, async ({ page }) => {
    await page.addInitScript((t) => {
      const d = new Date();
      const hoje = `plantao-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t, texto: '100', movimento: 'normal' }));
      localStorage.setItem('kube-learn:progresso', JSON.stringify({ [hoje]: { status: 'resolvido', em: '2026-10-26' } }));
      localStorage.setItem('kube-learn:plantoes', JSON.stringify({ [hoje]: { ms: 462000, entregas: 3 } }));
    }, tema);
    await page.goto('#/plantao');
    await expect(page.locator('.plantao-hoje')).toContainText('Atendido em 7:42 · 3 entregas');
    await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}
