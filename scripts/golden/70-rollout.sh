# ---------- Rollback (namespace rollout): três change-cause diferentes, o undo --to-revision=1 (o Deployment ganha as
# anotações do ReplicaSet alvo, e o histórico mostra o motivo certo na revisão nova), o undo que não muda nada e o
# rollout pausado, que recusa o undo e o restart.
# A gêmea no simulador: tests/golden/secoes/70-rollout.js.
cat > /tmp/kl-rollout-loja.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: loja
  namespace: rollout
spec:
  replicas: 2
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
Y
kc create namespace rollout >/dev/null 2>&1
kc apply -f /tmp/kl-rollout-loja.yaml >/dev/null 2>&1
kc -n rollout annotate deployment loja kubernetes.io/change-cause='versao 1.0: abertura' >/dev/null 2>&1
kc -n rollout rollout status deploy/loja --timeout=180s >/dev/null 2>&1
kc -n rollout set image deployment/loja nginx=nginx:1.28 >/dev/null 2>&1
kc -n rollout annotate deployment loja kubernetes.io/change-cause='versao 1.1: carrinho' --overwrite >/dev/null 2>&1
kc -n rollout rollout status deploy/loja --timeout=180s >/dev/null 2>&1
kc -n rollout set env deployment/loja COR=azul >/dev/null 2>&1
kc -n rollout annotate deployment loja kubernetes.io/change-cause='versao 2.0: reclamou' --overwrite >/dev/null 2>&1
kc -n rollout rollout status deploy/loja --timeout=180s >/dev/null 2>&1
cap rollout-hist-antes kc -n rollout rollout history deploy/loja
cap rollout-undo-rev1 kc -n rollout rollout undo deploy/loja --to-revision=1
kc -n rollout rollout status deploy/loja --timeout=180s >/dev/null 2>&1
cap rollout-hist-depois kc -n rollout rollout history deploy/loja
cap rollout-hist-rev4 kc -n rollout rollout history deploy/loja --revision=4
cap rollout-change-cause kc -n rollout get deploy loja -o jsonpath='{.metadata.annotations.kubernetes\.io/change-cause}'
cap rollout-undo-igual kc -n rollout rollout undo deploy/loja --to-revision=4
cap rollout-pause kc -n rollout rollout pause deploy/loja
cap rollout-undo-pausado kc -n rollout rollout undo deploy/loja
cap rollout-restart-pausado kc -n rollout rollout restart deploy/loja
cap rollout-resume kc -n rollout rollout resume deploy/loja
