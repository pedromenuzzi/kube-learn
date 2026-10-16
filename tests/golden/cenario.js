// Os mesmos passos de scripts/capturar-golden.sh, rodados no simulador. Mantenha os dois em sincronia:
// mudou um passo lá, mude aqui (e capture de novo no kind).
import { criarCluster } from '../../src/k8s/cluster.js';
import { kubectl } from '../../src/k8s/kubectl/index.js';

const WEB = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
`;

export const ARQUIVOS = {
  '/tmp/kl-web.yaml': WEB,
  '/tmp/kl-errado.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: errado
spec:
  replica: 2
  selector:
    matchLabels:
      app: errado
  template:
    metadata:
      labels:
        app: errado
    spec:
      containers:
      - name: c
        imagem: nginx
`,
  '/tmp/kl-seletor.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: seletor
spec:
  replicas: 1
  selector:
    matchLabels:
      app: um
  template:
    metadata:
      labels:
        app: outro
    spec:
      containers:
      - name: c
        image: nginx:1.27
`,
  '/tmp/kl-semimagem.yaml': `apiVersion: v1
kind: Pod
metadata:
  name: semimagem
spec:
  containers:
  - name: c
`,
  '/tmp/kl-tab.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: tab\nspec:\n\tcontainers: []\n',
  '/tmp/kl-tipo.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: tipo
spec:
  replicas: "3"
  selector:
    matchLabels:
      app: tipo
  template:
    metadata:
      labels:
        app: tipo
    spec:
      containers:
      - name: c
        image: nginx:1.27
`,
  '/tmp/kl-kind.yaml': `apiVersion: v1
kind: Deployment
metadata:
  name: kind-errado
`,
};

