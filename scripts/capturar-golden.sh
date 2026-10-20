#!/usr/bin/env bash
# Captura a saída do kubectl de VERDADE (num cluster kind de 3 nodes) para os arquivos golden.
# Uso: KUBECONFIG=... KUBECTL=kubectl scripts/capturar-golden.sh tests/golden/kind
# O cluster: kind com control-plane + 2 workers (kindest/node v1.37). Os testes (tests/golden.test.js)
# rodam os mesmos passos no simulador e comparam célula a célula, depois de normalizar nomes, IPs e idades.
set -u
OUT=${1:?pasta de saída}
K=${KUBECTL:-kubectl}
mkdir -p "$OUT"
n=0
cap() { # cap <nome> <comando...>  grava stdout+stderr e o código de saída
  local nome=$1; shift
  "$@" > "$OUT/$nome.txt" 2>&1; echo "exit=$?" >> "$OUT/$nome.txt"
}
kc() { $K "$@"; }

cat > /tmp/kl-web.yaml <<'Y'
apiVersion: apps/v1
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
Y
cat > /tmp/kl-errado.yaml <<'Y'
apiVersion: apps/v1
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
Y
cat > /tmp/kl-seletor.yaml <<'Y'
apiVersion: apps/v1
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
Y
cat > /tmp/kl-semimagem.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: semimagem
spec:
  containers:
  - name: c
Y
printf 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: tab\nspec:\n\tcontainers: []\n' > /tmp/kl-tab.yaml
cat > /tmp/kl-tipo.yaml <<'Y'
apiVersion: apps/v1
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
Y
cat > /tmp/kl-kind.yaml <<'Y'
apiVersion: v1
kind: Deployment
metadata:
  name: kind-errado
Y

cap nodes kc get nodes
cap nodes-wide kc get nodes -o wide
cap pods-A kc get pods -A
cap apply-web kc apply -f /tmp/kl-web.yaml
kc rollout status deploy/web --timeout=180s >/dev/null 2>&1
kc run dorminhoco --image=busybox:1.36 -- sleep 3600 >/dev/null 2>&1
kc wait --for=condition=Ready pod/dorminhoco --timeout=120s >/dev/null 2>&1
P=$(kc get pods -l app=web -o jsonpath='{.items[0].metadata.name}')
cap get-pods kc get pods
cap get-pods-wide kc get pods -o wide
cap get-pods-labels kc get pods --show-labels
cap get-pods-name kc get pods -l app=web -o name
cap get-pods-jsonpath kc get pods -l app=web -o jsonpath='{.items[*].metadata.name}'
cap get-deploy kc get deploy
cap get-deploy-wide kc get deploy -o wide
cap get-rs kc get rs
cap get-rs-wide kc get rs -o wide
cap get-svc kc get svc
cap get-svc-wide kc get svc -o wide
cap get-ep kc get endpoints web
cap get-all kc get all
cap get-deploy-svc kc get deploy,svc
cap get-ns kc get ns
cap get-pod-nao-existe kc get pod nao-existe
cap get-tipo-errado kc get podz
cap get-vazio kc get pods -n kube-public
cap comando-errado kc gte pods
cap flag-errada kc get pods --replicaz
cap describe-pod kc describe pod "$P"
cap describe-deploy kc describe deploy web
cap describe-rs kc describe rs -l app=web
cap describe-svc kc describe svc web
cap describe-node kc describe node golden-worker
cap describe-ns kc describe ns default
cap yaml-deploy kc get deploy web -o yaml
cap yaml-pod kc get pod "$P" -o yaml
cap yaml-svc kc get svc web -o yaml
cap json-svc kc get svc web -o json
cap logs-web kc logs "$P"
cap logs-deploy kc logs deploy/web
cap exec-curl kc exec "$P" -- curl -s web
cap exec-curl-codigo kc exec "$P" -- curl -s -o /dev/null -w '%{http_code}' http://web.default.svc.cluster.local
cap exec-wget kc exec dorminhoco -- wget -qO- web
cap exec-nslookup kc exec dorminhoco -- nslookup web
cap exec-sem-curl kc exec dorminhoco -- curl web
cap exec-hostname kc exec dorminhoco -- hostname
cap exec-cat-resolv kc exec dorminhoco -- cat /etc/resolv.conf
cap exec-conexao-recusada kc exec dorminhoco -- wget -qO- -T 2 http://web:8080
cap exec-dns-errado kc exec dorminhoco -- wget -qO- -T 2 http://nao-existe

