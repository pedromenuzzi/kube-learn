// Os mesmos passos de scripts/capturar-golden.sh, rodados no simulador. Mantenha os dois em sincronia:
// mudou um passo lá, mude aqui (e capture de novo no kind).
import { readFileSync } from 'node:fs';
import { criarCluster } from '../../src/k8s/cluster.js';
import { kubectl } from '../../src/k8s/kubectl/index.js';
import { nodePronto } from '../../src/k8s/scheduler.js';

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

// Os manifestos das fases novas vêm direto do script (os blocos "cat > /tmp/... <<'Y'"), para não divergirem.
const SCRIPT = readFileSync(new URL('../../scripts/capturar-golden.sh', import.meta.url), 'utf8');
for (const [, caminho, texto] of SCRIPT.matchAll(/cat > (\/tmp\/[\w.-]+) <<'Y'\n([\s\S]*?)\nY\n/g)) ARQUIVOS[caminho] ??= `${texto}\n`;

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
    metricas: true, // o kind do golden tem o metrics-server (para o nível 6)
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
  // Como o script: kubectl wait --for=condition=Ready pod/dorminhoco
  c.avancarAte(() => c.obter('Pod', 'default', 'dorminhoco')?.status?.conditions?.some((x) => x.type === 'Ready' && x.status === 'True'));
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

  // Fase 6 · nível 4: volumes, PVC, PV, StorageClass e StatefulSet
  const podPronto = (nome) => () => c.obter('Pod', 'default', nome)?.status?.conditions?.some((x) => x.type === 'Ready' && x.status === 'True');
  cap('get-sc', 'kubectl get sc');
  cap('describe-sc', 'kubectl describe sc standard');
  cap('apply-dados', 'kubectl apply -f /tmp/kl-dados.yaml');
  cap('pvc-pendente', 'kubectl get pvc dados');
  c.avancarAte(podPronto('caderno'), '2m');
  const PV = c.obter('PersistentVolumeClaim', 'default', 'dados').spec.volumeName;
  cap('get-pvc', 'kubectl get pvc');
  cap('get-pvc-wide', 'kubectl get pvc -o wide');
  cap('get-pv', 'kubectl get pv');
  cap('describe-pvc', 'kubectl describe pvc dados');
  cap('yaml-pvc', 'kubectl get pvc dados -o yaml');
  cap('describe-pv', `kubectl describe pv ${PV}`);
  cap('yaml-pv', `kubectl get pv ${PV} -o yaml`);
  cap('exec-cat-pvc', 'kubectl exec caderno -- cat /dados/notas.txt');
  cap('describe-pod-pvc', 'kubectl describe pod caderno');
  cap('apply-volume-errado', 'kubectl apply -f /tmp/kl-volume-errado.yaml');
  cap('apply-pvc-incompleto', 'kubectl apply -f /tmp/kl-pvc-incompleto.yaml');
  cap('apply-sem-fonte', 'kubectl apply -f /tmp/kl-sem-fonte.yaml');
  c.avancar('20s');
  cap('sem-fonte-get', 'kubectl get pod sem-cm usa-rapido');
  cap('sem-cm-describe', 'kubectl describe pod sem-cm');
  cap('rapido-describe', 'kubectl describe pod usa-rapido');
  cap('rapido-pvc', 'kubectl describe pvc rapido');
  cap('apply-vitrine', 'kubectl apply -f /tmp/kl-vitrine.yaml');
  c.avancarAte(podPronto('vitrine'), '2m');
  cap('exec-ls-cm', 'kubectl exec vitrine -c nginx -- ls /usr/share/nginx/html');
  cap('exec-cat-secret', 'kubectl exec vitrine -c nginx -- cat /etc/segredo/senha');
  cap('exec-curl-cm', 'kubectl exec vitrine -c nginx -- curl -s localhost');
  cap('exec-somente-leitura', "kubectl exec vitrine -c nginx -- sh -c 'echo x > /etc/segredo/y'");
  cap('exec-emptydir', "kubectl exec vitrine -c escritor -- sh -c 'echo y >> /compartilhado/msg; cat /compartilhado/msg'");
  cap('exec-cat-nao-existe', 'kubectl exec vitrine -c escritor -- cat /nao/existe');
  cap('describe-pod-volumes', 'kubectl describe pod vitrine');
  cap('apply-db', 'kubectl apply -f /tmp/kl-db.yaml');
  cap('rollout-sts', 'kubectl rollout status sts/db --timeout=180s');
  cap('get-sts', 'kubectl get sts');
  cap('get-sts-wide', 'kubectl get sts -o wide');
  cap('describe-sts', 'kubectl describe sts db');
  cap('yaml-sts', 'kubectl get sts db -o yaml');
  cap('get-pods-sts', 'kubectl get pods -l app=db');
  cap('get-pvc-sts', 'kubectl get pvc -l app=db');
  cap('exec-hosts-sts', 'kubectl exec db-1 -- cat /etc/hosts');
  k('kubectl run cliente --image=busybox:1.36 -- sleep 3600');
  c.avancarAte(podPronto('cliente'), '2m');
  cap('nslookup-sts-curto', 'kubectl exec cliente -- nslookup db-0.db');
  cap('nslookup-sts', 'kubectl exec cliente -- nslookup db-0.db.default.svc.cluster.local');
  cap('scale-sts', 'kubectl scale sts db --replicas=1');
  c.avancar('10s');
  cap('scale-sts-get', 'kubectl get pods -l app=db');
  cap('scale-sts-pvc', 'kubectl get pvc -l app=db');

  // Fase 6 · nível 5: Job, CronJob, DaemonSet, init container e sidecar
  cap('apply-job', 'kubectl apply -f /tmp/kl-job.yaml');
  cap('wait-job', 'kubectl wait --for=condition=complete job/relatorio --timeout=120s');
  cap('get-jobs', 'kubectl get jobs');
  cap('get-jobs-wide', 'kubectl get jobs -o wide');
  cap('describe-job', 'kubectl describe job relatorio');
  cap('yaml-job', 'kubectl get job relatorio -o yaml');
  cap('get-pods-job', 'kubectl get pods -l job-name=relatorio');
  cap('logs-job-pod', 'kubectl logs -l job-name=relatorio --tail=1');
  cap('apply-job-falha', 'kubectl apply -f /tmp/kl-job-falha.yaml');
  c.avancar('50s');
  cap('get-job-falha', 'kubectl get job falha');
  cap('describe-job-falha', 'kubectl describe job falha');
  cap('apply-job-sem-politica', 'kubectl apply -f /tmp/kl-job-sem-politica.yaml');
  cap('apply-cron-errado', 'kubectl apply -f /tmp/kl-cron-errado.yaml');
  cap('dry-job', 'kubectl create job x --image=busybox:1.36 --dry-run=client -o yaml -- echo oi');
  cap('dry-cronjob', "kubectl create cronjob y --image=busybox:1.36 --schedule='*/5 * * * *' --dry-run=client -o yaml");
  cap('apply-init', 'kubectl apply -f /tmp/kl-init.yaml');
  c.avancarAte(() => podPronto('com-init')() && podPronto('com-sidecar')(), '2m');
  cap('get-pods-init', 'kubectl get pods com-init com-sidecar');
  cap('describe-pod-init', 'kubectl describe pod com-init');
  cap('logs-init', 'kubectl logs com-init -c espera');
  cap('get-ds', 'kubectl get ds -A');
  cap('get-ds-wide', 'kubectl get ds -A -o wide');
  cap('describe-ds-kindnet', 'kubectl describe ds kindnet -n kube-system');
  cap('apply-extintor', 'kubectl apply -f /tmp/kl-extintor.yaml');
  cap('rollout-ds', 'kubectl rollout status ds/extintor --timeout=120s');
  cap('get-ds-extintor', 'kubectl get ds extintor');
  cap('describe-ds-extintor', 'kubectl describe ds extintor');
  cap('apply-cron', 'kubectl apply -f /tmp/kl-cron.yaml');
  c.avancarAte(() => c.listar('Job', 'default').some((j) => j.metadata.name.startsWith('limpeza-')), '2m');
  c.avancar('8s');
  cap('get-cronjob', 'kubectl get cronjob');
  cap('describe-cronjob', 'kubectl describe cronjob limpeza');

  // Fase 6 · nível 6: probes, recursos, cotas e HPA
  cap('apply-probes', 'kubectl apply -f /tmp/kl-probes.yaml');
  c.avancar('25s');
  cap('get-pods-probes', 'kubectl get pod pronto vivo');
  cap('yaml-probe', "kubectl get pod pronto -o jsonpath='{.spec.containers[0].readinessProbe}'");
  cap('describe-pod-readiness', 'kubectl describe pod pronto');
  cap('describe-pod-liveness', 'kubectl describe pod vivo');
  cap('apply-cota', 'kubectl apply -f /tmp/kl-cota.yaml');
  c.avancar('2s');
  cap('run-limitrange', 'kubectl run sem-nada --image=nginx:1.27 -n time-a');
  cap('resources-limitrange', "kubectl get pod sem-nada -n time-a -o jsonpath='{.spec.containers[0].resources}'");
  cap('anotacao-limitrange', "kubectl get pod sem-nada -n time-a -o jsonpath='{.metadata.annotations}'");
  cap('run-max-limitrange', `kubectl run grandao --image=nginx:1.27 -n time-a --overrides='{"spec":{"containers":[{"name":"grandao","image":"nginx:1.27","resources":{"limits":{"memory":"1Gi"}}}]}}'`);
  cap('run-cota-estourada', `kubectl run guloso --image=nginx:1.27 -n time-a --overrides='{"spec":{"containers":[{"name":"guloso","image":"nginx:1.27","resources":{"requests":{"cpu":"2"},"limits":{"cpu":"2"}}}]}}'`);
  k('kubectl create deployment muitos --image=nginx:1.27 --replicas=5 -n time-a');
  c.avancar('8s');
  cap('get-quota', 'kubectl get quota -n time-a');
  cap('describe-quota', 'kubectl describe quota cota -n time-a');
  cap('get-limitrange', 'kubectl get limitrange -n time-a');
  cap('describe-limitrange', 'kubectl describe limitrange limites -n time-a');
  cap('describe-ns-cota', 'kubectl describe ns time-a');
  cap('apply-cota-b', 'kubectl apply -f /tmp/kl-cota-b.yaml');
  c.avancar('2s');
  cap('run-cota-sem-requests', 'kubectl run x --image=nginx:1.27 -n time-b');
  cap('apply-hpa', 'kubectl apply -f /tmp/kl-hpa.yaml');
  cap('autoscale', 'kubectl autoscale deployment php --cpu=50% --min=1 --max=5');
  cap('autoscale-sem-requests', 'kubectl autoscale deployment sem-requests --cpu=50% --min=1 --max=3');
  cap('dry-autoscale', 'kubectl autoscale deployment php --cpu-percent=50 --min=1 --max=5 --dry-run=client -o yaml');
  c.avancarAte(deploymentPronto('php'), '2m');
  c.avancar('60s');
  cap('get-hpa', 'kubectl get hpa');
  cap('describe-hpa-sem-requests', 'kubectl describe hpa sem-requests');

  // Fase 7 · nível 7: nodeSelector, anti-afinidade, espalhamento, taints, cordon, drain, PDB, prioridade e node caindo
  const pronto = (nome) => () => c.obter('Pod', 'default', nome)?.status?.conditions?.some((x) => x.type === 'Ready' && x.status === 'True');
  const pendente = (app) => k(`kubectl get pods -l app=${app} --field-selector=status.phase=Pending -o name`).saida.split('\n')[0];
  cap('label-node', 'kubectl label node golden-worker energia=gerador');
  cap('apply-agenda', 'kubectl apply -f /tmp/kl-agenda.yaml');
  c.avancarAte(deploymentPronto('gerador'), '2m');
  c.avancar('5s');
  cap('get-pods-gerador', 'kubectl get pods -l app=gerador -o wide');
  cap('get-pods-backup', 'kubectl get pods -l app=backup -o wide');
  cap('describe-backup-pendente', `kubectl describe ${pendente('backup')}`);
  cap('get-pods-espalha', 'kubectl get pods -l app=espalha -o wide');
  cap('describe-espalha-pendente', `kubectl describe ${pendente('espalha')}`);
  cap('taint-node', 'kubectl taint nodes golden-worker2 dedicado=gpu:NoSchedule');
  cap('taint-repetido', 'kubectl taint nodes golden-worker2 dedicado=gpu:NoSchedule');
  k('kubectl label node golden-worker2 dedicado=gpu');
  cap('apply-restrito', 'kubectl apply -f /tmp/kl-restrito.yaml');
  c.avancar('3s');
  cap('describe-restrito', 'kubectl describe pod restrito');
  cap('describe-node-taint', 'kubectl describe node golden-worker2');
  cap('taint-remover', 'kubectl taint nodes golden-worker2 dedicado=gpu:NoSchedule-');
  cap('taint-remover-ausente', 'kubectl taint nodes golden-worker2 dedicado-');
  c.avancarAte(pronto('restrito'), '1m');
  cap('get-pod-restrito', 'kubectl get pod restrito -o wide');
  cap('cordon', 'kubectl cordon golden-worker');
  cap('cordon-de-novo', 'kubectl cordon golden-worker');
  cap('get-nodes-cordon', 'kubectl get nodes');
  cap('uncordon', 'kubectl uncordon golden-worker');
  cap('uncordon-de-novo', 'kubectl uncordon golden-worker');
  k('kubectl cordon golden-worker2');
  cap('apply-pdb', 'kubectl apply -f /tmp/kl-pdb.yaml');
  c.avancarAte(deploymentPronto('cofre'), '2m');
  c.avancarAte(pronto('avulso'), '1m');
  k('kubectl uncordon golden-worker2');
  c.avancar('2s');
  cap('get-pdb', 'kubectl get pdb');
  cap('describe-pdb', 'kubectl describe pdb cofre');
  cap('yaml-pdb', 'kubectl get pdb cofre -o yaml');
  cap('drain-ds', 'kubectl drain golden-worker --pod-selector=k8s-app=kube-proxy');
  cap('drain-ds-ok', 'kubectl drain golden-worker --pod-selector=k8s-app=kube-proxy --ignore-daemonsets');
  cap('drain-solto', 'kubectl drain golden-worker --pod-selector=solto=sim --ignore-daemonsets');
  cap('drain-pdb', 'kubectl drain golden-worker --pod-selector=app=cofre --ignore-daemonsets --timeout=90s');
  cap('drain-force', 'kubectl drain golden-worker --pod-selector=solto=sim --ignore-daemonsets --force');
  cap('get-nodes-drain', 'kubectl get nodes');
  cap('get-pods-cofre', 'kubectl get pods -l app=cofre -o wide');
  cap('uncordon-drain', 'kubectl uncordon golden-worker');
  cap('apply-prioridade', 'kubectl apply -f /tmp/kl-prioridade.yaml');
  cap('get-priorityclass', 'kubectl get priorityclass');
  cap('describe-priorityclass', 'kubectl describe priorityclass critico');
  cap('prioridade-pod', "kubectl get pod urgente -o jsonpath='{.spec.priority} {.spec.preemptionPolicy} {.spec.priorityClassName}'");
  cap('run-classe-inexistente', `kubectl run sem-classe --image=nginx:1.27 --overrides='{"spec":{"priorityClassName":"nao-existe"}}'`);
  // O prédio cai: o plantão e o sozinho moram no golden-worker2, e o kubelet dele para (no kind, docker stop).
  k('kubectl cordon golden-worker');
  k('kubectl apply -f /tmp/kl-caiu.yaml');
  c.avancarAte(deploymentPronto('plantao'), '2m');
  c.avancarAte(pronto('sozinho'), '1m');
  k('kubectl uncordon golden-worker');
  c.derrubarNode('golden-worker2');
  c.avancarAte(() => !nodePronto(c.obter('Node', null, 'golden-worker2')), '2m');
  c.avancar('5s');
  cap('get-nodes-caido', 'kubectl get nodes');
  cap('describe-node-caido', 'kubectl describe node golden-worker2');
  cap('get-pods-caido-antes', 'kubectl get pods -l caiu=sim -o wide');
  c.avancar('320s');
  cap('get-pods-caido', 'kubectl get pods -l caiu=sim -o wide');
  cap('describe-sozinho-caido', 'kubectl describe pod sozinho');
  return { saidas, cluster: c };
}
