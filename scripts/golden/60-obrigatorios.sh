# ---------- YAML pela metade (namespace obrigatorios): o null que sobra de um `labels:` ou de um `- ` sem nada é campo
# não definido para o apiserver (o valor zero do Go numa lista ou num mapa) e os obrigatórios que só a validação
# confere: o alvo do HPA, o roleRef dos bindings, a sonda sem teste e o envFrom sem fonte. E o kustomize com uma entrada
# que não é texto em resources. A gêmea no simulador: tests/golden/secoes/60-obrigatorios.js.
cat > /tmp/kl-obr-conteiner.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: vazio
  namespace: obrigatorios
spec:
  containers:
  -
Y
cat > /tmp/kl-obr-init.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: preparo-vazio
  namespace: obrigatorios
spec:
  initContainers:
  -
  containers:
  - name: nginx
    image: nginx:1.27
Y
cat > /tmp/kl-obr-labels.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sem-labels
  namespace: obrigatorios
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
Y
cat > /tmp/kl-obr-limites.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: limites
  namespace: obrigatorios
  labels:
    app:
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    resources:
      limits:
Y
cat > /tmp/kl-obr-hpa.yaml <<'Y'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: so-nome
  namespace: obrigatorios
spec:
  scaleTargetRef:
    name: web
  maxReplicas: 3
Y
cat > /tmp/kl-obr-hpa-sem-alvo.yaml <<'Y'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: sem-alvo
  namespace: obrigatorios
spec:
  maxReplicas: 3
Y
cat > /tmp/kl-obr-hpa-sem-grupo.yaml <<'Y'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: sem-grupo
  namespace: obrigatorios
spec:
  scaleTargetRef:
    kind: Deployment
    name: web
  maxReplicas: 3
Y
cat > /tmp/kl-obr-hpa-v1.yaml <<'Y'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: grupo-core
  namespace: obrigatorios
spec:
  scaleTargetRef:
    apiVersion: v1
    kind: Deployment
    name: web
  maxReplicas: 3
Y
cat > /tmp/kl-obr-rb.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: sem-papel
  namespace: obrigatorios
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
Y
cat > /tmp/kl-obr-rb-grupo.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: grupo-vazio
  namespace: obrigatorios
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: ""
  kind: Role
  name: leitor
Y
cat > /tmp/kl-obr-rb-tipo.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: tipo-errado
  namespace: obrigatorios
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Rol
  name: leitor
Y
cat > /tmp/kl-obr-rb-sem-nome.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: sem-nome
  namespace: obrigatorios
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
Y
cat > /tmp/kl-obr-rb-grupo-errado.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: grupo-errado
  namespace: obrigatorios
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac
  kind: Role
  name: leitor
Y
cat > /tmp/kl-obr-rb-ok.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: troca
  namespace: obrigatorios
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view
Y
cat > /tmp/kl-obr-rb-troca.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: troca
  namespace: obrigatorios
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: edit
Y
cat > /tmp/kl-obr-crb-role.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: obr-com-role
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: leitor
Y
cat > /tmp/kl-obr-crb.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: obr-sem-papel
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
Y
cat > /tmp/kl-obr-sonda.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: sem-teste
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    livenessProbe:
      periodSeconds: 5
Y
cat > /tmp/kl-obr-envfrom.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: sem-fonte
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    envFrom:
    - configMapRef:
Y
cat > /tmp/kl-obr-envfrom-nome.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: sem-nome
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    envFrom:
    - configMapRef: {}
Y
cat > /tmp/kl-obr-limitrange.yaml <<'Y'
apiVersion: v1
kind: LimitRange
metadata:
  name: padrao
  namespace: obrigatorios
spec:
  limits:
Y
cat > /tmp/kl-obr-sts.yaml <<'Y'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: molde-sem-nome
  namespace: obrigatorios
spec:
  serviceName: molde-sem-nome
  replicas: 1
  selector:
    matchLabels:
      app: molde
  template:
    metadata:
      labels:
        app: molde
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
  volumeClaimTemplates:
  - metadata:
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
Y
cat > /tmp/kl-obr-ns.yaml <<'Y'
apiVersion: v1
kind: Namespace
metadata:
  name: obr-rotulos
  labels:
