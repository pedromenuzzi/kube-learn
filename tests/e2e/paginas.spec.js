// Fase 3: o navio, o progresso, o glossário, as preferências e a acessibilidade (axe, WCAG 2.2 AA).
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';
import { NIVEIS, TROUBLESHOOTING } from '../../src/conteudo/index.js';

// Quantas missões contam na porcentagem do nível (as lições não contam): o número cresce com o conteúdo.
const missoesDoNivel = (n) => NIVEIS[n].itens.filter((i) => i.tipo !== 'licao').length;

const PAGINAS = ['#/', '#/trilha', '#/glossario', '#/livre', '#/ex/deploy-rolling-sem-indisponibilidade', '#/ex/n0-imagem-e-conteiner', '#/ex/n0-quiz-latest', '#/ex/n1-diario', '#/ex/n3-ingress-caminho', '#/ex/n9-imagem-errada', '#/troubleshooting', '#/ex/ts-loja-fora-do-ar'];
const TEMAS = ['claro', 'escuro', 'contraste'];

for (const tema of TEMAS) {
  test(`axe sem violações (tema ${tema})`, async ({ page }) => {
    test.slow(); // 12 páginas com o axe: com a máquina ocupada, passava dos 60 s
    // Reduzir movimento: sem o fade de entrada, o contraste é medido na cor final, sem esperar animação.
    await page.addInitScript((t) => localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t, texto: '100', movimento: 'reduzido' })), tema);
    for (const url of PAGINAS) {
      // A troca de hash redesenha depois do goto: marca a página velha e espera a nova no lugar dela.
      await page.evaluate(() => document.querySelector('main#conteudo > *')?.setAttribute('data-velha', ''));
      await page.goto(url);
      await page.waitForSelector('main#conteudo > :not([data-velha])');
      if (url.includes('deploy-') || url.includes('livre') || url.includes('n3-') || url.includes('n9-')) await page.waitForSelector('.cm-content');
      // .cm-scroller fica de fora: o editor é alcançado pelo teclado pela caixa de texto dele (contenteditable),
      // que rola junto com o cursor; o axe não reconhece isso como conteúdo focável.
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.cm-scroller').analyze();
      const resumo = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(resumo, `${url} (${tema})`).toEqual([]);
    }
  });
}

test('nível 0: lição lida e quiz certo contam na trilha', async ({ page }) => {
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-2')).toContainText('Bloqueado');
  await page.locator('#nivel-0').getByRole('link', { name: /Funciona na minha máquina/ }).click();
  await page.getByRole('link', { name: /^Lida · Próxima: / }).click(); // marca a lição como lida e abre a próxima
  await expect(page.locator('.placar-topo')).toHaveAccessibleName(/^5 XP, /);
  await page.goto('#/ex/n0-quiz-latest');
  await page.getByLabel(/a versão mais nova publicada/).check();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.quiz-retorno')).toContainText('Ainda não');
  await page.getByLabel(/tag comum/).check();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.quiz-retorno')).toContainText('Certo! +5 XP');
  await page.goto('#/ex/n0-quiz-referencia');
  await page.getByLabel('Sua resposta').fill('nginx:1.27');
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.quiz-retorno')).toContainText('Certo!');
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-0')).toContainText('2 de 10 missões (20%)');
  await expect(page.locator('.placar')).toContainText('15');
});

