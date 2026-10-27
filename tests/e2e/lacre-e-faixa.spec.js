// O nível lacrado com missões novas mostra a barra cheia (o lacre é dele), e a faixa "Nível N desbloqueado" não segue
// para a página seguinte, onde cobriria a migalha e a pergunta.
import { test, expect } from './base.js';
import { NIVEIS } from '../../src/conteudo/index.js';

const conta = (n) => n.itens.filter((i) => i.tipo !== 'licao').map((i) => i.id);

/** Começa com este localStorage (só na primeira carga) e "reduzir movimento" (a festa aparece na hora). */
const semear = (page, dados) => page.addInitScript((d) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: 'claro', texto: '100', movimento: 'reduzido' }));
  for (const [k, v] of Object.entries(d)) localStorage.setItem(`kube-learn:${k}`, JSON.stringify(v));
}, dados);
const resolvidos = (lista) => Object.fromEntries(lista.map((id) => [id, { status: 'resolvido', em: '2026-10-20' }]));

test('nível lacrado com missões novas: barra cheia, e as novas no texto', async ({ page }) => {
  await semear(page, { progresso: resolvidos(conta(NIVEIS[0]).slice(0, -2)), conquistas: { lacres: { 0: '2026-10-20' } } });
  await page.goto('#/trilha');
  const nivel = page.locator('#nivel-0');
  await expect(nivel.locator('.nivel-status')).toHaveText('Lacrado! · 2 missões novas');
  await expect(nivel.locator('.barra > span')).toHaveAttribute('style', 'width: 100%');
});

test('a faixa do nível novo some ao trocar de página', async ({ page }) => {
  const missoes = conta(NIVEIS[0]);
  const quiz = NIVEIS[0].itens.find((i) => i.alternativas);
  const faltam = Math.ceil(missoes.length * 0.7) - 1; // com o quiz, chega a 70%
  await semear(page, { progresso: resolvidos(missoes.filter((id) => id !== quiz.id).slice(0, faltam)) });
  await page.goto(`#/ex/${quiz.id}`);
  await page.locator(`.alternativa input[value="${quiz.alternativas.findIndex((a) => a.certa)}"]`).check();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.locator('.festa-faixa')).toContainText('Nível 1 desbloqueado');
  await page.goto(`#/ex/${conta(NIVEIS[1])[0]}`);
  await expect(page.locator('.festa-faixa')).toHaveCount(0, { timeout: 2000 }); // bem antes dos 9 s em que ela sairia sozinha
});
