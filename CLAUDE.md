# kube-learn

Trilha gamificada de Kubernetes, 100% no navegador (cluster simulado em JS). **O plano está em `PLANO.md`**: leia a
seção da fase pedida antes de mexer (fases em §15, simulador em §8, formato do conteúdo em §9, qualidade em §11).

## Convenções

- **Português do Brasil** nos nomes de arquivos, funções, variáveis e textos (como no DivergeTerraform). A saída do
  `kubectl` simulado fica em **inglês, igual à real**, com a explicação em português embaixo.
- **JS puro com módulos ES** e Vite, sem framework de UI. Nada de dependência nova sem necessidade clara.
- **O motor só cresce com o conteúdo:** um recurso, campo ou comando do simulador entra quando um exercício precisa
  dele.
- **Determinístico:** o simulador usa relógio e sorteio com semente, nunca `Date.now()` nem `Math.random()` direto.
- **Todo exercício novo passa pelo teste da trilha inteira:** a solução passa em todos os casos (inclusive os ocultos)
  e o código inicial ainda falha.
- **Toda analogia do glossário tem `vidaReal` e `limite`** (onde a analogia quebra).
- **Acessibilidade básica não é opcional:** teclado, foco visível, `aria-live` nos resultados, contraste AA, "reduzir
  movimento". O pixel art é enfeite (`aria-hidden`) com uma lista acessível por baixo.
- **Licença:** código AGPL-3.0-or-later, conteúdo CC BY-SA 4.0. Arquivo copiado do DivergeTerraform leva no topo um
  comentário com a origem (`// Adaptado de sertaoseracloud/terraform-playground: <caminho>`).

## Comandos

```bash
npm run dev | npm run lint | npm test | npm run build
```

Antes de terminar uma tarefa: `npm run lint && npm test && npm run build` tudo verde.
