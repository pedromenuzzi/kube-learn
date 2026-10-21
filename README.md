# 🏗️ kube-learn

Trilha gamificada para aprender **Kubernetes** no navegador. O cluster é **simulado**: você escreve YAML, usa o
`kubectl` num terminal e vê os pods nascerem, quebrarem e se recuperarem, sem conta na nuvem, sem instalar nada e
sem custo. Cada conceito vem com uma **comparação com a vida real** (e onde ela deixa de valer), e cada
missão resolvida embarca mais um contêiner no seu navio em pixel art, e a pilha só sobe.

**Acesse:** https://pedromenuzzi.github.io/kube-learn/

**Versão 1.0:** a trilha completa, com os níveis 0 a 11 (contêineres; cluster, kubectl e Pods; Deployments;
Services, Ingress e Gateway API; configuração e armazenamento; Jobs, CronJobs e DaemonSets; saúde e recursos;
scheduling e manutenção; segurança; troubleshooting; Helm, Kustomize, CRDs e GitOps; e os projetos), com 32 lições,
8 quizzes e 172 missões (64 no terminal), um glossário de 84 termos, a revisão do dia, os lacres de cada nível e o
navio em pixel art na página inicial. O nível 11 tem 8 projetos de 5 etapas encadeadas (a loja completa, o blog
com banco, deploy sem downtime, canário, Black Friday, multi-equipe, hardening e dev e prod) e termina com o
caminho para um cluster de verdade (Killercoda, kind e minikube). Fora da trilha, a seção **Troubleshooting** traz
clusters quebrados com mais de um defeito encadeado, abertos desde o primeiro dia. O simulador tem Helm 4, Kustomize,
CRDs com um operador e um fiscal de GitOps, além de scheduling, RBAC, NetworkPolicy e Pod Security, conferidos
contra 352 saídas de um kind de verdade. O plano completo está em [`PLANO.md`](PLANO.md).

## Desenvolvimento

Precisa de Node 22.12 ou mais novo.

```bash
npm install
npm run dev     # servidor local com recarga
npm run lint    # ESLint
npm test        # Vitest
npm run build   # gera dist/
```

## O simulador

O cluster roda em `src/k8s/`: API, controladores (Deployment, ReplicaSet, Endpoints, namespaces, coleta de
lixo), scheduler, kubelet (pull, CrashLoopBackOff, logs), rede (DNS, Services) e um `kubectl` com saída igual à
real. A fidelidade é conferida contra um cluster **kind** de verdade: `scripts/capturar-golden.sh` grava a saída
real em `tests/golden/kind/` e `tests/golden.test.js` compara com o simulador.

## Publicação

Todo PR roda o [CI](.github/workflows/ci.yml) (lint, testes e build). Cada push no `main` roda o CI e publica no
GitHub Pages pelo [deploy](.github/workflows/deploy.yml).

## Créditos

Inspirado no [DivergeTerraform](https://github.com/sertaoseracloud/terraform-playground), da Sertão será cloud.
Os arquivos reaproveitados de lá trazem um comentário com a origem.

## Licença

- **Código:** [GNU AGPL-3.0-or-later](LICENSE).
- **Conteúdo didático:** [CC BY-SA 4.0](LICENSE-CONTEUDO.md).

Kubernetes é marca da The Linux Foundation. Este projeto é independente e não é afiliado nem endossado pela CNCF.
