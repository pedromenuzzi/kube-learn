// Quiz não se acerta pela forma: se a certa é quase sempre a mais longa, o aluno aprende a ler o comprimento, não o
// Kubernetes. Mede o `texto` de cada alternativa em caracteres, sem as tags HTML, em português e em inglês.
import { describe, it, expect } from 'vitest';
import { NIVEIS } from '../src/conteudo/niveis.js';
import { NIVEL0 } from '../src/conteudo/nivel0.js';
import { QUIZZES } from '../src/conteudo/quizzes.js';
import nivel0 from '../src/i18n/en/conteudo/nivel0.json';
import quizzes from '../src/i18n/en/conteudo/quizzes.json';

const tamanho = (html) => html.replace(/<[^>]*>/g, '').length;
const ingles = { ...nivel0, ...quizzes };

const porId = new Map();
for (const q of [...NIVEIS.flatMap((n) => n.itens), ...NIVEL0, ...QUIZZES]) {
  if (q.tipo === 'quiz' && q.alternativas && !porId.has(q.id)) porId.set(q.id, q);
}

function medir(q, textos) {
  const tamanhos = textos.map(tamanho);
  const certa = q.alternativas.findIndex((a) => a.certa);
  const segunda = Math.max(...tamanhos.filter((_, i) => i !== certa));
  return { id: q.id, certa: tamanhos[certa], segunda, razao: tamanhos[certa] / segunda };
}

const idiomas = {
  pt: [...porId.values()].map((q) => medir(q, q.alternativas.map((a) => a.texto))),
  en: [...porId.values()].map((q) => medir(q, q.alternativas.map((a, i) => ingles[q.id]?.alternativas?.[i]?.texto ?? a.texto))),
};

describe.each(Object.entries(idiomas))('quizzes justos (%s)', (_, medidas) => {
  it('acha os quizzes de alternativas', () => {
    expect(medidas.length).toBeGreaterThan(30);
  });

  it('a certa é a única mais longa em no máximo 1/3 dos quizzes', () => {
    const unicaMaisLonga = medidas.filter((m) => m.certa > m.segunda);
    expect(unicaMaisLonga.length / medidas.length, `${unicaMaisLonga.length}/${medidas.length}: ${unicaMaisLonga.map((m) => m.id).join(', ')}`)
      .toBeLessThanOrEqual(1 / 3);
  });

  it('nenhuma certa passa de 40% a mais que a segunda mais longa', () => {
    expect(medidas.filter((m) => m.razao > 1.4).map((m) => `${m.id} (${m.certa}/${m.segunda})`)).toEqual([]);
  });
});
