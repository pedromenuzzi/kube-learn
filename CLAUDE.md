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

## O simulador (`src/k8s/`)

- `cluster.js` (API, eventos, relógio, laço de reconciliação) → `controladores.js`, `scheduler.js`, `kubelet.js`,
  `rede.js`; `imagens.js` é o catálogo de imagens falsas (o comportamento de cada uma); `shell.js` roda o
  `sh -c` dos contêineres e o `kubectl exec`; `esquema.js` tem os campos de cada kind (decodificação estrita,
  validação, padrões, explain); `kubectl/` é a linha de comando.
- `kubectl(cluster, 'kubectl get pods', { arquivos })` → `{ saida, stdout, stderr, codigo, observar?, sessao? }`.
  O kubectl não avança o relógio sozinho (só `delete` e `rollout status`, que esperam como o real); quem chama
  usa `cluster.avancar('30s')`.
- **Golden:** `tests/golden/kind/` é a saída do kubectl real (kind v1.37), capturada com
  `scripts/capturar-golden.sh`; `tests/golden/cenario.js` roda os mesmos passos no simulador e
  `tests/golden.test.js` compara. Mudou um formato de saída? O golden tem de continuar passando. Novo comando
  ou formato? Acrescente o passo nos dois lados e capture de novo num kind.

## Comandos

```bash
npm run dev | npm run lint | npm test | npm run build
```

Antes de terminar uma tarefa: `npm run lint && npm test && npm run build` tudo verde.
