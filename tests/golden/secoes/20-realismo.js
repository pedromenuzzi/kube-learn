// A gêmea de scripts/golden/20-realismo.sh no simulador (namespace realismo): EndpointSlice, exec barrado pelo RBAC,
// o fuso do CronJob, imagePullPolicy Never, o prazo do Job e o PodSecurity ao trocar o rótulo do namespace.
export default ({ c, k, cap }) => {
  const pronto = (o) => o?.status?.conditions?.some((x) => x.type === 'Ready' && x.status === 'True');
  const vitrinePronta = () => {
    const d = c.obter('Deployment', 'realismo', 'vitrine');
    return d?.status?.availableReplicas === 2 && d.status.updatedReplicas === 2;
  };
  k('kubectl create namespace realismo');
  k('kubectl run caixa -n realismo --image=busybox:1.36 -- sleep 3600');
  k('kubectl apply -f /tmp/kl-real-vitrine.yaml');
  c.avancarAte(() => vitrinePronta() && pronto(c.obter('Pod', 'realismo', 'caixa')), '3m');
  c.avancar('5s');
  cap('real-get-eps', 'kubectl get endpointslices -n realismo');
  cap('real-get-eps-servico', 'kubectl get endpointslices -n realismo -l kubernetes.io/service-name=vitrine');
  cap('real-describe-eps', 'kubectl describe endpointslice -n realismo -l kubernetes.io/service-name=vitrine');
  cap('real-describe-eps-vazio', 'kubectl describe endpointslices -n realismo -l kubernetes.io/service-name=vazio');
  cap('real-eps-campos', `kubectl get endpointslices -n realismo -l kubernetes.io/service-name=vitrine -o jsonpath='{.items[0].metadata.generateName} {.items[0].metadata.labels} {.items[0].ports} {.items[0].endpoints[0].conditions} {.items[0].metadata.ownerReferences[0].kind}/{.items[0].metadata.ownerReferences[0].name}'`);
  k('kubectl scale deploy/vitrine -n realismo --replicas=0');
  c.avancar('40s');
  cap('real-get-eps-zero', 'kubectl get endpointslices -n realismo -l kubernetes.io/service-name=vitrine');

  k('kubectl create role leitor -n realismo --verb=get,list --resource=pods');
  k('kubectl create rolebinding leitor -n realismo --role=leitor --user=carla');
  cap('real-exec-as-proibido', 'kubectl exec caixa -n realismo --as=carla -- ls /');
  cap('real-exec-as-sem-get', 'kubectl exec caixa -n realismo --as=davi -- ls /');
  cap('real-exec-as-nao-existe', 'kubectl exec nada -n realismo --as=carla -- ls /');
  cap('real-logs-as-sem-get', 'kubectl logs caixa -n realismo --as=davi');
  cap('real-logs-as-proibido', 'kubectl logs caixa -n realismo --as=carla');

  cap('real-apply-fuso', 'kubectl apply -f /tmp/kl-real-fuso.yaml');
  cap('real-apply-fuso-marte', 'kubectl apply -f /tmp/kl-real-fuso-marte.yaml');
  cap('real-apply-fuso-local', 'kubectl apply -f /tmp/kl-real-fuso-local.yaml');
  cap('real-apply-fuso-no-horario', 'kubectl apply -f /tmp/kl-real-fuso-no-horario.yaml');
  cap('real-get-fuso', 'kubectl get cronjob fuso -n realismo');
  cap('real-describe-fuso', 'kubectl describe cronjob fuso -n realismo');

  k('kubectl apply -f /tmp/kl-real-nunca.yaml');
  k('kubectl apply -f /tmp/kl-real-prazo.yaml');
  c.avancar('20s');
  cap('real-get-prazo-alvo', 'kubectl get job prazo -n realismo');
  cap('real-describe-prazo-alvo', 'kubectl describe job prazo -n realismo');
  c.avancar('40s');
  cap('real-get-nunca', 'kubectl get pod nunca -n realismo');
  cap('real-nunca-estado', "kubectl get pod nunca -n realismo -o jsonpath='{.status.containerStatuses[0].state}'");
  cap('real-get-prazo', 'kubectl get job prazo -n realismo');
  cap('real-describe-prazo', 'kubectl describe job prazo -n realismo');
  cap('real-prazo-condicoes', `kubectl get job prazo -n realismo -o jsonpath='{range .status.conditions[*]}{.type} {.reason}{"\\n"}{end}{.status.failed} {.status.terminating}'`);

  cap('real-label-ns-restrito', 'kubectl label ns realismo pod-security.kubernetes.io/enforce=restricted');
  cap('real-label-ns-mesmo-nivel', 'kubectl label ns realismo pod-security.kubernetes.io/warn=restricted');
  cap('real-label-ns-versao', 'kubectl label ns realismo pod-security.kubernetes.io/enforce-version=v1.36');
  cap('real-label-ns-privilegiado', 'kubectl label ns realismo pod-security.kubernetes.io/enforce=privileged --overwrite');
};
