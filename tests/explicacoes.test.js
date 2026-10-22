// @vitest-environment node
// A caixa "Na vida real" do terminal: o que vem da saída do kubectl (nomes, campos) entra escapado no HTML.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('as caixas das mensagens novas, com a saída do kind', () => {
  const ler = (nome) => readFileSync(new URL(`./golden/kind/${nome}.txt`, import.meta.url), 'utf8');
  const titulos = (saida, falhou) => explicar(saida, { falhou }).map((c) => c.titulo);

  it('fuso horário inventado, imagem com Never, norma nova com pods antigos e campo ignorado no patch', () => {
    expect(titulos('The CronJob "marte" is invalid: spec.timeZone: Invalid value: "Mars/Olympus": unknown time zone Mars/Olympus', true)).toEqual(['"Mars/Olympus" não é um fuso horário']);
    expect(titulos('nunca   0/1     ErrImageNeverPull   0          68s', false)).toEqual(['A imagem não está no node, e o pod proibiu baixar']);
    expect(titulos(ler('real-label-ns-restrito'), false)).toContain('A norma nova vale para os próximos pods');
    expect(titulos(ler('oficina-patch-desconhecido'), false)).toEqual(['O campo foi ignorado']);
  });

  it('request maior que o limit, recurso inventado, rótulo de PodSecurity inválido, apply num objeto criado sem apply e valor fora da lista', () => {
    expect(titulos(ler('val-apply-cpu'), true)).toEqual(['O request de cpu passa do limit']);
    expect(titulos(ler('val-apply-memoria'), true)).toEqual(['O request de memory passa do limit']);
    expect(titulos(ler('val-apply-cpus'), true)).toEqual(['"cpus" não é um recurso de contêiner']);
    expect(titulos(ler('val-label-psa-nivel'), true)).toEqual(['"restrito" não vale no rótulo de PodSecurity']);
    expect(titulos(ler('val-apply-ns-psa'), true)).toEqual(['"restrito" não vale no rótulo de PodSecurity', 'Aviso: o objeto não nasceu de um apply']);
    expect(titulos(ler('val-apply-sem-last-applied'), false)).toEqual(['Aviso: o objeto não nasceu de um apply']);
    const [politica] = explicar(ler('val-apply-politica'), { falhou: true });
    expect(politica.titulo).toBe('"Talvez" não é um valor aceito em imagePullPolicy');
    expect(politica.texto).toContain('<code>IfNotPresent</code>');
  });
});
