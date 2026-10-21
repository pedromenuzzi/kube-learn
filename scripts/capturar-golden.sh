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

# ---------- Fase 6 · nível 6: probes, recursos, cotas e HPA (o kind precisa do metrics-server) ----------
# kubectl apply -f metrics-server/components.yaml, com --kubelet-insecure-tls nos args, antes desta seção.
cat > /tmp/kl-probes.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: pronto
spec:
  containers:
  - name: web
    image: nginx:1.27
    readinessProbe:
      httpGet:
        path: /
        port: 8080
      periodSeconds: 5
---
apiVersion: v1
kind: Pod
metadata:
  name: vivo
spec:
  containers:
  - name: web
    image: nginx:1.27
    livenessProbe:
      tcpSocket:
        port: 80
      initialDelaySeconds: 3
Y
cat > /tmp/kl-cota.yaml <<'Y'
apiVersion: v1
kind: Namespace
metadata:
  name: time-a
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cota
  namespace: time-a
spec:
  hard:
    pods: "3"
    requests.cpu: "1"
    requests.memory: 1Gi
    limits.cpu: "2"
    limits.memory: 2Gi
---
apiVersion: v1
kind: LimitRange
metadata:
  name: limites
  namespace: time-a
spec:
  limits:
  - type: Container
    default:
      cpu: 500m
      memory: 256Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    max:
      memory: 512Mi
Y
cat > /tmp/kl-cota-b.yaml <<'Y'
apiVersion: v1
kind: Namespace
metadata:
  name: time-b
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cota
  namespace: time-b
spec:
  hard:
    requests.cpu: "1"
    limits.memory: 1Gi
Y
cat > /tmp/kl-hpa.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: php
spec:
  replicas: 1
  selector:
    matchLabels:
      app: php
  template:
    metadata:
      labels:
        app: php
    spec:
      containers:
      - name: php
        image: registry.k8s.io/hpa-example
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 200m
          limits:
            cpu: 500m
---
apiVersion: v1
kind: Service
metadata:
  name: php
spec:
  selector:
    app: php
  ports:
  - port: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sem-requests
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sem-requests
  template:
    metadata:
      labels:
        app: sem-requests
    spec:
      containers:
      - name: c
        image: nginx:1.27
Y

cap apply-probes kc apply -f /tmp/kl-probes.yaml
sleep 25
cap get-pods-probes kc get pod pronto vivo
cap yaml-probe kc get pod pronto -o jsonpath='{.spec.containers[0].readinessProbe}'
cap describe-pod-readiness kc describe pod pronto
cap describe-pod-liveness kc describe pod vivo
cap apply-cota kc apply -f /tmp/kl-cota.yaml
sleep 2
cap run-limitrange kc run sem-nada --image=nginx:1.27 -n time-a
cap resources-limitrange kc get pod sem-nada -n time-a -o jsonpath='{.spec.containers[0].resources}'
cap anotacao-limitrange kc get pod sem-nada -n time-a -o jsonpath='{.metadata.annotations}'
cap run-max-limitrange kc run grandao --image=nginx:1.27 -n time-a --overrides='{"spec":{"containers":[{"name":"grandao","image":"nginx:1.27","resources":{"limits":{"memory":"1Gi"}}}]}}'
cap run-cota-estourada kc run guloso --image=nginx:1.27 -n time-a --overrides='{"spec":{"containers":[{"name":"guloso","image":"nginx:1.27","resources":{"requests":{"cpu":"2"},"limits":{"cpu":"2"}}}]}}'
kc create deployment muitos --image=nginx:1.27 --replicas=5 -n time-a >/dev/null 2>&1
sleep 8
cap get-quota kc get quota -n time-a
cap describe-quota kc describe quota cota -n time-a
cap get-limitrange kc get limitrange -n time-a
cap describe-limitrange kc describe limitrange limites -n time-a
cap describe-ns-cota kc describe ns time-a
cap apply-cota-b kc apply -f /tmp/kl-cota-b.yaml
sleep 2
cap run-cota-sem-requests kc run x --image=nginx:1.27 -n time-b
cap apply-hpa kc apply -f /tmp/kl-hpa.yaml
cap autoscale kc autoscale deployment php --cpu=50% --min=1 --max=5
cap autoscale-sem-requests kc autoscale deployment sem-requests --cpu=50% --min=1 --max=3
cap dry-autoscale kc autoscale deployment php --cpu-percent=50 --min=1 --max=5 --dry-run=client -o yaml
kc rollout status deploy/php --timeout=120s >/dev/null 2>&1
sleep 60
cap get-hpa kc get hpa
cap describe-hpa-sem-requests kc describe hpa sem-requests