kc run crash --image=busybox:1.36 >/dev/null 2>&1
kc run pull --image=nginx:9.99 >/dev/null 2>&1
kc run nopull --image=ngnix:1.27 >/dev/null 2>&1
kc run grande --image=nginx:1.27 --overrides='{"spec":{"containers":[{"name":"grande","image":"nginx:1.27","resources":{"requests":{"cpu":"100"}}}]}}' >/dev/null 2>&1
kc run falha --image=busybox:1.36 -- sh -c 'echo vou falhar; exit 3' >/dev/null 2>&1
sleep 75
cap crash-get kc get pod crash falha
cap crash-describe kc describe pod crash
cap crash-logs-previous kc logs falha --previous
cap crash-logs kc logs falha
cap pull-get kc get pod pull nopull
cap pull-describe kc describe pod pull
cap nopull-describe kc describe pod nopull
cap pending-get kc get pod grande
cap pending-describe kc describe pod grande
cap logs-pull kc logs pull
cap events kc get events --field-selector involvedObject.name=crash

cap dry-deploy kc create deployment loja --image=nginx:1.27 --replicas=2 --port=80 --dry-run=client -o yaml
cap dry-run-pod kc run teste --image=nginx:1.27 --port=80 --labels=app=teste --env=COR=azul --dry-run=client -o yaml
cap dry-ns kc create namespace vendas --dry-run=client -o yaml
cap dry-cm kc create configmap cfg --from-literal=cor=azul --dry-run=client -o yaml
cap dry-secret kc create secret generic s --from-literal=senha=123 --dry-run=client -o yaml
cap dry-svc kc create service clusterip loja --tcp=80:8080 --dry-run=client -o yaml

cap apply-errado kc apply -f /tmp/kl-errado.yaml
cap apply-seletor kc apply -f /tmp/kl-seletor.yaml
cap apply-semimagem kc apply -f /tmp/kl-semimagem.yaml
cap apply-tab kc apply -f /tmp/kl-tab.yaml
cap apply-tipo kc apply -f /tmp/kl-tipo.yaml
cap apply-kind kc apply -f /tmp/kl-kind.yaml
cap apply-nao-existe kc apply -f /tmp/nao-existe.yaml
cap apply-web-de-novo kc apply -f /tmp/kl-web.yaml
cap create-web-de-novo kc create -f /tmp/kl-web.yaml
cap delete-default kc delete ns default
cap create-ns kc create namespace vendas
cap apply-ns-errado kc apply -f /tmp/kl-web.yaml -n nao-existe

cap create-cm kc create configmap cfg --from-literal=cor=azul --from-literal=tamanho=G
cap get-cm kc get cm
cap describe-cm kc describe cm cfg
cap create-secret kc create secret generic s --from-literal=senha=123
cap get-secret kc get secret
cap describe-secret kc describe secret s
cap yaml-secret kc get secret s -o yaml

cap label kc label pod dorminhoco cor=azul
cap label-sem-overwrite kc label pod dorminhoco cor=verde
cap label-overwrite kc label pod dorminhoco cor=verde --overwrite
cap label-remover kc label pod dorminhoco cor-
cap annotate kc annotate deploy web kubernetes.io/change-cause='versao 1.28'

