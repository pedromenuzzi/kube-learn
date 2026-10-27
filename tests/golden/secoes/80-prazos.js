// A gêmea de scripts/golden/80-prazos.sh no simulador (namespace prazos): --timeout e --since sem unidade, com
// unidade desconhecida ou vazios (o erro da flag Duration), e o describe all NOME, que o kubectl recusa.
export default ({ k, cap }) => {
  k('kubectl create namespace prazos');
  k('kubectl -n prazos create deployment web --image=nginx:1.27');
  k('kubectl -n prazos expose deployment web --port=80');
  k('kubectl -n prazos rollout status deploy/web --timeout=180s');
  cap('prazos-wait-sem-unidade', 'kubectl -n prazos wait --for=condition=Available deploy/web --timeout=30');
  cap('prazos-rollout-sem-unidade', 'kubectl -n prazos rollout status deploy/web --timeout=5');
  cap('prazos-drain-sem-unidade', 'kubectl drain node-1 --ignore-daemonsets --timeout=30');
  cap('prazos-logs-sem-unidade', 'kubectl -n prazos logs deploy/web --since=30');
  cap('prazos-unidade-desconhecida', 'kubectl -n prazos rollout status deploy/web --timeout=1d');
  cap('prazos-timeout-vazio', 'kubectl -n prazos wait --for=condition=Available deploy/web --timeout=');
  cap('prazos-timeout-texto', 'kubectl -n prazos wait --for=delete pod/x --timeout=abc');
  cap('prazos-describe-all-nome', 'kubectl -n prazos describe all web');
  cap('prazos-describe-all-nada', 'kubectl -n prazos describe all nada');
  cap('prazos-describe-tipos-nada', 'kubectl -n prazos describe svc,deploy nada');
};
