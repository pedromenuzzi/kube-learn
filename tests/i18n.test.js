// @vitest-environment node
// O inglês: toda missão, termo e explicação do terminal tem a sua tradução, com a mesma estrutura do português (os
// mesmos blocos de código, listas, alternativas e testes), sem trecho esquecido em português; e todo t('...') da
// interface tem a sua chave (o conteúdo não usa t(): o glossario.js tem o seu próprio t, de termo). Para conferir um arquivo só: npx vitest run tests/i18n.test.js -t nivel3
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { textosDoArquivo } from '../scripts/textos.mjs';
import * as EN from '../src/i18n/en/index.js';
import { REGRAS, STATUS } from '../src/k8s/explicacoes.js';
import { ITENS, NIVEIS, TROUBLESHOOTING } from '../src/conteudo/index.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';
import { textosDoItem, textosDoTermo, trocarConteudo } from '../src/conteudo/traducao.js';

const ARQUIVOS = ['nivel0', 'nivel1', 'nivel2', 'nivel3', 'nivel4', 'nivel5', 'nivel6', 'nivel7', 'nivel8', 'nivel9', 'nivel10', 'nivel11', 'troubleshooting', 'oficina', 'quizzes', 'glossario'];
const MARCAS = [/<code>/g, /<pre>/g, /<li>/g, /<h2>/g, /<tr>/g, /<p>/g, /<blockquote/g];
const contar = (s, re) => (s.match(re) ?? []).length;

/** Parece português? (fora do código: o que está em <code>, <pre> e o YAML/kubectl das dicas fica como está) */
export function pareceportugues(s) {
  // (os nomes das personagens ficam como são)
  const prosa = s.replace(/(?:<\/?b>)?Con(?:<\/?b>)?ceição|Apolinário/g, '').replace(/https?:\/\/\S+/g, '').replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '').replace(/<[^>]+>/g, ' ').replace(/\S*[-_=/.:{}]\S*/g, ' '); // sem nomes de recurso, caminhos e chave=valor
  return /[ãõç]|\b(não|você|também|está|então|porque|quando|sem|isso|esse|essa|são|pelo|pela|uma|com|para|que)\b/i.test(prosa);
}

function comparar(pt, en, onde, erros) {
  if (typeof pt === 'string') {
    if (typeof en !== 'string' || !en.trim()) return erros.push(`${onde}: falta`);
    for (const re of MARCAS) if (contar(pt, re) !== contar(en, re)) erros.push(`${onde}: ${re.source} ${contar(pt, re)} no português, ${contar(en, re)} no inglês`);
    if (pareceportugues(en)) erros.push(`${onde}: ainda parece português: ${en.slice(0, 90)}`);
    return;
  }
  if (Array.isArray(pt)) {
    if (!Array.isArray(en) || en.length !== pt.length) return erros.push(`${onde}: ${pt.length} itens no português`);
    pt.forEach((x, i) => comparar(x, en[i], `${onde}[${i}]`, erros));
    return;
  }
  for (const k of Object.keys(pt)) comparar(pt[k], en?.[k], `${onde}.${k}`, erros);
  for (const k of Object.keys(en ?? {})) if (!(k in pt)) erros.push(`${onde}.${k}: não existe no português`);
}

describe('inglês', () => {
  for (const arquivo of ARQUIVOS) {
    it(`${arquivo}: tudo traduzido, com a mesma estrutura`, () => {
      const pt = textosDoArquivo(arquivo);
      const en = JSON.parse(readFileSync(new URL(`../src/i18n/en/conteudo/${arquivo}.json`, import.meta.url), 'utf8'));
      const erros = [];
      for (const id of Object.keys(pt)) comparar(pt[id], en[id], id, erros);
      for (const id of Object.keys(en)) if (!(id in pt)) erros.push(`${id}: não existe no português`);
      expect(erros).toEqual([]);
    });
  }

  it('explicações do terminal: as mesmas regras, na mesma ordem', () => {
    const { REGRAS: R, STATUS: S } = EN.explicacoes;
    expect(R?.map((r) => r.re.source)).toEqual(REGRAS.map((r) => r.re.source));
    expect(S?.map((r) => r.re.source)).toEqual(STATUS.map((r) => r.re.source));
    for (const s of S) for (const c of ['titulo', 'texto', 'vidaReal']) expect(pareceportugues(s[c] ?? ''), `${s.re.source}.${c}`).toBe(false);
    // as regras com função: roda cada uma com grupos de mentira e confere que o texto saiu em inglês
    for (const r of R) {
      const caixa = r.t(['x', 'alfa', 'beta', 'gama', 'delta', 'in the namespace "x"']);
      for (const c of ['titulo', 'texto', 'vidaReal']) expect(pareceportugues(caixa[c] ?? ''), `${r.re.source}.${c}`).toBe(false);
    }
  });

  it('ida e volta: trocar para o inglês e voltar devolve o português exato', () => {
    const antes = [...ITENS, ...TROUBLESHOOTING].map(textosDoItem);
    const termos = GLOSSARIO.map(textosDoTermo);
    const niveis = NIVEIS.map((n) => n.titulo);
    trocarConteudo(EN);
    expect(NIVEIS[0].titulo).toBe(EN.niveis[0].titulo);
    trocarConteudo(null);
    expect([...ITENS, ...TROUBLESHOOTING].map(textosDoItem)).toEqual(antes);
    expect(GLOSSARIO.map(textosDoTermo)).toEqual(termos);
    expect(NIVEIS.map((n) => n.titulo)).toEqual(niveis);
  });

  it('os níveis', () => {
    for (const n of NIVEIS) expect(EN.niveis[n.numero]?.titulo, `nível ${n.numero}`).toBeTruthy();
  });

  it("toda chave t('...') da interface tem tradução", () => {
    const arquivos = [];
    const andar = (d) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) { if (!p.endsWith(join('i18n', 'en')) && !p.endsWith('conteudo')) andar(p); } else if (p.endsWith('.js')) arquivos.push(p);
      }
    };
    andar(new URL('../src', import.meta.url).pathname);
    const faltam = [];
    for (const f of arquivos) {
      const s = readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, ''); // sem os comentários
      for (const m of s.matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
        if (m[1] === '`' && m[2].includes('${')) faltam.push(`${f}: chave com \${} (use {nome} e valores): ${m[2].slice(0, 60)}`);
        const chave = m[2].replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
        if (!(chave in EN.ui)) faltam.push(`${f.split('/src/')[1]}: ${chave.slice(0, 80)}`);
      }
    }
    expect(faltam).toEqual([]);
  });
});