# ---------- Fase 7 · nível 7: nodeSelector, anti-afinidade, espalhamento, taints, cordon, drain, PDB, prioridade e node caindo ----------
cat > /tmp/kl-agenda.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gerador
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gerador
  template:
    metadata:
      labels:
        app: gerador
    spec:
      nodeSelector:
        energia: gerador
      containers:
      - name: c
        image: nginx:1.27
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backup
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backup
  template:
    metadata:
      labels:
        app: backup
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: backup
            topologyKey: kubernetes.io/hostname
      containers:
      - name: c
        image: nginx:1.27
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: espalha
spec:
  replicas: 4
  selector:
    matchLabels:
      app: espalha
  template:
    metadata:
      labels:
        app: espalha
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: kubernetes.io/hostname
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: espalha
      containers:
      - name: c
        image: nginx:1.27
Y
cat > /tmp/kl-restrito.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: restrito
spec:
  nodeSelector:
    dedicado: gpu
  containers:
  - name: c
    image: nginx:1.27
Y
cat > /tmp/kl-pdb.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cofre
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cofre
  template:
    metadata:
      labels:
        app: cofre
    spec:
      containers:
      - name: c
        image: nginx:1.27
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: cofre
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: cofre
---
apiVersion: v1
kind: Pod
metadata:
  name: avulso
  labels:
    solto: "sim"
spec:
  containers:
  - name: c
    image: nginx:1.27
Y
cat > /tmp/kl-prioridade.yaml <<'Y'
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: critico
value: 1000000
description: "Pagamentos: passam na frente."
---
apiVersion: v1
kind: Pod
metadata:
  name: urgente
spec:
  priorityClassName: critico
  containers:
  - name: c
    image: nginx:1.27
Y
cat > /tmp/kl-caiu.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plantao
spec:
  replicas: 2
  selector:
    matchLabels:
      app: plantao
  template:
    metadata:
      labels:
        app: plantao
        caiu: "sim"
    spec:
      containers:
      - name: c
        image: nginx:1.27
---
apiVersion: v1
kind: Pod
metadata:
  name: sozinho
  labels:
    caiu: "sim"
spec:
  containers:
  - name: c
    image: nginx:1.27
Y

