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
# O `- ` sem nada (ou o campo vazio) nos campos que o simulador lia sem conferir: o exec sem comando (sonda e gancho),
# o dono, o par e o ipBlock da catraca, a porta sem número, a catraca sem spec, o sujeito do binding, os nomes, as
# versões e o esquema do CRD, e a conta com listas de nada.
cat > /tmp/kl-obr-sonda-exec.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: sonda-exec
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    livenessProbe:
      exec:
        command:
Y
cat > /tmp/kl-obr-gancho.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: gancho
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    lifecycle:
      postStart:
        exec:
          command:
Y
cat > /tmp/kl-obr-dono.yaml <<'Y'
apiVersion: v1
kind: ConfigMap
metadata:
  name: dono-vazio
  namespace: obrigatorios
  ownerReferences:
  -
Y
cat > /tmp/kl-obr-np-par.yaml <<'Y'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: par-vazio
  namespace: obrigatorios
spec:
  podSelector: {}
  ingress:
  - from:
    -
Y
cat > /tmp/kl-obr-np-cidr.yaml <<'Y'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sem-cidr
  namespace: obrigatorios
spec:
  podSelector: {}
  egress:
  - to:
    - ipBlock:
        cidr:
        except:
        - 10.1.0.0/16
Y
cat > /tmp/kl-obr-np-porta.yaml <<'Y'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: porta-vazia
  namespace: obrigatorios
spec:
  podSelector: {}
  ingress:
  - ports:
    -
Y
cat > /tmp/kl-obr-np-spec.yaml <<'Y'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sem-spec
  namespace: obrigatorios
spec:
Y
cat > /tmp/kl-obr-crb-sujeito.yaml <<'Y'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: obr-sujeito-vazio
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view
subjects:
-
Y
cat > /tmp/kl-obr-crd-nomes.yaml <<'Y'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: fichas.obrigatorios.kube-learn.dev
spec:
  group: obrigatorios.kube-learn.dev
  names:
  scope: Namespaced
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
Y
cat > /tmp/kl-obr-crd-versao.yaml <<'Y'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: fichas.obrigatorios.kube-learn.dev
spec:
  group: obrigatorios.kube-learn.dev
  names:
    kind: Ficha
    plural: fichas
  scope: Namespaced
  versions:
  -
Y
cat > /tmp/kl-obr-crd-sem-versoes.yaml <<'Y'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: fichas.obrigatorios.kube-learn.dev
spec:
  group: obrigatorios.kube-learn.dev
  names:
    kind: Ficha
    plural: fichas
  scope: Namespaced
  versions:
Y
cat > /tmp/kl-obr-crd-campo.yaml <<'Y'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: fichas.obrigatorios.kube-learn.dev
spec:
  group: obrigatorios.kube-learn.dev
  names:
    kind: Ficha
    plural: fichas
  scope: Namespaced
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
Y
cat > /tmp/kl-obr-crd-sem-tipo.yaml <<'Y'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: fichas.obrigatorios.kube-learn.dev
spec:
  group: obrigatorios.kube-learn.dev
  names:
    kind: Ficha
    plural: fichas
  scope: Namespaced
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        properties:
          spec:
            type: object
            properties:
              dono:
                description: Quem preencheu.
              tags:
                type: array
                items:
                  description: Uma etiqueta.
Y
cat > /tmp/kl-obr-sa.yaml <<'Y'
apiVersion: v1
kind: ServiceAccount
metadata:
  name: conta-vazia
  namespace: obrigatorios
imagePullSecrets:
-
secrets:
-
Y
cap obr-apply-sonda-exec-vazia kc apply -f /tmp/kl-obr-sonda-exec.yaml
cap obr-apply-gancho-exec-vazio kc apply -f /tmp/kl-obr-gancho.yaml
cap obr-apply-dono-vazio kc apply -f /tmp/kl-obr-dono.yaml
cap obr-apply-np-par-vazio kc apply -f /tmp/kl-obr-np-par.yaml
cap obr-apply-np-sem-cidr kc apply -f /tmp/kl-obr-np-cidr.yaml
cap obr-apply-np-porta-vazia kc apply -f /tmp/kl-obr-np-porta.yaml
cap obr-describe-np-porta-vazia kc describe networkpolicy porta-vazia -n obrigatorios
cap obr-apply-np-sem-spec kc apply -f /tmp/kl-obr-np-spec.yaml
cap obr-np-sem-spec kc get networkpolicy sem-spec -n obrigatorios -o jsonpath='{.spec}'
cap obr-apply-crb-sujeito-vazio kc apply -f /tmp/kl-obr-crb-sujeito.yaml
cap obr-apply-crd-sem-nomes kc apply -f /tmp/kl-obr-crd-nomes.yaml
cap obr-apply-crd-versao-vazia kc apply -f /tmp/kl-obr-crd-versao.yaml
cap obr-apply-crd-sem-versoes kc apply -f /tmp/kl-obr-crd-sem-versoes.yaml
cap obr-apply-crd-campo-vazio kc apply -f /tmp/kl-obr-crd-campo.yaml
cap obr-apply-crd-sem-tipo kc apply -f /tmp/kl-obr-crd-sem-tipo.yaml
cap obr-apply-sa-vazia kc apply -f /tmp/kl-obr-sa.yaml
cap obr-describe-sa-vazia kc describe serviceaccount conta-vazia -n obrigatorios
# O YAML pela metade que ainda derrubava o simulador ou vazava undefined: o hostPath sem caminho (no pod e no PV), o
# init container (que passa pelas mesmas conferências de um contêiner: montagem, portas, env, nome repetido; e sonda
# só se for sidecar), o PDB e a cota sem spec (objetos válidos, que não protegem nem limitam nada), a sonda e o gancho
# sem porta, a chave do env sem key (ou sem name) e o objeto sem metadata.name.
cat > /tmp/kl-obr-hostpath.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: host-vazio
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
  volumes:
  - name: v
    hostPath:
      path:
