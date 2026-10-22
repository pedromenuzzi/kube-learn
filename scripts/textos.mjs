// O texto em português que falta traduzir, no formato dos arquivos de tradução (src/i18n/en/conteudo/*.json).
// Uso: node scripts/textos.mjs nivel3 | troubleshooting | quizzes | glossario
import { ITENS, TROUBLESHOOTING } from '../src/conteudo/index.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';
import { textosDoItem, textosDoTermo } from '../src/conteudo/traducao.js';

export function textosDoArquivo(nome) {
  if (nome === 'glossario') return Object.fromEntries(GLOSSARIO.map((g) => [g.id, textosDoTermo(g)]));
  // os quizzes de quizzes.js ficam num arquivo de tradução só deles (quizzes.json), não no do nível
  const itens = nome === 'troubleshooting' ? TROUBLESHOOTING
    : nome === 'quizzes' ? ITENS.filter((i) => i.arquivo === 'quizzes')
      : ITENS.filter((i) => `nivel${i.nivel}` === nome && i.arquivo !== 'quizzes');
  if (!itens.length && nome !== 'quizzes') throw new Error(`arquivo desconhecido: ${nome}`);
  return Object.fromEntries(itens.map((i) => [i.id, textosDoItem(i)]));
}

if (process.argv[2]) console.log(JSON.stringify(textosDoArquivo(process.argv[2]), null, 2));