cap label-node kc label node golden-worker energia=gerador
cap apply-agenda kc apply -f /tmp/kl-agenda.yaml
kc rollout status deploy/gerador --timeout=120s >/dev/null 2>&1
sleep 5
cap get-pods-gerador kc get pods -l app=gerador -o wide
cap get-pods-backup kc get pods -l app=backup -o wide
cap describe-backup-pendente kc describe "$(kc get pods -l app=backup --field-selector=status.phase=Pending -o name | head -1)"
cap get-pods-espalha kc get pods -l app=espalha -o wide
cap describe-espalha-pendente kc describe "$(kc get pods -l app=espalha --field-selector=status.phase=Pending -o name | head -1)"
cap taint-node kc taint nodes golden-worker2 dedicado=gpu:NoSchedule
cap taint-repetido kc taint nodes golden-worker2 dedicado=gpu:NoSchedule
kc label node golden-worker2 dedicado=gpu >/dev/null 2>&1
cap apply-restrito kc apply -f /tmp/kl-restrito.yaml
sleep 3
cap describe-restrito kc describe pod restrito
cap describe-node-taint kc describe node golden-worker2
cap taint-remover kc taint nodes golden-worker2 dedicado=gpu:NoSchedule-
cap taint-remover-ausente kc taint nodes golden-worker2 dedicado-
kc wait --for=condition=Ready pod/restrito --timeout=60s >/dev/null 2>&1
cap get-pod-restrito kc get pod restrito -o wide
cap cordon kc cordon golden-worker
cap cordon-de-novo kc cordon golden-worker
cap get-nodes-cordon kc get nodes
cap uncordon kc uncordon golden-worker
cap uncordon-de-novo kc uncordon golden-worker
kc cordon golden-worker2 >/dev/null 2>&1
cap apply-pdb kc apply -f /tmp/kl-pdb.yaml
kc rollout status deploy/cofre --timeout=120s >/dev/null 2>&1
kc wait --for=condition=Ready pod/avulso --timeout=60s >/dev/null 2>&1
kc uncordon golden-worker2 >/dev/null 2>&1
sleep 2
cap get-pdb kc get pdb
cap describe-pdb kc describe pdb cofre
cap yaml-pdb kc get pdb cofre -o yaml
cap drain-ds kc drain golden-worker --pod-selector=k8s-app=kube-proxy
cap drain-ds-ok kc drain golden-worker --pod-selector=k8s-app=kube-proxy --ignore-daemonsets
cap drain-solto kc drain golden-worker --pod-selector=solto=sim --ignore-daemonsets
cap drain-pdb kc drain golden-worker --pod-selector=app=cofre --ignore-daemonsets --timeout=90s
cap drain-force kc drain golden-worker --pod-selector=solto=sim --ignore-daemonsets --force
cap get-nodes-drain kc get nodes
cap get-pods-cofre kc get pods -l app=cofre -o wide
cap uncordon-drain kc uncordon golden-worker
cap apply-prioridade kc apply -f /tmp/kl-prioridade.yaml
cap get-priorityclass kc get priorityclass
cap describe-priorityclass kc describe priorityclass critico
cap prioridade-pod kc get pod urgente -o jsonpath='{.spec.priority} {.spec.preemptionPolicy} {.spec.priorityClassName}'
cap run-classe-inexistente kc run sem-classe --image=nginx:1.27 --overrides='{"spec":{"priorityClassName":"nao-existe"}}'
# O prédio cai: o plantão e o sozinho moram no golden-worker2, e o "kubelet" dele para (docker stop).
kc cordon golden-worker >/dev/null 2>&1
kc apply -f /tmp/kl-caiu.yaml >/dev/null 2>&1
kc rollout status deploy/plantao --timeout=120s >/dev/null 2>&1
kc wait --for=condition=Ready pod/sozinho --timeout=60s >/dev/null 2>&1
kc uncordon golden-worker >/dev/null 2>&1
docker stop golden-worker2 >/dev/null
until kc get node golden-worker2 | grep -q NotReady; do sleep 2; done
sleep 5
cap get-nodes-caido kc get nodes
cap describe-node-caido kc describe node golden-worker2
cap get-pods-caido-antes kc get pods -l caiu=sim -o wide
sleep 320
cap get-pods-caido kc get pods -l caiu=sim -o wide
cap describe-sozinho-caido kc describe pod sozinho

# ---------- Fase 7 · nível 8: RBAC, ServiceAccount, NetworkPolicy, securityContext e Pod Security ----------
cat > /tmp/kl-rbac.yaml <<'Y'
apiVersion: v1
kind: Namespace
metadata:
  name: loja
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: leitor
  namespace: loja
rules:
- apiGroups:
  - ""
  resources:
  - pods
  - pods/log
  verbs:
  - get
  - list
  - watch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ana-leitora
  namespace: loja
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: leitor
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: painel
  namespace: loja
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: painel-leitor
  namespace: loja
