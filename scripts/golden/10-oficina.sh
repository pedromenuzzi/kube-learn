# ---------- Oficina (namespace oficina): os comandos do dia a dia de quem já sabe o básico (o que a CKAD cobra):
# -o custom-columns, --sort-by, -L, kubectl events, patch (strategic, merge e json), set env, set resources, set image,
# os geradores com --dry-run=client -o yaml, auth can-i --list e logs --since.
# A gêmea no simulador: tests/golden/secoes/10-oficina.js.
cat > /tmp/kl-of-tropeco.yaml <<'Y'
apiVersion: batch/v1
kind: Job
metadata:
  name: tropeco
  namespace: oficina
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: c
        image: busybox:1.36
        command: ["sh", "-c", "exit 1"]
Y
cat > /tmp/kl-of-limpa.yaml <<'Y'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: limpa
  namespace: oficina
spec:
  schedule: "*/5 * * * *"
  suspend: true
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: c
            image: busybox:1.36
            command: ["sh", "-c", "echo oi"]
Y
cat > /tmp/kl-of-app.conf <<'Y'
linha1
linha2
Y
cat > /tmp/kl-of-patch.json <<'Y'
{"spec":{"replicas":2}}
Y
kc create namespace oficina >/dev/null 2>&1
kc -n oficina create deployment web --image=nginx:1.27 --replicas=2 >/dev/null 2>&1
kc -n oficina run bb --image=busybox:1.36 --labels=app=bb,tier=back -- sleep 3600 >/dev/null 2>&1
kc -n oficina rollout status deploy/web --timeout=180s >/dev/null 2>&1
kc -n oficina wait --for=condition=Ready pod --all --timeout=180s >/dev/null 2>&1

# -o custom-columns
cap oficina-cc kc -n oficina get pods -o 'custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[*].image,LABELS:.metadata.labels,NADA:.spec.nada'
cap oficina-cc-sem-cabecalho kc -n oficina get pods -o custom-columns=NAME:metadata.name --no-headers
cap oficina-cc-chaves kc -n oficina get pods -o 'custom-columns=NAME:{.metadata.name},FASE:.status.phase'
cap oficina-cc-valores kc -n oficina get pod bb -o 'custom-columns=ARGS:.spec.containers[0].args,R:.status.containerStatuses[0].restartCount,READY:.status.containerStatuses[0].ready'
cap oficina-cc-tipos kc -n oficina get pod,deploy -o custom-columns=NAME:.metadata.name,KIND:.kind
cap oficina-cc-nada kc -n oficina get svc -o custom-columns=NAME:.metadata.name
cap oficina-cc-um-errado kc -n oficina get pod bb nada -o custom-columns=NAME:.metadata.name
cap oficina-cc-vazio kc -n oficina get pods -o custom-columns=
cap oficina-cc-sem-spec kc -n oficina get pods -o custom-columns
cap oficina-cc-sem-caminho kc -n oficina get pods -o custom-columns=NAME
cap oficina-cc-chave-aberta kc -n oficina get pods -o 'custom-columns=NAME:{.metadata.name'
cap oficina-get-formato-ruim kc -n oficina get pods -o foo

# --sort-by (a tabela do 1.37 só ordena uma busca; um campo que falta em todos some com a tabela)
cap oficina-sort-nome kc -n oficina get pods --sort-by=.metadata.name -o name
cap oficina-sort-label kc -n oficina get pods --sort-by=.metadata.labels.tier
cap oficina-sort-label-cc kc -n oficina get pods --sort-by=metadata.labels.tier -o custom-columns=NAME:.metadata.name
cap oficina-sort-falta kc -n oficina get pods -l app=web --sort-by=.spec.nada
cap oficina-sort-falta-um kc -n oficina get pod bb --sort-by=.spec.nada
cap oficina-sort-falta-name kc -n oficina get pods --sort-by=.spec.nada -o name
cap oficina-sort-falta-yaml kc -n oficina get pods -l app=bb --sort-by=.spec.nada -o yaml
cap oficina-sort-um-name kc -n oficina get pod bb --sort-by=.spec.nada -o name
cap oficina-sort-tipos kc -n oficina get pods,deploy --sort-by=.metadata.name
cap oficina-sort-tipos-name kc -n oficina get pods,deploy --sort-by=.metadata.name -o name
cap oficina-sort-caminho kc -n oficina get pods --sort-by='{.metadata.name' -o name
cap oficina-sort-um-deploy kc -n oficina get deploy --sort-by=.spec.nada

