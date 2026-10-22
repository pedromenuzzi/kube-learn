# ---------- Realismo (namespace realismo): EndpointSlice, exec barrado pelo RBAC, o fuso do CronJob,
# imagePullPolicy Never, o prazo do Job (activeDeadlineSeconds) e o PodSecurity ao trocar o rótulo do namespace.
# A gêmea no simulador: tests/golden/secoes/20-realismo.js.
cat > /tmp/kl-real-vitrine.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vitrine
  namespace: realismo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: vitrine
  template:
    metadata:
      labels:
        app: vitrine
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
  name: vitrine
  namespace: realismo
  labels:
    app: vitrine
spec:
  selector:
    app: vitrine
  ports:
  - port: 80
    targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: vazio
  namespace: realismo
spec:
  selector:
    app: ninguem
  ports:
  - name: http
    port: 80
    targetPort: 8080
Y
cat > /tmp/kl-real-fuso.yaml <<'Y'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: fuso
  namespace: realismo
spec:
  schedule: "0 3 1 1 *"
  timeZone: America/Sao_Paulo
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: c
            image: busybox:1.36
            command: ["true"]
Y
cat > /tmp/kl-real-fuso-marte.yaml <<'Y'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: marte
  namespace: realismo
spec:
  schedule: "0 3 * * *"
  timeZone: Mars/Olympus
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: c
            image: busybox:1.36
Y
cat > /tmp/kl-real-fuso-local.yaml <<'Y'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: local
  namespace: realismo
spec:
  schedule: "0 3 * * *"
  timeZone: local
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: c
            image: busybox:1.36
Y
cat > /tmp/kl-real-fuso-no-horario.yaml <<'Y'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: tz
  namespace: realismo
spec:
  schedule: "CRON_TZ=America/Sao_Paulo 0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: c
            image: busybox:1.36
Y
cat > /tmp/kl-real-nunca.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: nunca
  namespace: realismo
spec:
  containers:
  - name: c
    image: busybox:1.34
    imagePullPolicy: Never
    command: ["sleep", "3600"]
Y
cat > /tmp/kl-real-prazo.yaml <<'Y'
apiVersion: batch/v1
kind: Job
metadata:
  name: prazo
  namespace: realismo
spec:
  activeDeadlineSeconds: 10
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: c
        image: busybox:1.36
        command: ["sleep", "3600"]
Y
kc create namespace realismo >/dev/null 2>&1
kc run caixa -n realismo --image=busybox:1.36 -- sleep 3600 >/dev/null 2>&1
kc apply -f /tmp/kl-real-vitrine.yaml >/dev/null 2>&1
kc rollout status deploy/vitrine -n realismo --timeout=180s >/dev/null 2>&1
kc wait --for=condition=Ready pod/caixa -n realismo --timeout=180s >/dev/null 2>&1
sleep 5
cap real-get-eps kc get endpointslices -n realismo
cap real-get-eps-servico kc get endpointslices -n realismo -l kubernetes.io/service-name=vitrine
cap real-describe-eps kc describe endpointslice -n realismo -l kubernetes.io/service-name=vitrine
cap real-describe-eps-vazio kc describe endpointslices -n realismo -l kubernetes.io/service-name=vazio
cap real-eps-campos kc get endpointslices -n realismo -l kubernetes.io/service-name=vitrine -o jsonpath='{.items[0].metadata.generateName} {.items[0].metadata.labels} {.items[0].ports} {.items[0].endpoints[0].conditions} {.items[0].metadata.ownerReferences[0].kind}/{.items[0].metadata.ownerReferences[0].name}'
kc scale deploy/vitrine -n realismo --replicas=0 >/dev/null 2>&1
sleep 40
cap real-get-eps-zero kc get endpointslices -n realismo -l kubernetes.io/service-name=vitrine

kc create role leitor -n realismo --verb=get,list --resource=pods >/dev/null 2>&1
kc create rolebinding leitor -n realismo --role=leitor --user=carla >/dev/null 2>&1
cap real-exec-as-proibido kc exec caixa -n realismo --as=carla -- ls /
cap real-exec-as-sem-get kc exec caixa -n realismo --as=davi -- ls /
cap real-exec-as-nao-existe kc exec nada -n realismo --as=carla -- ls /
cap real-logs-as-sem-get kc logs caixa -n realismo --as=davi
cap real-logs-as-proibido kc logs caixa -n realismo --as=carla

cap real-apply-fuso kc apply -f /tmp/kl-real-fuso.yaml
cap real-apply-fuso-marte kc apply -f /tmp/kl-real-fuso-marte.yaml
cap real-apply-fuso-local kc apply -f /tmp/kl-real-fuso-local.yaml
cap real-apply-fuso-no-horario kc apply -f /tmp/kl-real-fuso-no-horario.yaml
cap real-get-fuso kc get cronjob fuso -n realismo
cap real-describe-fuso kc describe cronjob fuso -n realismo

kc apply -f /tmp/kl-real-nunca.yaml >/dev/null 2>&1
kc apply -f /tmp/kl-real-prazo.yaml >/dev/null 2>&1
sleep 20
cap real-get-prazo-alvo kc get job prazo -n realismo
cap real-describe-prazo-alvo kc describe job prazo -n realismo
sleep 40
cap real-get-nunca kc get pod nunca -n realismo
cap real-nunca-estado kc get pod nunca -n realismo -o jsonpath='{.status.containerStatuses[0].state}'
cap real-get-prazo kc get job prazo -n realismo
cap real-describe-prazo kc describe job prazo -n realismo
cap real-prazo-condicoes kc get job prazo -n realismo -o jsonpath='{range .status.conditions[*]}{.type} {.reason}{"\n"}{end}{.status.failed} {.status.terminating}'

cap real-label-ns-restrito kc label ns realismo pod-security.kubernetes.io/enforce=restricted
cap real-label-ns-mesmo-nivel kc label ns realismo pod-security.kubernetes.io/warn=restricted
cap real-label-ns-versao kc label ns realismo pod-security.kubernetes.io/enforce-version=v1.36
cap real-label-ns-privilegiado kc label ns realismo pod-security.kubernetes.io/enforce=privileged --overwrite