test('resolver uma missão embarca um contêiner: o nível mostra o progresso e o placar soma XP', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  // Níveis 0 e 1 já resolvidos, para o nível da missão estar aberto.
  await page.addInitScript(() => {
    if (localStorage.getItem('kube-learn:progresso')) return;
    const ids = ['n0-quiz-imagem-conteiner', 'n0-quiz-quantos', 'n0-quiz-referencia', 'n0-quiz-partes', 'n0-quiz-latest', 'n0-quiz-dockerfile',
      'n1-quantos-nodes', 'n1-primeiro-pod', 'n1-kubectl-run', 'n1-em-que-node', 'n1-diario', 'n1-cofre', 'n1-labels', 'n1-seletor', 'n1-namespaces', 'n1-contexto', 'n1-dry-run', 'n1-explain'];
    localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(ids.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
  });
  await page.goto('#/trilha');
  await expect(page.locator('#nivel-2')).toContainText(`0 de ${missoesDoNivel(2)} missões`);
  await expect(page.locator('#nivel-11')).toContainText('Bloqueado');
  await page.locator('#nivel-2').getByRole('link', { name: /Atualizar sem derrubar ninguém/ }).click();
  await page.getByRole('tab', { name: 'Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
  await page.getByRole('link', { name: 'Voltar à Trilha' }).click();
  await expect(page.locator('#nivel-2')).toContainText(`1 de ${missoesDoNivel(2)} missões (${Math.round(100 / missoesDoNivel(2))}%)`);

  await expect(page.locator('.placar')).toContainText('Dias seguidos');
  await expect(page.locator('#nivel-2').getByRole('link', { name: /resolvida/ })).toHaveCount(1);
  await expect(page.locator('canvas.navio')).toBeVisible();
});

test('troubleshooting: a seção abre sem desbloquear nada e marca o incidente resolvido', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('#/');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Troubleshooting' }).click();
  await expect(page.locator('.chamado')).toHaveCount(TROUBLESHOOTING.length);
  await page.getByRole('link', { name: 'A loja fora do ar' }).click();
  await expect(page.locator('.ex-topo')).not.toContainText('XP');
  await page.getByRole('tab', { name: 'Solução' }).click();
  await page.getByRole('button', { name: 'Ver a solução' }).click();
  await page.getByRole('button', { name: 'Copiar para o editor' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Incidente resolvido');
  await page.getByRole('link', { name: 'Voltar ao Troubleshooting' }).click();
  await expect(page.locator('.chamado').first()).toContainText('Resolvido');
});

test('glossário: a busca filtra (sem precisar de acento)', async ({ page }) => {
  await page.goto('#/glossario');
  await page.getByLabel('Buscar').fill('leiturista');
  await expect(page.locator('.termo:visible')).toHaveCount(1);
  await expect(page.locator('.termo:visible h3')).toHaveText('metrics-server');
  await page.getByLabel('Buscar').fill('reconciliacao');
  await expect(page.locator('.termo:visible h3')).toHaveText('Reconciliação');
});

test('preferências: tema e tamanho do texto ficam salvos', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('button', { name: 'Acessibilidade' }).click();
  await page.getByLabel('Alto contraste').check();
  await page.getByLabel('Tamanho do texto').selectOption('125');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'contraste');
  await expect(page.locator('html')).toHaveAttribute('data-texto', '125');
});

// O "pular para o conteúdo" leva o foco ao <main> e a página fica (seguir o href #conteudo abria a 404).
for (const ingles of [false, true]) {
  for (const [largura, altura] of [[1280, 800], [390, 844]]) {
    test(`pular para o conteúdo: o foco vai ao <main> sem trocar a página (${largura}px${ingles ? ', em inglês' : ''})`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      if (ingles) await page.addInitScript(() => localStorage.setItem('kube-learn:preferencias', JSON.stringify({ idioma: 'en' })));
      for (const rota of ['#/trilha', '#/ex/n0-primeiro-pod', '#/glossario']) {
        await page.goto(rota);
        await page.reload(); // página recém-aberta: o primeiro Tab cai no link
        await page.waitForSelector('main#conteudo > *');
        const titulo = await page.title();
        await page.keyboard.press('Tab');
        await expect(page.locator('.pular')).toBeFocused();
        await expect(page.locator('.pular')).toHaveText(ingles ? 'Skip to content' : 'Pular para o conteúdo');
        await page.keyboard.press('Enter');
        await expect(page.locator('main#conteudo')).toBeFocused();
        expect(await page.evaluate(() => location.hash)).toBe(rota);
        await expect(page).toHaveTitle(titulo);
        await expect(page.locator('main')).not.toContainText(/Página não encontrada|Page not found/);
        if (rota.startsWith('#/ex/')) {
          await page.keyboard.press('Tab');
          await expect(page.locator('a.voltar')).toBeFocused();
        }
      }
    });
  }
}