# -L (colunas de label)
cap oficina-label-col kc -n oficina get pods -l app=bb -L app,tier
cap oficina-label-col-show kc -n oficina get pods -l app=bb -L app -L tier --show-labels
cap oficina-label-col-wide kc -n oficina get deploy -L app.kubernetes.io/name,app -o wide

# --sort-by por número: um pod que cai e volta fica por último
kc -n oficina run cai --image=busybox:1.36 -- sh -c 'sleep 1; exit 1' >/dev/null 2>&1
sleep 25
cap oficina-sort-restarts kc -n oficina get pods --sort-by=.status.containerStatuses[0].restartCount -o custom-columns=NAME:.metadata.name
kc -n oficina delete pod cai --now >/dev/null 2>&1

# kubectl events (e o get events ordenado)
kc apply -f /tmp/kl-of-tropeco.yaml >/dev/null 2>&1
kc -n oficina wait --for=condition=Failed job/tropeco --timeout=90s >/dev/null 2>&1
cap oficina-events-for kc events -n oficina --for job/tropeco
cap oficina-events-warning kc events -n oficina --types=Warning --for=job/tropeco
cap oficina-events-tipos kc events -n oficina --types Normal,warning --for job/tropeco
cap oficina-events-deploy kc events -n oficina --for deploy/web
cap oficina-events-sem-cabecalho kc events -n oficina --for deployment.apps/web --no-headers
cap oficina-events-todos kc events -A --for job/tropeco
cap oficina-events-jsonpath kc events -n oficina --for job/tropeco -o 'jsonpath={.items[*].reason}'
cap oficina-events-nenhum kc events -n oficina --for pod/naoexiste
cap oficina-events-tipo-ruim kc events -n oficina --types=Nada
cap oficina-events-for-sem-nome kc events -n oficina --for job
cap oficina-events-for-tipo-ruim kc events -n oficina --for nada/x
cap oficina-events-formato kc events -n oficina --for job/tropeco -o wide
cap oficina-get-events-ordem kc get events -n oficina --field-selector involvedObject.name=tropeco --sort-by=.lastTimestamp
cap oficina-get-events-ordem-criacao kc get events -n oficina --field-selector involvedObject.name=tropeco --sort-by=.metadata.creationTimestamp -o custom-columns=REASON:.reason,TYPE:.type

