# 🏗️ kube-learn: plano de criação

> Aprenda Kubernetes contêiner por contêiner. Cada missão resolvida embarca mais um contêiner no seu navio.

Plano escrito em 16/10/2026. A referência é o **DivergeTerraform**
([site](https://sertaoseracloud.github.io/terraform-playground/) · [repo](https://github.com/sertaoseracloud/terraform-playground)),
uma trilha gamificada de Terraform que roda simulada no navegador. Aqui fazemos o mesmo para Kubernetes. **O foco é o
aprendizado**; o jogo existe para dar ritmo e vontade de voltar.

---

## 1. A ideia

- **Site estático no GitHub Pages, tudo no navegador.** Não precisa de cluster, conta na nuvem nem cadastro, e não
  custa nada.
- **Cluster Kubernetes simulado em JavaScript.** O aluno escreve YAML e usa o `kubectl` num terminal. Os pods nascem,
  quebram e se recuperam, e a saída é igual à do `kubectl` de verdade.
- **Toda ideia vem com uma comparação com a vida real**, e cada comparação diz **onde ela deixa de valer** para não
  ensinar errado.
- **Exercícios no estilo LeetCode.** Há testes visíveis e ocultos. Os ocultos fazem "caos": apagam um pod, derrubam um
  node ou mandam carga. Resposta decorada não passa.
- **O progresso é um navio.** Cada missão resolvida embarca mais um contêiner, e a pilha sobe até ficar
  engraçada.
- **Língua: português do Brasil.** O `kubectl` responde em inglês, como o real, e embaixo de cada resposta vem uma
  explicação em português.
- **Público:** quem nunca usou Kubernetes, ou quem usa "copiando YAML" sem entender. A trilha vai até o nível de quem
  estuda para o CKAD.

---

## 2. O que aproveitamos do DivergeTerraform

| Lá | Aqui |
|---|---|
| Simulador de Terraform (parser de HCL feito à mão e motor de plano) | Simulador de cluster: YAML lido pela lib `yaml`, API server, controladores, scheduler, kubelet, rede e `kubectl` |
| Glossário com analogia do dia a dia | Glossário com **analogia e "onde a analogia quebra"** |
| Abas Descrição, Docs, Solução e Testes | As mesmas, mais a aba **🏠 Na vida real** |
| Casos de teste visíveis e ocultos | Os mesmos, com caos nos ocultos |
| Terminal `terraform` | Terminal `kubectl` (e `helm` no fim) |
| Grafo, Estado e Outputs | **Cluster** (desenho simples dos nodes e pods), **Recursos** (árvore) e **Eventos** |
| Mapa pixel art com uma vila que cresce | **Navio porta-contêiner em pixel art 8-bit que ganha um contêiner por missão** (com o motor de sprites deles) |
| XP, 🔥 sequência, desbloqueio a 70% e certificados | Os mesmos, mais **revisão espaçada** e **incidentes** |
| O teste roda a trilha inteira (toda solução passa e todo código inicial falha) | Igual. É o teste mais importante |

**Licença do original:** o código é AGPL-3.0 e o conteúdo é CC BY-SA 4.0. Pegar ideias é livre, mas **copiar arquivo
de lá obriga o nosso projeto a ser AGPL**. A decisão está na §13.

---

## 3. Como o aprendizado funciona

Todo item da trilha segue o mesmo ciclo:

```
 1. Vida real        2. Conceito          3. Mão na massa         4. Feedback            5. Revisão
 analogia curta  →   o que é, para que  →  YAML e/ou kubectl   →  testes + explicação →  cartões em dias
 + onde ela quebra   serve, exemplo        no cluster simulado     do erro em pt-BR       espaçados
```

Regras pedagógicas, válidas para todo conteúdo:

1. **Comparação antes do conceito.** A lição começa pelo que a pessoa já conhece. Depois vem o termo técnico.
2. **Toda analogia mostra o limite.** Exemplo: "o Secret é um envelope lacrado, **não um cofre**: base64 qualquer um
   abre".
3. **Uma ideia nova por exercício.** O enunciado tem sempre a mesma forma: 🎯 o que fazer, 📚 as palavras técnicas
   (até 6, com analogia), ✅ como saber que deu certo e 💡 uma dica.
4. **O erro também ensina.** Cada erro do `kubectl` ou do cluster (ImagePullBackOff, Forbidden...) traz uma caixa em
   português com o que houve, a analogia e onde mexer.
5. **Ver acontecer.** O relógio do cluster anda, e o aluno vê o pod passar por Pending, ContainerCreating e Running, e
   cair em CrashLoopBackOff, com `-w` ou no desenho do cluster.
6. **Aprender a investigar.** Um nível inteiro é de incidentes, com o roteiro `get` → `describe` → eventos → `logs` →
   `exec`.
7. **Revisão espaçada.** Cartões tirados do glossário voltam em 1, 2, 4, 7 e 15 dias (sistema de Leitner). É o que
   fixa o conteúdo.
8. **Realismo onde importa.** Nomes de recursos, mensagens e formato das tabelas são iguais ao Kubernetes real. Tudo
   que o aluno aprende vale fora do site.

---

## 4. Comparações com a vida real

O cenário principal é um **condomínio**: é familiar, e os conceitos ligados (node, pod, scheduler) ficam na mesma
cena. Cada linha vira uma entrada do glossário (`src/conteudo/glossario.js`) e aparece em quatro lugares: na aba 🏠,
no balão dos termos técnicos, nas explicações de erro e nos cartões de revisão.

| Conceito | Na vida real | Onde a analogia quebra |
|---|---|---|
| Imagem | **Módulo pré-fabricado**: sai da fábrica sempre igual | É só leitura; para mudar, fabrica-se outra versão (tag) |
| Contêiner | O **módulo instalado e funcionando** | Muitos contêineres saem da mesma imagem ao mesmo tempo |
| Registry | A **fábrica e o depósito** | — |
| Tag | O **modelo ou lote** (`v1`, `v2`) | `latest` não quer dizer "o mais novo" |
| Cluster | Um **condomínio**: vários prédios e uma administração | — |
| Control plane | A **administração** do condomínio | Num cluster gerenciado (EKS, GKE, AKS) você nem a vê |
| Node | Um **prédio** do condomínio, com energia (CPU) e espaço (memória) | — |
| Pod | Um **apartamento**: tem endereço (IP), e quem mora nele divide o espaço | Apartamento com defeito **não é consertado**: dá lugar a outro, com outro endereço |
| Sidecar | O **colega de apartamento** que ajuda o titular | — |
| Init container | A **equipe de pintura** que prepara o apartamento antes da mudança | — |
| kubectl | O **interfone com a portaria** | Só fala com a portaria (API Server), nunca direto com os prédios |
| Manifesto YAML | A **planta**: diz *como quer*, não *como fazer* | — |
| Reconciliação | O **termostato**: compara o desejado com o real e corrige sem parar | — |
| Namespace | Uma **empresa** que aluga apartamentos em vários prédios; cada uma pode ter a sua "sala-de-reunião" | Sozinho, o namespace **não isola a rede** nem os recursos |
| Labels e seletores | **Etiquetas na porta** e "todos com a etiqueta X" | — |
| ReplicaSet | Um contrato: **"sempre 3 apartamentos ocupados"** | — |
| Deployment | **Reforma por etapas**: troca um apartamento por vez, sem fechar o condomínio, e dá para desfazer | — |
| `maxSurge` / `maxUnavailable` | Quantos apartamentos **extras temporários** abrem / quantos podem ficar **fechados** durante a reforma | — |
| Recreate | **Fechar tudo** para reformar | — |
| Service (ClusterIP) | O **ramal fixo** da empresa: as pessoas mudam, o ramal fica | — |
| Endpoints | A **lista de apartamentos atrás do ramal**, só os prontos para atender | — |
| NodePort | Um **interfone numerado** na porta de cada prédio | — |
| LoadBalancer | A **portaria da rua**, com catracas que distribuem as pessoas | — |
| Ingress | O **balcão de informações**: "/financeiro, bloco B" | O ingress-nginx foi aposentado em 2026; o caminho novo é o Gateway API |
| Gateway API | A **portaria do condomínio** (Gateway, cuidada pela administração) com a **placa de cada empresa** (HTTPRoute) | — |
| DNS do cluster | O **endereço completo**: `nome.empresa.svc.cluster.local` | — |
| ConfigMap | O **quadro de avisos** | — |
| Secret | Um **envelope lacrado** | **Não é cofre**: base64 qualquer um abre |
| emptyDir | A **mesa de trabalho**: some na mudança | — |
| PV / PVC / StorageClass | O **box na garagem** / o **pedido de aluguel** do box / o **tipo** de box | — |
| StatefulSet | **Apartamentos numerados** (101, 102...), cada um sempre com o mesmo box | — |
| DaemonSet | O **extintor**: um em cada prédio, inclusive nos que forem construídos depois | — |
| Job | Uma **obra pontual**: pintou a fachada, acabou | — |
| CronJob | A **coleta de lixo toda terça às 7h** | — |
| Liveness probe | O síndico bate na porta: "**tá vivo?**" Se ninguém responde, reinicia | — |
| Readiness probe | "**Já pode receber visita?**" Enquanto não pode, o ramal não manda ninguém | — |
| Startup probe | O **prazo da mudança**: antes dele, ninguém cobra | — |
| Requests | A **potência contratada**: só vai para o prédio onde cabe | — |
| Limit de memória | O **disjuntor**: passou do limite, desarma (**OOMKilled**) | — |
| Limit de CPU | A **pressão da água reduzida**: nada desarma, só fica lento | — |
| QoS | O **tipo de contrato**: decide quem é despejado primeiro | — |
| ResourceQuota / LimitRange | A **cota total** da empresa / o **tamanho mínimo e máximo** de cada apartamento | — |
| HPA | **Contratar temporários na Black Friday** e dispensar depois | — |
| Cluster Autoscaler | **Construir mais um prédio** quando nenhum tem espaço | — |
| PodDisruptionBudget | "**Pelo menos 2 elevadores funcionando**", mesmo na manutenção | — |
| nodeSelector / affinity | "Quero um **prédio com gerador**" | — |
| Anti-affinity | **Não pôr os dois backups no mesmo prédio** | — |
| Taint / Toleration | **Prédio restrito**: só entra quem tem autorização | A toleration **permite**, não **obriga**. Para obrigar, use affinity |
| cordon / drain | **Interditar** o prédio para novos moradores / **esvaziar** o prédio para a reforma | — |
| Node NotReady | **Queda de energia** no prédio | — |
| Role / RoleBinding | O **tipo de crachá** / **entregar o crachá** a alguém | — |
| ClusterRole | O **crachá master**, que vale no condomínio inteiro | — |
| ServiceAccount | O **crachá de máquina** (o do elevador, o das câmeras) | — |
| NetworkPolicy | As **portas e catracas internas** | Sem nenhuma política, **tudo fica aberto** |
| securityContext | **Ninguém recebe a chave mestra** (root) | — |
| Pod Security Admission | As **normas dos bombeiros** de cada bloco | — |
| Events / Logs | O **livro de ocorrências** / o **diário** de cada morador | — |
| describe / exec / port-forward | A **ficha cadastral** / **entrar no apartamento** / uma **passagem temporária** da sua casa até lá | — |
| CrashLoopBackOff | O morador **desmaia toda vez que entra**, e o síndico espera cada vez mais antes de tentar de novo | — |
| ImagePullBackOff | O **pré-moldado não chegou**: o nome ou o modelo estava errado no pedido | — |
| Pending | **Esperando no lobby**: nenhum prédio tem espaço ou autorização | — |
| Helm | O **projeto padrão da construtora**; o `values.yaml` são os acabamentos escolhidos | — |
| Kustomize | A **mesma planta com ajustes por cidade** (dev e prod) | — |
| GitOps | A **planta registrada em cartório**, com um fiscal que acerta a obra sozinho | — |
| CRD / Operator | Um **formulário novo** na administração / o **especialista** que sabe cuidar daquilo | — |

### 4.1 Personagens para decorar o control plane

O nome de cada personagem começa como o componente. Aparecem em balões nas lições do nível 1.

| Personagem | Componente | Papel |
|---|---|---|
| **Seu Apolinário**, o porteiro | **API** Server | Todo pedido passa por ele |
| **Dona Etelvina**, a arquivista | **etcd** | Guarda o registro de tudo |
| **Shirley**, a corretora | **Scheduler** | Escolhe o prédio de cada apartamento novo |
| **Dona Conceição**, a fiscal | **Controller** Manager | Compara o desejado com o real e corrige |
| **Kleber**, o zelador | **kubelet** | Um em cada prédio, cuida dos apartamentos dele |

---

## 5. A trilha (cada item = um contêiner no navio)

> Na Fase 5 o prédio virou um **navio porta-contêiner**, que combina mais com o Kubernetes (contêineres, timoneiro).

### 5.1 Visual do navio

O navio é desenhado em **pixel art 8-bit**, no estilo dos jogos antigos, e ocupa a largura da página inicial:

- **Começa vazio:** só o casco, a ponte de comando e o mar.
- **Cada item resolvido** embarca um contêiner com a cor do nível (lição, quiz e fácil são de 20 pés; médio e
  difícil, de 40), empilhado na ordem da trilha.
- **A pilha só sobe**, e a partir da 6ª fileira começa a entortar: a graça é ver até onde aguenta.
- **O helicóptero** traz o contêiner da próxima missão; nível lacrado (100%) ganha o lacre dourado nos contêineres.
- **No topo:** uma gaivota; com tudo embarcado, a bandeira.

**Como desenhar:**

- **Motor:** `pixel.js`, adaptado dos cenários do DivergeTerraform com crédito (§13), para as nuvens; o resto é
  desenhado com retângulos num `<canvas>`, sem suavização (`image-rendering: pixelated`). Céu e janelas usam as cores
  do tema (noite no tema escuro).
- **Fonte pixel** para os títulos, por exemplo "Press Start 2P", servida pelo próprio site com `@fontsource`. O
  texto corrido fica em Atkinson Hyperlegible, porque fonte pixel cansa na leitura.
- **Mesmo estilo nos lacres** de cada nível e no certificado final.

**Acessibilidade:** o canvas é só enfeite (`aria-hidden`). Por baixo dele há uma lista de níveis com links, na ordem
do curso, que é o que o teclado e o leitor de tela usam. "Reduzir movimento" para as animações.

### 5.2 Níveis

| Nível | Tema | Analogia âncora | Itens* |
|---|---|---|---|
| 0 | **Contêineres** (antes do Kubernetes) | Pré-moldados | 5 L + 8 quizzes |
| 1 | **Cluster, kubectl e Pods** | Condomínio, administração e personagens | 3 L + 14 |
| 2 | **ReplicaSet e Deployment** | Contrato e reforma por etapas | 2 L + 12 |
| 3 | **Services e rede** (Ingress e Gateway API) | Ramal, portaria e balcão | 3 L + 14 |
| 4 | **Configuração e armazenamento** | Quadro de avisos, envelope e box da garagem | 3 L + 14 |
| 5 | **Jobs, CronJobs, DaemonSets, init e sidecar** | Obra pontual, coleta de lixo e extintor | 2 L + 10 |
| 6 | **Saúde e recursos** (probes, limits, HPA) | Síndico, disjuntor e temporários | 3 L + 14 |
| 7 | **Scheduling e manutenção** | Prédio com gerador, prédio restrito, reforma | 2 L + 10 |
| 8 | **Segurança** (RBAC e NetworkPolicy) | Crachás e catracas | 3 L + 12 |
| 9 | **Troubleshooting** (só incidentes) | Plantão do síndico | 1 L + 20 |
| 10 | **Helm, Kustomize e GitOps** | Projeto da construtora | 3 L + 10 |
| 11 | **Projetos finais** | Tudo junto | 8 projetos de ~5 etapas |

\* L = lição. As quantidades são metas. No total, cerca de 30 lições, 130 exercícios e 40 etapas.

### 5.3 O que cada nível ensina

- **0 · Contêineres:**
  - por que o contêiner existe ("funciona na minha máquina");
  - imagem × contêiner, registry e tags (o perigo do `latest`);
  - por que orquestrar e de onde vem o nome (*Kubernetes* = timoneiro, em grego).
  - Só quizzes, **sem simulador de Docker**.
- **1 · Cluster, kubectl e Pods:**
  - arquitetura (os personagens), `get`, `describe`, `logs`, `exec`, `delete`, `explain`;
  - o YAML de um Pod (`apiVersion`, `kind`, `metadata`, `spec`);
  - labels e `-l`, namespaces e contexto;
  - `--dry-run=client -o yaml` para gerar YAML (truque de prova);
  - pod com 2 contêineres.
  - Exemplos: "o primeiro pod", "em que node ele está?", "leia os logs e encontre a senha", "mesmo nome em dois
    namespaces".
- **2 · Deployments:**
  - autocura, seletor × labels (o erro clássico), `scale`;
  - rolling update (`maxSurge` e `maxUnavailable`), `rollout status`, `history`, `undo` e `restart`;
  - `set image`, Recreate.
  - Teste oculto: apaga um pod e confere que ele volta.
- **3 · Services e rede:**
  - ClusterIP, `port` × `targetPort`, DNS, EndpointSlices e Service sem endpoints;
  - NodePort, LoadBalancer, headless e `port-forward`;
  - Ingress (host e path);
  - **Gateway API** (Gateway, HTTPRoute e divisão por peso para canário).
- **4 · Configuração e armazenamento:**
  - ConfigMap e Secret (`env`, `envFrom` e volume);
  - base64 não é criptografia;
  - `emptyDir`, PV, PVC e StorageClass;
  - StatefulSet com headless e DNS estável (`db-0.db`).
  - Exemplo realista: o postgres não sobe sem `POSTGRES_PASSWORD`.
- **5 · Cargas especiais:**
  - Job (`completions`, `parallelism`, `backoffLimit`), CronJob (o relógio simulado pula até o horário);
  - DaemonSet (o teste oculto adiciona um node);
  - init container e sidecar nativo.
- **6 · Saúde e recursos:**
  - liveness, readiness e startup probes;
  - requests e limits, OOMKilled e throttling;
  - QoS, ResourceQuota e LimitRange;
  - HPA com carga simulada (um busybox com `wget` em laço) e `kubectl top` (os clusters do nível trazem o
    metrics-server, que o kind não tem). O PDB foi para o nível 7, junto do `drain`.
- **7 · Scheduling:**
  - nodeSelector, affinity e anti-affinity, topology spread;
  - taints e tolerations, PriorityClass;
  - `cordon`, `drain` e node caindo (o pod solto some, o do Deployment volta).
- **8 · Segurança:**
  - Role, RoleBinding, ClusterRole e `auth can-i --as`, ServiceAccount;
  - NetworkPolicy (default deny e a pegadinha do DNS no egress);
  - securityContext e Pod Security Admission.
- **9 · Troubleshooting:** 20 incidentes em cluster já quebrado, cada um com o relato de um "morador":
  1. ImagePullBackOff;
  2. CrashLoopBackOff por falta de env;
  3. Pending por falta de recurso;
  4. Pending por taint;
  5. Pending por PVC;
  6. Service sem endpoints;
  7. `targetPort` errado;
  8. readiness falhando;
  9. OOMKilled;
  10. ConfigMap faltando;
  11. NetworkPolicy bloqueando;
  12. RBAC Forbidden;
  13. DNS apontando para o namespace errado;
  14. rollout travado;
  15. Job que falha;
  16. CronJob que nunca roda;
  17. node NotReady;
  18. Ingress apontando para o Service errado;
  19. quota estourada;
  20. init container preso.
- **10 · Ecossistema:**
  - `helm install`, `upgrade`, `rollback` e `template` com charts pré-montados (**sem** template Go);
  - Kustomize (`apply -k`) com base e overlays;
  - um CRD com operator simulado;
  - GitOps em conceito.
- **11 · Projetos:** etapas encadeadas, em que o código de cada etapa parte do que o aluno fez na anterior.
  - Os 8 projetos:
    1. loja (frontend, API e Redis);
    2. blog com banco (StatefulSet, Secret e PVC);
    3. deploy sem downtime;
    4. canário;
    5. Black Friday (HPA e quota);
    6. multi-equipe (namespaces, RBAC e NetworkPolicy);
    7. hardening;
    8. Helm e Kustomize dev/prod.
  - A lição final ensina como continuar num cluster de verdade: kind, minikube e Killercoda.

**Inspiração no CKAD** (não é preparatório oficial):

| Domínio | Peso | Níveis |
|---|---|---|
| Design and Build | 20% | 0, 1, 4, 5 |
| Deployment | 20% | 2, 10, 11 |
| Observability and Maintenance | 15% | 6, 9 |
| Environment, Configuration and Security | 25% | 4, 6, 8, 10 |
| Services and Networking | 20% | 3, 8 |

---

## 6. Jogo (o mínimo que motiva)

- **XP:** lição ou quiz vale 5, fácil 10, médio 20 e difícil 40. Incidentes e etapas de projeto seguem a dificuldade.
- **Item = contêiner, nível = cor.** Não há "cargos" por XP: um conceito só. O XP aparece como pontuação.
- **🔥 Sequência de dias** de estudo, com a mesma regra do original (não zera de manhã).
- **Desbloqueio:** o próximo nível abre quando o atual chega a **70%**.
- **Lacre por nível concluído (100%)** e **certificado final** quando o navio está carregado, com botão para o
  LinkedIn.
- **🔍 Revisão do dia:** de 5 a 10 cartões do glossário, só com os termos já vistos. Há três formatos:
  - qual conceito é esta analogia?
  - qual analogia combina com este conceito?
  - verdadeiro ou falso: onde a analogia quebra.
- **Deixado para depois:** conquistas, modo plantão (incidente aleatório com cronômetro) e easter eggs. Só entram se
  fizerem falta.

---

## 7. A tela do exercício

```
┌ 📝 Missão │ 🏠 Na vida real │ 📘 Manual │ 💡 Solução │ 🧪 Testes ┐┌ deploy.yaml │ service.yaml │ + ──────┐
│ 🎯 O que fazer                                                   ││ apiVersion: apps/v1                 │
│ 📚 Palavras técnicas (com analogia)                              ││ kind: Deployment ...                │
│ ✅ Como saber que deu certo   💡 Dica                            │└─────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────┘┌ 🖥️ Terminal │ 🗺️ Cluster │ 🌳 Recursos │ 📜 Eventos ┐
  [▶ Aplicar] [⏩ +30s] [⬆ Entregar] [♻️ Resetar]                    │ aluno@kube-learn:~$ kubectl get pods -w │
                                                                     └─────────────────────────────────────┘
```

### 7.1 Botões

- **▶ Aplicar** (Ctrl+Enter): roda `kubectl apply -f .` e os testes visíveis.
- **⬆ Entregar** (Ctrl+Shift+Enter): roda todos os testes, inclusive os ocultos.
- **⏩ +30s:** avança o relógio do cluster.
- **♻️ Resetar:** volta ao cluster inicial do exercício.

### 7.2 Painéis

Missão, Arquivos, Terminal e Cluster são **janelas**: o aluno arrasta pelo topo para mudar de lugar (antes/depois de
outra ou numa coluna nova, até 3) e arrasta os divisores para mudar o tamanho. Tudo também pelo teclado (botões
↑ ↓ ← → e setas nos divisores). A arrumação fica salva; "🪟 Arrumação padrão" restaura.


- **Terminal:** histórico, Tab e `-w`. Os erros saem com a mensagem real e, embaixo, a caixa 🏠 em português.
- **🗺️ Cluster:** caixinhas com os nodes e os pods dentro, coloridas pelo estado, com tabela equivalente para leitor
  de tela.
- **🌳 Recursos:** a árvore Deployment → ReplicaSet → Pods.
- **📜 Eventos:** o mesmo que `kubectl get events`.

### 7.3 Tipos de item

| Tipo | Como funciona |
|---|---|
| `licao` | Explicação com um YAML de exemplo para aplicar |
| `quiz` | Alternativas, cada uma com explicação |
| `problema` | YAML e/ou terminal, com testes |
| `incidente` | Cluster quebrado e o relato de quem reclamou |
| `projeto` | Etapas encadeadas |

---

## 8. O simulador

### 8.1 Visão geral

```
 Editor (YAML) ──▶ lib yaml ──▶ esquemas por kind ──▶ API server simulado (objetos, defaults, ownerRefs, eventos)
 Terminal ──▶ kubectl/ (parser, comandos, formatadores) ──────▲                  │
                                                                                  ▼
            relógio ──tick──▶ controladores → scheduler → kubelet → rede (DNS, Services, Gateway, NetworkPolicy)
                                                                                  │
            Terminal · Cluster · Recursos · Eventos ◀──────── estado ─────────────┴──▶ regras dos testes
```

### 8.2 Peças

- **YAML:** a lib [`yaml`](https://eemeli.org/yaml/) lê vários documentos e dá linha e coluna nos erros. **Não**
  escrevemos parser.
- **Esquemas:** uma DSL curta por kind, no estilo do original (`'replicas?:int selector!:LabelSelector'`), com
  defaults, textos do `kubectl explain` e erros como os do kubectl (`unknown field "replica"`), com "você quis dizer
  `replicas`?" em português. **Não** usamos o OpenAPI oficial: é grande demais.
- **API server:** guarda os objetos com `uid`, `resourceVersion` e `ownerReferences`. Faz a admissão (defaults, quota,
  LimitRange e PSA), confere o RBAC quando há `--as` e registra os eventos.
- **Relógio e sorteio com semente:** tudo é **determinístico**. Os nomes saem no formato real
  (`loja-7d9f8c6b5-x2k4q`). Cada comando avança 1 a 2 s. A cada tick, os controladores rodam até estabilizar.
- **Controladores:** Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, CronJob, HPA, EndpointSlice, garbage
  collector e namespace.
- **Scheduler:** filtra por recursos, seletores, affinity e taints. As mensagens são as reais
  (`0/3 nodes are available: 3 Insufficient cpu.`).
- **Kubelet:** controla o ciclo de vida do pod.
  - Fases: pull da imagem, ContainerCreating, Running, CrashLoopBackOff (espera de 10, 20, 40 s... até 5 min, como o
    real), OOMKilled e Completed.
  - Também cuida das probes e da montagem de ConfigMap, Secret e volumes.
- **Catálogo de imagens falsas.** É o que deixa tudo realista sem contêiner de verdade:

  ```js
  'nginx:1.27':               { portas: [80], sobeEm: '2s', http: { '/': 200 } },
  'postgres:17':              { portas: [5432], exigeEnv: ['POSTGRES_PASSWORD'],
                                semEnv: { codigo: 1, log: 'Error: Database is uninitialized and superuser password is not specified.' } },
  'kubelearn/loja:2.0-bugada': { quebraApos: '3s', codigo: 1, log: 'panic: nil pointer dereference' },
  'kubelearn/guloso:1.0':      { memoria: { cresce: '50Mi/s' } },   // com limit, vira OOMKilled
  'busybox:1.36':             { shell: true },
  ```

- **Rede:**
  - IPs falsos (pods em `10.244.x.y`, Services em `10.96.x.y`) e DNS;
  - o Service manda só para os pods prontos, em rodízio;
  - Ingress e HTTPRoute, NetworkPolicy;
  - `curl`, `wget` e `nslookup` no shell simulado do `exec`.
- **Explicações dos erros:** cada motivo (`ImagePullBackOff`, `Forbidden`...) traz o que houve, a analogia e onde
  mexer.

### 8.3 `kubectl`

Cada comando entra quando um nível precisa dele.

| Nível | Comandos |
|---|---|
| 1 | `get` (`-o wide/yaml/json/name`, `-l`, `-n`, `-A`, `-w`), `describe`, `apply`, `create`, `run`, `delete`, `logs` (`--previous`), `exec`, `explain`, `config set-context --current --namespace`, `--dry-run=client -o yaml` |
| 2 | `scale`, `rollout` (`status`, `history`, `undo`, `restart`), `set image`, `label`, `annotate`, `edit` (abre no editor) |
| 3 | `expose`, `port-forward` |
| 6 | `top`, `autoscale` |
| 7 | `cordon`, `drain`, `uncordon`, `taint` |
| 8 | `auth can-i --as`, `create role/rolebinding/serviceaccount` |
| 10 | `apply -k`, `helm install/upgrade/rollback/list/template` |
| sempre | `-o jsonpath` (parte), `version` (fixada em **v1.37**), `help` |

### 8.4 Fidelidade e limites

- **Saída igual à real:** colunas, AGE (`5s`, `2m3s`, `3h`) e mensagens (`deployment.apps/loja created`,
  `Error from server (NotFound): ...`).
- **Nomes realistas** (`control-plane`, `node-1`, `node-2`), para o aprendizado valer fora do site.
- **Arquivos golden:** um script captura a saída de um cluster **kind** de verdade, e os testes comparam o simulador
  com ela.
- **Fora do escopo:** contêiner de verdade, todos os campos e flags, template Go do Helm, CNI real, kubeadm e
  multi-cluster.
- **Aviso no site:** é um simulador para aprender. A última lição leva para um cluster real.

---

## 9. Formato do conteúdo

Cada nível é um arquivo em `src/conteudo/`. O YAML vai na tag `` yaml`...` ``.

```js
problema({
  id: 'deploy-rolling-sem-indisponibilidade',
  titulo: 'Atualizar sem derrubar ninguém',
  dificuldade: 'medio',
  vidaReal: 'Reforma por etapas: abre o apartamento novo, espera ficar pronto e só então fecha o antigo.',
  enunciado: `<p>Atualize a loja para <code>kubelearn/loja:1.1</code> sem que nenhum pod fique indisponível.</p>`,
  dica: 'strategy.rollingUpdate.maxUnavailable: 0',
  cluster: 'loja-3-replicas',                  // estado inicial em src/conteudo/clusters/
  inicial: { 'loja.yaml': yaml`...` },
  solucao: { 'loja.yaml': yaml`...` },
  testes: [
    { descricao: 'kubectl apply -f .', regras: [
      { semErros: true },
      { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].image', igual: 'kubelearn/loja:1.1' },
    ] },
    { oculto: true, descricao: 'rollout completo sem indisponibilidade',
      passos: [{ comando: 'kubectl apply -f .' }, { avancar: '2m' }],
      regras: [
        { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.1' },
        { rollout: 'deployment/loja', minDisponivel: 3 },
      ] },
  ],
});
```

### 9.1 Regras de verificação

| Regra | Confere |
|---|---|
| `{ semErros }` / `{ erro: 'texto' }` | O comando passou / foi recusado com essa mensagem |
| `{ objeto: 'kind/nome', campo, igual \| contem \| regex \| existe }` | Um campo de um objeto |
| `{ pods: 'seletor', quantidade, fase, prontos, imagem, node, reinicios }` | Os pods do seletor |
| `{ status: 'pod/x', motivo }` | O motivo do estado (`OOMKilled`...) |
| `{ endpoints: 'svc/x', quantidade }` | Quantos pods atrás do Service |
| `{ requisicao: { de, url, status \| 'bloqueada' } }` | Um `curl` simulado de ponta a ponta |
| `{ rollout: 'deployment/x', minDisponivel }` | Nunca ficou abaixo de N pods na atualização |
| `{ evento: { motivo } }` | Uma ocorrência aconteceu |
| `{ pode: { quem, verbo, recurso, resposta } }` | O RBAC permite ou nega |
| `{ env }` / `{ arquivo }` | O que o contêiner enxerga |
| `{ comando: 'regex' }` / `{ resposta }` | O aluno usou o comando / deu a resposta certa |

### 9.2 Passos dos testes ocultos

- `{ comando }`
- `{ avancar: '1m' }`
- `{ caos: { derrubarNode } }`
- `{ carga: { url, rps } }`
- `{ novoNode }`

### 9.3 Glossário

O formato de cada entrada é `{ id, termo, padroes, definicao, vidaReal, limite, exemplo }`.

---

## 10. Stack e repositório

- **Base:** Vite com JS puro, sem framework de UI, igual ao original, para um site leve. O pixel art é desenhado em `<canvas>`, sem biblioteca.
- **Bibliotecas:**
  - CodeMirror 6 com `@codemirror/lang-yaml`;
  - `yaml` (eemeli);
  - fontes servidas pelo próprio site com `@fontsource` (sem Google Fonts, por privacidade).
- **Testes:** Vitest com happy-dom, e Playwright com axe-core. ESLint para o lint.
- **Publicação e dados:** GitHub Actions publica no GitHub Pages. Os dados ficam no `localStorage` com o prefixo
  `kube-learn:`.

Os arquivos nascem só quando a fase precisa deles.

```
kube-learn/
├── index.html · package.json · vite.config.js · CLAUDE.md
├── src/
│   ├── main.js                 # rotas por hash: #/ #/trilha #/ex/<id> #/livre #/glossario #/revisao
│   ├── jogo/                   # progresso, XP, 70%, sequência, revisão (Leitner)
│   ├── k8s/                    # api, relogio, scheduler, kubelet, imagens, rede, controladores/, esquema/, kubectl/
│   ├── conteudo/               # util.js, 00-conteineres.js … 11-projetos/, glossario.js, clusters/
│   ├── verificacoes.js
│   └── ui/                     # inicio, predio, exercicio, editor, terminal, cluster, glossario, revisao
└── tests/                      # k8s/, golden/, conteudo.test.js (a trilha inteira), e2e/
```

---

## 11. Qualidade e publicação

- **O teste da trilha inteira** é o principal:
  - toda solução passa em todos os casos, inclusive os ocultos;
  - todo código inicial ainda falha;
  - as lições aplicam sem erro;
  - todo termo do glossário tem `vidaReal` e `limite`.
- **Motor:** testes de unidade e cenários comparados com os arquivos golden do kind.
- **CI:** em todo PR, lint, testes e build. O E2E com axe entra na Fase 3.
- **Deploy:** cada push no `main` publica no Pages. Homologação só quando houver público.

---

## 12. Acessibilidade e privacidade

- **Já no MVP:**
  - teclado em tudo, foco visível e "pular para o conteúdo";
  - `aria-live` nos resultados;
  - temas claro, escuro e alto contraste;
  - tamanho de texto ajustável e "reduzir movimento";
  - tabela equivalente ao desenho do cluster;
  - nada depende só de cor.
- **Depois:** ouvir o enunciado (`speechSynthesis`), perfis neurodivergentes e VLibras. Se a licença permitir,
  reaproveitamos os do original.
- **Privacidade:**
  - sem cookies, sem analytics e sem servidor;
  - botões para baixar e apagar os dados;
  - página LGPD simples.
- **Simplificação (ponytail):** o estado do cluster de cada exercício **não é salvo**. Ao reabrir, o cluster volta ao
  inicial, e ficam salvos os arquivos e o progresso.

---

## 13. Decisões

| Decisão | Escolha |
|---|---|
| **Nome** | **kube-learn**, com repositório `kube-learn` |
| **Visual** | **Pixel art 8-bit** (§5.1) |
| **Licença** | **AGPL-3.0-or-later para o código e CC BY-SA 4.0 para o conteúdo**, iguais ao original. Assim podemos reaproveitar com crédito o motor de pixel art, o painel de acessibilidade e as ideias de testes, sem refazer o que já funciona. Cada arquivo copiado leva um comentário de origem e o README credita o DivergeTerraform (Sertão será cloud). A AGPL obriga quem publicar uma versão modificada a abrir o código, o que combina com um projeto educativo e aberto |
| **Certificado** | **Sem criptografia no MVP.** Num site estático, quem ler o código consegue forjar a assinatura (o próprio original admite isso). Validação de verdade exige servidor |
| **Idioma** | Só pt-BR, com o `kubectl` em inglês como no real |
| **Autor do DivergeTerraform** | Vale conversar: ele mantém Python, PHP e Terraform no mesmo formato e pode topar parceria ou divulgação |
| **Marca** | Não usar o logo oficial do Kubernetes. Incluir o aviso "Kubernetes é marca da The Linux Foundation; projeto independente" |

---

## 14. Riscos

| Risco | Como evitar |
|---|---|
| O simulador crescer sem fim (o maior risco) | O motor só ganha o que algum exercício usa. Os arquivos golden mantêm a fidelidade |
| Ensinar errado ao simplificar | Campo `limite` em toda analogia, aviso de simulador e lição final com kind |
| O conteúdo virar o gargalo (~200 itens) | Formato fixo, o teste da trilha inteira e lançamento por nível |
| O Kubernetes mudar | Versão fixada, Gateway API ensinado e revisão a cada release |

---

## 15. Fases

As estimativas são em sessões do Claude no esforço alto. Cada fase termina com tudo verde e publicado.

| Fase | Entrega | Pronto quando | Sessões |
|---|---|---|---|
| **0. Repositório** ✅ | Vite, ESLint, Vitest, CI, deploy no Pages, LICENSE, README, `CLAUDE.md` e rotas vazias | O site está no ar via Actions | 1 |
| **1. Motor v0** ✅ | Relógio, API, esquemas (Pod, Namespace, Deployment, ReplicaSet, Service, ConfigMap, Secret), controladores básicos, scheduler simples, kubelet (pull, running, crash, logs), imagens, DNS e Service, `kubectl` dos níveis 1 e 2 | Aplicar um Deployment e avançar o tempo dá um `get pods` igual ao golden | 3 |
| **2. Tela do exercício** ✅ | Editor, terminal, painéis, abas, verificações, testes visíveis e ocultos, playground livre | Um exercício resolvido de ponta a ponta | 2 |
| **3. Trilha e progresso** ✅ | Prédio em pixel art (navio desde a Fase 5) (motor `pixel.js` reaproveitado, sprites e fonte pixel), XP, 🔥, 70%, landing, página do glossário, acessibilidade básica, E2E com axe | O progresso fica salvo e o axe passa | 2 |
| **4. Conteúdo MVP** ✅ | Níveis 0 a 3 (~13 lições e ~48 exercícios) e ~45 termos no glossário | A trilha inteira passa. **🚀 v0.1** | 4 |
| **5. Revisão e certificados** ✅ | Revisão do dia, o navio no lugar do prédio, lacre por nível, certificado final, mapa do cluster, página de privacidade | **v0.2** | 2 |
| **6. Níveis 4 a 6** ✅ | Motor (volumes, StatefulSet, Jobs, DaemonSet, probes, limits, HPA, quotas) e conteúdo; o mar se mexe na página inicial | **v0.3** | 5 |
| **7. Níveis 7 a 9** ✅ | Motor (scheduling avançado, drain, RBAC, NetworkPolicy, PSA) e os 20 incidentes | **v0.4** | 5 |
| **8. Níveis 10 e 11** ✅ | Helm e Kustomize simulados, CRD, os 8 projetos, lição do kind | **v1.0 🏙️** | 4 |

O MVP vai da Fase 0 à 4, em cerca de 12 sessões. O total é de umas 28.

**Como pedir cada fase:**

> Leia o `PLANO.md` e implemente a **Fase N** (§15) seguindo as §8 a §11. No fim, rode lint, testes e build, e diga o
> que ficou de fora.

---

## 16. Fontes

- DivergeTerraform: [site](https://sertaoseracloud.github.io/terraform-playground/) ·
  [repo](https://github.com/sertaoseracloud/terraform-playground) (código AGPL-3.0, conteúdo CC BY-SA 4.0)
- [Kubernetes v1.37](https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/), a versão estável atual
- [Aposentadoria do ingress-nginx](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/), com o Gateway API
  como caminho novo
- [Currículo do CKAD](https://www.cncf.io/training/certification/ckad/)
