// O acabamento: nada cobre o que o aluno precisa ler, o botão principal cabe no celular, a fonte pixel na grade de
// 8 px, o navio cheio dentro do quadro e o axe também a 390 px e no diálogo do kubectl edit.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { NIVEIS } from '../../src/conteudo/index.js';
import { CORES } from '../../src/ui/navio.js';

const CELULAR = { width: 390, height: 844 };
const TODOS = NIVEIS.flatMap((n) => n.itens.map((i) => i.id));
const MEIO = [...NIVEIS.slice(0, 4).flatMap((n) => n.itens.map((i) => i.id)), ...NIVEIS[4].itens.slice(0, 8).map((i) => i.id)];

/** Começa com estas preferências e estes itens resolvidos (em dias passados, como quem volta). */
const semear = (page, { tema = 'claro', movimento = 'normal', ids = [], nome = '', janelas = null } = {}) => page.addInitScript(([t, mov, lista, nm, jan]) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: t, texto: '100', movimento: mov }));
  if (nm) localStorage.setItem('kube-learn:nome', JSON.stringify(nm));
  if (jan) localStorage.setItem('kube-learn:janelas', JSON.stringify(jan));
  if (!lista.length) return;
  const dia = (k) => {
    const x = new Date();
    x.setDate(x.getDate() - k);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(lista.map((id) => [id, { status: 'resolvido', em: dia(3) }]))));
  localStorage.setItem('kube-learn:dias', JSON.stringify([dia(5), dia(4), dia(3)]));
}, [tema, movimento, ids, nome, janelas]);

const semViolacoes = async (page, onde) => {
  await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.cm-scroller').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), onde).toEqual([]);
};

const entregarErrado = async (page, vezes, missao = 'kubectl-escalar') => {
  await page.goto(`#/ex/${missao}`);
  await expect(page.locator('input.term-entrada')).toBeVisible();
  // Cada entrega errada sobe um degrau da escada de ajuda: nada, a dica, o Manual.
  for (const degrau of ['.ex-aviso.falha', '.ex-aviso [data-aba=missao]', '.ex-aviso [data-aba=manual]'].slice(0, vezes)) {
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.locator(degrau)).toBeVisible();
  }
};

/** Nos pontos da linha do meio de `seletor` (o começo, o centro e o fim), o elemento é ele mesmo (ou está dentro dele):
 * nada o cobre. As pontas pegam o aviso que vaza só um pouco sobre a linha. */
const descoberto = (page, seletor) => page.locator(seletor).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return [0.03, 0.5, 0.97].every((f) => el.contains(document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2)));
});

const rolarAteOFim = (page, seletor) => page.locator(seletor).evaluate((el) => { el.scrollTop = el.scrollHeight; });

for (const [rotulo, ids] of [['primeira visita', []], ['quem volta', MEIO]]) {
  test(`390x844, ${rotulo}: o texto e o botão principal vêm antes do navio, acima da barra de abas`, async ({ page }) => {
    await page.setViewportSize(CELULAR);
    await semear(page, { ids });
    await page.goto('#/');
    const botao = page.locator('.heroi .acoes .botao');
    await expect(botao).toBeVisible();
    const b = await botao.boundingBox();
    const nav = await page.locator('.nav').boundingBox();
    expect(b.y + b.height).toBeLessThan(nav.y);
    const texto = await page.locator('.heroi-texto').boundingBox();
    const navio = await page.locator('.heroi canvas.navio').boundingBox();
    expect(texto.y).toBeLessThan(navio.y);
  });
}

for (const tamanho of [{ width: 1280, height: 720 }, { width: 1366, height: 800 }, { width: 1920, height: 1080 }]) {
  test(`${tamanho.width}x${tamanho.height}: o aviso da 2ª falha não cobre a linha do terminal`, async ({ page }) => {
    await page.setViewportSize(tamanho);
    await entregarErrado(page, 2);
    expect(await descoberto(page, 'input.term-entrada')).toBe(true);
    await expect(page.locator('.ex-aviso')).toBeInViewport();
  });
}