cap set-image kc set image deployment/web nginx=nginx:1.28
cap rollout-status kc rollout status deploy/web --timeout=180s
cap rollout-history kc rollout history deploy/web
cap rollout-history-rev kc rollout history deploy/web --revision=2
cap get-rs-depois kc get rs
cap describe-deploy-depois kc describe deploy web
cap rollout-undo kc rollout undo deploy/web
kc rollout status deploy/web --timeout=180s >/dev/null 2>&1
cap rollout-history-undo kc rollout history deploy/web
cap set-image-errado kc set image deployment/web naoexiste=nginx:1.28
cap scale kc scale deploy web --replicas=5
cap rollout-restart kc rollout restart deploy/web
kc rollout status deploy/web --timeout=180s >/dev/null 2>&1
cap scale-get kc get deploy web

cap config-contexts kc config get-contexts
cap config-current kc config current-context
cap config-ns kc config set-context --current --namespace=vendas
kc config set-context --current --namespace=default >/dev/null 2>&1
cap api-resources kc api-resources
cap version kc version
cap cluster-info kc cluster-info
cap explain-deploy kc explain deployment
cap explain-replicas kc explain deployment.spec.replicas
cap explain-containers kc explain pod.spec.containers

cap delete-pod kc delete pod dorminhoco
cap delete-deploy kc delete deploy web
cap delete-f kc delete -f /tmp/kl-web.yaml
cap delete-label kc delete pods -l run
cap delete-nao-existe kc delete pod nao-existe

# ---------- Fase 6 · nível 4: volumes, PVC, PV, StorageClass e StatefulSet ----------
cat > /tmp/kl-dados.yaml <<'Y'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dados
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: caderno
spec:
  containers:
  - name: caderno
    image: busybox:1.36
    command: ["sh", "-c", "echo primeira nota >> /dados/notas.txt; sleep 3600"]
    volumeMounts:
    - name: dados
      mountPath: /dados
  volumes:
  - name: dados
    persistentVolumeClaim:
      claimName: dados
Y
cat > /tmp/kl-volume-errado.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: montagem-errada
spec:
  containers:
  - name: c
    image: busybox:1.36
    volumeMounts:
    - name: dado
      mountPath: /d
  volumes:
  - name: dados
    emptyDir: {}
Y
cat > /tmp/kl-pvc-incompleto.yaml <<'Y'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: incompleto
spec:
  storageClassName: standard
Y
cat > /tmp/kl-sem-fonte.yaml <<'Y'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: rapido
spec:
  storageClassName: rapido
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: usa-rapido
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
    volumeMounts:
    - name: d
      mountPath: /d
  volumes:
  - name: d
    persistentVolumeClaim:
      claimName: rapido
---
apiVersion: v1
kind: Pod
metadata:
  name: sem-cm
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
    volumeMounts:
    - name: cfg
      mountPath: /cfg
  volumes:
  - name: cfg
    configMap:
      name: nao-existe
Y
cat > /tmp/kl-vitrine.yaml <<'Y'
apiVersion: v1
kind: ConfigMap
metadata:
  name: vitrine
data:
  index.html: |
    <h1>Promoção de tijolos!</h1>
  cor: azul
---
apiVersion: v1
kind: Secret
metadata:
  name: cofre
stringData:
  senha: tijolo-azul-42
---
apiVersion: v1
kind: Pod
metadata:
  name: vitrine
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    volumeMounts:
    - name: html
      mountPath: /usr/share/nginx/html
    - name: segredo
      mountPath: /etc/segredo
      readOnly: true
  - name: escritor
    image: busybox:1.36
    command: ["sh", "-c", "echo oi > /compartilhado/msg; sleep 3600"]
    volumeMounts:
    - name: compartilhado
      mountPath: /compartilhado
  volumes:
  - name: html
    configMap:
      name: vitrine
  - name: segredo
    secret:
      secretName: cofre
  - name: compartilhado
    emptyDir: {}
Y
cat > /tmp/kl-db.yaml <<'Y'
apiVersion: v1
kind: Service
metadata:
  name: db
