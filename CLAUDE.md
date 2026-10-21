# kube-learn

Trilha gamificada de Kubernetes, 100% no navegador (cluster simulado em JS). **O plano está em `PLANO.md`**: leia a
seção da fase pedida antes de mexer (fases em §15, simulador em §8, formato do conteúdo em §9, qualidade em §11).

## Convenções

- **Português do Brasil** nos nomes de arquivos, funções, variáveis e textos (como no DivergeTerraform). A saída do
  `kubectl` simulado fica em **inglês, igual à real**, com a explicação em português embaixo.
- **Dois idiomas (PT | EN no topo):** o português é a fonte; o inglês fica em `src/i18n/en/` e só é baixado quando
  alguém escolhe inglês (`src/i18n.js`). Texto de interface: `t('o texto em português', { valores })` (a chave é o
  português; `{nome}` em vez de `${}`), com a tradução em `src/i18n/en/ui-*.js`. Conteúdo novo (missão, termo,
  explicação do terminal): a tradução vai em `src/i18n/en/conteudo/<arquivo>.json` (o formato sai de
  `node scripts/textos.mjs nivelN`) e em `src/i18n/en/explicacoes.js`. `tests/i18n.test.js` confere que nada ficou sem
  tradução nem com a estrutura diferente. Nomes de recursos, comandos e YAML não se traduzem.
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
  `rede.js`, `discos.js` (PV, PVC, o provisionador local-path do kind e o sistema de arquivos de cada contêiner,
  com volumes), `cron.js` (o horário dos CronJobs), `cotas.js` (ResourceQuota e LimitRange), `manutencao.js` (PodDisruptionBudget,
  eviction, node que cai e despejo por taint NoExecute), `seguranca.js` (RBAC, NetworkPolicy e Pod Security; os papéis padrão
  copiados do kind ficam em `papeis.js`), `crds.js` (CustomResourceDefinition e o operador de backup), `kustomize.js` (o
  `kubectl kustomize`/`apply -k`), `helm.js` + `charts.js` (o helm do terminal e os charts prontos, sem template Go),
  `gitops.js` (o repositório git do terminal e o fiscal que sincroniza); `imagens.js` é o catálogo de imagens falsas (o comportamento de cada uma); `shell.js` roda o
  `sh -c` dos contêineres e o `kubectl exec`; `esquema.js` tem os campos de cada kind (decodificação estrita,
  validação, padrões, explain); `kubectl/` é a linha de comando.
- O cluster sobe com o que o kind tem (kindnet, kube-proxy, local-path-provisioner, StorageClass standard);
  `criarCluster({ metricas: true })` instala também o metrics-server (`kubectl top` e HPA). No `clusters.js`, use
  `metricas: true` no cluster de partida.
- `kubectl(cluster, 'kubectl get pods', { arquivos })` → `{ saida, stdout, stderr, codigo, observar?, sessao? }`.
  O kubectl não avança o relógio sozinho (só `delete` e `rollout status`, que esperam como o real); quem chama
  usa `cluster.avancar('30s')`.
- **Golden:** `tests/golden/kind/` é a saída do kubectl real (kind v1.37), capturada com
  `scripts/capturar-golden.sh`; `tests/golden/cenario.js` roda os mesmos passos no simulador e
  `tests/golden.test.js` compara. Mudou um formato de saída? O golden tem de continuar passando. Novo comando
  ou formato? Acrescente o passo nos dois lados e capture de novo num kind. Os manifestos novos ficam só no script
  (blocos `cat > /tmp/... <<'Y'`): o `cenario.js` lê de lá. Para capturar só uma seção nova, rode o cabeçalho do
  script mais a seção, num kind limpo.

## Conteúdo (`src/conteudo/`)

- Um arquivo por nível (`nivel0.js`...), ligado em `niveis.js`. Construtores em `util.js`: `licao` (com `inicial` abre
  na tela do exercício; sem, é leitura), `quiz` (alternativas com explicação, ou `resposta` RegExp + `exemplos`) e
  `problema`.
- A seção **Troubleshooting** (`troubleshooting.js`, rota `#/troubleshooting`) fica fora da trilha: abre desde o começo,
  não vale XP nem contêiner. Cada incidente tem mais de um defeito encadeado e usa o `incidente()` do nível 9 com
  `partidas: PARTIDA_TS`; o teste da trilha roda os dois.
- Missão de terminal: `terminal: true`, `solucaoTerminal: [...]` e testes `noClusterDoAluno` (conferem o cluster do
  próprio aluno). Resposta digitada: regra `{ resposta }` + `respostaCerta` (texto ou função do cluster).
- Clusters de partida em `clusters.js` (`nodes` com labels e taints; `antes`, comandos antes dos manifestos;
  `manifestos`; e `comandos`, cada um seguido de 1 minuto, que podem ser funções do cluster, como `c.derrubarNode('node-2')`,
  ou linhas `helm ...`; `repoHelm: true` já cadastra o repositório kube-learn; `gitops: { arquivo: yaml }` liga o GitOps).
- As regras de teste estão documentadas no topo de `src/verificacoes.js`. O teste da trilha
  (`tests/conteudo.test.js`) roda a solução e o inicial de toda missão.

## Comandos

```bash
npm run dev | npm run lint | npm test | npm run build
```

E2E (Playwright, contra o build): `npm run test:e2e`. No WSL faltam bibliotecas do Chromium; rode no contêiner oficial:
`docker run --rm --network host --ipc=host -e CI=1 -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD:/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test`

Antes de terminar uma tarefa: `npm run lint && npm test && npm run build` tudo verde.