// Depois da 2ª e da 3ª falha o aviso traz ajuda e não fecha sozinho: o painel da Missão rola o que ele cobriria.
for (const tamanho of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }]) {
  test(`${tamanho.width}x${tamanho.height}: com o aviso aberto, a Dica aberta e o último teste sobem acima dele`, async ({ page }) => {
    await page.setViewportSize(tamanho);
    await entregarErrado(page, 2, 'n3-ramal');
    await page.locator('.ex-aviso [data-aba=missao]').click();
    await rolarAteOFim(page, '#lado-missao');
    expect(await descoberto(page, '#lado-missao details[open]')).toBe(true);
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.locator('.ex-aviso [data-aba=manual]')).toBeVisible();
    await rolarAteOFim(page, '#lado-testes');
    expect(await descoberto(page, '#lado-testes .testes > li:last-child')).toBe(true);
    await expect(page.locator('.ex-aviso')).not.toBeEmpty();
  });
}

// O aviso só flutua com a Missão sozinha na primeira ou na última coluna, e por dentro dela; nas outras arrumações que o
// aluno pode salvar, fica no fluxo. Em nenhuma ele cobre o prompt ou a linha do terminal.
const coluna = (largura, ...ids) => ({ largura, janelas: ids.map((id) => ({ id, altura: 100 / ids.length })) });
for (const [rotulo, missao, colunas, posicao] of [
  ['a Missão e o terminal na mesma coluna', 'kubectl-escalar', [coluna(50, 'missao', 'paineis'), coluna(50, 'arquivos')], 'static'],
  ['a Missão sozinha no meio', 'n3-ramal', [coluna(30, 'arquivos'), coluna(40, 'missao'), coluna(30, 'paineis')], 'static'],
  ['a Missão estreita (15%)', 'n3-ramal', [coluna(15, 'missao'), coluna(85, 'arquivos', 'paineis')], 'fixed'],
  ['a Missão sozinha à direita', 'n3-ramal', [coluna(60, 'arquivos', 'paineis'), coluna(40, 'missao')], 'fixed'],
]) {
  test(`1280x720, ${rotulo}: o aviso da 3ª falha não cobre o prompt nem a linha do terminal`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await semear(page, { janelas: { colunas } });
    await entregarErrado(page, 3, missao);
    await page.locator('input.term-entrada').scrollIntoViewIfNeeded();
    expect(await descoberto(page, '.term-prompt')).toBe(true);
    expect(await descoberto(page, 'input.term-entrada')).toBe(true);
    // Nem sobre as outras janelas (o editor, o terminal).
    const sobre = await page.evaluate(() => {
      const a = document.querySelector('.ex-aviso').getBoundingClientRect();
      return [...document.querySelectorAll('.janela:not([data-janela=missao])')].filter((j) => {
        const r = j.getBoundingClientRect();
        return a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom;
      }).map((j) => j.dataset.janela);
    });
    expect(sobre).toEqual([]);
    const aviso = page.locator('.ex-aviso');
    await expect(aviso).toHaveCSS('position', posicao);
    if (posicao === 'fixed') {
      const a = await aviso.boundingBox();
      const m = await page.locator('[data-janela=missao]').boundingBox();
      expect(a.x).toBeGreaterThanOrEqual(m.x);
      expect(a.x + a.width).toBeLessThanOrEqual(m.x + m.width);
      expect(a.y + a.height).toBeLessThanOrEqual(m.y + m.height);
    }
  });
}

test('390x844: o aviso da 3ª falha fica no fluxo e a lista de testes fica à vista', async ({ page }) => {
  await page.setViewportSize(CELULAR);
  await entregarErrado(page, 3);
  await expect(page.locator('.ex-aviso')).toHaveCSS('position', 'static');
  const teste = page.locator('#lado-testes .testes > li').first();
  await teste.scrollIntoViewIfNeeded();
  expect(await descoberto(page, '#lado-testes .testes > li')).toBe(true);
  expect(await descoberto(page, '#lado-testes .resumo')).toBe(true);
});

test('390x844: o texto de sucesso fica legível enquanto o helicóptero pousa', async ({ page }) => {
  await page.setViewportSize(CELULAR);
  await page.goto('#/ex/kubectl-escalar');
  const entrada = page.locator('input.term-entrada');
  await entrada.fill('kubectl scale deployment loja --replicas=5');
  await entrada.press('Enter');
  await page.getByRole('button', { name: '+30s' }).click();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.locator('.ex-aviso')).toContainText('Missão cumprida');
  const festa = await page.locator('.festa-embarque').boundingBox();
  const texto = await page.locator('.ex-aviso .aviso-texto').boundingBox();
  const cruza = festa.x < texto.x + texto.width && texto.x < festa.x + festa.width && festa.y < texto.y + texto.height && texto.y < festa.y + festa.height;
  expect(cruza).toBe(false);
});

