# ---------- Terminal (namespace terminal): o kubectl run --rm -i (o pod de depuração que some no fim), os erros do run
# anexado, o -i sem anexar (o shell fica esperando a entrada) e o rollout que estoura o progressDeadlineSeconds.
# A gêmea no simulador: tests/golden/secoes/30-terminal.js.
cat > /tmp/kl-term-loja.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: loja
  namespace: terminal
spec:
  replicas: 2
  progressDeadlineSeconds: 30
  selector:
    matchLabels:
      app: loja
  template:
    metadata:
      labels:
        app: loja
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
---
apiVersion: v1
kind: Service
metadata:
  name: loja
  namespace: terminal
spec:
  selector:
    app: loja
  ports:
  - port: 80
    targetPort: 80
Y
kc create namespace terminal >/dev/null 2>&1
kc apply -f /tmp/kl-term-loja.yaml >/dev/null 2>&1
kc rollout status deploy/loja -n terminal --timeout=180s >/dev/null 2>&1
# O busybox já no node: o run --rm espera o pod rodar, e o pull não entra na conta.
kc run puxa -n terminal --restart=Never --image=busybox:1.36 -- true >/dev/null 2>&1
kc wait --for=jsonpath='{.status.phase}'=Succeeded pod/puxa -n terminal --timeout=180s >/dev/null 2>&1
kc delete pod puxa -n terminal >/dev/null 2>&1
cap term-run-rm kc run tmp -n terminal --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- http://loja
cap term-run-rm-falha kc run falha -n terminal --rm -i --restart=Never --image=busybox:1.36 -- sh -c 'echo saindo; exit 3'
cap term-run-rm-lento kc run lento -n terminal --rm -i --restart=Never --image=busybox:1.36 -- sh -c 'sleep 5; echo depois'
cap term-run-sem-rm kc run eco -n terminal -i --restart=Never --image=busybox:1.36 -- echo oi
cap term-get-eco kc get pod eco -n terminal
cap term-run-rm-sem-i kc run x -n terminal --rm --image=busybox:1.36 -- echo oi
cap term-run-t-sem-i kc run x -n terminal -t --image=busybox:1.36
cap term-run-rm-dry kc run x -n terminal --rm -i --dry-run=client --image=busybox:1.36
cap term-run-restart kc run x -n terminal --restart=Sometimes --image=busybox:1.36
cap term-run-sem-anexar kc run entrada -n terminal -it --attach=false --image=busybox:1.36
kc wait --for=condition=Ready pod/entrada -n terminal --timeout=120s >/dev/null 2>&1
sleep 5
cap term-get-entrada kc get pod entrada -n terminal
cap term-entrada-spec kc get pod entrada -n terminal -o jsonpath='{.spec.restartPolicy} {.spec.containers[0].stdin} {.spec.containers[0].stdinOnce} {.spec.containers[0].tty}'
# O rollout que trava: a tag não existe. O prazo (30 s sem progresso) vence e o rollout status desiste.
kc set image deploy/loja -n terminal nginx=nginx:nao-existe-kl >/dev/null 2>&1
sleep 3
cap term-rollout-timeout kc rollout status deploy/loja -n terminal --timeout=3s
cap term-rollout-prazo kc rollout status deploy/loja -n terminal
cap term-rollout-sem-watch kc rollout status deploy/loja -n terminal --watch=false
cap term-describe-prazo kc describe deploy loja -n terminal
cap term-condicoes-prazo kc get deploy loja -n terminal -o jsonpath='{range .status.conditions[*]}{.type} {.status} {.reason} {.message}{"\n"}{end}'