# kubectl patch
cap oficina-patch kc -n oficina patch deploy web -p '{"spec":{"replicas":3}}'
cap oficina-patch-igual kc -n oficina patch deploy web -p '{"spec":{"replicas":3}}'
cap oficina-patch-merge kc -n oficina patch deploy web --type merge -p '{"metadata":{"labels":{"time":"azul"}}}'
cap oficina-patch-json kc -n oficina patch deploy web --type=json -p '[{"op":"replace","path":"/spec/replicas","value":2}]'
cap oficina-patch-yaml kc -n oficina patch deploy web -p 'spec: {replicas: 2}'
cap oficina-patch-arquivo kc -n oficina patch deploy web --patch-file /tmp/kl-of-patch.json
cap oficina-patch-conteiner kc -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"lado","image":"busybox:1.36","command":["sleep","3600"]}]}}}}'
cap oficina-patch-conteiner-ordem kc -n oficina get deploy web -o 'jsonpath={.spec.template.spec.containers[*].name}'
cap oficina-patch-apaga kc -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"lado","$patch":"delete"}]}}}}'
cap oficina-patch-apaga-de-novo kc -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"lado","$patch":"delete"}]}}}}'
cap oficina-patch-env-a kc -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","env":[{"name":"A","value":"1"}]}]}}}}'
cap oficina-patch-env-b kc -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","env":[{"name":"B","value":"2"}]}]}}}}'
cap oficina-patch-env-ordem kc -n oficina get deploy web -o 'jsonpath={.spec.template.spec.containers[0].env}'
cap oficina-patch-merge-lista kc -n oficina patch deploy web --type merge -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","image":"nginx:1.27","env":[{"name":"B","value":"2"},{"name":"A","value":"1"}]}]}}}}'
cap oficina-patch-json-add kc -n oficina patch deploy web --type json -p '[{"op":"add","path":"/metadata/labels/novo","value":"sim"}]'
cap oficina-patch-nulo kc -n oficina patch deploy/web -p '{"metadata":{"labels":{"novo":null}}}'
cap oficina-patch-varios kc -n oficina patch deploy web svc web -p '{"metadata":{"labels":{"x":"y"}}}'
cap oficina-patch-name kc -n oficina patch deploy web -p '{"spec":{"replicas":2}}' -o name
cap oficina-patch-dry kc -n oficina patch deploy web -p '{"spec":{"replicas":4}}' --dry-run=client
cap oficina-patch-desconhecido kc -n oficina patch deploy web -p '{"spec":{"replica":2}}'
cap oficina-patch-desconhecido-lista kc -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","imagem":"nginx:1.27"}]}}}}'
cap oficina-patch-tipo kc -n oficina patch deploy web -p '{"spec":{"replicas":"2"}}'
cap oficina-patch-tipo-bool kc -n oficina patch deploy web -p '{"spec":{"paused":"sim"}}'
cap oficina-patch-invalido kc -n oficina patch deploy web -p '{"spec":{"replicas":-1}}'
cap oficina-patch-seletor kc -n oficina patch deploy web -p '{"spec":{"selector":{"matchLabels":{"app":"outro"}}}}'
cap oficina-patch-nome kc -n oficina patch deploy web -p '{"metadata":{"name":"outro"}}'
cap oficina-patch-sem-chave kc -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"image":"nginx:1.27"}]}}}}'
cap oficina-patch-sem-p kc -n oficina patch deploy web
cap oficina-patch-dois kc -n oficina patch deploy web -p '{}' --patch-file /tmp/kl-of-patch.json
cap oficina-patch-arquivo-nada kc -n oficina patch deploy web --patch-file /tmp/kl-of-nada.json
cap oficina-patch-json-quebrado kc -n oficina patch deploy web -p '{bad'
cap oficina-patch-yaml-quebrado kc -n oficina patch deploy web -p 'a: b: c'
cap oficina-patch-lista kc -n oficina patch deploy web -p '[]'
cap oficina-patch-merge-lista-ruim kc -n oficina patch deploy web --type merge -p '[]'
cap oficina-patch-json-objeto kc -n oficina patch deploy web --type json -p '{"spec":{}}'
cap oficina-patch-json-falha kc -n oficina patch deploy web --type json -p '[{"op":"replace","path":"/spec/nada/x","value":1}]'
cap oficina-patch-json-teste kc -n oficina patch deploy web --type json -p '[{"op":"test","path":"/spec/replicas","value":9}]'
cap oficina-patch-tipo-ruim kc -n oficina patch deploy web --type xml -p '{}'
cap oficina-patch-nao-existe kc -n oficina patch deploy nada -p '{}'
cap oficina-patch-sem-nome kc -n oficina patch deploy -p '{}'
cap oficina-patch-sem-recurso kc -n oficina patch -p '{}'
kc -n oficina expose deploy web --port 80 >/dev/null 2>&1
cap oficina-patch-svc-porta kc -n oficina patch svc web -p '{"spec":{"ports":[{"port":8080,"targetPort":80,"name":"alt"}]}}'
cap oficina-patch-svc-tipo kc -n oficina patch svc web --type merge -p '{"spec":{"type":"NodePort"}}'