/** Roda o cenário e devolve { nome: saída + "exit=N\n" }, como os arquivos capturados. */
export function rodarCenario() {
  const c = criarCluster({
    nome: 'golden',
    contexto: 'kind-golden',
    kernel: '6.18.33.2-microsoft-standard-WSL2',
    nodes: [
      { nome: 'golden-control-plane', controlPlane: true, cpu: '12', memoria: '8131216Ki', disco: '1081101176832' },
      { nome: 'golden-worker', cpu: '12', memoria: '8131216Ki', disco: '1081101176832' },
      { nome: 'golden-worker2', cpu: '12', memoria: '8131216Ki', disco: '1081101176832' },
    ],
    uptime: '2m',
  });
  const saidas = {};
  const k = (cmd) => kubectl(c, cmd, { arquivos: ARQUIVOS });
  const cap = (nome, cmd) => {
    const r = k(cmd);
    saidas[nome] = `${r.saida}exit=${r.codigo}\n`;
    c.avancar(1000);
    return r;
  };
  const deploymentPronto = (nome) => () => {
    const d = c.obter('Deployment', 'default', nome);
    return d && d.status?.updatedReplicas === d.spec.replicas && d.status?.availableReplicas === d.spec.replicas && (d.status?.replicas ?? 0) === d.spec.replicas;
  };

  cap('nodes', 'kubectl get nodes');
  cap('nodes-wide', 'kubectl get nodes -o wide');
  cap('apply-web', 'kubectl apply -f /tmp/kl-web.yaml');
  c.avancarAte(deploymentPronto('web'));
  k('kubectl run dorminhoco --image=busybox:1.36 -- sleep 3600');
  c.avancarAte(() => c.obter('Pod', 'default', 'dorminhoco')?.status?.phase === 'Running');
  const P = k("kubectl get pods -l app=web -o jsonpath='{.items[0].metadata.name}'").saida;
  cap('get-pods', 'kubectl get pods');
  cap('get-pods-wide', 'kubectl get pods -o wide');
  cap('get-pods-labels', 'kubectl get pods --show-labels');
  cap('get-pods-name', 'kubectl get pods -l app=web -o name');
  cap('get-pods-jsonpath', "kubectl get pods -l app=web -o jsonpath='{.items[*].metadata.name}'");
  cap('get-deploy', 'kubectl get deploy');
  cap('get-deploy-wide', 'kubectl get deploy -o wide');
  cap('get-rs', 'kubectl get rs');
  cap('get-rs-wide', 'kubectl get rs -o wide');
  cap('get-svc', 'kubectl get svc');
  cap('get-svc-wide', 'kubectl get svc -o wide');
  cap('get-ep', 'kubectl get endpoints web');
  cap('get-all', 'kubectl get all');
  cap('get-deploy-svc', 'kubectl get deploy,svc');
  cap('get-pod-nao-existe', 'kubectl get pod nao-existe');
  cap('get-tipo-errado', 'kubectl get podz');
  cap('get-vazio', 'kubectl get pods -n kube-public');
  cap('comando-errado', 'kubectl gte pods');
  cap('flag-errada', 'kubectl get pods --replicaz');
  cap('describe-pod', `kubectl describe pod ${P}`);
  cap('describe-deploy', 'kubectl describe deploy web');
  cap('describe-rs', 'kubectl describe rs -l app=web');
  cap('describe-svc', 'kubectl describe svc web');
  cap('describe-node', 'kubectl describe node golden-worker');
  cap('describe-ns', 'kubectl describe ns default');
  cap('yaml-deploy', 'kubectl get deploy web -o yaml');
  cap('yaml-pod', `kubectl get pod ${P} -o yaml`);
  cap('yaml-svc', 'kubectl get svc web -o yaml');
  cap('json-svc', 'kubectl get svc web -o json');
  cap('logs-web', `kubectl logs ${P}`);
  cap('logs-deploy', 'kubectl logs deploy/web');
  cap('exec-curl', `kubectl exec ${P} -- curl -s web`);
  cap('exec-curl-codigo', `kubectl exec ${P} -- curl -s -o /dev/null -w '%{http_code}' http://web.default.svc.cluster.local`);
  cap('exec-wget', 'kubectl exec dorminhoco -- wget -qO- web');
  cap('exec-nslookup', 'kubectl exec dorminhoco -- nslookup web');
  cap('exec-sem-curl', 'kubectl exec dorminhoco -- curl web');
  cap('exec-hostname', 'kubectl exec dorminhoco -- hostname');
  cap('exec-cat-resolv', 'kubectl exec dorminhoco -- cat /etc/resolv.conf');
  cap('exec-conexao-recusada', 'kubectl exec dorminhoco -- wget -qO- -T 2 http://web:8080');
  cap('exec-dns-errado', 'kubectl exec dorminhoco -- wget -qO- -T 2 http://nao-existe');

  k('kubectl run crash --image=busybox:1.36');
  k('kubectl run pull --image=nginx:9.99');
  k('kubectl run nopull --image=ngnix:1.27');
  k(`kubectl run grande --image=nginx:1.27 --overrides='{"spec":{"containers":[{"name":"grande","image":"nginx:1.27","resources":{"requests":{"cpu":"100"}}}]}}'`);
  k("kubectl run falha --image=busybox:1.36 -- sh -c 'echo vou falhar; exit 3'");
  c.avancar('75s');
  cap('crash-get', 'kubectl get pod crash falha');
  cap('crash-describe', 'kubectl describe pod crash');
  cap('crash-logs', 'kubectl logs falha');
  cap('pull-get', 'kubectl get pod pull nopull');
  cap('pull-describe', 'kubectl describe pod pull');
  cap('nopull-describe', 'kubectl describe pod nopull');
  cap('pending-get', 'kubectl get pod grande');
  cap('pending-describe', 'kubectl describe pod grande');
  cap('logs-pull', 'kubectl logs pull');
  cap('events', 'kubectl get events --field-selector involvedObject.name=crash');

  cap('dry-deploy', 'kubectl create deployment loja --image=nginx:1.27 --replicas=2 --port=80 --dry-run=client -o yaml');
  cap('dry-run-pod', 'kubectl run teste --image=nginx:1.27 --port=80 --labels=app=teste --env=COR=azul --dry-run=client -o yaml');
  cap('dry-ns', 'kubectl create namespace vendas --dry-run=client -o yaml');
  cap('dry-cm', 'kubectl create configmap cfg --from-literal=cor=azul --dry-run=client -o yaml');
  cap('dry-secret', 'kubectl create secret generic s --from-literal=senha=123 --dry-run=client -o yaml');
  cap('dry-svc', 'kubectl create service clusterip loja --tcp=80:8080 --dry-run=client -o yaml');

  cap('apply-errado', 'kubectl apply -f /tmp/kl-errado.yaml');
  cap('apply-seletor', 'kubectl apply -f /tmp/kl-seletor.yaml');
  cap('apply-semimagem', 'kubectl apply -f /tmp/kl-semimagem.yaml');
  cap('apply-tab', 'kubectl apply -f /tmp/kl-tab.yaml');
  cap('apply-tipo', 'kubectl apply -f /tmp/kl-tipo.yaml');
  cap('apply-kind', 'kubectl apply -f /tmp/kl-kind.yaml');
  cap('apply-nao-existe', 'kubectl apply -f /tmp/nao-existe.yaml');
  cap('apply-web-de-novo', 'kubectl apply -f /tmp/kl-web.yaml');
  cap('create-web-de-novo', 'kubectl create -f /tmp/kl-web.yaml');
  cap('delete-default', 'kubectl delete ns default');
  cap('create-ns', 'kubectl create namespace vendas');
  cap('apply-ns-errado', 'kubectl apply -f /tmp/kl-web.yaml -n nao-existe');

  cap('create-cm', 'kubectl create configmap cfg --from-literal=cor=azul --from-literal=tamanho=G');
  cap('get-cm', 'kubectl get cm');
  cap('describe-cm', 'kubectl describe cm cfg');
  cap('create-secret', 'kubectl create secret generic s --from-literal=senha=123');
  cap('get-secret', 'kubectl get secret');
  cap('describe-secret', 'kubectl describe secret s');
  cap('yaml-secret', 'kubectl get secret s -o yaml');

  cap('label', 'kubectl label pod dorminhoco cor=azul');
  cap('label-sem-overwrite', 'kubectl label pod dorminhoco cor=verde');
  cap('label-overwrite', 'kubectl label pod dorminhoco cor=verde --overwrite');
  cap('label-remover', 'kubectl label pod dorminhoco cor-');
  cap('annotate', "kubectl annotate deploy web kubernetes.io/change-cause='versao 1.28'");

  cap('set-image', 'kubectl set image deployment/web nginx=nginx:1.28');
  cap('rollout-status', 'kubectl rollout status deploy/web --timeout=180s');
  cap('rollout-history', 'kubectl rollout history deploy/web');
  cap('rollout-history-rev', 'kubectl rollout history deploy/web --revision=2');
  cap('get-rs-depois', 'kubectl get rs');
  cap('describe-deploy-depois', 'kubectl describe deploy web');
  cap('rollout-undo', 'kubectl rollout undo deploy/web');
  k('kubectl rollout status deploy/web --timeout=180s');
  cap('rollout-history-undo', 'kubectl rollout history deploy/web');
  cap('set-image-errado', 'kubectl set image deployment/web naoexiste=nginx:1.28');
  cap('scale', 'kubectl scale deploy web --replicas=5');
  cap('rollout-restart', 'kubectl rollout restart deploy/web');
  k('kubectl rollout status deploy/web --timeout=180s');
  cap('scale-get', 'kubectl get deploy web');

  cap('config-contexts', 'kubectl config get-contexts');
  cap('config-current', 'kubectl config current-context');
  cap('config-ns', 'kubectl config set-context --current --namespace=vendas');
  k('kubectl config set-context --current --namespace=default');
  cap('version', 'kubectl version');
  cap('cluster-info', 'kubectl cluster-info');
  cap('explain-deploy', 'kubectl explain deployment');
  cap('explain-replicas', 'kubectl explain deployment.spec.replicas');
  cap('explain-containers', 'kubectl explain pod.spec.containers');

  cap('delete-pod', 'kubectl delete pod dorminhoco');
  cap('delete-deploy', 'kubectl delete deploy web');
  cap('delete-f', 'kubectl delete -f /tmp/kl-web.yaml');
  cap('delete-label', 'kubectl delete pods -l run');
  cap('delete-nao-existe', 'kubectl delete pod nao-existe');
  return { saidas, cluster: c };
}
