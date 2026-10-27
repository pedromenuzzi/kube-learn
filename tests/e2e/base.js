// O `test` de todos os specs: falha em qualquer erro que o aluno veria no console (pageerror ou console.error).
// Os specs importam daqui, não de '@playwright/test'.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  // Erros de console que o spec provoca de propósito (RegExp sobre o texto). Valem só onde o spec liga, com o motivo
  // ao lado: `test.use({ errosPermitidos: [/.../] }); // por quê`.
  errosPermitidos: [[], { option: true }],
  // No contexto, e não na página: pega também as páginas que o teste abre (context.newPage, popups).
  context: async ({ context, errosPermitidos }, use, info) => {
    const erros = [];
    const vigiar = (pagina) => {
      pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.stack ?? e.message}`));
      pagina.on('console', (m) => {
        if (m.type() === 'error' && !errosPermitidos.some((r) => r.test(m.text()))) erros.push(`console.error: ${m.text()}`);
      });
    };
    context.pages().forEach(vigiar);
    context.on('page', vigiar);
    await use(context);
    // Assentamento: o erro que chega logo depois do último passo (um setTimeout, o próximo quadro) também conta. Só
    // quando o teste passou: se já falhou, não há o que esperar (e a página pode estar travada).
    if (info.status === 'passed') {
      await Promise.all(context.pages().map((p) => p.evaluate(() => new Promise((r) => {
        requestAnimationFrame(() => setTimeout(r, 250));
        setTimeout(r, 1000); // aba sem quadros (em segundo plano): não espera para sempre
      })).catch(() => p.waitForTimeout(250).catch(() => {})))); // navegando ou já fechada
    }
    expect(erros, 'erros no console da página').toEqual([]);
  },
});

export { expect };