spec:
  clusterIP: None
  selector:
    app: db
  ports:
  - port: 6379
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db
  replicas: 2
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
      - name: redis
        image: redis:7
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: dados
          mountPath: /data
  volumeClaimTemplates:
  - metadata:
      name: dados
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
Y

cap get-sc kc get sc
cap describe-sc kc describe sc standard
cap apply-dados kc apply -f /tmp/kl-dados.yaml
cap pvc-pendente kc get pvc dados
kc wait --for=condition=Ready pod/caderno --timeout=120s >/dev/null 2>&1
PV=$(kc get pvc dados -o jsonpath='{.spec.volumeName}')
cap get-pvc kc get pvc
cap get-pvc-wide kc get pvc -o wide
cap get-pv kc get pv
cap describe-pvc kc describe pvc dados
cap yaml-pvc kc get pvc dados -o yaml
cap describe-pv kc describe pv "$PV"
cap yaml-pv kc get pv "$PV" -o yaml
cap exec-cat-pvc kc exec caderno -- cat /dados/notas.txt
cap describe-pod-pvc kc describe pod caderno
cap apply-volume-errado kc apply -f /tmp/kl-volume-errado.yaml
cap apply-pvc-incompleto kc apply -f /tmp/kl-pvc-incompleto.yaml
cap apply-sem-fonte kc apply -f /tmp/kl-sem-fonte.yaml
sleep 20
cap sem-fonte-get kc get pod sem-cm usa-rapido
cap sem-cm-describe kc describe pod sem-cm
cap rapido-describe kc describe pod usa-rapido
cap rapido-pvc kc describe pvc rapido
cap apply-vitrine kc apply -f /tmp/kl-vitrine.yaml
kc wait --for=condition=Ready pod/vitrine --timeout=120s >/dev/null 2>&1
cap exec-ls-cm kc exec vitrine -c nginx -- ls /usr/share/nginx/html
cap exec-cat-secret kc exec vitrine -c nginx -- cat /etc/segredo/senha
cap exec-curl-cm kc exec vitrine -c nginx -- curl -s localhost
cap exec-somente-leitura kc exec vitrine -c nginx -- sh -c 'echo x > /etc/segredo/y'
cap exec-emptydir kc exec vitrine -c escritor -- sh -c 'echo y >> /compartilhado/msg; cat /compartilhado/msg'
cap exec-cat-nao-existe kc exec vitrine -c escritor -- cat /nao/existe
cap describe-pod-volumes kc describe pod vitrine
cap apply-db kc apply -f /tmp/kl-db.yaml
cap rollout-sts kc rollout status sts/db --timeout=180s
cap get-sts kc get sts
cap get-sts-wide kc get sts -o wide
cap describe-sts kc describe sts db
cap yaml-sts kc get sts db -o yaml
cap get-pods-sts kc get pods -l app=db
cap get-pvc-sts kc get pvc -l app=db
cap exec-hosts-sts kc exec db-1 -- cat /etc/hosts
kc run cliente --image=busybox:1.36 -- sleep 3600 >/dev/null 2>&1
kc wait --for=condition=Ready pod/cliente --timeout=120s >/dev/null 2>&1
cap nslookup-sts-curto kc exec cliente -- nslookup db-0.db
cap nslookup-sts kc exec cliente -- nslookup db-0.db.default.svc.cluster.local
cap scale-sts kc scale sts db --replicas=1
sleep 10
cap scale-sts-get kc get pods -l app=db
cap scale-sts-pvc kc get pvc -l app=db

# ---------- Fase 6 · nível 5: Job, CronJob, DaemonSet, init container e sidecar ----------
cat > /tmp/kl-job.yaml <<'Y'
apiVersion: batch/v1
kind: Job
metadata:
  name: relatorio
spec:
  completions: 3
  parallelism: 2
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: relatorio
        image: busybox:1.36
        command: ["sh", "-c", "echo gerando relatorio; sleep 3; echo pronto"]
