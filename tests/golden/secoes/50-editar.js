// A gêmea de scripts/golden/50-editar.sh no simulador (namespace editar): o kubectl edit com o KUBE_EDITOR (cat, sed e o
// /tmp/kl-editor.sh, que aqui é uma função: a troca do sed e, no arquivo reaberto com o erro, mostra os comentários do
// topo e desiste) e o kubectl explain em inglês.
import { editarSemTela, kubeEditor } from '../../../src/k8s/kubectl/editar.js';

export default ({ c, k, cap }) => {
  const webPronto = (n) => () => {
    const d = c.obter('Deployment', 'editar', 'web');
    return d?.status?.availableReplicas === n && d.status.updatedReplicas === n && d.status.replicas === n;
  };
  // O /tmp/kl-editor.sh: TROCA (o sed) na primeira vez; reaberto com o erro, mostra (grep ^# ou cat) e não muda nada.
  const editor = (troca, mostrar = 'grep') => (texto) => (texto.includes('was not valid')
    ? { texto, saida: mostrar === 'cat' ? texto : `${texto.split('\n').filter((l) => l.startsWith('#')).join('\n')}\n` }
    : kubeEditor(`sed -i '${troca}'`)(texto));
  const editar = (nome, troca, mostrar) => cap(nome, () => editarSemTela(c, 'kubectl edit deploy/web -n editar', editor(troca, mostrar)));

  k('kubectl create namespace editar');
  k('kubectl apply -f /tmp/kl-editar-web.yaml');
  c.avancarAte(webPronto(1), '3m');
  k('kubectl -n editar create configmap cores --from-literal=cor=azul');
  cap('editar-texto', 'KUBE_EDITOR=cat kubectl edit deployment web -n editar');
  editar('editar-seletor', 's/app: web/app: outro/', 'cat');
  editar('editar-desconhecido', 's/progressDeadlineSeconds: 600/progressDeadline: 600/');
  editar('editar-tipo', 's/^  replicas: 1$/  replicas: tres/');
  editar('editar-negativo', 's/^  replicas: 1$/  replicas: -1/');
  editar('editar-nome', 's/^  name: web$/  name: web2/');
  editar('editar-vazio', 's/.*//');
  cap('editar-replicas', `KUBE_EDITOR="sed -i 's/replicas: 1/replicas: 2/'" kubectl edit deploy/web -n editar`);
  c.avancarAte(webPronto(2), '3m');
  cap('editar-get', 'kubectl get deploy web -n editar');
  cap('editar-cm', 'KUBE_EDITOR="sed -i s/azul/verde/" kubectl edit cm cores -n editar');
  cap('editar-lista', 'KUBE_EDITOR="sed -i s/verde/roxo/" kubectl edit cm/cores deploy/web -n editar');
  cap('editar-json', 'KUBE_EDITOR=cat kubectl edit cm cores -n editar -o json');
  cap('editar-nao-existe', 'KUBE_EDITOR=cat kubectl edit deploy nada -n editar');
  cap('editar-sem-objetos', 'KUBE_EDITOR=cat kubectl edit deploy -n kube-public');
  cap('editar-sem-nome', 'KUBE_EDITOR=cat kubectl edit');
  k('kubectl create role leitor -n editar --verb=get,list --resource=deployments,configmaps');
  k('kubectl create rolebinding leitor -n editar --role=leitor --user=ana');
  cap('editar-as-sem-get', 'KUBE_EDITOR=cat kubectl edit deploy/web -n editar --as=bia');
  cap('editar-as-sem-patch', 'KUBE_EDITOR="sed -i s/roxo/azul/" kubectl edit cm/cores -n editar --as=ana');

  for (const alvo of ['deployment.spec', 'deployment.spec.strategy.type', 'pod', 'pod.spec.containers.env', 'pod.spec.containers.ports',
    'pod.spec.tolerations', 'pod.spec.affinity', 'service', 'service.spec.ports', 'secret', 'namespace', 'cronjob.spec', 'ingress.spec',
    'role.rules', 'poddisruptionbudget.spec', 'daemonset.spec']) cap(`explain-en-${alvo}`, `kubectl explain ${alvo}`);
};
