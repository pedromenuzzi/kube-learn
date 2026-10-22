// A gêmea de scripts/golden/10-oficina.sh no simulador (namespace oficina): -o custom-columns, --sort-by, -L,
// kubectl events, patch, set env/resources/image, os geradores com --dry-run=client -o yaml, auth can-i --list e
// logs --since.
// Cada linha do script vira uma linha aqui, na mesma ordem.
export default ({ c, k, cap }) => {
  const pronto = (p) => p.status?.conditions?.some((x) => x.type === 'Ready' && x.status === 'True');
  const todosProntos = () => c.listar('Pod', 'oficina').every(pronto);
  const webPronto = () => {
    const d = c.obter('Deployment', 'oficina', 'web');
    return d?.status?.availableReplicas === 2 && d.status.updatedReplicas === 2;
  };
  const sh = (linhas) => linhas.trim().split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const [nome, ...cmd] = l.split(' ');
    cap(nome, `kubectl ${cmd.join(' ')}`);
  });

  k('kubectl create namespace oficina');
  k('kubectl -n oficina create deployment web --image=nginx:1.27 --replicas=2');
  k('kubectl -n oficina run bb --image=busybox:1.36 --labels=app=bb,tier=back -- sleep 3600');
  c.avancarAte(() => webPronto() && todosProntos(), '3m');

  sh(`
    oficina-cc -n oficina get pods -o 'custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[*].image,LABELS:.metadata.labels,NADA:.spec.nada'
    oficina-cc-sem-cabecalho -n oficina get pods -o custom-columns=NAME:metadata.name --no-headers
    oficina-cc-chaves -n oficina get pods -o 'custom-columns=NAME:{.metadata.name},FASE:.status.phase'
    oficina-cc-valores -n oficina get pod bb -o 'custom-columns=ARGS:.spec.containers[0].args,R:.status.containerStatuses[0].restartCount,READY:.status.containerStatuses[0].ready'
    oficina-cc-tipos -n oficina get pod,deploy -o custom-columns=NAME:.metadata.name,KIND:.kind
    oficina-cc-nada -n oficina get svc -o custom-columns=NAME:.metadata.name
    oficina-cc-um-errado -n oficina get pod bb nada -o custom-columns=NAME:.metadata.name
    oficina-cc-vazio -n oficina get pods -o custom-columns=
    oficina-cc-sem-spec -n oficina get pods -o custom-columns
    oficina-cc-sem-caminho -n oficina get pods -o custom-columns=NAME
    oficina-cc-chave-aberta -n oficina get pods -o 'custom-columns=NAME:{.metadata.name'
    oficina-get-formato-ruim -n oficina get pods -o foo

    oficina-sort-nome -n oficina get pods --sort-by=.metadata.name -o name
    oficina-sort-label -n oficina get pods --sort-by=.metadata.labels.tier
    oficina-sort-label-cc -n oficina get pods --sort-by=metadata.labels.tier -o custom-columns=NAME:.metadata.name
    oficina-sort-falta -n oficina get pods -l app=web --sort-by=.spec.nada
    oficina-sort-falta-um -n oficina get pod bb --sort-by=.spec.nada
    oficina-sort-falta-name -n oficina get pods --sort-by=.spec.nada -o name
    oficina-sort-falta-yaml -n oficina get pods -l app=bb --sort-by=.spec.nada -o yaml
    oficina-sort-um-name -n oficina get pod bb --sort-by=.spec.nada -o name
    oficina-sort-tipos -n oficina get pods,deploy --sort-by=.metadata.name
    oficina-sort-tipos-name -n oficina get pods,deploy --sort-by=.metadata.name -o name
    oficina-sort-caminho -n oficina get pods --sort-by='{.metadata.name' -o name
    oficina-sort-um-deploy -n oficina get deploy --sort-by=.spec.nada

    oficina-label-col -n oficina get pods -l app=bb -L app,tier
    oficina-label-col-show -n oficina get pods -l app=bb -L app -L tier --show-labels
    oficina-label-col-wide -n oficina get deploy -L app.kubernetes.io/name,app -o wide
  `);

  k("kubectl -n oficina run cai --image=busybox:1.36 -- sh -c 'sleep 1; exit 1'");
  c.avancar('25s');
  cap('oficina-sort-restarts', 'kubectl -n oficina get pods --sort-by=.status.containerStatuses[0].restartCount -o custom-columns=NAME:.metadata.name');
  k('kubectl -n oficina delete pod cai --now');

  k('kubectl apply -f /tmp/kl-of-tropeco.yaml');
  c.avancarAte(() => c.obter('Job', 'oficina', 'tropeco')?.status?.conditions?.some((x) => x.type === 'Failed' && x.status === 'True'), '90s');
  sh(`
    oficina-events-for events -n oficina --for job/tropeco
    oficina-events-warning events -n oficina --types=Warning --for=job/tropeco
    oficina-events-tipos events -n oficina --types Normal,warning --for job/tropeco
    oficina-events-deploy events -n oficina --for deploy/web
    oficina-events-sem-cabecalho events -n oficina --for deployment.apps/web --no-headers
    oficina-events-todos events -A --for job/tropeco
    oficina-events-jsonpath events -n oficina --for job/tropeco -o 'jsonpath={.items[*].reason}'
    oficina-events-nenhum events -n oficina --for pod/naoexiste
    oficina-events-tipo-ruim events -n oficina --types=Nada
    oficina-events-for-sem-nome events -n oficina --for job
    oficina-events-for-tipo-ruim events -n oficina --for nada/x
    oficina-events-formato events -n oficina --for job/tropeco -o wide
    oficina-get-events-ordem get events -n oficina --field-selector involvedObject.name=tropeco --sort-by=.lastTimestamp
    oficina-get-events-ordem-criacao get events -n oficina --field-selector involvedObject.name=tropeco --sort-by=.metadata.creationTimestamp -o custom-columns=REASON:.reason,TYPE:.type
  `);

  sh(`
    oficina-patch -n oficina patch deploy web -p '{"spec":{"replicas":3}}'
    oficina-patch-igual -n oficina patch deploy web -p '{"spec":{"replicas":3}}'
    oficina-patch-merge -n oficina patch deploy web --type merge -p '{"metadata":{"labels":{"time":"azul"}}}'
    oficina-patch-json -n oficina patch deploy web --type=json -p '[{"op":"replace","path":"/spec/replicas","value":2}]'
    oficina-patch-yaml -n oficina patch deploy web -p 'spec: {replicas: 2}'
    oficina-patch-arquivo -n oficina patch deploy web --patch-file /tmp/kl-of-patch.json
    oficina-patch-conteiner -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"lado","image":"busybox:1.36","command":["sleep","3600"]}]}}}}'
    oficina-patch-conteiner-ordem -n oficina get deploy web -o 'jsonpath={.spec.template.spec.containers[*].name}'
    oficina-patch-apaga -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"lado","$patch":"delete"}]}}}}'
    oficina-patch-apaga-de-novo -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"lado","$patch":"delete"}]}}}}'
    oficina-patch-env-a -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","env":[{"name":"A","value":"1"}]}]}}}}'
    oficina-patch-env-b -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","env":[{"name":"B","value":"2"}]}]}}}}'
    oficina-patch-env-ordem -n oficina get deploy web -o 'jsonpath={.spec.template.spec.containers[0].env}'
    oficina-patch-merge-lista -n oficina patch deploy web --type merge -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","image":"nginx:1.27","env":[{"name":"B","value":"2"},{"name":"A","value":"1"}]}]}}}}'
    oficina-patch-json-add -n oficina patch deploy web --type json -p '[{"op":"add","path":"/metadata/labels/novo","value":"sim"}]'
    oficina-patch-nulo -n oficina patch deploy/web -p '{"metadata":{"labels":{"novo":null}}}'
    oficina-patch-varios -n oficina patch deploy web svc web -p '{"metadata":{"labels":{"x":"y"}}}'
    oficina-patch-name -n oficina patch deploy web -p '{"spec":{"replicas":2}}' -o name
    oficina-patch-dry -n oficina patch deploy web -p '{"spec":{"replicas":4}}' --dry-run=client
    oficina-patch-desconhecido -n oficina patch deploy web -p '{"spec":{"replica":2}}'
    oficina-patch-desconhecido-lista -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","imagem":"nginx:1.27"}]}}}}'
    oficina-patch-tipo -n oficina patch deploy web -p '{"spec":{"replicas":"2"}}'
    oficina-patch-tipo-bool -n oficina patch deploy web -p '{"spec":{"paused":"sim"}}'
    oficina-patch-invalido -n oficina patch deploy web -p '{"spec":{"replicas":-1}}'
    oficina-patch-seletor -n oficina patch deploy web -p '{"spec":{"selector":{"matchLabels":{"app":"outro"}}}}'
    oficina-patch-nome -n oficina patch deploy web -p '{"metadata":{"name":"outro"}}'
    oficina-patch-sem-chave -n oficina patch deploy web -p '{"spec":{"template":{"spec":{"containers":[{"image":"nginx:1.27"}]}}}}'
    oficina-patch-sem-p -n oficina patch deploy web
    oficina-patch-dois -n oficina patch deploy web -p '{}' --patch-file /tmp/kl-of-patch.json
    oficina-patch-arquivo-nada -n oficina patch deploy web --patch-file /tmp/kl-of-nada.json
    oficina-patch-json-quebrado -n oficina patch deploy web -p '{bad'
    oficina-patch-yaml-quebrado -n oficina patch deploy web -p 'a: b: c'
    oficina-patch-lista -n oficina patch deploy web -p '[]'
    oficina-patch-merge-lista-ruim -n oficina patch deploy web --type merge -p '[]'
    oficina-patch-json-objeto -n oficina patch deploy web --type json -p '{"spec":{}}'
    oficina-patch-json-falha -n oficina patch deploy web --type json -p '[{"op":"replace","path":"/spec/nada/x","value":1}]'
    oficina-patch-json-teste -n oficina patch deploy web --type json -p '[{"op":"test","path":"/spec/replicas","value":9}]'
    oficina-patch-tipo-ruim -n oficina patch deploy web --type xml -p '{}'
    oficina-patch-nao-existe -n oficina patch deploy nada -p '{}'
    oficina-patch-sem-nome -n oficina patch deploy -p '{}'
    oficina-patch-sem-recurso -n oficina patch -p '{}'
  `);
  k('kubectl -n oficina expose deploy web --port 80');
  sh(`
    oficina-patch-svc-porta -n oficina patch svc web -p '{"spec":{"ports":[{"port":8080,"targetPort":80,"name":"alt"}]}}'
    oficina-patch-svc-tipo -n oficina patch svc web --type merge -p '{"spec":{"type":"NodePort"}}'
  `);

  k('kubectl -n oficina create configmap cfg --from-literal=cor=azul --from-literal=log.level=debug --from-literal=TAMANHO=g');
  k('kubectl -n oficina create secret generic seg --from-literal=senha=x');
  sh(`
    oficina-set-env -n oficina set env deploy/web MODO=teste
    oficina-set-env-igual -n oficina set env deploy/web MODO=teste
    oficina-set-env-lista -n oficina set env deploy/web --list
    oficina-set-env-from -n oficina set env deploy/web --from=configmap/cfg
    oficina-set-env-prefixo -n oficina set env deploy/web --from=secret/seg --prefix=APP_
    oficina-set-env-lista-from -n oficina set env deploy/web --list
    oficina-set-env-resolve -n oficina set env deploy/web --list --resolve
    oficina-set-env-chaves -n oficina set env deploy/web --keys=cor --from=configmap/cfg
    oficina-set-env-tira -n oficina set env deploy/web MODO-
    oficina-set-env-tira-nada -n oficina set env deploy/web NADA-
    oficina-set-env-conteiner -n oficina set env deploy/web A=1 -c nada
    oficina-set-env-sem-sobrescrever -n oficina set env deploy/web A=2 --overwrite=false
    oficina-set-env-nome-ruim -n oficina set env deploy/web 1A=x
    oficina-set-env-svc -n oficina set env svc/web A=1
    oficina-set-env-from-nada -n oficina set env deploy/web --from=configmap/nada
    oficina-set-env-dry -n oficina set env deploy/web C=3 --dry-run=client
    oficina-set-env-dois -n oficina set env deploy/web A=9 B=8
    oficina-set-env-nao-existe -n oficina set env deploy/nada A=1
    oficina-set-res -n oficina set resources deploy/web --requests=cpu=100m,memory=64Mi
    oficina-set-res-igual -n oficina set resources deploy/web --requests=cpu=100m,memory=64Mi
    oficina-set-res-limite -n oficina set resources deploy/web --limits=cpu=200m -c nginx
    oficina-set-res-ver -n oficina get deploy web -o 'jsonpath={.spec.template.spec.containers[0].resources}'
    oficina-set-res-nada -n oficina set resources deploy/web
    oficina-set-res-conteiner -n oficina set resources deploy/web --limits=cpu=200m -c nada
    oficina-set-res-quantidade -n oficina set resources deploy/web --limits=cpu=abc
    oficina-set-res-sintaxe -n oficina set resources deploy/web --limits=cpu
    oficina-set-res-dry -n oficina set resources deploy/web --requests=cpu=0 --dry-run=client
    oficina-set-res-name -n oficina set resources deploy/web --requests=memory=128Mi --limits=memory=256Mi -o name
    oficina-set-res-svc -n oficina set resources svc/web --limits=cpu=1
    oficina-set-image-igual -n oficina set image deploy/web nginx=nginx:1.27
    oficina-set-image-dry -n oficina set image deploy/web nginx=nginx:1.28 --dry-run=client
    oficina-set-image-conteiner -n oficina set image deploy/web nada=nginx:1.27
    oficina-set-image-svc -n oficina set image svc/web a=b
    oficina-set-sem-sub -n oficina set
    oficina-set-sub-ruim -n oficina set nada
  `);

  k('kubectl apply -f /tmp/kl-of-limpa.yaml');
  sh(`
    oficina-gera-deploy -n oficina create deployment api --image=nginx:1.27 --replicas=3 --port=8080 --dry-run=client -o yaml
    oficina-gera-deploy-duas -n oficina create deployment multi --image=nginx:1.27 --image=busybox:1.36 --dry-run=client -o yaml
    oficina-gera-svc -n oficina create service clusterip api --tcp=80:8080 --dry-run=client -o yaml
    oficina-gera-svc-nodeport -n oficina create service nodeport api --tcp=80:8080 --node-port=30080 --dry-run=client -o yaml
    oficina-gera-svc-headless -n oficina create service clusterip sem --clusterip=None --dry-run=client -o yaml
    oficina-gera-svc-lb -n oficina create service loadbalancer lb --tcp=80 --dry-run=client -o yaml
    oficina-gera-svc-sem-porta -n oficina create service clusterip semporta --dry-run=client -o yaml
    oficina-gera-svc-externo -n oficina create service externalname ext --external-name=example.com --dry-run=client -o yaml
    oficina-gera-svc-externo-sem -n oficina create service externalname ext2 --dry-run=client -o yaml
    oficina-gera-cm -n oficina create configmap cfg2 --from-literal=cor=azul --from-literal=modo=1 --from-file=/tmp/kl-of-app.conf --dry-run=client -o yaml
    oficina-gera-cm-chave -n oficina create configmap cfg3 --from-file=app=/tmp/kl-of-app.conf --dry-run=client -o yaml
    oficina-gera-secret -n oficina create secret generic seg2 --from-literal=senha=s3cr3t --dry-run=client -o yaml
    oficina-gera-secret-tipo -n oficina create secret generic seg3 --from-literal=a=b --type=kubernetes.io/basic-auth --dry-run=client -o yaml
    oficina-gera-job -n oficina create job tarefa --image=busybox:1.36 --dry-run=client -o yaml -- sh -c 'echo oi'
    oficina-gera-job-from -n oficina create job manual --from=cronjob/limpa --dry-run=client -o yaml
    oficina-gera-cronjob -n oficina create cronjob relogio --image=busybox:1.36 --schedule='*/1 * * * *' --dry-run=client -o yaml -- date
    oficina-gera-cronjob-never -n oficina create cronjob relogio2 --image=busybox:1.36 --schedule='*/1 * * * *' --restart=Never --dry-run=client -o yaml
    oficina-gera-run -n oficina run p1 --image=nginx:1.27 --port=80 --labels=app=p1,tier=web --env=A=1 --env=B=2 --dry-run=client -o yaml
    oficina-gera-run-command -n oficina run p2 --image=busybox:1.36 --command --dry-run=client -o yaml -- sleep 3600
    oficina-gera-run-never -n oficina run p3 --image=busybox:1.36 --restart=Never --dry-run=client -o yaml -- echo oi
    oficina-gera-expose -n oficina expose deploy web --port=80 --target-port=8080 --dry-run=client -o yaml
    oficina-gera-expose-nodeport -n oficina expose deploy web --port=80 --type=NodePort --name=web-np --dry-run=client -o yaml
    oficina-gera-expose-udp -n oficina expose deploy web --port=80 --protocol=UDP --dry-run=client -o yaml
    oficina-gera-expose-pod -n oficina expose pod bb --port=80 --dry-run=client -o yaml
    oficina-gera-autoscale -n oficina autoscale deploy web --max=3 --dry-run=client -o yaml
    oficina-gera-ns -n oficina create namespace teste --dry-run=client -o yaml
    oficina-gera-ingress -n oficina create ingress ing --class=nginx --rule=foo.com/api*=api:http --rule=bar.com/=web:80,tls=certificado --dry-run=client -o yaml
    oficina-gera-ingress-padrao -n oficina create ingress ing3 --default-backend=web:80 --dry-run=client -o yaml
    oficina-gera-ingress-sem-host -n oficina create ingress ing4 --rule=/=web:80 --dry-run=client -o yaml
    oficina-gera-ingress-mesmo-host -n oficina create ingress ing8 --rule=foo.com/a=web:80,tls --rule=foo.com/b=web:80 --annotation=a=b --dry-run=client -o yaml
    oficina-gera-ingress-nada -n oficina create ingress ing5 --dry-run=client -o yaml
    oficina-gera-ingress-ruim -n oficina create ingress ing6 --rule=foo.com=web:80 --dry-run=client -o yaml
    oficina-gera-quota -n oficina create quota q --hard=cpu=1,memory=1Gi,pods=4 --dry-run=client -o yaml
    oficina-gera-quota-vazia -n oficina create quota q3 --dry-run=client -o yaml
    oficina-gera-pdb -n oficina create pdb guarda --selector=app=web --min-available=1 --dry-run=client -o yaml
    oficina-gera-pdb-pct -n oficina create pdb guarda2 --selector=app=web --max-unavailable=50% --dry-run=client -o yaml
    oficina-gera-pdb-conjunto -n oficina create pdb guarda6 --selector='app in (b,a),tier=x,!z,w' --min-available=1 --dry-run=client -o yaml
    oficina-gera-pdb-sem-numero -n oficina create pdb guarda3 --selector=app=web --dry-run=client -o yaml
    oficina-gera-pdb-sem-seletor -n oficina create pdb guarda5 --min-available=1 --dry-run=client -o yaml
    oficina-gera-pdb-dois -n oficina create pdb guarda4 --selector=app=web --min-available=1 --max-unavailable=1 --dry-run=client -o yaml
    oficina-gera-pdb-diferente -n oficina create pdb guarda7 --selector=app!=web --min-available=1 --dry-run=client -o yaml
  `);

  k('kubectl -n oficina create serviceaccount leitor');
  k('kubectl -n oficina create role leitor --verb=get,list,watch --resource=pods,services --resource=deployments.apps');
  k('kubectl -n oficina create role log --verb=get --resource=pods/log --resource-name=bb');
  k('kubectl -n oficina create rolebinding leitor --role=leitor --serviceaccount=oficina:leitor');
  k('kubectl -n oficina create rolebinding log --role=log --serviceaccount=oficina:leitor');
  sh(`
    oficina-auth-lista-sa auth can-i --list -n oficina --as=system:serviceaccount:oficina:leitor
    oficina-auth-lista-outro-ns auth can-i --list -n default --as=system:serviceaccount:oficina:leitor
    oficina-auth-lista-usuario auth can-i --list -n oficina --as=ana
    oficina-auth-lista-sem-cabecalho auth can-i --list -n oficina --as=ana --no-headers
    oficina-auth-lista-admin auth can-i --list -n oficina
    oficina-auth-lista-args auth can-i --list get pods
  `);

  k("kubectl -n oficina run conta --image=busybox:1.36 -- sh -c 'echo inicio; sleep 15; echo depois; sleep 3600'");
  c.avancarAte(() => pronto(c.obter('Pod', 'oficina', 'conta')), '2m');
  c.avancar('30s');
  sh(`
    oficina-logs-since-curto -n oficina logs conta --since=5s
    oficina-logs-since -n oficina logs conta --since=20s
    oficina-logs-since-longo -n oficina logs conta --since=1h
    oficina-logs-since-tail -n oficina logs conta --since=1h --tail=1
    oficina-logs-since-zero -n oficina logs conta --since=0s
    oficina-logs-since-ruim -n oficina logs conta --since=abc
    oficina-logs-since-negativo -n oficina logs conta --since=-5s
    oficina-logs-since-dois -n oficina logs conta --since=5s --since-time=2026-10-22T17:00:00Z
    oficina-logs-since-time-ruim -n oficina logs conta --since-time=ontem
  `);
};
