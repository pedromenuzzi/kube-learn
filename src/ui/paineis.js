// Os painéis que mostram o cluster por dentro: o mapa (nodes com os pods dentro), a árvore de recursos e os eventos.
import { escapar } from './util.js';
import { resumoPod, enderecosEndpoints } from '../k8s/kubectl/tabelas.js';
import { kubectl } from '../k8s/kubectl/index.js';
import { nodePronto } from '../k8s/scheduler.js';

const CLASSE = (status) => (status === 'Running' ? 'ok' : /Completed|Succeeded/.test(status) ? 'fim' : /Pending|ContainerCreating|Terminating/.test(status) ? 'espera' : 'ruim');

/** Mapa: um bloco por node, com os pods de cada namespace de aplicação (o kube-system fica de lado). */
export function htmlCluster(c, { sistema = false } = {}) {
  const pods = c.listar('Pod').filter((p) => sistema || p.metadata.namespace !== 'kube-system');
  const semNode = pods.filter((p) => !p.spec.nodeName);
  const bloco = (titulo, lista, extra = '') => `
    <li class="node">
      <h4>${titulo}${extra}</h4>
      ${lista.length ? `<ul class="pods">${lista.map((p) => {
    const r = resumoPod(p, c.agora);
    return `<li class="pod pod-${CLASSE(r.status)}"><span class="pod-nome">${escapar(p.metadata.name)}</span> <span class="pod-status">${escapar(r.status)}</span>${p.metadata.namespace !== 'default' ? ` <span class="pod-ns">${escapar(p.metadata.namespace)}</span>` : ''}</li>`;
  }).join('')}</ul>` : '<p class="vazio">nenhum pod</p>'}
    </li>`;
  return `<ul class="mapa">
    ${c.listar('Node').map((n) => bloco(`🏢 ${escapar(n.metadata.name)}`, pods.filter((p) => p.spec.nodeName === n.metadata.name),
    `<span class="node-status">${nodePronto(n) ? 'Ready' : 'NotReady'}${n.metadata.labels['node-role.kubernetes.io/control-plane'] !== undefined ? ' · control-plane' : ''}</span>`)).join('')}
    ${semNode.length ? bloco('⏳ esperando lugar (Pending)', semNode) : ''}
  </ul>`;
}

/** Árvore: Deployment → ReplicaSet → Pods, Service → endpoints, e o que mais existir no namespace default. */
export function htmlRecursos(c, ns = 'default') {
  const dono = (o) => o.metadata.ownerReferences?.find((r) => r.controller)?.uid;
  const filhos = (uid, kind) => c.listar(kind, ns).filter((o) => dono(o) === uid);
  const pod = (p) => {
    const r = resumoPod(p, c.agora);
    return `<li><span class="tipo">pod</span> ${escapar(p.metadata.name)} <span class="pod-${CLASSE(r.status)}">${escapar(r.status)}</span></li>`;
  };
  const rs = (r) => `<li><span class="tipo">replicaset</span> ${escapar(r.metadata.name)} (${r.status?.readyReplicas ?? 0}/${r.spec.replicas})
    <ul>${filhos(r.metadata.uid, 'Pod').map(pod).join('')}</ul></li>`;
  const itens = [
    ...c.listar('Deployment', ns).map((d) => `<li><span class="tipo">deployment</span> ${escapar(d.metadata.name)} (${d.status?.readyReplicas ?? 0}/${d.spec.replicas})
      <ul>${filhos(d.metadata.uid, 'ReplicaSet').filter((r) => r.spec.replicas || r.status?.replicas).map(rs).join('')}</ul></li>`),
    ...c.listar('ReplicaSet', ns).filter((r) => !dono(r)).map(rs),
    ...c.listar('Pod', ns).filter((p) => !dono(p)).map(pod),
    ...c.listar('Service', ns).map((s) => {
      const ep = c.obter('Endpoints', ns, s.metadata.name);
      return `<li><span class="tipo">service</span> ${escapar(s.metadata.name)} ${escapar(s.spec.clusterIP ?? '')} → <span class="${ep && enderecosEndpoints(ep) !== '<none>' ? '' : 'pod-ruim'}">${escapar(ep ? enderecosEndpoints(ep) : '<none>')}</span></li>`;
    }),
    ...c.listar('ConfigMap', ns).filter((m) => m.metadata.name !== 'kube-root-ca.crt').map((m) => `<li><span class="tipo">configmap</span> ${escapar(m.metadata.name)}</li>`),
    ...c.listar('Secret', ns).map((s) => `<li><span class="tipo">secret</span> ${escapar(s.metadata.name)}</li>`),
  ];
  return itens.length ? `<ul class="arvore">${itens.join('')}</ul>` : `<p class="vazio">Nada no namespace ${ns} ainda.</p>`;
}

export function htmlEventos(c) {
  const r = kubectl(c, 'kubectl get events -A --field-selector metadata.namespace!=kube-system');
  return `<pre class="eventos">${escapar(r.saida.trim() || 'Nenhum evento.')}</pre>`;
}
