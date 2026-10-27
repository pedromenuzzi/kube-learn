// Os clusters de partida dos exercícios: nodes e o que já estava aplicado antes do aluno chegar.
import { criarCluster, NODES_PADRAO } from '../k8s/cluster.js';
import { kubectl } from '../k8s/kubectl/index.js';
import { criarRepositorio } from '../k8s/gitops.js';
import { helm, REPO_PADRAO } from '../k8s/helm.js';
import { yaml } from './util.js';
import { BANCO, CADERNO, PVC, DB } from './manifestos.js';
import { PARTIDA0 } from './nivel0.js';
import { PARTIDA5 } from './nivel5.js';
import { PARTIDA6 } from './nivel6.js';
import { PARTIDA7 } from './nivel7.js';
import { PARTIDA8 } from './nivel8.js';
import { PARTIDA9 } from './nivel9.js';
import { PARTIDA_TS } from './troubleshooting.js';
import { PARTIDA_OF } from './oficina.js';
import { PARTIDA10 } from './nivel10.js';
import { PARTIDA11 } from './nivel11.js';
import { PARTIDA_PL } from '../jogo/plantao.js';

const LOJA = (replicas, versao) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: loja
    labels:
      app: loja
  spec:
    replicas: ${replicas}
    selector:
      matchLabels:
        app: loja
    template:
      metadata:
        labels:
          app: loja
      spec:
        containers:
        - name: loja
          image: kubelearn/loja:${versao}
          ports:
          - containerPort: 8080
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: loja
  spec:
    selector:
      app: loja
    ports:
    - port: 80
      targetPort: 8080
`;

const pod = (nome, imagem, { labels = { app: nome }, ns, comando } = {}) => yaml`
  apiVersion: v1
  kind: Pod
  metadata:
    name: ${nome}
${ns ? `    namespace: ${ns}\n` : ''}    labels:
${Object.entries(labels).map(([k, v]) => `      ${k}: ${v}`).join('\n')}
  spec:
    containers:
    - name: ${nome}
      image: ${imagem}
${comando ? `      command: ${JSON.stringify(comando)}\n` : ''}`;

/** O prédio de investigação do nível 1: um pouco de tudo para o aluno achar com o kubectl. */
const NIVEL1 = [
  'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: vendas\n',
  pod('caixa', 'busybox:1.36', { ns: 'vendas', comando: ['sleep', '3600'] }),
  pod('misterio', 'nginx:1.27'),
  pod('diario', 'kubelearn/diario:1.0'),
  pod('cofre', 'kubelearn/cofre:1.0'),
  ...['suporte-1', 'suporte-2', 'suporte-3'].map((n) => pod(n, 'busybox:1.36', { labels: { equipe: 'suporte' }, comando: ['sleep', '3600'] })),
  ...['vendas-1', 'vendas-2'].map((n) => pod(n, 'busybox:1.36', { labels: { equipe: 'vendas' }, comando: ['sleep', '3600'] })),
  pod('intruso', 'busybox:1.36', { comando: ['sleep', '3600'] }),
  pod('vitrine', 'ngnix:1.27'),
].join('---\n');

const LOJA_DEP = (replicas = 3, versao = '1.0', nome = 'loja', app = nome) => LOJA(replicas, versao).split('---')[0]
  .replaceAll('name: loja', `name: ${nome}`).replaceAll('app: loja', `app: ${app}`);
const SVC = (nome, porta, alvo, app = nome) => yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: ${nome}
  spec:
    selector:
      app: ${app}
    ports:
    - port: ${porta}
      targetPort: ${alvo}
`;
const DEP = (nome, imagem, replicas, porta) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: ${nome}
  spec:
    replicas: ${replicas}
    selector:
      matchLabels:
        app: ${nome}
    template:
      metadata:
        labels:
          app: ${nome}
      spec:
        containers:
        - name: ${nome}
          image: ${imagem}
          ports:
          - containerPort: ${porta}
`;
const INGRESS_CLASS = yaml`
  apiVersion: networking.k8s.io/v1
  kind: IngressClass
  metadata:
    name: traefik
    annotations:
      ingressclass.kubernetes.io/is-default-class: "true"
  spec:
    controller: traefik.io/ingress-controller
`;
const GATEWAY = yaml`
  apiVersion: gateway.networking.k8s.io/v1
  kind: GatewayClass
  metadata:
    name: kube-learn
  spec:
    controllerName: kube-learn.dev/gateway-controller
  ---
  apiVersion: gateway.networking.k8s.io/v1
  kind: Gateway
  metadata:
    name: portaria
  spec:
    gatewayClassName: kube-learn
    listeners:
    - name: http
      port: 80
      protocol: HTTP
