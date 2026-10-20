// Tudo o que o site guarda fica no localStorage deste navegador, com o prefixo kube-learn:.
// O acesso pode falhar (janela anônima, dados bloqueados): o site continua funcionando sem guardar.

const PREFIXO = 'kube-learn:';

/** As chaves que o site grava (a página de privacidade lista estas). */
export const CHAVES = {
  progresso: 'progresso', // { [idDoItem]: { status: 'resolvido' | 'tentado', em: 'AAAA-MM-DD' } }
  arquivos: 'arquivos:', // arquivos:<idDoItem> → { nome: conteúdo } que o aluno escreveu
  dias: 'dias', // ['AAAA-MM-DD', ...]: os dias em que o aluno estudou (para a sequência 🔥)
  janelas: 'janelas', // a arrumação das janelas da tela do exercício
  preferencias: 'preferencias', // { tema, texto, movimento }
};

/** Marca hoje como dia de estudo (para a sequência de dias). */
export function registrarDia(hoje) {
  const dias = ler(CHAVES.dias, []);
  if (!dias.includes(hoje)) gravar(CHAVES.dias, [...dias, hoje].slice(-400));
}

export function ler(chave, padrao = null) {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return v === null ? padrao : JSON.parse(v);
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
export function registrarResultado(id, resolvido, hoje = new Date().toISOString().slice(0, 10)) {
  const p = ler(CHAVES.progresso, {});
  if (p[id]?.status === 'resolvido') return p;
  p[id] = { status: resolvido ? 'resolvido' : 'tentado', em: hoje };
  gravar(CHAVES.progresso, p);
  return p;
}
