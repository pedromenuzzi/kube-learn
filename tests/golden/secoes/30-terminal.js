// A gêmea de scripts/golden/30-terminal.sh no simulador (namespace terminal): o kubectl run --rm -i, os erros do run
// anexado, o -i sem anexar e o rollout que estoura o progressDeadlineSeconds.
export default ({ c, k, cap }) => {
  const pod = (nome) => c.obter('Pod', 'terminal', nome);
  k('kubectl create namespace terminal');
  k('kubectl apply -f /tmp/kl-term-loja.yaml');
  k('kubectl rollout status deploy/loja -n terminal --timeout=180s');
  k('kubectl run puxa -n terminal --restart=Never --image=busybox:1.36 -- true');
  c.avancarAte(() => pod('puxa')?.status?.phase === 'Succeeded', '3m');
  k('kubectl delete pod puxa -n terminal');
  cap('term-run-rm', 'kubectl run tmp -n terminal --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- http://loja');
  cap('term-run-rm-falha', "kubectl run falha -n terminal --rm -i --restart=Never --image=busybox:1.36 -- sh -c 'echo saindo; exit 3'");
  cap('term-run-rm-lento', "kubectl run lento -n terminal --rm -i --restart=Never --image=busybox:1.36 -- sh -c 'sleep 5; echo depois'");
  cap('term-run-sem-rm', 'kubectl run eco -n terminal -i --restart=Never --image=busybox:1.36 -- echo oi');
  cap('term-get-eco', 'kubectl get pod eco -n terminal');
  cap('term-run-rm-sem-i', 'kubectl run x -n terminal --rm --image=busybox:1.36 -- echo oi');
  cap('term-run-t-sem-i', 'kubectl run x -n terminal -t --image=busybox:1.36');
  cap('term-run-rm-dry', 'kubectl run x -n terminal --rm -i --dry-run=client --image=busybox:1.36');
  cap('term-run-restart', 'kubectl run x -n terminal --restart=Sometimes --image=busybox:1.36');
  cap('term-run-sem-anexar', 'kubectl run entrada -n terminal -it --attach=false --image=busybox:1.36');
  c.avancarAte(() => pod('entrada')?.status?.conditions?.some((x) => x.type === 'Ready' && x.status === 'True'), '2m');
  c.avancar('5s');
  cap('term-get-entrada', 'kubectl get pod entrada -n terminal');
  cap('term-entrada-spec', "kubectl get pod entrada -n terminal -o jsonpath='{.spec.restartPolicy} {.spec.containers[0].stdin} {.spec.containers[0].stdinOnce} {.spec.containers[0].tty}'");
  k('kubectl set image deploy/loja -n terminal nginx=nginx:nao-existe-kl');
  c.avancar('3s');
  cap('term-rollout-timeout', 'kubectl rollout status deploy/loja -n terminal --timeout=3s');
  cap('term-rollout-prazo', 'kubectl rollout status deploy/loja -n terminal');
  cap('term-rollout-sem-watch', 'kubectl rollout status deploy/loja -n terminal --watch=false');
  cap('term-describe-prazo', 'kubectl describe deploy loja -n terminal');
  cap('term-condicoes-prazo', `kubectl get deploy loja -n terminal -o jsonpath='{range .status.conditions[*]}{.type} {.status} {.reason} {.message}{"\\n"}{end}'`);
};