Y
cat > /tmp/kl-job-falha.yaml <<'Y'
apiVersion: batch/v1
kind: Job
metadata:
  name: falha
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: falha
        image: busybox:1.36
        command: ["sh", "-c", "echo tentando; exit 1"]
Y
cat > /tmp/kl-job-sem-politica.yaml <<'Y'
apiVersion: batch/v1
kind: Job
metadata:
  name: sem-politica
spec:
  template:
    spec:
      containers:
      - name: c
        image: busybox:1.36
        command: ["echo", "oi"]
Y
cat > /tmp/kl-cron-errado.yaml <<'Y'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: hora-errada
spec:
  schedule: "a cada 5 minutos"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: c
            image: busybox:1.36
Y
cat > /tmp/kl-cron.yaml <<'Y'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: limpeza
spec:
  schedule: "*/1 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: limpeza
            image: busybox:1.36
            command: ["sh", "-c", "echo varrendo o corredor"]
Y
cat > /tmp/kl-init.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: com-init
spec:
  initContainers:
  - name: espera
    image: busybox:1.36
    command: ["sh", "-c", "echo esperando o banco; sleep 8"]
  containers:
  - name: app
    image: nginx:1.27
---
apiVersion: v1
kind: Pod
metadata:
  name: com-sidecar
spec:
  initContainers:
  - name: logs
    image: busybox:1.36
    restartPolicy: Always
    command: ["sh", "-c", "while true; do echo enviando logs; sleep 5; done"]
  containers:
  - name: app
    image: nginx:1.27
Y
cat > /tmp/kl-extintor.yaml <<'Y'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: extintor
spec:
  selector:
    matchLabels:
      app: extintor
  template:
    metadata:
      labels:
        app: extintor
    spec:
      containers:
      - name: extintor
        image: busybox:1.36
        command: ["sleep", "3600"]
Y

cap apply-job kc apply -f /tmp/kl-job.yaml
cap wait-job kc wait --for=condition=complete job/relatorio --timeout=120s
cap get-jobs kc get jobs
cap get-jobs-wide kc get jobs -o wide
cap describe-job kc describe job relatorio
cap yaml-job kc get job relatorio -o yaml
cap get-pods-job kc get pods -l job-name=relatorio
cap logs-job-pod kc logs -l job-name=relatorio --tail=1
cap apply-job-falha kc apply -f /tmp/kl-job-falha.yaml
sleep 50
cap get-job-falha kc get job falha
cap describe-job-falha kc describe job falha
cap apply-job-sem-politica kc apply -f /tmp/kl-job-sem-politica.yaml
cap apply-cron-errado kc apply -f /tmp/kl-cron-errado.yaml
cap dry-job kc create job x --image=busybox:1.36 --dry-run=client -o yaml -- echo oi
cap dry-cronjob kc create cronjob y --image=busybox:1.36 --schedule='*/5 * * * *' --dry-run=client -o yaml
cap apply-init kc apply -f /tmp/kl-init.yaml
kc wait --for=condition=Ready pod/com-init pod/com-sidecar --timeout=120s >/dev/null 2>&1
cap get-pods-init kc get pods com-init com-sidecar
cap describe-pod-init kc describe pod com-init
cap logs-init kc logs com-init -c espera
cap get-ds kc get ds -A
cap get-ds-wide kc get ds -A -o wide
cap describe-ds-kindnet kc describe ds kindnet -n kube-system
cap apply-extintor kc apply -f /tmp/kl-extintor.yaml
cap rollout-ds kc rollout status ds/extintor --timeout=120s
cap get-ds-extintor kc get ds extintor
cap describe-ds-extintor kc describe ds extintor
cap apply-cron kc apply -f /tmp/kl-cron.yaml
for i in $(seq 1 40); do kc get jobs 2>/dev/null | grep -q limpeza && break; sleep 3; done
sleep 8
cap get-cronjob kc get cronjob
cap describe-cronjob kc describe cronjob limpeza