# kubectl set env / set resources / set image
kc -n oficina create configmap cfg --from-literal=cor=azul --from-literal=log.level=debug --from-literal=TAMANHO=g >/dev/null 2>&1
kc -n oficina create secret generic seg --from-literal=senha=x >/dev/null 2>&1
cap oficina-set-env kc -n oficina set env deploy/web MODO=teste
cap oficina-set-env-igual kc -n oficina set env deploy/web MODO=teste
cap oficina-set-env-lista kc -n oficina set env deploy/web --list
cap oficina-set-env-from kc -n oficina set env deploy/web --from=configmap/cfg
cap oficina-set-env-prefixo kc -n oficina set env deploy/web --from=secret/seg --prefix=APP_
cap oficina-set-env-lista-from kc -n oficina set env deploy/web --list
cap oficina-set-env-resolve kc -n oficina set env deploy/web --list --resolve
cap oficina-set-env-chaves kc -n oficina set env deploy/web --keys=cor --from=configmap/cfg
cap oficina-set-env-tira kc -n oficina set env deploy/web MODO-
cap oficina-set-env-tira-nada kc -n oficina set env deploy/web NADA-
cap oficina-set-env-conteiner kc -n oficina set env deploy/web A=1 -c nada
cap oficina-set-env-sem-sobrescrever kc -n oficina set env deploy/web A=2 --overwrite=false
cap oficina-set-env-nome-ruim kc -n oficina set env deploy/web 1A=x
cap oficina-set-env-svc kc -n oficina set env svc/web A=1
cap oficina-set-env-from-nada kc -n oficina set env deploy/web --from=configmap/nada
cap oficina-set-env-dry kc -n oficina set env deploy/web C=3 --dry-run=client
cap oficina-set-env-dois kc -n oficina set env deploy/web A=9 B=8
cap oficina-set-env-nao-existe kc -n oficina set env deploy/nada A=1
cap oficina-set-res kc -n oficina set resources deploy/web --requests=cpu=100m,memory=64Mi
cap oficina-set-res-igual kc -n oficina set resources deploy/web --requests=cpu=100m,memory=64Mi
cap oficina-set-res-limite kc -n oficina set resources deploy/web --limits=cpu=200m -c nginx
cap oficina-set-res-ver kc -n oficina get deploy web -o 'jsonpath={.spec.template.spec.containers[0].resources}'
cap oficina-set-res-nada kc -n oficina set resources deploy/web
cap oficina-set-res-conteiner kc -n oficina set resources deploy/web --limits=cpu=200m -c nada
cap oficina-set-res-quantidade kc -n oficina set resources deploy/web --limits=cpu=abc
cap oficina-set-res-sintaxe kc -n oficina set resources deploy/web --limits=cpu
cap oficina-set-res-dry kc -n oficina set resources deploy/web --requests=cpu=0 --dry-run=client
cap oficina-set-res-name kc -n oficina set resources deploy/web --requests=memory=128Mi --limits=memory=256Mi -o name
cap oficina-set-res-svc kc -n oficina set resources svc/web --limits=cpu=1
cap oficina-set-image-igual kc -n oficina set image deploy/web nginx=nginx:1.27
cap oficina-set-image-dry kc -n oficina set image deploy/web nginx=nginx:1.28 --dry-run=client
cap oficina-set-image-conteiner kc -n oficina set image deploy/web nada=nginx:1.27
cap oficina-set-image-svc kc -n oficina set image svc/web a=b
cap oficina-set-sem-sub kc -n oficina set
cap oficina-set-sub-ruim kc -n oficina set nada

