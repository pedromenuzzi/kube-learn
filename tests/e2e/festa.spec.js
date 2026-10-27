// As comemorações (o lacre, o nível que abre) e o feedback, com o axe nos diálogos abertos.
import { test, expect } from './base.js';
import AxeBuilder from '@axe-core/playwright';

// Os quizzes do nível 0 (as lições não contam na porcentagem); o primeiro tem a alternativa certa na posição 0.
const QUIZZES = ['n0-quiz-imagem-conteiner', 'n0-quiz-quantos', 'n0-quiz-referencia', 'n0-quiz-partes', 'n0-quiz-latest', 'n0-quiz-dockerfile', 'n0-quiz-vm', 'n0-quiz-papel-k8s'];

/** Começa com estes itens resolvidos e "reduzir movimento" (as comemorações aparecem na hora, sem animação). */
const comProgresso = (page, ids) => page.addInitScript((lista) => {
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('kube-learn:preferencias', JSON.stringify({ tema: 'claro', texto: '100', movimento: 'reduzido' }));
  localStorage.setItem('kube-learn:progresso', JSON.stringify(Object.fromEntries(lista.map((i) => [i, { status: 'resolvido', em: '2026-10-20' }]))));
}, ids);

const acertarOPrimeiroQuiz = async (page) => {
  await page.goto(`#/ex/${QUIZZES[0]}`);
  await page.locator('.alternativa').first().click();
  await page.getByRole('button', { name: 'Responder' }).click();
};

const semViolacoes = async (page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

test('o último quiz do nível carimba o lacre', async ({ page }) => {
  await comProgresso(page, QUIZZES.slice(1));
  await acertarOPrimeiroQuiz(page);
  const cartao = page.getByRole('dialog', { name: 'Nível 0 lacrado!' });
  await expect(cartao).toBeVisible();
  await expect(cartao.getByRole('button', { name: 'Seguir viagem' })).toBeFocused();
  await semViolacoes(page);
  await page.keyboard.press('Enter');
  await expect(cartao).toBeHidden();
});

test('passar de 70% abre o nível seguinte, com a faixa', async ({ page }) => {
  await comProgresso(page, QUIZZES.slice(1, 6)); // 5 de 8: o sexto passa de 70%
  await acertarOPrimeiroQuiz(page);
  await expect(page.locator('.festa-faixa')).toContainText('Nível 1 desbloqueado');
  await expect(page.getByRole('dialog')).toHaveCount(0); // ainda não fechou o nível: sem lacre
});

test('feedback: o diálogo monta a issue com a reação, o texto e os comandos', async ({ page }) => {
  await comProgresso(page, []);
  await page.goto('#/ex/n3-ramal');
  const terminal = page.getByRole('textbox', { name: /aluno@kube-learn/ });
  await terminal.fill('kubectl get svc');
  await terminal.press('Enter');
  await page.getByRole('button', { name: 'Feedback' }).click();
  const dialogo = page.getByRole('dialog', { name: /Como foi/ });
  await dialogo.getByLabel('Achei um erro').check();
  await dialogo.getByLabel('Conte mais (opcional)').fill('O teste não aceitou targetPort como texto.');
  const url = new URL(await dialogo.getByRole('link', { name: 'Abrir no GitHub' }).getAttribute('href'));
  expect(url.origin + url.pathname).toBe('https://github.com/pedromenuzzi/kube-learn/issues/new');
  expect(url.searchParams.get('title')).toBe('[feedback] O ramal da loja: Achei um erro');
  expect(url.searchParams.get('relato')).toContain('targetPort como texto');
  expect(url.searchParams.get('relato')).toContain('kubectl get svc');
  await semViolacoes(page);
  await dialogo.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialogo).toHaveCount(0);
});
