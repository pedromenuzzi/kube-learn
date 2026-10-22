// Os quizzes dos níveis 1 a 11: as pegadinhas que uma missão não testa (o que um campo NÃO faz, a ordem das coisas, o
// que acontece depois). Ficam num arquivo só e entram na trilha logo depois do item `depois` (em niveis.js); o inglês
// fica em src/i18n/en/conteudo/quizzes.json. Construtor: quiz() de util.js, com alternativas que explicam cada escolha.
import { quiz } from './util.js';

/** Um quiz da trilha: `depois` é o id do item que vem antes dele. */
export const novoQuiz = (depois, dados) => ({ ...quiz(dados), depois, arquivo: 'quizzes' });

export const QUIZZES = [
  // novoQuiz('n1-licao-...', { id: 'n1-quiz-...', titulo, pergunta, alternativas: [{ texto, certa?, explicacao }], vidaReal, limite }),
];
