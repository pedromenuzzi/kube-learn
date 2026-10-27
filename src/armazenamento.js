// Tudo o que o site guarda fica no localStorage deste navegador, com o prefixo kube-learn:.
// O acesso pode falhar (janela anônima, dados bloqueados): o site continua funcionando sem guardar.
import { hojeLocal } from './jogo/gamificacao.js';

const PREFIXO = 'kube-learn:';

/** As chaves que o site grava (a página de privacidade lista estas). */
export const CHAVES = {
  progresso: 'progresso', // { [idDoItem]: { status: 'resolvido' | 'tentado', em: 'AAAA-MM-DD' } }
  conquistas: 'conquistas', // { lacres: { [nivel]: 'AAAA-MM-DD' }, navio: 'AAAA-MM-DD' }: o que já foi ganho (missão nova não tira)
  arquivos: 'arquivos:', // arquivos:<idDoItem> → { nome: conteúdo } que o aluno escreveu
  dias: 'dias', // ['AAAA-MM-DD', ...]: os dias em que o aluno estudou (para a sequência 🔥)
  janelas: 'janelas', // a arrumação das janelas da tela do exercício
  preferencias: 'preferencias', // { tema, texto, movimento, som, idioma }
  revisao: 'revisao', // { [idDoTermo]: { caixa, proxima } }: os cartões da revisão do dia
  nome: 'nome', // o nome que vai no certificado (só se você escrever)
  recordes: 'recordes', // { [idDoExercicio]: ms }: o menor tempo de cada exercício da Oficina do kubectl
  plantoes: 'plantoes', // { [idDoPlantao]: { ms, entregas } }: o tempo e as entregas da primeira vez que resolveu
  plantaoAberto: 'plantaoAberto', // { [idDoPlantao]: { ms, entregas } }: o plantão em andamento (sai ao resolver)
};

/** O que cada chave guarda, em português (a página de privacidade mostra esta lista). */
export const DESCRICOES = {
  progresso: 'Quais missões você resolveu ou tentou, e quando.',
  conquistas: 'Os lacres dos níveis e o navio carregado, com a data: missão nova que chega depois não tira.',
  'arquivos:': 'Os arquivos que você escreveu em cada missão.',
  dias: 'Os dias em que você estudou (para a sequência 🔥).',
  janelas: 'Onde você deixou as janelas da tela do exercício.',
  preferencias: 'Tema, tamanho do texto, reduzir movimento, efeitos sonoros e idioma.',
  revisao: 'Em que caixa está cada cartão da revisão e quando ele volta.',
  nome: 'O nome que você escreveu para o certificado.',
  recordes: 'O seu menor tempo em cada exercício da Oficina do kubectl.',
  plantoes: 'O tempo e o número de entregas de cada Plantão do dia que você atendeu (a primeira vez).',
  plantaoAberto: 'O tempo e as entregas do Plantão do dia que você começou e ainda não resolveu.',
};

/**
 * A forma de cada chave (o padrão de quem lê): o que o restaurar aceita de um arquivo. Toda chave de CHAVES tem a sua
 * (tests/armazenamento.test.js confere).
 */
export const FORMAS = {
  progresso: {},
  conquistas: {},
  'arquivos:': {},
  dias: [],
  janelas: {},
  preferencias: {},
  revisao: {},
  nome: '',
  recordes: {},
  plantoes: {},
  plantaoAberto: {},
};

/** O valor tem a forma do padrão: nem null, nem outro tipo, nem lista no lugar de objeto (ou o contrário). */
const mesmaForma = (v, padrao) => v !== null && typeof v === typeof padrao && Array.isArray(v) === Array.isArray(padrao);

/** Todas as chaves do site neste navegador. */
export function todasAsChaves() {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO));
  } catch {
    return [];
  }
}

export function exportarTudo() {
  return Object.fromEntries(todasAsChaves().map((k) => [k.slice(PREFIXO.length), ler(k.slice(PREFIXO.length))]));
}

export function apagarTudo() {
  for (const k of todasAsChaves()) apagar(k.slice(PREFIXO.length));
}

/** Marca hoje como dia de estudo (para a sequência de dias). */
export function registrarDia(hoje) {
  const dias = ler(CHAVES.dias, []);
  if (!dias.includes(hoje)) gravar(CHAVES.dias, [...dias, hoje].slice(-400));
}

/**
 * O valor guardado. Com um padrão, um valor de outra forma (um 'null', um texto onde vai um objeto) volta como o padrão,
 * sem apagar o guardado; num objeto, as entradas null somem (quem lê faz p.status sem medo).
 */
export function ler(chave, padrao = null) {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (bruto === null) return padrao;
    const v = JSON.parse(bruto);
    if (padrao === null || padrao === undefined) return v;
    if (!mesmaForma(v, padrao)) return padrao;
    return typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null)) : v;
  } catch {
    return padrao;
  }
}

export function gravar(chave, valor) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch { /* sem armazenamento: segue sem guardar */ }
}

export function apagar(chave) {
  try {
    localStorage.removeItem(PREFIXO + chave);
  } catch { /* idem */ }
}

/** Marca o item como resolvido (não desfaz) ou tentado. */
export function registrarResultado(id, resolvido, hoje = hojeLocal()) { // a data local (em UTC, depois das 21h no Brasil já era amanhã)
  const p = ler(CHAVES.progresso, {});
  if (p[id]?.status === 'resolvido') return p;
  p[id] = { status: resolvido ? 'resolvido' : 'tentado', em: hoje };
  gravar(CHAVES.progresso, p);
  globalThis.dispatchEvent?.(new Event('kube-learn:progresso')); // o placar do topo se atualiza
  return p;
}

/** A forma esperada da chave (arquivos:<id> usa a de arquivos:), ou undefined se a chave não é do site. */
function formaDa(chave) {
  if (chave.startsWith(CHAVES.arquivos)) return chave.length > CHAVES.arquivos.length ? FORMAS[CHAVES.arquivos] : undefined;
  return Object.values(CHAVES).includes(chave) ? FORMAS[chave] : undefined; // lidas na hora: a chave nova já vale
}

/**
 * Confere o conteúdo do arquivo do "Baixar meus dados" (já lido como JSON). Devolve o problema, { texto, valores }
 * para o t(), ou null se dá para restaurar.
 */
export function conferirDados(dados) {
  // Vazio ({}) também não: restaurar apagaria tudo sem perguntar (sem progresso aqui, não há confirmação).
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) || !Object.keys(dados).length) return { texto: 'Este arquivo não tem os dados do kube-learn.' };
  for (const [chave, valor] of Object.entries(dados)) {
    const forma = formaDa(chave);
    if (forma === undefined) return { texto: 'O arquivo tem uma chave que o kube-learn não conhece: {chave}.', valores: { chave } };
    if (!mesmaForma(valor, forma)) return { texto: 'O valor de {chave} no arquivo não tem a forma esperada.', valores: { chave } };
  }
  return null;
}

/**
 * Troca tudo o que o site guarda pelo conteúdo do arquivo (não mescla). Com qualquer problema, não grava nada e
 * devolve o problema (como o conferirDados); senão, null. O placar do topo se atualiza pelo evento.
 */
export function restaurar(dados) {
  const problema = conferirDados(dados);
  if (problema) return problema;
  apagarTudo();
  for (const [chave, valor] of Object.entries(dados)) gravar(chave, valor);
  globalThis.dispatchEvent?.(new Event('kube-learn:progresso'));
  return null;
}
