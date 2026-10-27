// O índice leve do conteúdo, para a página inicial, o topo, a trilha e o certificado: os níveis com as missões (id, tipo,
// dificuldade, título...), sem o texto inteiro. Ele vem de src/conteudo/resumo.js, gerado do próprio conteúdo pelo
// vite.config.js (ninguém o edita à mão). O conteúdo completo (src/conteudo/index.js) só chega por import() nas páginas que
// precisam dele. Os objetos daqui são outros: a troca de idioma traduz os dois.
import resumo from 'virtual:indice-do-conteudo';
import { aoTrocarIdioma } from '../i18n.js';
import { chamadoDoDia } from '../jogo/rodizio.js';

/** Os níveis, como NIVEIS, com as missões resumidas. */
export const NIVEIS = resumo.niveis;
/** Os termos do glossário: { id, item, nivel } (o bastante para a revisão contar os cartões). */
export const GLOSSARIO = resumo.glossario;

const POR_ID = new Map([...NIVEIS.flatMap((n) => n.itens), ...resumo.secoes].map((i) => [i.id, i]));
/** O resumo do item pelo id (trilha, Troubleshooting, Oficina e o Plantão do dia). */
export const itemDoIndice = (id) => POR_ID.get(id) ?? (id?.startsWith('plantao-') ? chamadoDoDia(id.slice(8)) ?? undefined : undefined);

const texto = (pt, en) => (typeof en === 'string' ? en : pt);
aoTrocarIdioma((en) => {
  for (const n of NIVEIS) {
    n._pt ??= { titulo: n.titulo, descricao: n.descricao };
    n.titulo = texto(n._pt.titulo, en?.niveis[n.numero]?.titulo);
    n.descricao = texto(n._pt.descricao, en?.niveis[n.numero]?.descricao);
  }
  for (const i of POR_ID.values()) {
    i._pt ??= { titulo: i.titulo, projeto: i.projeto?.titulo };
    i.titulo = texto(i._pt.titulo, en?.itens[i.id]?.titulo);
    if (i.projeto) i.projeto.titulo = texto(i._pt.projeto, en?.itens[i.id]?.projeto);
  }
});
