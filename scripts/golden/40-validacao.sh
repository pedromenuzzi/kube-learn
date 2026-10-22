# ---------- Validação (namespace validacao): as tags reais de imagem (o nginx:1.14.2 da documentação, o nginx:alpine),
# requests maiores que os limits, nome de recurso fora do padrão, rótulo de PodSecurity com valor inválido, o apply num
# objeto criado sem apply (a anotação last-applied) e o nslookup do busybox com o nome curto do Service.
# A gêmea no simulador: tests/golden/secoes/40-validacao.js.
cat > /tmp/kl-val-docs.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: docs
  namespace: validacao
  labels:
    app: docs
spec:
  containers:
  - name: nginx
    image: nginx:1.14.2
    ports:
    - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: loja
  namespace: validacao
spec:
  selector:
    app: docs
  ports:
  - port: 80
Y
cat > /tmp/kl-val-cpu.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: guloso
  namespace: validacao
spec:
  containers:
  - name: c
    image: nginx:1.27
    resources:
      requests:
        cpu: "2"
      limits:
        cpu: "1"
Y
cat > /tmp/kl-val-cpu-milli.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: guloso
  namespace: validacao
spec:
  containers:
  - name: c
    image: nginx:1.27
    resources:
      requests:
        cpu: "0.5"
      limits:
        cpu: 250m
Y
cat > /tmp/kl-val-memoria.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: guloso
  namespace: validacao
spec:
  replicas: 1
  selector:
    matchLabels:
      app: guloso
  template:
    metadata:
      labels:
        app: guloso
    spec:
      containers:
      - name: c
        image: nginx:1.27
        resources:
          requests:
            memory: 1024Mi
          limits:
            memory: 512Mi
Y
cat > /tmp/kl-val-cpus.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: plural
  namespace: validacao
spec:
  containers:
  - name: c
    image: nginx:1.27
    resources:
      requests:
        cpus: "1"
Y
cat > /tmp/kl-val-gpu.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: placa
  namespace: validacao
spec:
  containers:
  - name: c
    image: nginx:1.27
    resources:
      limits:
        gpu: "1"
Y
cat > /tmp/kl-val-politica.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: talvez
  namespace: validacao
spec:
  containers:
  - name: c
    image: nginx:1.27
    imagePullPolicy: Talvez
Y
cat > /tmp/kl-val-ns.yaml <<'Y'
apiVersion: v1
kind: Namespace
metadata:
  name: validacao
  labels:
    pod-security.kubernetes.io/enforce: restrito
Y
cat > /tmp/kl-val-criado.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: criado
  namespace: validacao
  labels:
    app: criado
spec:
  replicas: 1
  selector:
    matchLabels:
      app: criado
  template:
    metadata:
      labels:
        app: criado
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
Y
kc create namespace validacao >/dev/null 2>&1
kc apply -f /tmp/kl-val-docs.yaml >/dev/null 2>&1
kc run alpino -n validacao --image=nginx:alpine >/dev/null 2>&1
kc run consulta -n validacao --image=busybox:1.36 -- sleep 3600 >/dev/null 2>&1
kc run pausa -n validacao --image=registry.k8s.io/pause:3.10 >/dev/null 2>&1
kc wait --for=condition=Ready pod/docs pod/alpino pod/consulta pod/pausa -n validacao --timeout=180s >/dev/null 2>&1
sleep 5
cap val-get-pods kc get pods -n validacao
cap val-describe-docs kc describe pod docs -n validacao
cap val-describe-alpino kc describe pod alpino -n validacao
cap val-logs-docs kc logs docs -n validacao
cap val-imagens kc get pods -n validacao -o jsonpath='{range .items[*]}{.metadata.name} {.status.containerStatuses[0].image}{"\n"}{end}'
cap val-exec-docs-curl kc exec docs -n validacao -- curl -s -o /dev/null -w '%{http_code}' http://localhost
cap val-exec-alpino-curl kc exec alpino -n validacao -- curl -s -o /dev/null -w '%{http_code}' http://localhost
cap val-exec-alpino-bash kc exec alpino -n validacao -- bash -c 'echo oi'
# O alpine sem comando: o sh não tem o que ler e sai na hora (Completed), e o kubelet reinicia.
kc run osso -n validacao --image=alpine:3.20 >/dev/null 2>&1
sleep 40
cap val-osso-ultimo kc get pod osso -n validacao -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason} {.status.containerStatuses[0].lastState.terminated.exitCode}'

cap val-apply-cpu kc apply -f /tmp/kl-val-cpu.yaml
cap val-apply-cpu-milli kc apply -f /tmp/kl-val-cpu-milli.yaml
cap val-apply-memoria kc apply -f /tmp/kl-val-memoria.yaml
cap val-apply-cpus kc apply -f /tmp/kl-val-cpus.yaml
cap val-apply-gpu kc apply -f /tmp/kl-val-gpu.yaml
cap val-apply-politica kc apply -f /tmp/kl-val-politica.yaml

cap val-label-psa-nivel kc label ns validacao pod-security.kubernetes.io/enforce=restrito
cap val-label-psa-versao kc label ns validacao pod-security.kubernetes.io/enforce-version=v9
cap val-label-psa-maiuscula kc label ns validacao pod-security.kubernetes.io/warn=Restricted
cap val-apply-ns-psa kc apply -f /tmp/kl-val-ns.yaml
cap val-labels-ns kc get ns validacao --show-labels

kc create deployment criado -n validacao --image=nginx:1.27 >/dev/null 2>&1
cap val-apply-sem-last-applied kc apply -f /tmp/kl-val-criado.yaml
cap val-apply-de-novo kc apply -f /tmp/kl-val-criado.yaml

cap val-nslookup-curto kc exec consulta -n validacao -- nslookup loja
cap val-nslookup-ns kc exec consulta -n validacao -- nslookup loja.validacao
cap val-nslookup-svc kc exec consulta -n validacao -- nslookup loja.validacao.svc
cap val-nslookup-fqdn kc exec consulta -n validacao -- nslookup loja.validacao.svc.cluster.local
cap val-nslookup-kubernetes kc exec consulta -n validacao -- nslookup kubernetes.default
cap val-nslookup-nada kc exec consulta -n validacao -- nslookup nada
cap val-wget-curto kc exec consulta -n validacao -- wget -qO- -T 2 http://loja/nada
