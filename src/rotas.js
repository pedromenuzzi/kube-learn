// Rotas por hash (#/trilha, #/ex/<id>...). Função pura, testada em tests/rotas.test.js.

export const ROTAS = {
  '/': { titulo: 'Início' },
  '/trilha': { titulo: 'Trilha' },
  '/ex': { titulo: 'Exercício', comParametro: true },
  '/livre': { titulo: 'Playground livre' },
  '/troubleshooting': { titulo: 'Troubleshooting' },
  '/oficina': { titulo: 'Oficina do kubectl' },
  '/plantao': { titulo: 'Plantão do dia' },
  '/diario': { titulo: 'Diário de bordo' },
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
  try {
    return { caminho, parametro: parametro && decodeURIComponent(parametro), titulo: rota.titulo };
  } catch {
    return null; // '#/ex/%' e outros escapes quebrados: página não encontrada
  }
}