subjects:
- kind: ServiceAccount
  name: painel
  namespace: loja
roleRef:
  kind: Role
  name: leitor
  apiGroup: rbac.authorization.k8s.io
Y
cat > /tmp/kl-sa-faltando.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: sem-cracha
  namespace: loja
spec:
  serviceAccountName: fantasma
  containers:
  - name: c
    image: nginx:1.27
Y
cat > /tmp/kl-rede.yaml <<'Y'
apiVersion: v1
kind: Namespace
metadata:
  name: rede
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: rede
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: nginx:1.27
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: rede
spec:
  selector:
    app: api
  ports:
  - port: 80
---
apiVersion: v1
kind: Pod
metadata:
  name: vitrine
  namespace: rede
  labels:
    app: vitrine
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
---
apiVersion: v1
kind: Pod
metadata:
  name: curioso
  namespace: rede
  labels:
    app: curioso
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
Y
cat > /tmp/kl-catracas.yaml <<'Y'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: nega-tudo
  namespace: rede
spec:
  podSelector: {}
  policyTypes:
  - Ingress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: libera-vitrine
  namespace: rede
spec:
  podSelector:
    matchLabels:
      app: api
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: vitrine
    ports:
    - protocol: TCP
      port: 80
Y
cat > /tmp/kl-sem-saida.yaml <<'Y'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sem-saida
  namespace: rede
spec:
  podSelector:
    matchLabels:
      app: vitrine
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: api
    ports:
    - protocol: TCP
      port: 80
Y
cat > /tmp/kl-dns.yaml <<'Y'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: dns
  namespace: rede
spec:
  podSelector:
    matchLabels:
      app: vitrine
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
Y
cat > /tmp/kl-seguranca.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: raiz
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
---
apiVersion: v1
kind: Pod
metadata:
  name: comum
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
---
apiVersion: v1
kind: Pod
metadata:
  name: naoroot
spec:
  securityContext:
    runAsNonRoot: true
  containers:
  - name: c
    image: nginx:1.27
---
apiVersion: v1
kind: Pod
metadata:
  name: so-leitura
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
    securityContext:
      readOnlyRootFilesystem: true
Y
cat > /tmp/kl-psa.yaml <<'Y'
apiVersion: v1
kind: Namespace
metadata:
  name: cofre
  labels:
    pod-security.kubernetes.io/enforce: restricted
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: guarda
  namespace: cofre
spec:
  replicas: 1
  selector:
    matchLabels:
      app: guarda
  template:
    metadata:
      labels:
        app: guarda
    spec:
      containers:
      - name: guarda
        image: busybox:1.36
        command: ["sleep", "3600"]
Y
cat > /tmp/kl-psa-ok.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: certinho
  namespace: cofre
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
Y
cat > /tmp/kl-privilegiado.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: privilegiado
  namespace: cofre
spec:
  containers:
  - name: c
    image: busybox:1.36
    command: ["sleep", "3600"]
    securityContext:
      privileged: true
Y

