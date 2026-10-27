// O `test` de todos os specs: falha em qualquer erro que o aluno veria no console (pageerror ou console.error).
// Os specs importam daqui, não de '@playwright/test'.
import { test as base, expect } from '@playwright/test';

// Erros de console esperados (RegExp sobre o texto). Um lugar só; entra aqui só com o motivo ao lado.
const PERMITIDOS = [
  /defeito de propósito/,
  /^Failed to load resource: net::ERR_FAILED$/, // home-leve.spec.js: o route.abort() do pedaço lazy que não chega // dados-que-ficam.spec.js: a exceção forçada que abre a página 'Algo quebrou aqui'
];

export const test = base.extend({
  // No contexto, e não na página: pega também as páginas que o teste abre (context.newPage, popups).
  context: async ({ context }, use) => {
    const erros = [];
    const vigiar = (pagina) => {
      pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.stack ?? e.message}`));
      pagina.on('console', (m) => {
        if (m.type() === 'error' && !PERMITIDOS.some((r) => r.test(m.text()))) erros.push(`console.error: ${m.text()}`);
      });
    };
    context.pages().forEach(vigiar);
    context.on('page', vigiar);
    await use(context);
    expect(erros, 'erros no console da página').toEqual([]);
  },
});

export { expect };
