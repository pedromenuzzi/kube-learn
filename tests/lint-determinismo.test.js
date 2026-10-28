// A regra de lint do simulador determinístico (eslint.config.js) pega o relógio e o sorteio do sistema por qualquer
// caminho, e deixa passar o Math e o Date que não leem nenhum dos dois.
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const erros = async (codigo) => (await eslint.lintText(`export const a = ${codigo};\n`, { filePath: 'src/k8s/zz.js' }))[0].errorCount;

describe('lint do simulador determinístico', () => {
  it.each([
    'Date.now()', 'Math.random()', 'new Date()', 'Date()',
    'performance.now()', 'crypto.randomUUID()', 'crypto.getRandomValues(new Uint8Array(1))',
    'globalThis.Math.random()', 'window.Date.now()', 'new globalThis.Date()', 'self.crypto.randomUUID()', 'window.performance.now()',
  ])('pega %s', async (codigo) => expect(await erros(codigo)).toBeGreaterThan(0));

  it.each(['Math.max(1, 2)', 'new Date(0).toISOString()', 'Date.UTC(2026, 0, 1)'])('deixa %s', async (codigo) => expect(await erros(codigo)).toBe(0));
});