Y
cat > /tmp/kl-obr-pv-hostpath.yaml <<'Y'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: obr-pv-sem-caminho
spec:
  capacity:
    storage: 1Gi
  accessModes: ["ReadWriteOnce"]
  hostPath:
    path:
Y
cat > /tmp/kl-obr-init-montagem.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: painel
  namespace: obrigatorios
spec:
  initContainers:
  - name: preparo
    image: busybox:1.36
    command: ["sh", "-c", "echo ok"]
    volumeMounts:
    - name: config
      mountPath:
  containers:
  - name: painel
    image: nginx:1.27
  volumes:
  - name: config
    emptyDir: {}
Y
cat > /tmp/kl-obr-init-varios.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: init-varios
  namespace: obrigatorios
spec:
  initContainers:
  - name: nginx
    image: busybox:1.36
    ports:
    - name: http
    env:
    - value: x
    volumeMounts:
    - name: nada
      mountPath: /x
    livenessProbe:
      exec:
        command: ["true"]
    readinessProbe:
      exec:
        command: ["true"]
  - name: lado
    image: busybox:1.36
    restartPolicy: Always
    startupProbe:
      httpGet:
        path: /
  containers:
  - name: nginx
    image: nginx:1.27
Y
cat > /tmp/kl-obr-pdb-sem-spec.yaml <<'Y'
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: sem-regra
  namespace: obrigatorios
spec:
Y
cat > /tmp/kl-obr-quota-sem-spec.yaml <<'Y'
apiVersion: v1
kind: ResourceQuota
metadata:
  name: teto
  namespace: obrigatorios
Y
cat > /tmp/kl-obr-sonda-sem-porta.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: sonda-sem-porta
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    livenessProbe:
      httpGet:
        path: /healthz
Y
cat > /tmp/kl-obr-tcp-sem-porta.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: tcp-sem-porta
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    readinessProbe:
      tcpSocket: {}
Y
cat > /tmp/kl-obr-ganchos-sem-porta.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: ganchos-sem-porta
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    lifecycle:
      postStart: {}
      preStop:
        httpGet:
          path: /parar
    startupProbe:
      tcpSocket:
        port:
Y
cat > /tmp/kl-obr-env-sem-chave.yaml <<'Y'
apiVersion: v1
kind: Pod
metadata:
  name: env-sem-chave
  namespace: obrigatorios
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    env:
    - name: SENHA
      valueFrom:
        secretKeyRef:
          name: segredo
    - name: COR
      valueFrom:
        configMapKeyRef:
          name: cores
    - name: TOKEN
      valueFrom:
        secretKeyRef:
          key: token
Y
cat > /tmp/kl-obr-cm-sem-nome.yaml <<'Y'
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: obrigatorios
  labels:
    a: b
Y
cap obr-apply-hostpath-vazio kc apply -f /tmp/kl-obr-hostpath.yaml
cap obr-apply-pv-hostpath-vazio kc apply -f /tmp/kl-obr-pv-hostpath.yaml
cap obr-apply-init-montagem-vazia kc apply -f /tmp/kl-obr-init-montagem.yaml
cap obr-apply-init-varios kc apply -f /tmp/kl-obr-init-varios.yaml
cap obr-apply-pdb-sem-spec kc apply -f /tmp/kl-obr-pdb-sem-spec.yaml
cap obr-apply-quota-sem-spec kc apply -f /tmp/kl-obr-quota-sem-spec.yaml
sleep 5
cap obr-get-pdb-sem-spec kc get pdb -n obrigatorios
cap obr-describe-pdb-sem-spec kc describe pdb sem-regra -n obrigatorios
cap obr-pdb-sem-spec kc get pdb sem-regra -n obrigatorios -o jsonpath='{.spec}'
cap obr-get-quota-sem-spec kc get quota -n obrigatorios
cap obr-describe-quota-sem-spec kc describe quota teto -n obrigatorios
cap obr-get-pdb-yaml kc get pdb sem-regra -n obrigatorios -o yaml
cap obr-get-quota-yaml kc get quota teto -n obrigatorios -o yaml
cap obr-run-com-cota-vazia kc run cota-livre -n obrigatorios --image=nginx:1.27
cap obr-apply-sonda-sem-porta kc apply -f /tmp/kl-obr-sonda-sem-porta.yaml
cap obr-apply-tcp-sem-porta kc apply -f /tmp/kl-obr-tcp-sem-porta.yaml
cap obr-apply-ganchos-sem-porta kc apply -f /tmp/kl-obr-ganchos-sem-porta.yaml
cap obr-apply-env-sem-chave kc apply -f /tmp/kl-obr-env-sem-chave.yaml
cap obr-apply-cm-sem-nome kc apply -f /tmp/kl-obr-cm-sem-nome.yaml
cap obr-create-cm-sem-nome kc create -f /tmp/kl-obr-cm-sem-nome.yaml
cap obr-delete-cm-sem-nome kc delete -f /tmp/kl-obr-cm-sem-nome.yaml
