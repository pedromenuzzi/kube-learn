// @vitest-environment node
// Comportamento do cluster simulado: o que um exercício vai conferir tem de funcionar como no real.
import { describe, expect, it } from 'vitest';
import { criarCluster } from '../src/k8s/cluster.js';
import { kubectl } from '../src/k8s/kubectl/index.js';
import { idade } from '../src/k8s/unidades.js';
import { tabular } from '../src/k8s/tabwriter.js';
import { jsonpath } from '../src/k8s/kubectl/formatos.js';
import { analisar } from '../src/k8s/shell.js';
import { estaPronto } from '../src/k8s/rede.js';

const deploy = (nome, imagem, replicas = 3, extra = '') => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${nome}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${nome}
${extra}  template:
    metadata:
      labels:
        app: ${nome}
    spec:
      containers:
      - name: app
        image: ${imagem}
`;
const servico = (nome, porta, alvo, seletor = nome) => `apiVersion: v1
kind: Service
metadata:
  name: ${nome}
spec:
  selector:
    app: ${seletor}
  ports:
  - port: ${porta}
    targetPort: ${alvo}
`;

function novo(arquivos = {}) {
  const c = criarCluster();
  const k = (linha) => kubectl(c, linha, { arquivos });
  return { c, k, arquivos };
}
const pods = (c, app) => c.listar('Pod', 'default').filter((p) => p.metadata.labels?.app === app && !p.metadata.deletionTimestamp);
const prontos = (c, app) => pods(c, app).filter(estaPronto).length;

describe('Deployment e ReplicaSet', () => {
  it('sobe as réplicas e se cura quando um pod some', () => {
    const { c, k } = novo({ 'web.yaml': deploy('web', 'nginx:1.27') });
    expect(k('kubectl apply -f web.yaml').saida).toBe('deployment.apps/web created\n');
    c.avancar('30s');
    expect(prontos(c, 'web')).toBe(3);
    const vitima = pods(c, 'web')[0].metadata.name;
    expect(k(`kubectl delete pod ${vitima}`).codigo).toBe(0);
    c.avancar('30s');
    expect(prontos(c, 'web')).toBe(3);
    expect(pods(c, 'web').map((p) => p.metadata.name)).not.toContain(vitima);
  });

  it('rolling update com maxUnavailable 0 nunca deixa menos de 3 prontos', () => {
    const estrategia = '  strategy:\n    rollingUpdate:\n      maxSurge: 1\n      maxUnavailable: 0\n';
    const { c, k, arquivos } = novo({ 'loja.yaml': deploy('loja', 'kubelearn/loja:1.0', 3, estrategia) });
    k('kubectl apply -f loja.yaml');
    c.avancar('30s');
    arquivos['loja.yaml'] = deploy('loja', 'kubelearn/loja:1.1', 3, estrategia);
    expect(k('kubectl apply -f loja.yaml').saida).toBe('deployment.apps/loja configured\n');
    let minimo = Infinity;
    for (let i = 0; i < 60; i++) {
      c.avancar(1000);
      minimo = Math.min(minimo, prontos(c, 'loja'));
    }
    expect(minimo).toBe(3);
    expect(pods(c, 'loja').every((p) => p.spec.containers[0].image === 'kubelearn/loja:1.1')).toBe(true);
    expect(k('kubectl rollout status deploy/loja').saida).toBe('deployment "loja" successfully rolled out\n');
  });

  it('versão bugada entra em CrashLoopBackOff e o rollout undo volta', () => {
    const { c, k } = novo({ 'loja.yaml': deploy('loja', 'kubelearn/loja:1.0') });
    k('kubectl apply -f loja.yaml');
    c.avancar('30s');
    k('kubectl set image deploy/loja app=kubelearn/loja:2.0-bugada');
    c.avancar('40s');
    const tabela = k('kubectl get pods').saida;
    expect(tabela).toMatch(/CrashLoopBackOff|Error/);
    expect(prontos(c, 'loja')).toBeGreaterThanOrEqual(2); // o rolling update segura os antigos
    const bugado = pods(c, 'loja').find((p) => p.spec.containers[0].image.endsWith('bugada')).metadata.name;
    expect(k(`kubectl logs ${bugado} --previous`).saida).toContain('panic: runtime error');
    expect(k('kubectl rollout undo deploy/loja').stdout).toBe('deployment.apps/loja rolled back\n');
    c.avancar('30s');
    expect(prontos(c, 'loja')).toBe(3);
    expect(pods(c, 'loja').every((p) => p.spec.containers[0].image === 'kubelearn/loja:1.0')).toBe(true);
    expect(k('kubectl rollout history deploy/loja').saida).toMatch(/2\s+<none>\n3\s+<none>/);
  });

  it('Recreate apaga todos os antigos antes de criar os novos', () => {
    const { c, k, arquivos } = novo({ 'a.yaml': deploy('a', 'nginx:1.27', 2, '  strategy:\n    type: Recreate\n') });
    k('kubectl apply -f a.yaml');
    c.avancar('30s');
    arquivos['a.yaml'] = deploy('a', 'nginx:1.28', 2, '  strategy:\n    type: Recreate\n');
    k('kubectl apply -f a.yaml');
    let misturou = false;
    for (let i = 0; i < 40; i++) {
      c.avancar(1000);
      const imagens = new Set(c.listar('Pod', 'default').filter((p) => p.metadata.labels?.app === 'a').map((p) => p.spec.containers[0].image));
      if (imagens.size > 1) misturou = true;
    }
    expect(misturou).toBe(false);
    expect(prontos(c, 'a')).toBe(2);
  });

  it('tirar a label solta o pod e o ReplicaSet cria outro no lugar', () => {
    const { c, k } = novo({ 'web.yaml': deploy('web', 'nginx:1.27', 2) });
    k('kubectl apply -f web.yaml');
    c.avancar('20s');
    const solto = pods(c, 'web')[0].metadata.name;
    expect(k(`kubectl label pod ${solto} app-`).saida).toBe(`pod/${solto} unlabeled\n`);
    c.avancar('20s');
    expect(prontos(c, 'web')).toBe(2);
    expect(c.obter('Pod', 'default', solto).metadata.ownerReferences).toBeUndefined();
  });
});

describe('rede', () => {
  it('o Service distribui entre os pods (rodízio) e o DNS resolve o nome', () => {
    const { c, k } = novo({ 'loja.yaml': `${deploy('loja', 'kubelearn/loja:1.0')}---\n${servico('loja', 80, 8080)}` });
    k('kubectl apply -f loja.yaml');
    k('kubectl run cliente --image=busybox:1.36 -- sleep 3600');
    c.avancar('30s');
    const quem = new Set();
    for (let i = 0; i < 6; i++) {
      const r = k('kubectl exec cliente -- wget -qO- http://loja.default.svc.cluster.local');
      expect(r.codigo).toBe(0);
      quem.add(JSON.parse(r.stdout).pod);
    }
    expect(quem.size).toBe(3);
  });

  it('seletor errado deixa o Service sem endpoints e a conexão é recusada', () => {
    const { c, k } = novo({ 'loja.yaml': `${deploy('loja', 'kubelearn/loja:1.0', 1)}---\n${servico('loja', 80, 8080, 'lojinha')}` });
    k('kubectl apply -f loja.yaml');
    k('kubectl run cliente --image=busybox:1.36 -- sleep 3600');
    c.avancar('30s');
    expect(k('kubectl get endpoints loja').stdout).toMatch(/loja\s+<none>/);
    const r = k('kubectl exec cliente -- wget -qO- loja');
    expect(r.stdout).toMatch(/wget: can't connect to remote host \(10\.96\.\d+\.\d+\): Connection refused/);
    expect(r.stderr).toBe('command terminated with exit code 1\n');
  });

  it('targetPort errado: o pod não ouve nessa porta', () => {
    const { c, k } = novo({ 'loja.yaml': `${deploy('loja', 'kubelearn/loja:1.0', 1)}---\n${servico('loja', 80, 80)}` });
    k('kubectl apply -f loja.yaml');
    k('kubectl run cliente --image=busybox:1.36 -- sleep 3600');
    c.avancar('30s');
    expect(k('kubectl exec cliente -- wget -qO- loja').stdout).toContain('Connection refused');
  });
});

describe('kubelet', () => {
  it('pod que não cabe fica Pending com a mensagem do scheduler', () => {
    const { c, k } = novo();
    k(`kubectl run grande --image=nginx:1.27 --overrides='{"spec":{"containers":[{"name":"grande","image":"nginx:1.27","resources":{"requests":{"memory":"64Gi"}}}]}}'`);
    c.avancar('10s');
    expect(k('kubectl get pod grande').stdout).toMatch(/grande\s+0\/1\s+Pending/);
    expect(k('kubectl describe pod grande').stdout).toContain('0/3 nodes are available: 1 node(s) had untolerated taint(s), 2 Insufficient memory.');
  });

  it('postgres sem senha cai; com a senha num Secret, sobe', () => {
    const pg = (env) => `apiVersion: v1\nkind: Pod\nmetadata:\n  name: banco\nspec:\n  containers:\n  - name: pg\n    image: postgres:17\n${env}`;
    const { c, k, arquivos } = novo({ 'pg.yaml': pg('') });
    k('kubectl apply -f pg.yaml');
    c.avancar('20s');
    expect(k('kubectl logs banco').stdout).toContain('superuser password is not specified');
    k('kubectl delete pod banco');
    k('kubectl create secret generic pg --from-literal=senha=s3gr3d0');
    arquivos['pg.yaml'] = pg('    env:\n    - name: POSTGRES_PASSWORD\n      valueFrom:\n        secretKeyRef:\n          name: pg\n          key: senha\n');
    k('kubectl apply -f pg.yaml');
    c.avancar('20s');
    expect(k('kubectl get pod banco').stdout).toMatch(/banco\s+1\/1\s+Running\s+0/);
    expect(k('kubectl exec banco -- printenv POSTGRES_PASSWORD').stdout).toBe('s3gr3d0\n');
  });

  it('ConfigMap que falta trava o contêiner até ele existir', () => {
    const pod = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: app\nspec:\n  containers:\n  - name: app\n    image: nginx:1.27\n    envFrom:\n    - configMapRef:\n        name: config\n';
    const { c, k } = novo({ 'app.yaml': pod });
    k('kubectl apply -f app.yaml');
    c.avancar('10s');
    expect(k('kubectl get pod app').stdout).toContain('CreateContainerConfigError');
    k('kubectl create configmap config --from-literal=COR=azul');
    c.avancar('15s');
    expect(k('kubectl exec app -- printenv COR').stdout).toBe('azul\n');
  });

  it('busybox com laço escreve no log com o tempo do cluster, e o -f acompanha', () => {
    const { c, k } = novo();
    k("kubectl run relogio --image=busybox:1.36 -- sh -c 'while true; do echo tic; sleep 5; done'");
    c.avancar('12s');
    const r = k('kubectl logs -f relogio');
    const antes = r.stdout.split('\n').filter(Boolean).length;
    expect(antes).toBeGreaterThanOrEqual(2);
    c.avancar('10s');
    expect(r.observar()).toBe('tic\ntic\n');
  });

  it('get -w mostra as mudanças conforme o relógio anda', () => {
    const { c, k } = novo();
    const w = k('kubectl get pods -w');
    k('kubectl run web --image=nginx:1.27');
    c.avancar('10s');
    const linhas = w.observar();
    expect(linhas).toMatch(/web\s+0\/1\s+Pending/);
    expect(linhas).toMatch(/web\s+0\/1\s+ContainerCreating/);
    expect(linhas).toMatch(/web\s+1\/1\s+Running/);
  });

  it('exec -it abre uma sessão de shell', () => {
    const { c, k } = novo();
    k('kubectl run caixa --image=busybox:1.36 -- sleep 3600');
    c.avancar('10s');
    const { sessao } = k('kubectl exec -it caixa -- sh');
    expect(sessao.executar('echo $HOSTNAME').saida).toBe('caixa\n');
    expect(sessao.executar('exit').sair).toBe(true);
  });
});

describe('API', () => {
  it('apagar o namespace apaga tudo dentro', () => {
    const { c, k } = novo({ 'web.yaml': deploy('web', 'nginx:1.27', 2) });
    k('kubectl create namespace loja');
    k('kubectl apply -f web.yaml -n loja');
    c.avancar('20s');
    expect(c.listar('Pod', 'loja').length).toBe(2);
    expect(k('kubectl delete ns loja').stdout).toBe('namespace "loja" deleted\n');
    expect(c.obter('Namespace', null, 'loja')).toBeUndefined();
    expect(c.listar('Pod', 'loja').length).toBe(0);
  });

  it('apply três vias: tira do cluster o campo que saiu do arquivo, mantém o que o servidor pôs', () => {
    const base = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\ndata:\n  a: "1"\n';
    const { c, k, arquivos } = novo({ 'cfg.yaml': `${base}  b: "2"\n` });
    k('kubectl apply -f cfg.yaml');
    arquivos['cfg.yaml'] = base;
    expect(k('kubectl apply -f cfg.yaml').stdout).toBe('configmap/cfg configured\n');
    expect(c.obter('ConfigMap', 'default', 'cfg').data).toEqual({ a: '1' });
    expect(k('kubectl apply -f cfg.yaml').stdout).toBe('configmap/cfg unchanged\n');
  });

  it('o mesmo cluster com os mesmos passos dá sempre a mesma saída', () => {
    const rodar = () => {
      const { c, k } = novo({ 'web.yaml': deploy('web', 'nginx:1.27') });
      k('kubectl apply -f web.yaml');
      c.avancar('20s');
      return k('kubectl get pods -o wide').stdout + k('kubectl get svc -A').stdout;
    };
    expect(rodar()).toBe(rodar());
  });
});

describe('peças pequenas', () => {
  it('idade como o kubectl (HumanDuration)', () => {
    const s = 1000;
    expect([0, 59 * s, 119 * s, 120 * s, 138 * s, 600 * s, 3 * 3600 * s + 5 * 60 * s, 30 * 3600 * s, 50 * 3600 * s].map(idade))
      .toEqual(['0s', '59s', '119s', '2m', '2m18s', '10m', '3h5m', '30h', '2d2h']);
  });

  it('tabwriter alinha por blocos, como o do Go', () => {
    expect(tabular('Name:\tweb\nLabels:\tapp=web\n\tx=y\nIPs:\n  IP:\t1.2.3.4\n', { padding: 2 }))
      .toBe('Name:    web\nLabels:  app=web\n         x=y\nIPs:\n  IP:  1.2.3.4\n');
  });

  it('jsonpath com range e filtro', () => {
    const lista = { items: [{ metadata: { name: 'a' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }, { metadata: { name: 'b' }, status: { conditions: [{ type: 'Ready', status: 'False' }] } }] };
    expect(jsonpath('{range .items[*]}{.metadata.name}={.status.conditions[?(@.type=="Ready")].status}{"\\n"}{end}', lista)).toBe('a=True\nb=False\n');
    expect(jsonpath('{.items[-1].metadata.name}', lista)).toBe('b');
  });

  it('o shell entende while, &&, || e aspas', () => {
    const nos = analisar("echo 'a;b' && false || echo ok; while true; do echo x; sleep 1; done");
    expect(nos.map((n) => n.argv?.[0] ?? 'while')).toEqual(['echo', 'false', 'echo', 'while']);
    expect(nos[0].argv[1]).toBe('a;b');
  });
});

describe('sondas com zeros e caminho vazio ganham o padrão do apiserver (SetDefaults_Probe)', () => {
  const pod = (sondas) => `apiVersion: v1
