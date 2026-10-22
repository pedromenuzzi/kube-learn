# ---------- kubectl edit (namespace editar) e o kubectl explain em inglês ----------
# O editor é o KUBE_EDITOR: cat mostra o arquivo que o kubectl abre; sed muda o arquivo; /tmp/kl-editor.sh muda com o
# sed da variável TROCA e, quando o kubectl reabre o arquivo com o erro, mostra os comentários do topo (os motivos; com
# MOSTRAR=cat, o arquivo todo) e sai sem mudar nada, o que desiste da edição.
# A gêmea no simulador: tests/golden/secoes/50-editar.js.
cat > /tmp/kl-editar-web.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: editar
spec:
  replicas: 1
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
Y
cat > /tmp/kl-editor.sh <<'Y'
#!/bin/sh
if grep -q 'was not valid' "$1"; then ${MOSTRAR:-grep ^#} "$1"; else sed -i "$TROCA" "$1"; fi
Y
chmod +x /tmp/kl-editor.sh
kc create namespace editar >/dev/null 2>&1
kc apply -f /tmp/kl-editar-web.yaml >/dev/null 2>&1
kc -n editar rollout status deploy/web --timeout=180s >/dev/null 2>&1
kc -n editar create configmap cores --from-literal=cor=azul >/dev/null 2>&1
cap editar-texto env KUBE_EDITOR=cat $K edit deployment web -n editar
cap editar-seletor env KUBE_EDITOR=/tmp/kl-editor.sh TROCA='s/app: web/app: outro/' MOSTRAR=cat $K edit deploy/web -n editar
cap editar-desconhecido env KUBE_EDITOR=/tmp/kl-editor.sh TROCA='s/progressDeadlineSeconds: 600/progressDeadline: 600/' $K edit deploy/web -n editar
cap editar-tipo env KUBE_EDITOR=/tmp/kl-editor.sh TROCA='s/^  replicas: 1$/  replicas: tres/' $K edit deploy/web -n editar
cap editar-negativo env KUBE_EDITOR=/tmp/kl-editor.sh TROCA='s/^  replicas: 1$/  replicas: -1/' $K edit deploy/web -n editar
cap editar-nome env KUBE_EDITOR=/tmp/kl-editor.sh TROCA='s/^  name: web$/  name: web2/' $K edit deploy/web -n editar
cap editar-vazio env KUBE_EDITOR=/tmp/kl-editor.sh TROCA='s/.*//' $K edit deploy/web -n editar
cap editar-replicas env KUBE_EDITOR="sed -i 's/replicas: 1/replicas: 2/'" $K edit deploy/web -n editar
kc -n editar rollout status deploy/web --timeout=180s >/dev/null 2>&1
cap editar-get kc get deploy web -n editar
cap editar-cm env KUBE_EDITOR="sed -i s/azul/verde/" $K edit cm cores -n editar
cap editar-lista env KUBE_EDITOR="sed -i s/verde/roxo/" $K edit cm/cores deploy/web -n editar
cap editar-json env KUBE_EDITOR=cat $K edit cm cores -n editar -o json
cap editar-nao-existe env KUBE_EDITOR=cat $K edit deploy nada -n editar
cap editar-sem-objetos env KUBE_EDITOR=cat $K edit deploy -n kube-public
cap editar-sem-nome env KUBE_EDITOR=cat $K edit
kc create role leitor -n editar --verb=get,list --resource=deployments,configmaps >/dev/null 2>&1
kc create rolebinding leitor -n editar --role=leitor --user=ana >/dev/null 2>&1
cap editar-as-sem-get env KUBE_EDITOR=cat $K edit deploy/web -n editar --as=bia
cap editar-as-sem-patch env KUBE_EDITOR="sed -i s/roxo/azul/" $K edit cm/cores -n editar --as=ana

# O explain em inglês: as descrições de verdade (no simulador, de src/i18n/en/esquema.json).
for alvo in deployment.spec deployment.spec.strategy.type pod pod.spec.containers.env pod.spec.containers.ports \
  pod.spec.tolerations pod.spec.affinity service service.spec.ports secret namespace cronjob.spec ingress.spec \
  role.rules poddisruptionbudget.spec daemonset.spec; do
  cap "explain-en-$alvo" kc explain "$alvo"
done
