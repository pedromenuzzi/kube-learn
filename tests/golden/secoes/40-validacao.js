// A gêmea de scripts/golden/40-validacao.sh no simulador (namespace validacao): as tags reais de imagem, requests
// maiores que os limits, rótulo de PodSecurity inválido, o apply sem a anotação last-applied e o nslookup do busybox.
export default ({ c, k, cap }) => {
  const pronto = (nome) => c.obter('Pod', 'validacao', nome)?.status?.conditions?.some((x) => x.type === 'Ready' && x.status === 'True');
  k('kubectl create namespace validacao');
  k('kubectl apply -f /tmp/kl-val-docs.yaml');
  k('kubectl run alpino -n validacao --image=nginx:alpine');
  k('kubectl run consulta -n validacao --image=busybox:1.36 -- sleep 3600');
  k('kubectl run pausa -n validacao --image=registry.k8s.io/pause:3.10');
  c.avancarAte(() => ['docs', 'alpino', 'consulta', 'pausa'].every(pronto), '3m');
  c.avancar('5s');
  cap('val-get-pods', 'kubectl get pods -n validacao');
  cap('val-describe-docs', 'kubectl describe pod docs -n validacao');
  cap('val-describe-alpino', 'kubectl describe pod alpino -n validacao');
  cap('val-logs-docs', 'kubectl logs docs -n validacao');
  cap('val-imagens', `kubectl get pods -n validacao -o jsonpath='{range .items[*]}{.metadata.name} {.status.containerStatuses[0].image}{"\\n"}{end}'`);
  cap('val-exec-docs-curl', "kubectl exec docs -n validacao -- curl -s -o /dev/null -w '%{http_code}' http://localhost");
  cap('val-exec-alpino-curl', "kubectl exec alpino -n validacao -- curl -s -o /dev/null -w '%{http_code}' http://localhost");
  cap('val-exec-alpino-bash', "kubectl exec alpino -n validacao -- bash -c 'echo oi'");
  k('kubectl run osso -n validacao --image=alpine:3.20');
  c.avancar('40s');
  cap('val-osso-ultimo', "kubectl get pod osso -n validacao -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason} {.status.containerStatuses[0].lastState.terminated.exitCode}'");

  cap('val-apply-cpu', 'kubectl apply -f /tmp/kl-val-cpu.yaml');
  cap('val-apply-cpu-milli', 'kubectl apply -f /tmp/kl-val-cpu-milli.yaml');
  cap('val-apply-memoria', 'kubectl apply -f /tmp/kl-val-memoria.yaml');
  cap('val-apply-cpus', 'kubectl apply -f /tmp/kl-val-cpus.yaml');
  cap('val-apply-gpu', 'kubectl apply -f /tmp/kl-val-gpu.yaml');
  cap('val-apply-politica', 'kubectl apply -f /tmp/kl-val-politica.yaml');

  cap('val-label-psa-nivel', 'kubectl label ns validacao pod-security.kubernetes.io/enforce=restrito');
  cap('val-label-psa-versao', 'kubectl label ns validacao pod-security.kubernetes.io/enforce-version=v9');
  cap('val-label-psa-maiuscula', 'kubectl label ns validacao pod-security.kubernetes.io/warn=Restricted');
  cap('val-apply-ns-psa', 'kubectl apply -f /tmp/kl-val-ns.yaml');
  cap('val-labels-ns', 'kubectl get ns validacao --show-labels');

  k('kubectl create deployment criado -n validacao --image=nginx:1.27');
  cap('val-apply-sem-last-applied', 'kubectl apply -f /tmp/kl-val-criado.yaml');
  cap('val-apply-de-novo', 'kubectl apply -f /tmp/kl-val-criado.yaml');

  cap('val-nslookup-curto', 'kubectl exec consulta -n validacao -- nslookup loja');
  cap('val-nslookup-ns', 'kubectl exec consulta -n validacao -- nslookup loja.validacao');
  cap('val-nslookup-svc', 'kubectl exec consulta -n validacao -- nslookup loja.validacao.svc');
  cap('val-nslookup-fqdn', 'kubectl exec consulta -n validacao -- nslookup loja.validacao.svc.cluster.local');
  cap('val-nslookup-kubernetes', 'kubectl exec consulta -n validacao -- nslookup kubernetes.default');
  cap('val-nslookup-nada', 'kubectl exec consulta -n validacao -- nslookup nada');
  cap('val-wget-curto', 'kubectl exec consulta -n validacao -- wget -qO- -T 2 http://loja/nada');
};