test('abaixo de 60rem: sem alça, setas ←/→ e Arrumação padrão; abas numa linha; o aviso vazio continua vivo', async ({ page }) => {
  await page.setViewportSize(CELULAR);
  await page.goto('#/ex/n3-ramal');
  await expect(page.locator('.cm-content')).toBeVisible();
  for (const s of ['.alca', '[data-mover=esquerda]', '[data-mover=direita]', '[data-acao=arrumacao]']) {
    for (const el of await page.locator(s).all()) await expect(el).toBeHidden();
  }
  await expect(page.locator('[data-mover=cima]').first()).toBeVisible();
  const linhas = await page.locator('.janela .abas[role=tablist]').evaluateAll((listas) => listas.map((l) => new Set([...l.querySelectorAll('[role=tab]')].map((a) => a.offsetTop)).size));
  expect(linhas.length).toBeGreaterThan(1);
  expect(linhas.every((n) => n === 1)).toBe(true);
  const aviso = page.locator('.ex-aviso');
  await expect(aviso).toHaveCount(1);
  await expect(aviso).toHaveAttribute('role', 'status');
  await expect(aviso).toBeEmpty();
  expect(await aviso.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  // O relógio do cluster cabe na linha dos botões (não fica sozinho numa linha).
  await expect(page.locator('.relogio')).not.toBeEmpty();
  const relogio = await page.locator('.relogio').boundingBox();
  const ultimo = await page.locator('.ex-acoes [data-acao=feedback]').boundingBox();
  expect(Math.abs((relogio.y + relogio.height / 2) - (ultimo.y + ultimo.height / 2))).toBeLessThan(4);
});

test('390 px: o terminal e o editor em 16 px (o iOS não dá zoom)', async ({ page }) => {
  await page.setViewportSize(CELULAR);
  await page.goto('#/ex/n3-ramal');
  await expect(page.locator('.ex-editor .cm-content')).toHaveCSS('font-size', '16px');
  await expect(page.locator('input.term-entrada')).toHaveCSS('font-size', '16px');
});

test('detalhes: todas as letras na fonte pixel, topo limpo, rádios iguais', async ({ page }) => {
  await semear(page, { ids: TODOS, nome: 'Maria da Silva' });
  // Sem a ligadura "fi": cada letra ocupa uma casa de 1em.
  for (const [rota, texto] of [['#/oficina', 'Oficina do kubectl'], ['#/certificado', 'Certificado']]) {
    await page.goto(rota);
    const h1 = page.locator('h1.pixel');
    await expect(h1).toHaveText(texto);
    const casas = await h1.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().width / parseFloat(getComputedStyle(el).fontSize);
    });
    expect(Math.round(casas)).toBe(texto.length);
  }
  await expect(page.locator('.pular')).toHaveCSS('box-shadow', 'none');
  await page.setViewportSize(CELULAR);
  await page.goto('#/ex/n0-quiz-latest');
  const larguras = await page.locator('.alternativa input').evaluateAll((l) => l.map((i) => i.getBoundingClientRect().width));
  expect(new Set(larguras).size).toBe(1);
});

for (const tamanho of [{ width: 1280, height: 720 }, CELULAR]) {
  test(`${tamanho.width} px: o título do nível atual fica à vista depois do scroll da trilha`, async ({ page }) => {
    await page.setViewportSize(tamanho);
    await semear(page, { ids: MEIO });
    await page.goto('#/trilha');
    const titulo = page.locator('#nivel-4 .rotulo-nivel');
    const topo = await page.locator('.topo').boundingBox();
    await expect.poll(async () => (await titulo.boundingBox()).y).toBeGreaterThanOrEqual(topo.y + topo.height);
    await expect(titulo).toBeInViewport();
  });
}

