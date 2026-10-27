import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/', '.claude/'] }, // .claude/: as worktrees dos agentes
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // O simulador é determinístico: relógio e sorteio com semente (cluster.agora, aleatorio.js), nunca os do sistema.
    files: ['src/k8s/**/*.js'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Date', property: 'now', message: 'Simulador determinístico: use o relógio do cluster.' },
        { object: 'Math', property: 'random', message: 'Simulador determinístico: use o sorteio com semente (aleatorio.js).' },
      ],
      'no-restricted-syntax': ['error',
        { selector: 'NewExpression[callee.name="Date"][arguments.length=0]', message: 'Simulador determinístico: new Date() sem argumento lê o relógio do sistema.' },
        { selector: 'CallExpression[callee.name="Date"]', message: 'Simulador determinístico: Date() lê o relógio do sistema.' },
      ],
    },
  },
  {
    // O conteúdo (menos os clusters de partida) e as páginas fora do exercício não importam o simulador: ele iria inteiro
    // para o pacote da página inicial. O simulador chega com a tela do exercício (import dinâmico).
    files: ['src/conteudo/**/*.js', 'src/ui/paginas.js', 'src/ui/leitura.js', 'src/ui/revisao.js', 'src/ui/certificado.js', 'src/ui/festa.js', 'src/ui/topo.js', 'src/main.js'],
    ignores: ['src/conteudo/clusters.js'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/k8s/*', '!**/k8s/aleatorio.js'], message: 'O simulador não entra no pacote da página inicial: use src/constantes.js ou src/conteudo/manifestos.js.' },
        { group: ['./clusters.js', '**/conteudo/clusters.js'], message: 'clusters.js traz o simulador: use src/conteudo/manifestos.js.' },
      ] }],
    },
  },
];
