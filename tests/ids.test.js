// @vitest-environment node
// O progresso do aluno fica guardado pelo id de cada missão: renomear ou apagar um id apaga, sem aviso, o XP e os lacres
// de quem já tinha resolvido. Todo id que já foi publicado (tests/ids-conhecidos.json) tem de continuar existindo.
// Missão nova: acrescente o id no fim da lista.
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ITENS, TROUBLESHOOTING } from '../src/conteudo/index.js';

it('nenhum id publicado sumiu (renomear apaga o progresso de quem já resolveu)', () => {
  const conhecidos = JSON.parse(readFileSync(new URL('./ids-conhecidos.json', import.meta.url), 'utf8'));
  const atuais = new Set([...ITENS, ...TROUBLESHOOTING].map((i) => i.id));
  expect(conhecidos.filter((id) => !atuais.has(id))).toEqual([]);
  expect([...atuais].filter((id) => !conhecidos.includes(id)), 'missão nova: acrescente o id em tests/ids-conhecidos.json').toEqual([]);
});