# Os geradores (--dry-run=client -o yaml); com -n, o kubectl escreve o namespace
kc apply -f /tmp/kl-of-limpa.yaml >/dev/null 2>&1
cap oficina-gera-deploy kc -n oficina create deployment api --image=nginx:1.27 --replicas=3 --port=8080 --dry-run=client -o yaml
cap oficina-gera-deploy-duas kc -n oficina create deployment multi --image=nginx:1.27 --image=busybox:1.36 --dry-run=client -o yaml
cap oficina-gera-svc kc -n oficina create service clusterip api --tcp=80:8080 --dry-run=client -o yaml
cap oficina-gera-svc-nodeport kc -n oficina create service nodeport api --tcp=80:8080 --node-port=30080 --dry-run=client -o yaml
cap oficina-gera-svc-headless kc -n oficina create service clusterip sem --clusterip=None --dry-run=client -o yaml
cap oficina-gera-svc-lb kc -n oficina create service loadbalancer lb --tcp=80 --dry-run=client -o yaml
cap oficina-gera-svc-sem-porta kc -n oficina create service clusterip semporta --dry-run=client -o yaml
cap oficina-gera-svc-externo kc -n oficina create service externalname ext --external-name=example.com --dry-run=client -o yaml
cap oficina-gera-svc-externo-sem kc -n oficina create service externalname ext2 --dry-run=client -o yaml
cap oficina-gera-cm kc -n oficina create configmap cfg2 --from-literal=cor=azul --from-literal=modo=1 --from-file=/tmp/kl-of-app.conf --dry-run=client -o yaml
cap oficina-gera-cm-chave kc -n oficina create configmap cfg3 --from-file=app=/tmp/kl-of-app.conf --dry-run=client -o yaml
cap oficina-gera-secret kc -n oficina create secret generic seg2 --from-literal=senha=s3cr3t --dry-run=client -o yaml
cap oficina-gera-secret-tipo kc -n oficina create secret generic seg3 --from-literal=a=b --type=kubernetes.io/basic-auth --dry-run=client -o yaml
cap oficina-gera-job kc -n oficina create job tarefa --image=busybox:1.36 --dry-run=client -o yaml -- sh -c 'echo oi'
cap oficina-gera-job-from kc -n oficina create job manual --from=cronjob/limpa --dry-run=client -o yaml
cap oficina-gera-cronjob kc -n oficina create cronjob relogio --image=busybox:1.36 --schedule='*/1 * * * *' --dry-run=client -o yaml -- date
cap oficina-gera-cronjob-never kc -n oficina create cronjob relogio2 --image=busybox:1.36 --schedule='*/1 * * * *' --restart=Never --dry-run=client -o yaml
cap oficina-gera-run kc -n oficina run p1 --image=nginx:1.27 --port=80 --labels=app=p1,tier=web --env=A=1 --env=B=2 --dry-run=client -o yaml
cap oficina-gera-run-command kc -n oficina run p2 --image=busybox:1.36 --command --dry-run=client -o yaml -- sleep 3600
cap oficina-gera-run-never kc -n oficina run p3 --image=busybox:1.36 --restart=Never --dry-run=client -o yaml -- echo oi
cap oficina-gera-expose kc -n oficina expose deploy web --port=80 --target-port=8080 --dry-run=client -o yaml
cap oficina-gera-expose-nodeport kc -n oficina expose deploy web --port=80 --type=NodePort --name=web-np --dry-run=client -o yaml
cap oficina-gera-expose-udp kc -n oficina expose deploy web --port=80 --protocol=UDP --dry-run=client -o yaml
cap oficina-gera-expose-pod kc -n oficina expose pod bb --port=80 --dry-run=client -o yaml
cap oficina-gera-autoscale kc -n oficina autoscale deploy web --max=3 --dry-run=client -o yaml
cap oficina-gera-ns kc -n oficina create namespace teste --dry-run=client -o yaml
cap oficina-gera-ingress kc -n oficina create ingress ing --class=nginx --rule=foo.com/api*=api:http --rule=bar.com/=web:80,tls=certificado --dry-run=client -o yaml
cap oficina-gera-ingress-padrao kc -n oficina create ingress ing3 --default-backend=web:80 --dry-run=client -o yaml
cap oficina-gera-ingress-sem-host kc -n oficina create ingress ing4 --rule=/=web:80 --dry-run=client -o yaml
cap oficina-gera-ingress-mesmo-host kc -n oficina create ingress ing8 --rule=foo.com/a=web:80,tls --rule=foo.com/b=web:80 --annotation=a=b --dry-run=client -o yaml
cap oficina-gera-ingress-nada kc -n oficina create ingress ing5 --dry-run=client -o yaml
cap oficina-gera-ingress-ruim kc -n oficina create ingress ing6 --rule=foo.com=web:80 --dry-run=client -o yaml
cap oficina-gera-quota kc -n oficina create quota q --hard=cpu=1,memory=1Gi,pods=4 --dry-run=client -o yaml
cap oficina-gera-quota-vazia kc -n oficina create quota q3 --dry-run=client -o yaml
cap oficina-gera-pdb kc -n oficina create pdb guarda --selector=app=web --min-available=1 --dry-run=client -o yaml
cap oficina-gera-pdb-pct kc -n oficina create pdb guarda2 --selector=app=web --max-unavailable=50% --dry-run=client -o yaml
cap oficina-gera-pdb-conjunto kc -n oficina create pdb guarda6 --selector='app in (b,a),tier=x,!z,w' --min-available=1 --dry-run=client -o yaml
cap oficina-gera-pdb-sem-numero kc -n oficina create pdb guarda3 --selector=app=web --dry-run=client -o yaml
cap oficina-gera-pdb-sem-seletor kc -n oficina create pdb guarda5 --min-available=1 --dry-run=client -o yaml
cap oficina-gera-pdb-dois kc -n oficina create pdb guarda4 --selector=app=web --min-available=1 --max-unavailable=1 --dry-run=client -o yaml
cap oficina-gera-pdb-diferente kc -n oficina create pdb guarda7 --selector=app!=web --min-available=1 --dry-run=client -o yaml