kind: Pod
metadata:
  name: p
spec:
  containers:
  - name: c
    image: nginx
${sondas}`;

  it('failureThreshold/periodSeconds/... = 0 e path "" viram 3/10/1/1 e "/": o pod saudável fica Ready e não reinicia', () => {
    const c = criarCluster();
    const zeros = '{httpGet: {port: 80, path: ""}, failureThreshold: 0, periodSeconds: 0, timeoutSeconds: 0, successThreshold: 0}';
    expect(kubectl(c, 'kubectl apply -f p.yaml', { arquivos: { 'p.yaml': pod(`    readinessProbe: ${zeros}\n    livenessProbe: ${zeros}\n`) } }).codigo).toBe(0);
    c.avancar('2m');
    expect(kubectl(c, 'kubectl get pod p --no-headers').stdout).toMatch(/^p\s+1\/1\s+Running\s+0\s/);
    expect(JSON.parse(kubectl(c, 'kubectl get pod p -o jsonpath={.spec.containers[0].livenessProbe}').stdout))
      .toEqual({ failureThreshold: 3, httpGet: { path: '/', port: 80, scheme: 'HTTP' }, periodSeconds: 10, successThreshold: 1, timeoutSeconds: 1 });
  });
});

describe('--timeout e --since são durações do Go', () => {
  const c = criarCluster();
  kubectl(c, 'kubectl create deploy web --image=nginx');
  c.avancar('30s');

  it.each([
    ['kubectl wait --for=condition=Available deploy/web --timeout=30', 'wait', '--timeout', 'missing unit in duration "30"'],
    ['kubectl rollout status deploy/web --timeout=5', 'rollout status', '--timeout', 'missing unit in duration "5"'],
    ['kubectl drain node-1 --ignore-daemonsets --timeout=30', 'drain', '--timeout', 'missing unit in duration "30"'],
    ['kubectl logs deploy/web --since=1d', 'logs', '--since', 'unknown unit "d" in duration "1d"'],
    ['kubectl wait --for=delete pod/x --timeout=abc', 'wait', '--timeout', 'invalid duration "abc"'],
  ])('%s: o erro da flag, sem exceção', (linha, comando, flag, motivo) => {
    const r = kubectl(c, linha);
    expect(r.codigo).toBe(1);
    expect(r.stderr).toBe(`error: invalid argument "${linha.match(/=(\w+)$/)[1]}" for "${flag}" flag: time: ${motivo}\nSee 'kubectl ${comando} --help' for usage.\n`);
  });

  it('com unidade (e combinações como 1m30s), segue funcionando', () => {
    expect(kubectl(c, 'kubectl wait --for=condition=Available deploy/web --timeout=1m30s').stdout).toBe('deployment.apps/web condition met\n');
    expect(kubectl(c, 'kubectl rollout status deploy/web --timeout=0').codigo).toBe(0);
  });
});
