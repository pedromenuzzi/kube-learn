# ---------- Durações e o describe all (namespace prazos): --timeout e --since são time.Duration do Go (sem unidade, com
# unidade desconhecida ou vazio, o pflag recusa antes de rodar), e o describe all NOME, que o kubectl recusa (a
# categoria all são vários tipos, e a busca por prefixo exige um só).
# A gêmea no simulador: tests/golden/secoes/80-prazos.js.
kc create namespace prazos >/dev/null 2>&1
kc -n prazos create deployment web --image=nginx:1.27 >/dev/null 2>&1
kc -n prazos expose deployment web --port=80 >/dev/null 2>&1
kc -n prazos rollout status deploy/web --timeout=180s >/dev/null 2>&1
cap prazos-wait-sem-unidade kc -n prazos wait --for=condition=Available deploy/web --timeout=30
cap prazos-rollout-sem-unidade kc -n prazos rollout status deploy/web --timeout=5
cap prazos-drain-sem-unidade kc drain node-1 --ignore-daemonsets --timeout=30
cap prazos-logs-sem-unidade kc -n prazos logs deploy/web --since=30
cap prazos-unidade-desconhecida kc -n prazos rollout status deploy/web --timeout=1d
cap prazos-timeout-vazio kc -n prazos wait --for=condition=Available deploy/web --timeout=
cap prazos-timeout-texto kc -n prazos wait --for=delete pod/x --timeout=abc
cap prazos-describe-all-nome kc -n prazos describe all web
cap prazos-describe-all-nada kc -n prazos describe all nada
cap prazos-describe-tipos-nada kc -n prazos describe svc,deploy nada
