// A troca de idioma do conteúdo: o texto de cada missão, termo do glossário e nível é trocado no lugar, nos próprios
// objetos (o português fica guardado em `_pt` para voltar). O formato de textosDoItem é o dos arquivos de tradução
// (src/i18n/en/conteudo/*.json), e scripts/textos.mjs o exporta para quem for traduzir.
import { ITENS, NIVEIS, PLAYGROUND, TROUBLESHOOTING } from './index.js';
import { GLOSSARIO } from './glossario.js';

const CAMPOS = ['titulo', 'enunciado', 'dica', 'vidaReal', 'limite', 'comoSaber', 'explicacao', 'dicaErro', 'rotuloResposta', 'relato', 'morador'];
const CAMPOS_TERMO = ['termo', 'definicao', 'vidaReal', 'limite', 'exemplo'];

/** O texto de um item: os campos de texto, as alternativas, os testes (descrição e mensagens) e o título do projeto. */
export function textosDoItem(item) {
  const o = {};
  for (const c of CAMPOS) if (typeof item[c] === 'string') o[c] = item[c];
  if (item.alternativas) o.alternativas = item.alternativas.map((a) => ({ texto: a.texto, ...(a.explicacao ? { explicacao: a.explicacao } : {}) }));
  if (item.testes?.length) {
    o.testes = item.testes.map((t) => {
      const msgs = Object.fromEntries(t.regras.map((r, i) => [i, r.msg]).filter(([, m]) => m));
      return { descricao: t.descricao, ...(Object.keys(msgs).length ? { msgs } : {}) };
    });
  }
  if (item.projeto) o.projeto = item.projeto.titulo;
  return o;
}

export const textosDoTermo = (g) => Object.fromEntries(CAMPOS_TERMO.filter((c) => typeof g[c] === 'string').map((c) => [c, g[c]]));

function aplicarTextos(item, o) {
  for (const c of CAMPOS) if (c in o) item[c] = o[c];
  o.alternativas?.forEach((a, i) => Object.assign(item.alternativas[i], a));
  o.testes?.forEach((t, i) => {
    item.testes[i].descricao = t.descricao;
    for (const [r, msg] of Object.entries(t.msgs ?? {})) item.testes[i].regras[r].msg = msg;
  });
  if (o.projeto) item.projeto.titulo = o.projeto;
}

/** O inglês por cima do português, campo a campo: o que não tem tradução continua em português. */
function mesclar(pt, en) {
  if (en === undefined || en === null) return pt;
  if (Array.isArray(pt)) return pt.map((x, i) => mesclar(x, en[i]));
  if (pt && typeof pt === 'object') return Object.fromEntries(Object.keys(pt).map((k) => [k, mesclar(pt[k], en[k])]));
  return typeof en === typeof pt ? en : pt;
}

/** `en`: o pacote src/i18n/en/index.js, ou null para voltar ao português. */
export function trocarConteudo(en) {
  for (const item of [...ITENS, ...TROUBLESHOOTING, PLAYGROUND]) {
    item._pt ??= textosDoItem(item);
    aplicarTextos(item, en ? mesclar(item._pt, en.itens[item.id]) : item._pt);
  }
  for (const g of GLOSSARIO) {
    g._pt ??= textosDoTermo(g);
    Object.assign(g, en ? mesclar(g._pt, en.glossario[g.id]) : g._pt);
  }
  for (const n of NIVEIS) {
    n._pt ??= { titulo: n.titulo, descricao: n.descricao };
    Object.assign(n, en ? mesclar(n._pt, en.niveis[n.numero]) : n._pt);
  }
}