Y
mkdir -p /tmp/kl-obr-k-objeto /tmp/kl-obr-k-numero
cat > /tmp/kl-obr-k-objeto/kustomization.yaml <<'Y'
resources:
- name: web
Y
cat > /tmp/kl-obr-k-numero/kustomization.yaml <<'Y'
resources:
- 3
Y
kc create namespace obrigatorios >/dev/null 2>&1
until kc get serviceaccount default -n obrigatorios >/dev/null 2>&1; do sleep 1; done
cap obr-apply-conteiner-vazio kc apply -f /tmp/kl-obr-conteiner.yaml
cap obr-apply-init-vazio kc apply -f /tmp/kl-obr-init.yaml
cap obr-apply-labels-vazio kc apply -f /tmp/kl-obr-labels.yaml
cap obr-apply-limites-vazio kc apply -f /tmp/kl-obr-limites.yaml
cap obr-limites-recursos kc get pod limites -n obrigatorios -o jsonpath='{.spec.containers[0].resources}'
cap obr-limites-labels kc get pod limites -n obrigatorios -o jsonpath='{.metadata.labels}'
cap obr-limites-anotacao kc get pod limites -n obrigatorios -o jsonpath='{.metadata.annotations.kubectl\.kubernetes\.io/last-applied-configuration}'
cap obr-apply-hpa-so-nome kc apply -f /tmp/kl-obr-hpa.yaml
cap obr-apply-hpa-sem-alvo kc apply -f /tmp/kl-obr-hpa-sem-alvo.yaml
cap obr-apply-hpa-sem-grupo kc apply -f /tmp/kl-obr-hpa-sem-grupo.yaml
cap obr-apply-hpa-v1 kc apply -f /tmp/kl-obr-hpa-v1.yaml
cap obr-apply-rb-sem-roleref kc apply -f /tmp/kl-obr-rb.yaml
cap obr-apply-rb-grupo-vazio kc apply -f /tmp/kl-obr-rb-grupo.yaml
cap obr-rb-grupo-padrao kc get rolebinding grupo-vazio -n obrigatorios -o jsonpath='{.roleRef.apiGroup}'
cap obr-apply-rb-tipo-errado kc apply -f /tmp/kl-obr-rb-tipo.yaml
cap obr-apply-rb-sem-nome kc apply -f /tmp/kl-obr-rb-sem-nome.yaml
cap obr-apply-rb-grupo-errado kc apply -f /tmp/kl-obr-rb-grupo-errado.yaml
cap obr-apply-rb-ok kc apply -f /tmp/kl-obr-rb-ok.yaml
cap obr-apply-rb-troca kc apply -f /tmp/kl-obr-rb-troca.yaml
cap obr-apply-crb-sem-roleref kc apply -f /tmp/kl-obr-crb.yaml
cap obr-apply-crb-role kc apply -f /tmp/kl-obr-crb-role.yaml
cap obr-apply-sonda-sem-teste kc apply -f /tmp/kl-obr-sonda.yaml
cap obr-apply-envfrom-sem-fonte kc apply -f /tmp/kl-obr-envfrom.yaml
cap obr-apply-envfrom-sem-nome kc apply -f /tmp/kl-obr-envfrom-nome.yaml
cap obr-apply-limitrange-vazio kc apply -f /tmp/kl-obr-limitrange.yaml
cap obr-run-com-limitrange-vazio kc run solto -n obrigatorios --image=nginx:1.27
cap obr-solto-recursos kc get pod solto -n obrigatorios -o jsonpath='{.spec.containers[0].resources}'
cap obr-describe-limitrange-vazio kc describe limitrange padrao -n obrigatorios
cap obr-apply-sts-molde-sem-nome kc apply -f /tmp/kl-obr-sts.yaml
cap obr-apply-ns-labels-vazio kc apply -f /tmp/kl-obr-ns.yaml
cap obr-kustomize-objeto kc kustomize /tmp/kl-obr-k-objeto
cap obr-kustomize-numero kc kustomize /tmp/kl-obr-k-numero
