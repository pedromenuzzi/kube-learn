// Exercícios de exemplo da Fase 2 (um de YAML e um de terminal). Na Fase 4 eles vão para o nível 2.
import { problema, yaml } from './util.js';

const loja = (estrategia, versao) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
    labels:
      app: loja
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: loja
${estrategia}    template:
      metadata:
        labels:
          app: loja
      spec:
        containers:
        - name: loja
          image: kubelearn/loja:${versao}
          ports:
          - containerPort: 8080
`;

export const EXEMPLOS = [
  problema({
    id: 'deploy-rolling-sem-indisponibilidade',
    titulo: 'Atualizar sem derrubar ninguém',
    dificuldade: 'medio',
    cluster: 'loja-3-replicas',
    vidaReal: 'Uma reforma por etapas: abre o apartamento novo, espera ficar pronto e só então fecha o antigo. O condomínio nunca fica sem atendimento.',
    limite: 'Na reforma de verdade alguém confere se o apartamento ficou bom. Aqui, sem uma readinessProbe, o Kubernetes acha que "subiu" = "pronto".',
    enunciado: `
      <p>A loja está rodando a versão <code>1.0</code> com 3 réplicas. Chegou a <code>1.1</code>.</p>
      <ul>
        <li>troque a imagem para <code>kubelearn/loja:1.1</code>;</li>
        <li>e garanta que <b>nenhum pod</b> fique indisponível durante a troca:
          <code>maxUnavailable: 0</code> (pode criar <b>1</b> pod a mais por vez: <code>maxSurge: 1</code>).</li>
      </ul>
      <p>Depois de aplicar, acompanhe no terminal: <code>kubectl get pods -w</code> ou
         <code>kubectl rollout status deploy/loja</code>.</p>`,
    comoSaber: 'Os 3 pods novos ficam prontos e, durante a troca, nunca há menos de 3 pods atendendo.',
    dica: 'Em spec: strategy → rollingUpdate → maxSurge: 1 e maxUnavailable: 0.',
    manual: ['deployment.spec.strategy', 'deployment.spec.strategy.rollingUpdate'],
    inicial: { 'loja.yaml': loja('', '1.0') },
    solucao: { 'loja.yaml': loja('    strategy:\n      rollingUpdate:\n        maxSurge: 1\n        maxUnavailable: 0\n', '1.1') },
    testes: [
      {
        descricao: 'kubectl apply -f .',
        passos: [{ comando: 'kubectl apply -f .' }],
        regras: [
          { semErros: true },
          { objeto: 'deployment/loja', campo: 'spec.template.spec.containers[0].image', igual: 'kubelearn/loja:1.1' },
          { objeto: 'deployment/loja', campo: 'spec.strategy.rollingUpdate.maxUnavailable', igual: 0 },
        ],
      },
      {
        oculto: true,
        descricao: 'rollout completo, sem ninguém indisponível',
        regras: [
          { pods: 'app=loja', prontos: 3, imagem: 'kubelearn/loja:1.1' },
          { rollout: 'deployment/loja', minDisponivel: 3 },
        ],
      },
    ],
  }),

  problema({
    id: 'kubectl-escalar',
    titulo: 'Black Friday: mais réplicas pelo terminal',
    dificuldade: 'facil',
    cluster: 'loja-3-replicas',
    terminal: true,
    vidaReal: 'Contratar temporários para a Black Friday: o contrato passa de 3 para 5 apartamentos ocupados, e a administração providencia o resto.',
    limite: 'Aqui você muda o número na mão. Para acompanhar o movimento sozinho, existe o HPA (nível 6).',
    enunciado: `
      <p>A Black Friday chegou. Deixe a <code>deployment/loja</code> com <b>5 réplicas</b>, usando <b>só o terminal</b>
         (sem editar YAML).</p>`,
    comoSaber: '<code>kubectl get deploy loja</code> mostra <code>5/5</code>.',
    dica: 'kubectl scale deployment loja --replicas=...',
    manual: ['deployment.spec.replicas'],
    solucaoTerminal: ['kubectl scale deployment loja --replicas=5'],
    testes: [
      {
        noClusterDoAluno: true,
        descricao: 'a loja tem 5 réplicas prontas',
        regras: [
          { comando: '^kubectl\\s+scale\\b', msg: 'você usou o kubectl scale' },
          { objeto: 'deployment/loja', campo: 'spec.replicas', igual: 5 },
          { pods: 'app=loja', prontos: 5 },
        ],
      },
    ],
  }),
];