cap apply-rbac kc apply -f /tmp/kl-rbac.yaml
cap get-role kc get role -n loja
cap describe-role kc describe role leitor -n loja
cap get-rolebinding kc get rolebinding -n loja -o wide
cap describe-rolebinding kc describe rolebinding ana-leitora -n loja
cap get-sa kc get sa -n loja
cap describe-sa kc describe sa painel -n loja
cap can-i-sim kc auth can-i list pods --as=ana -n loja
cap can-i-nao kc auth can-i delete pods --as=ana -n loja
cap can-i-outro-ns kc auth can-i list pods --as=ana -n default
cap can-i-sa kc auth can-i list pods --as=system:serviceaccount:loja:painel -n loja
cap can-i-log kc auth can-i get pods --subresource=log --as=ana -n loja
cap can-i-deploy kc auth can-i create deployments.apps --as=ana -n loja
cap as-get-proibido kc get pods --as=ana
cap as-get-ok kc get pods --as=ana -n loja
cap as-delete-proibido kc delete pod qualquer --as=ana -n loja
cap as-run-proibido kc run outro --image=nginx:1.27 --as=ana -n loja
cap as-get-deploy-proibido kc get deploy --as=ana -n loja
cap create-role kc create role escritor --verb=get,list,create,update --resource=deployments -n loja
cap create-rolebinding kc create rolebinding bruno-escritor --role=escritor --user=bruno -n loja
cap can-i-bruno kc auth can-i create deployments --as=bruno -n loja
cap create-sa kc create serviceaccount robo -n loja
cap create-clusterrolebinding kc create clusterrolebinding auditoria --clusterrole=view --user=auditoria
cap can-i-view kc auth can-i list pods --as=auditoria -n kube-system
cap can-i-view-secrets kc auth can-i get secrets --as=auditoria -n kube-system
cap dry-role kc create role leitor2 --verb=get,list --resource=pods,services -n loja --dry-run=client -o yaml
cap dry-rolebinding kc create rolebinding x --clusterrole=view --serviceaccount=loja:painel -n loja --dry-run=client -o yaml
cap get-clusterrole-view kc get clusterrole view
cap apply-sa-faltando kc apply -f /tmp/kl-sa-faltando.yaml
cap apply-rede kc apply -f /tmp/kl-rede.yaml
kc rollout status deploy/api -n rede --timeout=120s >/dev/null 2>&1
kc wait --for=condition=Ready pod/vitrine pod/curioso -n rede --timeout=120s >/dev/null 2>&1
cap wget-antes kc exec curioso -n rede -- wget -q -O- -T 3 http://api
cap apply-catracas kc apply -f /tmp/kl-catracas.yaml
sleep 5
cap wget-vitrine kc exec vitrine -n rede -- wget -q -O- -T 3 http://api
cap wget-curioso kc exec curioso -n rede -- wget -q -O- -T 3 http://api
cap get-netpol kc get netpol -n rede
cap describe-netpol kc describe netpol libera-vitrine -n rede
cap describe-netpol-nega kc describe netpol nega-tudo -n rede
cap apply-sem-saida kc apply -f /tmp/kl-sem-saida.yaml
sleep 5
cap wget-sem-dns kc exec vitrine -n rede -- wget -q -O- -T 3 http://api
cap describe-netpol-saida kc describe netpol sem-saida -n rede
cap apply-dns kc apply -f /tmp/kl-dns.yaml
sleep 5
cap wget-com-dns kc exec vitrine -n rede -- wget -q -O- -T 3 http://api
cap describe-netpol-dns kc describe netpol dns -n rede
cap apply-seguranca kc apply -f /tmp/kl-seguranca.yaml
kc wait --for=condition=Ready pod/raiz pod/comum pod/so-leitura --timeout=120s >/dev/null 2>&1
sleep 5
cap id-raiz kc exec raiz -- id
cap id-comum kc exec comum -- id
cap whoami-comum kc exec comum -- whoami
cap touch-so-leitura kc exec so-leitura -- touch /arquivo
cap get-pod-naoroot kc get pod naoroot
cap describe-pod-naoroot kc describe pod naoroot
cap apply-psa kc apply -f /tmp/kl-psa.yaml
sleep 5
cap run-psa kc run solto --image=busybox:1.36 -n cofre -- sleep 3600
cap get-deploy-psa kc get deploy -n cofre
cap describe-rs-psa kc describe rs -n cofre
cap apply-psa-ok kc apply -f /tmp/kl-psa-ok.yaml
cap label-ns-baseline kc label ns cofre pod-security.kubernetes.io/enforce=baseline --overwrite
cap apply-privilegiado kc apply -f /tmp/kl-privilegiado.yaml
cap describe-ns-psa kc describe ns cofre
