// @vitest-environment node
// O progresso do aluno fica guardado pelo id de cada missão: renomear ou apagar um id apaga, sem aviso, o XP e os lacres
// de quem já tinha resolvido. Todo id que já foi publicado (tests/ids-conhecidos.json) tem de continuar existindo.
// Missão nova: acrescente o id no fim da lista. O mesmo vale para os termos do glossário: a Revisão do dia guarda a caixa
// de cada cartão pelo id do termo (tests/ids-glossario.json).
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ITENS, OFICINA, TROUBLESHOOTING } from '../src/conteudo/index.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';

const conferir = (arquivo, ids, aviso) => {
  const conhecidos = JSON.parse(readFileSync(new URL(arquivo, import.meta.url), 'utf8'));
  const atuais = new Set(ids);
  expect(conhecidos.filter((id) => !atuais.has(id))).toEqual([]);
  expect([...atuais].filter((id) => !conhecidos.includes(id)), aviso).toEqual([]);
};

it('nenhum id publicado sumiu (renomear apaga o progresso de quem já resolveu)', () => {
  conferir('./ids-conhecidos.json', [...ITENS, ...TROUBLESHOOTING, ...OFICINA].map((i) => i.id), 'missão nova: acrescente o id em tests/ids-conhecidos.json');
});

it('nenhum termo do glossário sumiu (renomear apaga os cartões da revisão de quem já estudou)', () => {
  conferir('./ids-glossario.json', GLOSSARIO.map((g) => g.id), 'termo novo: acrescente o id em tests/ids-glossario.json');
});
