// Os idiomas do site: português (a fonte de tudo) e inglês. O inglês fica em src/i18n/en/ e só é baixado quando alguém
// escolhe inglês. A interface usa t('o texto em português', { valores }); o conteúdo (missões, glossário, níveis) é
// trocado no lugar, nos próprios objetos (src/conteudo/traducao.js), então quem lê item.titulo já lê no idioma atual.
import { ler, gravar, CHAVES } from './armazenamento.js';

let atual = 'pt';
let pacote = null; // src/i18n/en/index.js, depois de baixado

/** O idioma salvo; na primeira visita, o do navegador (português se ele pede português; senão, inglês). */
export function idiomaInicial() {
  const salvo = ler(CHAVES.preferencias, {}).idioma;
  if (salvo === 'pt' || salvo === 'en') return salvo;
  const pedidos = globalThis.navigator?.languages ?? [];
  return !pedidos.length || pedidos.some((l) => l.toLowerCase().startsWith('pt')) ? 'pt' : 'en';
}

export const idioma = () => atual;

/** O pacote do inglês, se já foi baixado (as explicações do terminal o consultam). */
export const pacoteIngles = () => (atual === 'en' ? pacote : null);

/** Troca o idioma: baixa o inglês na primeira vez e troca o texto do conteúdo. */
export async function definirIdioma(novo, { salvar = true } = {}) {
  if (novo === 'en' && !pacote) pacote = await import('./i18n/en/index.js');
  atual = novo;
  const { trocarConteudo } = await import('./conteudo/traducao.js');
  trocarConteudo(novo === 'en' ? pacote : null);
  if (salvar) gravar(CHAVES.preferencias, { ...ler(CHAVES.preferencias, {}), idioma: novo });
  if (globalThis.document) document.documentElement.lang = novo === 'en' ? 'en' : 'pt-BR';
}

/**
 * O texto da interface no idioma atual. A chave é o próprio texto em português; {nome} é trocado por valores.nome.
 * Sem tradução, fica o português (o teste tests/i18n.test.js confere que toda chave tem a sua).
 */
export function t(pt, valores) {
  const texto = atual === 'en' ? pacote?.ui[pt] ?? pt : pt;
  return valores ? texto.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m)) : texto;
}