`;
const juntar = (...docs) => docs.map((d) => d.trim()).join('\n---\n');
/** Os nodes padrão, com labels e taints a mais em alguns: { 'node-2': { labels, taints } }. */
const nodesCom = (extras) => NODES_PADRAO.map((n) => ({ ...n, ...(extras[n.nome] ?? {}) }));
const zona = (z) => ({ labels: { 'topology.kubernetes.io/zone': z } });
const NS = (nome) => `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${nome}\n`;
const COTA = (ns, duro) => `apiVersion: v1
kind: ResourceQuota
metadata:
  name: cota
  namespace: ${ns}
spec:
  hard:
${Object.entries(duro).map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`).join('\n')}
`;

// ---------- nível 4 ----------
const CM = (nome, dados) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${nome}
data:
${Object.entries(dados).map(([k, v]) => (v.includes('\n') ? `  ${k}: |\n${v.trimEnd().split('\n').map((l) => `    ${l}`).join('\n')}` : `  ${k}: ${JSON.stringify(v)}`)).join('\n')}
`;
const SECRET = (nome, dados) => `apiVersion: v1
kind: Secret
metadata:
  name: ${nome}
stringData:
${Object.entries(dados).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n')}
`;
/** A loja lendo a COR de um ConfigMap (o "quadro de avisos"). */
const LOJA_COM_COR = LOJA_DEP(2).replace(/^( +)ports:/m, (_, r) => `${r}env:
${r}- name: COR
${r}  valueFrom:
${r}    configMapKeyRef:
${r}      name: loja-config
${r}      key: COR
${r}ports:`);
const GALERIA = yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: galeria
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: galeria
    template:
      metadata:
        labels:
          app: galeria
      spec:
        containers:
        - name: galeria
          image: busybox:1.36
          command: ["sleep", "3600"]
          volumeMounts:
          - name: fotos
            mountPath: /fotos
        volumes:
        - name: fotos
          persistentVolumeClaim:
            claimName: fotos
`;

export const CLUSTERS = {
  vazio: {},
  'tag-que-nao-existe': { manifestos: PARTIDA0.vitrine },
  'loja-3-replicas': { manifestos: LOJA(3, '1.0') },
  'loja-4-replicas': { manifestos: LOJA(4, '1.0') },
  relatorio: {
    manifestos: yaml`
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: relatorio
      spec:
        replicas: 2
        selector:
          matchLabels:
            app: relatorio
        template:
          metadata:
            labels:
              app: relatorio
          spec:
            containers:
            - name: relatorio
              image: nginx:1.27
    `,
  },
  // A loja foi para a 2.0, que cai na subida: o rollout travou (os 3 pods da 1.0 seguram as pontas).
  'loja-bugada': { manifestos: LOJA(3, '1.0'), comandos: ['kubectl set image deployment/loja loja=kubelearn/loja:2.0-bugada'] },
  // Três revisões, cada uma com o motivo anotado.
  'loja-historico': {
    manifestos: LOJA(3, '1.0'),
    comandos: [
      "kubectl annotate deployment loja kubernetes.io/change-cause='versao 1.0: abertura da loja'",
      'kubectl set image deployment/loja loja=kubelearn/loja:1.1',
      "kubectl annotate deployment loja kubernetes.io/change-cause='versao 1.1: carrinho novo' --overwrite",
      'kubectl set image deployment/loja loja=kubelearn/loja:2.0',
      "kubectl annotate deployment loja kubernetes.io/change-cause='versao 2.0: tudo novo (e o cliente reclamou)' --overwrite",
    ],
  },
  nivel1: { manifestos: NIVEL1 },
  // Nível 3
  'loja-sem-servico': { manifestos: LOJA_DEP() },
  estoque: {
    manifestos: juntar(
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: estoque',
      DEP('estoque', 'nginx:1.27', 2, 80).replace('metadata:\n  name: estoque', 'metadata:\n  name: estoque\n  namespace: estoque'),
      SVC('estoque', 80, 80).replace('metadata:\n  name: estoque', 'metadata:\n  name: estoque\n  namespace: estoque'),
      pod('cliente', 'busybox:1.36', { comando: ['sleep', '3600'] }),
    ),
  },
  banco: { manifestos: DEP('banco', 'redis:7', 3, 6379) },
  praca: { manifestos: juntar(INGRESS_CLASS, LOJA_DEP(2), SVC('loja', 80, 8080), DEP('blog', 'httpd:2.4', 2, 80), SVC('blog', 80, 80)) },
  'condominio-gateway': { manifestos: juntar(GATEWAY, LOJA_DEP(2), SVC('loja', 80, 8080)) },
  canario: { manifestos: juntar(GATEWAY, LOJA_DEP(3), SVC('loja', 80, 8080), LOJA_DEP(1, '1.1', 'loja-v2'), SVC('loja-v2', 80, 8080)) },
  // Nível 4
  'loja-sem-config': { manifestos: juntar(LOJA_DEP(2), SVC('loja', 80, 8080)) },
  'loja-com-config': { manifestos: juntar(CM('loja-config', { COR: 'azul' }), LOJA_COM_COR, SVC('loja', 80, 8080)) },
  'banco-sem-senha': { manifestos: BANCO() },
  'senha-errada': { manifestos: juntar(SECRET('banco-senha', { senha: 'concreto-armado' }), BANCO({ chave: 'password' })) },
  'cofre-secreto': { manifestos: SECRET('wifi', { senha: 'argamassa-forte-7' }) },
  vitrine: { manifestos: juntar(CM('vitrine-html', { 'index.html': '<h1>Promoção de tijolos: leve 3, pague 2!</h1>\n' }), DEP('vitrine', 'nginx:1.27', 2, 80), SVC('vitrine', 80, 80)) },
  placa: { manifestos: SVC('placa', 80, 80) },
  caderno: { manifestos: CADERNO() },
  'pvc-rapido': { manifestos: juntar(PVC('fotos', 'rapido'), GALERIA) },
  'db-pronto': { manifestos: juntar(DB(3), pod('cliente', 'busybox:1.36', { comando: ['sleep', '3600'] })) },
  // Nível 5
  'job-quebrado': { manifestos: PARTIDA5.migracao },
  'backup-noturno': { manifestos: PARTIDA5.backup },
  extintor: { manifestos: PARTIDA5.extintor },
  painel: { manifestos: PARTIDA5.painel },
  // Nível 6 (os que medem uso vêm com o metrics-server)
  'loja-trava': { manifestos: juntar(PARTIDA6.trava, SVC('loja', 80, 8080)) },
  'loja-lenta': { manifestos: juntar(PARTIDA6.lenta, SVC('loja', 80, 8080)) },
  'loja-sonda-errada': { manifestos: juntar(PARTIDA6.sondaErrada, SVC('loja', 80, 8080)) },
  'loja-apertada': { manifestos: juntar(PARTIDA6.apertado, SVC('loja', 80, 8080)), metricas: true },
  'relatorio-oom': { manifestos: PARTIDA6.oom },
  consumo: { manifestos: juntar(PARTIDA6.semPedido, SVC('loja', 80, 8080), PARTIDA6.oom.replace('memory: 128Mi', 'memory: 512Mi'), DEP('vitrine', 'nginx:1.27', 1, 80)), metricas: true },
  'loja-pedidos': { manifestos: juntar(PARTIDA6.apertado.replace('cpu: 1500m', 'cpu: 100m'), SVC('loja', 80, 8080)), metricas: true },
  'black-friday': {
    manifestos: juntar(PARTIDA6.semPedido, SVC('loja', 80, 8080), yaml`
      apiVersion: autoscaling/v2
      kind: HorizontalPodAutoscaler
      metadata:
        name: loja
      spec:
        scaleTargetRef:
          apiVersion: apps/v1
          kind: Deployment
          name: loja
        minReplicas: 2
        maxReplicas: 8
        metrics:
        - type: Resource
          resource:
            name: cpu
            target:
              type: Utilization
              averageUtilization: 50
    `, pod('carga', 'busybox:1.36', { comando: ['sh', '-c', 'while true; do wget -q -O- http://loja; done'] })),
    metricas: true,
  },
  'cota-vendas': { manifestos: juntar(NS('vendas'), COTA('vendas', { 'requests.cpu': '1', 'limits.memory': '1Gi' }), PARTIDA6.vendas) },
  'cota-compras': { manifestos: juntar(NS('compras'), COTA('compras', { 'requests.cpu': '1', 'requests.memory': '1Gi', 'limits.cpu': '2', 'limits.memory': '2Gi' }), PARTIDA6.compras) },
  'teto-compras': {
    manifestos: juntar(NS('compras'), yaml`
      apiVersion: v1
      kind: LimitRange
      metadata:
        name: teto
        namespace: compras
      spec:
        limits:
        - type: Container
          max:
            memory: 512Mi
    `, PARTIDA6.grande),
  },
  // Nível 7
  gerador: { nodes: nodesCom({ 'node-2': { labels: { energia: 'gerador' } } }) },
  'sem-ssd': { manifestos: PARTIDA7.semSsd },
  'gerador-em-reforma': { nodes: nodesCom({ 'node-2': { labels: { energia: 'gerador' } } }), comandos: ['kubectl cordon node-2'] },
  zonas: { nodes: [NODES_PADRAO[0], { nome: 'node-1', ...zona('zona-a') }, { nome: 'node-2', ...zona('zona-a') }, { nome: 'node-3', ...zona('zona-b') }] },
  gpu: { nodes: nodesCom({ 'node-2': { labels: { dedicado: 'gpu' }, taints: [{ effect: 'NoSchedule', key: 'dedicado', value: 'gpu' }] } }), manifestos: LOJA(3, '1.0') },
  'placa-esquecida': { nodes: nodesCom({ 'node-1': { labels: { impressora: 'sim' }, taints: [{ effect: 'NoSchedule', key: 'obra', value: 'sim' }] } }), manifestos: PARTIDA7.impressao },
  // A loja inteira no node-1 (o node-2 estava interditado quando ela chegou).
  'pdb-loja': { antes: ['kubectl cordon node-2'], manifestos: LOJA(3, '1.0'), comandos: ['kubectl uncordon node-2'] },
  lotado: { manifestos: PARTIDA7.relatorios },
  // A loja e o caderno no node-2, que cai: 6 minutos depois, a loja já renasceu no node-1 e o caderno ficou.
  apagao: {
    antes: ['kubectl cordon node-1'],
    manifestos: juntar(LOJA_DEP(2), PARTIDA7.caderno),
    comandos: ['kubectl uncordon node-1', (c) => { c.derrubarNode('node-2'); c.avancar('6m'); }],
  },
  // Nível 8
  'crachas-da-loja': { manifestos: juntar(PARTIDA8.lojaNs, PARTIDA8.crachas) },
  'loja-ns': { manifestos: PARTIDA8.lojaNs },
  rede: { manifestos: PARTIDA8.rede },
  'rede-fechada': { manifestos: juntar(PARTIDA8.rede, PARTIDA8.negaTudo) },
  'rede-sem-dns': { manifestos: juntar(PARTIDA8.rede, PARTIDA8.saidaSemDns) },
  'rede-e-monitoramento': { manifestos: juntar(PARTIDA8.rede, PARTIDA8.negaTudo, PARTIDA8.monitoramento) },
  'cofre-restrito': { manifestos: PARTIDA8.cofre },
  // Nível 9: um cluster quebrado por incidente (nivel9.js)
  ...PARTIDA9,
  // Nível 10
  'helm-repo': { repoHelm: true },
  'helm-loja-4': { repoHelm: true, comandos: ['helm install loja kube-learn/loja --set replicaCount=4'] },
  'helm-quebrado': { repoHelm: true, comandos: ['helm install loja kube-learn/loja', 'helm upgrade loja kube-learn/loja --set image.tag=2.0-bugada'] },
  'loja-azul': { manifestos: PARTIDA10.corAzul },
  'operador-backup': { manifestos: PARTIDA10.operador },
  'gitops-loja': { gitops: { 'loja.yaml': PARTIDA10.lojaGit } },
  // Nível 11 (os projetos)
  'projeto-loja': { manifestos: juntar(INGRESS_CLASS, PARTIDA11.cliente) },
  'projeto-canario': { manifestos: GATEWAY },
  'projeto-black-friday': { metricas: true },
  // A seção Troubleshooting (troubleshooting.js)
  ...PARTIDA_TS,
  // A Oficina do kubectl (oficina.js)
  ...PARTIDA_OF,
};

/** Monta o cluster de partida (sempre igual para a mesma semente). */
export function montarCluster(nome = 'vazio', semente = nome) {
  const def = CLUSTERS[nome] ?? PARTIDA_PL[nome]; // o do Plantão do dia é montado junto com o plantão
  if (!def) throw new Error(`cluster de partida desconhecido: ${nome}`);
  const c = criarCluster({ nodes: def.nodes, semente, metricas: def.metricas });
  // Comandos antes dos manifestos (ex.: interditar um node para tudo nascer no outro).
  for (const linha of def.antes ?? []) {
    const r = kubectl(c, linha);
    if (r.codigo) throw new Error(`cluster ${nome}: ${linha}: ${r.saida}`);
  }
  if (def.manifestos) {
    const r = kubectl(c, 'kubectl apply -f inicial.yaml', { arquivos: { 'inicial.yaml': def.manifestos } });
    if (r.codigo) throw new Error(`cluster ${nome}: ${r.saida}`);
    c.avancar('1m');
  }
  // Comandos que "alguém" rodou antes do aluno chegar (cada um seguido de 1 minuto).
  if (def.repoHelm) helm(c, `helm repo add kube-learn ${REPO_PADRAO}`);
  if (def.gitops) criarRepositorio(c, def.gitops);
  // Uma função faz o que o kubectl não faz (ex.: derrubar um node); "helm ..." roda o helm.
  for (const linha of def.comandos ?? []) {
    if (typeof linha === 'function') linha(c);
    else {
      const r = linha.startsWith('helm ') ? helm(c, linha) : kubectl(c, linha);
      if (r.codigo) throw new Error(`cluster ${nome}: ${linha}: ${r.saida}`);
    }
    c.avancar('1m');
  }
  return c;
}