test('fonte pixel na grade de 8 px, sem título transbordando a 390 px', async ({ page }) => {
  await semear(page, { ids: MEIO });
  for (const tamanho of [{ width: 1280, height: 800 }, CELULAR]) {
    await page.setViewportSize(tamanho);
    for (const rota of ['#/', '#/trilha', '#/oficina', '#/diario', '#/troubleshooting', '#/glossario', '#/revisao', '#/certificado', '#/plantao']) {
      await page.goto(rota);
      await page.waitForSelector('main#conteudo h1');
      const fora = await page.evaluate(() => [...document.querySelectorAll('.pixel, .marca-nome, .placar dd, .hoje-numeros dd, .diario-numeros dd')]
        .filter((el) => el.getBoundingClientRect().width > 1 && getComputedStyle(el).fontFamily.includes('Press Start'))
        .flatMap((el) => {
          const px = parseFloat(getComputedStyle(el).fontSize);
          const erros = px % 8 ? [`${el.className || el.tagName}: ${px}px`] : [];
          if (el.scrollWidth > el.clientWidth + 1) erros.push(`${el.className || el.tagName}: transborda`);
          return erros;
        }));
      expect(fora, `${rota} a ${tamanho.width}`).toEqual([]);
    }
  }
});

for (const tema of ['claro', 'escuro', 'contraste']) {
  test(`axe a 390 px e no kubectl edit (tema ${tema})`, async ({ page }) => {
    test.setTimeout(120_000);
    await semear(page, { tema, movimento: 'reduzido' });
    await page.setViewportSize(CELULAR);
    for (const rota of ['#/', '#/trilha', '#/ex/n0-quiz-latest', '#/oficina']) {
      await page.goto(rota);
      await page.waitForSelector('main#conteudo h1');
      await semViolacoes(page, `${rota} (${tema}, 390)`);
    }
    await entregarErrado(page, 3);
    await semViolacoes(page, `missão com falha (${tema}, 390)`);
    for (const tamanho of [CELULAR, { width: 1280, height: 720 }]) {
      await page.setViewportSize(tamanho);
      await page.goto('#/');
      await page.goto('#/livre');
      await page.getByRole('button', { name: 'Aplicar' }).click();
      // na segunda volta, o cluster do aluno continua o mesmo (missao-confiavel): o apply diz unchanged
      await expect(page.locator('.term-saida')).toContainText(/deployment\.apps\/nginx (created|unchanged)/);
      await page.locator('input.term-entrada').fill('kubectl edit deployment nginx');
      await page.locator('input.term-entrada').press('Enter');
      await expect(page.locator('dialog.edicao .cm-content')).toBeFocused();
      await semViolacoes(page, `kubectl edit (${tema}, ${tamanho.width})`);
      await page.keyboard.press('Escape');
    }
  });
}

test('alto contraste: a caixa de explicação do terminal usa as cores do tema', async ({ page }) => {
  await semear(page, { tema: 'contraste' });
  await page.goto('#/livre');
  await page.locator('input.term-entrada').fill('kubectl get podz');
  await page.locator('input.term-entrada').press('Enter');
  const caixa = page.locator('.term-caixa');
  await expect(caixa).toBeVisible();
  await expect(caixa).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(caixa).toHaveCSS('border-left-color', 'rgb(255, 255, 0)');
});

/** As cores que não podem aparecer na primeira e na última coluna do canvas: contêiner ou nuvem cortados. */
const cortes = (page, seletor) => page.locator(seletor).evaluate((canvas, cores) => {
  const proibidas = new Set([...cores, '#ffffff'].map((c) => c.toLowerCase()));
  const { width: w, height: h } = canvas;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const hex = (i) => `#${[px[i], px[i + 1], px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const achados = [];
  for (const x of [0, w - 1]) {
    for (let y = 0; y < h; y++) {
      const c = hex((y * w + x) * 4);
      if (proibidas.has(c)) achados.push(`${x},${y} ${c}`);
    }
  }
  return achados.slice(0, 5);
}, CORES);

test('navio cheio e parado: nenhum contêiner nem nuvem cortados na borda', async ({ page }) => {
  await semear(page, { ids: TODOS, movimento: 'reduzido' });
  for (const tamanho of [{ width: 1280, height: 800 }, CELULAR]) {
    await page.setViewportSize(tamanho);
    await page.goto('#/');
    await expect(page.locator('.heroi canvas.navio')).toBeVisible();
    expect(await cortes(page, '.heroi canvas.navio'), `início a ${tamanho.width}`).toEqual([]);
    await page.goto('#/trilha');
    await expect(page.locator('.trilha-lateral canvas.navio')).toBeVisible();
    expect(await cortes(page, '.trilha-lateral canvas.navio'), `trilha a ${tamanho.width}`).toEqual([]);
  }
});
