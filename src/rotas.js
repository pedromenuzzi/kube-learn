// Rotas por hash (#/trilha, #/ex/<id>...). Função pura, testada em tests/rotas.test.js.

export const ROTAS = {
  '/': { titulo: 'Início' },
  '/trilha': { titulo: 'Trilha' },
  '/ex': { titulo: 'Exercício', comParametro: true },
  '/livre': { titulo: 'Playground livre' },
  '/glossario': { titulo: 'Glossário' },
  '/revisao': { titulo: 'Revisão do dia' },
  '/certificado': { titulo: 'Certificado' },
  '/privacidade': { titulo: 'Privacidade' },
};

/** '#/ex/pod-1' → { caminho: '/ex', parametro: 'pod-1', titulo }. Rota desconhecida → null. */
export function resolverRota(hash) {
  const partes = (hash ?? '').replace(/^#/, '').split('/').filter(Boolean);
  const caminho = `/${partes[0] ?? ''}`;
  const rota = ROTAS[caminho];
  if (!rota) return null;
  const parametro = partes.slice(1).join('/') || null;
  if (Boolean(rota.comParametro) !== Boolean(parametro)) return null;
  return { caminho, parametro: parametro && decodeURIComponent(parametro), titulo: rota.titulo };
}