# auth can-i --list (os crachás de uma ServiceAccount, de um usuário qualquer e do administrador)
kc -n oficina create serviceaccount leitor >/dev/null 2>&1
kc -n oficina create role leitor --verb=get,list,watch --resource=pods,services --resource=deployments.apps >/dev/null 2>&1
kc -n oficina create role log --verb=get --resource=pods/log --resource-name=bb >/dev/null 2>&1
kc -n oficina create rolebinding leitor --role=leitor --serviceaccount=oficina:leitor >/dev/null 2>&1
kc -n oficina create rolebinding log --role=log --serviceaccount=oficina:leitor >/dev/null 2>&1
cap oficina-auth-lista-sa kc auth can-i --list -n oficina --as=system:serviceaccount:oficina:leitor
cap oficina-auth-lista-outro-ns kc auth can-i --list -n default --as=system:serviceaccount:oficina:leitor
cap oficina-auth-lista-usuario kc auth can-i --list -n oficina --as=ana
cap oficina-auth-lista-sem-cabecalho kc auth can-i --list -n oficina --as=ana --no-headers
cap oficina-auth-lista-admin kc auth can-i --list -n oficina
cap oficina-auth-lista-args kc auth can-i --list get pods

# logs --since (o "depois" sai 15 s depois do "inicio")
kc -n oficina run conta --image=busybox:1.36 -- sh -c 'echo inicio; sleep 15; echo depois; sleep 3600' >/dev/null 2>&1
kc -n oficina wait --for=condition=Ready pod/conta --timeout=120s >/dev/null 2>&1
sleep 30
cap oficina-logs-since-curto kc -n oficina logs conta --since=5s
cap oficina-logs-since kc -n oficina logs conta --since=20s
cap oficina-logs-since-longo kc -n oficina logs conta --since=1h
cap oficina-logs-since-tail kc -n oficina logs conta --since=1h --tail=1
cap oficina-logs-since-zero kc -n oficina logs conta --since=0s
cap oficina-logs-since-ruim kc -n oficina logs conta --since=abc
cap oficina-logs-since-negativo kc -n oficina logs conta --since=-5s
cap oficina-logs-since-dois kc -n oficina logs conta --since=5s --since-time=2026-10-22T17:00:00Z
cap oficina-logs-since-time-ruim kc -n oficina logs conta --since-time=ontem
