// O resumo do conteúdo que a página inicial, o topo e a trilha usam: de cada missão, só o que calcularJornada, o navio,
// a lista de salas e a revisão pedem (sem enunciado, YAML nem testes). Não se escreve à mão: o vite.config.js o gera do
// conteúdo (no build, um JSON; no dev e nos testes, na hora), e src/conteudo/indice.js o entrega. tests/indice.test.js
// confere que ele bate com NIVEIS.

// Sempre o português (a fonte), mesmo se o conteúdo já foi trocado para o inglês: indice.js traduz o resumo à parte.
const pt = (x, campo) => x._pt?.[campo] ?? x[campo];

const item = (i) => ({
  id: i.id,
  tipo: i.tipo,
  ...(i.dificuldade ? { dificuldade: i.dificuldade } : {}),
  titulo: pt(i, 'titulo'),
  ...(i.nivel !== undefined ? { nivel: i.nivel } : {}),
  ...(i.terminal ? { terminal: true } : {}),
  ...(i.projeto ? { projeto: { ...i.projeto, titulo: i._pt?.projeto ?? i.projeto.titulo } } : {}),
  ...(i.secao ? { secao: i.secao } : {}),
  ...(i.desde ? { desde: i.desde } : {}), // a data em que a missão foi publicada (a migração das conquistas usa)
  // Lição sem cluster e quiz abrem na tela de leitura (a página fica estreita); o resto, na tela do exercício.
  ...(i.tipo === 'quiz' || (i.tipo === 'licao' && !i.inicial) ? { leitura: true } : {}),
});

/** → { niveis: [{ id, numero, icone, titulo, descricao, itens }], secoes: [item], glossario: [{ id, item, nivel }] } */
export const resumoDoConteudo = ({ NIVEIS, TROUBLESHOOTING, OFICINA, GLOSSARIO }) => ({
  niveis: NIVEIS.map((n) => ({ id: n.id, numero: n.numero, icone: n.icone, titulo: pt(n, 'titulo'), descricao: pt(n, 'descricao'), itens: n.itens.map(item) })),
  secoes: [...TROUBLESHOOTING, ...OFICINA].map(item),
  glossario: GLOSSARIO.map((g) => ({ id: g.id, item: g.item, nivel: g.nivel })),
});
