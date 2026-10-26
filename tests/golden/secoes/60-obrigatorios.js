// A gêmea de scripts/golden/60-obrigatorios.sh no simulador (namespace obrigatorios): o null do YAML pela metade é
// campo não definido, e os obrigatórios do alvo do HPA, do roleRef, da sonda e do envFrom; o kustomize com uma entrada
// que não é texto.
export default ({ k, cap }) => {
  k('kubectl create namespace obrigatorios');
  cap('obr-apply-conteiner-vazio', 'kubectl apply -f /tmp/kl-obr-conteiner.yaml');
  cap('obr-apply-init-vazio', 'kubectl apply -f /tmp/kl-obr-init.yaml');
  cap('obr-apply-labels-vazio', 'kubectl apply -f /tmp/kl-obr-labels.yaml');
  cap('obr-apply-limites-vazio', 'kubectl apply -f /tmp/kl-obr-limites.yaml');
  cap('obr-limites-recursos', "kubectl get pod limites -n obrigatorios -o jsonpath='{.spec.containers[0].resources}'");
  cap('obr-limites-labels', "kubectl get pod limites -n obrigatorios -o jsonpath='{.metadata.labels}'");
  cap('obr-limites-anotacao', "kubectl get pod limites -n obrigatorios -o jsonpath='{.metadata.annotations.kubectl\\.kubernetes\\.io/last-applied-configuration}'");
  cap('obr-apply-hpa-so-nome', 'kubectl apply -f /tmp/kl-obr-hpa.yaml');
  cap('obr-apply-hpa-sem-alvo', 'kubectl apply -f /tmp/kl-obr-hpa-sem-alvo.yaml');
  cap('obr-apply-hpa-sem-grupo', 'kubectl apply -f /tmp/kl-obr-hpa-sem-grupo.yaml');
  cap('obr-apply-hpa-v1', 'kubectl apply -f /tmp/kl-obr-hpa-v1.yaml');
  cap('obr-apply-rb-sem-roleref', 'kubectl apply -f /tmp/kl-obr-rb.yaml');
  cap('obr-apply-rb-grupo-vazio', 'kubectl apply -f /tmp/kl-obr-rb-grupo.yaml');
  cap('obr-rb-grupo-padrao', "kubectl get rolebinding grupo-vazio -n obrigatorios -o jsonpath='{.roleRef.apiGroup}'");
  cap('obr-apply-rb-tipo-errado', 'kubectl apply -f /tmp/kl-obr-rb-tipo.yaml');
  cap('obr-apply-rb-sem-nome', 'kubectl apply -f /tmp/kl-obr-rb-sem-nome.yaml');
  cap('obr-apply-rb-grupo-errado', 'kubectl apply -f /tmp/kl-obr-rb-grupo-errado.yaml');
  cap('obr-apply-rb-ok', 'kubectl apply -f /tmp/kl-obr-rb-ok.yaml');
  cap('obr-apply-rb-troca', 'kubectl apply -f /tmp/kl-obr-rb-troca.yaml');
  cap('obr-apply-crb-sem-roleref', 'kubectl apply -f /tmp/kl-obr-crb.yaml');
  cap('obr-apply-crb-role', 'kubectl apply -f /tmp/kl-obr-crb-role.yaml');
  cap('obr-apply-sonda-sem-teste', 'kubectl apply -f /tmp/kl-obr-sonda.yaml');
  cap('obr-apply-envfrom-sem-fonte', 'kubectl apply -f /tmp/kl-obr-envfrom.yaml');
  cap('obr-apply-envfrom-sem-nome', 'kubectl apply -f /tmp/kl-obr-envfrom-nome.yaml');
  cap('obr-apply-limitrange-vazio', 'kubectl apply -f /tmp/kl-obr-limitrange.yaml');
  cap('obr-run-com-limitrange-vazio', 'kubectl run solto -n obrigatorios --image=nginx:1.27');
  cap('obr-solto-recursos', "kubectl get pod solto -n obrigatorios -o jsonpath='{.spec.containers[0].resources}'");
  cap('obr-describe-limitrange-vazio', 'kubectl describe limitrange padrao -n obrigatorios');
  cap('obr-apply-sts-molde-sem-nome', 'kubectl apply -f /tmp/kl-obr-sts.yaml');
  cap('obr-apply-ns-labels-vazio', 'kubectl apply -f /tmp/kl-obr-ns.yaml');
  cap('obr-kustomize-objeto', 'kubectl kustomize /tmp/kl-obr-k-objeto');
  cap('obr-kustomize-numero', 'kubectl kustomize /tmp/kl-obr-k-numero');
};
