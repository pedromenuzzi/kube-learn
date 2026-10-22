// @vitest-environment node
// A caixa "Na vida real" do terminal: o que vem da saída do kubectl (nomes, campos) entra escapado no HTML.
import { describe, expect, it } from 'vitest';
import { explicar } from '../src/k8s/explicacoes.js';

describe('explicações do terminal', () => {
  it('um campo com HTML na mensagem de erro não vira HTML na caixa', () => {
    const saida = 'Error from server (BadRequest): error when creating "x.yaml": Deployment in version "v1" cannot be handled as a Deployment: strict decoding error: unknown field "<img src=x onerror=alert(1)>"';
    const [caixa] = explicar(saida, { falhou: true });
    expect(caixa.texto).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(`${caixa.titulo}${caixa.texto}`).not.toContain('<img');
  });

  it('o nome que aparece no título também chega escapado', () => {
    const [caixa] = explicar('Error from server (AlreadyExists): pods "<b>x</b>" already exists', { falhou: true });
    expect(caixa.titulo).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
