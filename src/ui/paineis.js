// Os painéis que mostram o cluster por dentro: o mapa (nodes com os pods dentro), a árvore de recursos e os eventos.
import { escapar } from './util.js';
import { resumoPod, enderecosEndpoints, alvosHpa } from '../k8s/kubectl/tabelas.js';
import { kubectl } from '../k8s/kubectl/index.js';
import { nodePronto, usoDoNode } from '../k8s/scheduler.js';
import { cpuMili, bytes } from '../k8s/unidades.js';

const CLASSE = (status) => (status === 'Running' ? 'ok' : /Completed|Succeeded/.test(status) ? 'fim' : /Pending|ContainerCreating|Terminating/.test(status) ? 'espera' : 'ruim');
const ICONE = (status) => ({ Running: '✅', Pending: '⏳', ContainerCreating: '⏳', Terminating: '🚚', Completed: '🏁', Succeeded: '🏁', CrashLoopBackOff: '💥', ImagePullBackOff: '📦', ErrImagePull: '📦', Error: '❌', CreateContainerConfigError: '✉️' }[status] ?? '⚠️');

/** A legenda fixa do mapa (fica fora da parte que se redesenha a cada segundo). */
export const htmlLegendaMapa = (sistema) => `
  <p class="mapa-legenda">🏢 cada node é um prédio, cada pod um apartamento.
    <span>✅ rodando</span> <span>⏳ subindo</span> <span>💥 caindo</span> <span>📦 imagem não veio</span> <span>🚚 saindo</span> <span>🏁 terminou</span></p>
  <p><label><input type="checkbox" name="sistema"${sistema ? ' checked' : ''}> Mostrar a administração (kube-system e local-path-storage)</label></p>`;

const barra = (rotulo, usado, total, texto) => {
  const pct = total ? Math.min(100, Math.round((usado / total) * 100)) : 0;
  return `<div class="uso"><span>${rotulo}</span><span class="uso-barra" aria-hidden="true"><span style="width:${pct}%" class="${pct > 85 ? 'uso-alto' : ''}"></span></span><span>${texto} (${pct}%)</span></div>`;
};
const cpuTxt = (m) => (m % 1000 === 0 ? `${m / 1000}` : `${m}m`);
const memTxt = (b) => (b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)}Gi` : `${Math.round(b / 2 ** 20)}Mi`);

/** Mapa: um prédio por node (com o quanto já foi reservado), os pods dentro, e os ramais (Services) e portarias. */
export function htmlCluster(c, { sistema = false } = {}) {
  const SISTEMA = ['kube-system', 'local-path-storage'];
  const pods = c.listar('Pod').filter((p) => sistema || !SISTEMA.includes(p.metadata.namespace));
  const semNode = pods.filter((p) => !p.spec.nodeName);
  const apto = (p) => {
    const r = resumoPod(p, c.agora);
    return `<li class="pod pod-${CLASSE(r.status)}"><span aria-hidden="true">${ICONE(r.status)}</span> <span class="pod-nome">${escapar(p.metadata.name)}</span>
      <span class="pod-status">${escapar(r.status)}</span> <span class="pod-ns">${r.pronto}${r.reinicios !== '0' ? ` · ${escapar(r.reinicios)} reinícios` : ''}${p.metadata.namespace !== 'default' ? ` · ${escapar(p.metadata.namespace)}` : ''}</span></li>`;
  };
  const predio = (n) => {
    const uso = usoDoNode(c, n.metadata.name);
    const cap = n.status.allocatable;
    const meus = pods.filter((p) => p.spec.nodeName === n.metadata.name);
    const cp = n.metadata.labels['node-role.kubernetes.io/control-plane'] !== undefined;
    return `<li class="node${nodePronto(n) ? '' : ' node-caido'}">
      <h4>🏢 ${escapar(n.metadata.name)} <span class="node-status">${nodePronto(n) ? 'Ready' : 'NotReady'}${cp ? ' · administração' : ''}${n.spec.unschedulable ? ' · interditado' : ''}</span></h4>
      ${barra('CPU', uso.cpu, cpuMili(cap.cpu), `${cpuTxt(uso.cpu)} de ${cap.cpu}`)}
      ${barra('Memória', uso.memoria, bytes(cap.memory), `${memTxt(uso.memoria)} de ${memTxt(bytes(cap.memory))}`)}
      ${meus.length ? `<ul class="pods">${meus.map(apto).join('')}</ul>` : '<p class="vazio">nenhum pod</p>'}
    </li>`;
  };
  const servicos = c.listar('Service').filter((s) => sistema || s.metadata.namespace !== 'kube-system').filter((s) => s.metadata.name !== 'kubernetes');
  const ramal = (s) => {
    const ep = c.obter('Endpoints', s.metadata.namespace, s.metadata.name);
    const n = (ep?.subsets ?? []).reduce((t, x) => t + (x.addresses?.length ?? 0), 0);
    const externo = s.status?.loadBalancer?.ingress?.[0]?.ip;
    return `<li class="${n ? '' : 'pod-ruim'}">📞 <b>${escapar(s.metadata.name)}</b>${s.metadata.namespace !== 'default' ? ` (${escapar(s.metadata.namespace)})` : ''}
      <span class="pod-ns">${escapar(s.spec.type)} · ${escapar(s.spec.clusterIP)}${externo ? ` · externo ${externo}` : ''}</span> → ${n ? `${n} pod${n > 1 ? 's' : ''} pronto${n > 1 ? 's' : ''}` : 'ninguém atende'}</li>`;
  };
  const portarias = [
    ...c.listar('Ingress').map((i) => `<li>🚪 <b>${escapar(i.metadata.name)}</b> (Ingress) <span class="pod-ns">${escapar((i.spec.rules ?? []).map((r) => r.host ?? '*').join(', '))} · ${escapar(i.status?.loadBalancer?.ingress?.[0]?.ip ?? 'sem endereço')}</span></li>`),
    ...c.listar('Gateway').map((g) => `<li>🚪 <b>${escapar(g.metadata.name)}</b> (Gateway) <span class="pod-ns">${escapar(g.status?.addresses?.[0]?.value ?? 'sem endereço')}</span></li>`),
  ];
  return `<ul class="mapa">
      ${c.listar('Node').map(predio).join('')}
      ${semNode.length ? `<li class="node node-lobby"><h4>⏳ esperando lugar no lobby (Pending)</h4><ul class="pods">${semNode.map(apto).join('')}</ul></li>` : ''}
    </ul>
    ${servicos.length || portarias.length ? `<h4 class="mapa-sub">Ramais e portarias</h4><ul class="ramais">${[...portarias, ...servicos.map(ramal)].join('')}</ul>` : ''}`;
}

/** Árvore: Deployment → ReplicaSet → Pods, Service → endpoints, e o que mais existir no namespace default. */
export function htmlRecursos(c, ns = 'default') {
  const dono = (o) => o.metadata.ownerReferences?.find((r) => r.controller)?.uid;
  const filhos = (uid, kind) => c.listar(kind, ns).filter((o) => dono(o) === uid);
  const pod = (p) => {
    const r = resumoPod(p, c.agora);
    return `<li><span class="tipo">pod</span> ${escapar(p.metadata.name)} <span class="pod-${CLASSE(r.status)}">${escapar(r.status)}</span></li>`;
  };
  const job = (j) => {
    const fim = j.status?.conditions?.find((x) => (x.type === 'Complete' || x.type === 'Failed') && x.status === 'True')?.type;
    return `<li><span class="tipo">job</span> ${escapar(j.metadata.name)} <span class="${fim === 'Complete' ? 'pod-ok' : fim === 'Failed' ? 'pod-ruim' : 'pod-espera'}">${fim ?? 'Running'}</span> (${j.status?.succeeded ?? 0}/${j.spec.completions ?? 1})
      <ul>${filhos(j.metadata.uid, 'Pod').map(pod).join('')}</ul></li>`;
  };
  const rs = (r) => `<li><span class="tipo">replicaset</span> ${escapar(r.metadata.name)} (${r.status?.readyReplicas ?? 0}/${r.spec.replicas})
    <ul>${filhos(r.metadata.uid, 'Pod').map(pod).join('')}</ul></li>`;
  const itens = [
    ...c.listar('Deployment', ns).map((d) => `<li><span class="tipo">deployment</span> ${escapar(d.metadata.name)} (${d.status?.readyReplicas ?? 0}/${d.spec.replicas})
      <ul>${filhos(d.metadata.uid, 'ReplicaSet').filter((r) => r.spec.replicas || r.status?.replicas).map(rs).join('')}</ul></li>`),
    ...c.listar('ReplicaSet', ns).filter((r) => !dono(r)).map(rs),
    ...c.listar('DaemonSet', ns).map((d) => `<li><span class="tipo">daemonset</span> ${escapar(d.metadata.name)} (${d.status?.numberReady ?? 0}/${d.status?.desiredNumberScheduled ?? 0})
      <ul>${filhos(d.metadata.uid, 'Pod').map(pod).join('')}</ul></li>`),
    ...c.listar('CronJob', ns).map((cj) => `<li><span class="tipo">cronjob</span> ${escapar(cj.metadata.name)} <code>${escapar(cj.spec.schedule)}</code>
      <ul>${filhos(cj.metadata.uid, 'Job').map(job).join('')}</ul></li>`),
    ...c.listar('Job', ns).filter((j) => !dono(j)).map(job),
    ...c.listar('StatefulSet', ns).map((st) => `<li><span class="tipo">statefulset</span> ${escapar(st.metadata.name)} (${st.status?.readyReplicas ?? 0}/${st.spec.replicas})
      <ul>${filhos(st.metadata.uid, 'Pod').map(pod).join('')}</ul></li>`),
    ...c.listar('Pod', ns).filter((p) => !dono(p)).map(pod),
    ...c.listar('Service', ns).map((s) => {
      const ep = c.obter('Endpoints', ns, s.metadata.name);
      return `<li><span class="tipo">service</span> ${escapar(s.metadata.name)} ${escapar(s.spec.clusterIP ?? '')} → <span class="${ep && enderecosEndpoints(ep) !== '<none>' ? '' : 'pod-ruim'}">${escapar(ep ? enderecosEndpoints(ep) : '<none>')}</span></li>`;
    }),
    ...c.listar('HorizontalPodAutoscaler', ns).map((h) => `<li><span class="tipo">hpa</span> ${escapar(h.metadata.name)} → ${escapar(h.spec.scaleTargetRef.name)} <span class="pod-ns">${escapar(alvosHpa(h))} · ${h.status?.currentReplicas ?? 0} réplicas</span></li>`),
    ...c.listar('ResourceQuota', ns).map((q) => `<li><span class="tipo">quota</span> ${escapar(q.metadata.name)} <span class="pod-ns">${escapar(Object.keys(q.spec.hard ?? {}).sort().map((k) => `${k}: ${q.status?.used?.[k] ?? 0}/${q.spec.hard[k]}`).join(', '))}</span></li>`),
    ...c.listar('ConfigMap', ns).filter((m) => m.metadata.name !== 'kube-root-ca.crt').map((m) => `<li><span class="tipo">configmap</span> ${escapar(m.metadata.name)}</li>`),
    ...c.listar('Secret', ns).map((s) => `<li><span class="tipo">secret</span> ${escapar(s.metadata.name)}</li>`),
    ...c.listar('PersistentVolumeClaim', ns).map((v) => `<li><span class="tipo">pvc</span> ${escapar(v.metadata.name)} <span class="${v.status?.phase === 'Bound' ? 'pod-ok' : 'pod-espera'}">${escapar(v.metadata.deletionTimestamp ? 'Terminating' : v.status?.phase ?? 'Pending')}</span>${v.status?.capacity?.storage ? ` ${escapar(v.status.capacity.storage)}` : ''}</li>`),
  ];
  return itens.length ? `<ul class="arvore">${itens.join('')}</ul>` : `<p class="vazio">Nada no namespace ${ns} ainda.</p>`;
}

export function htmlEventos(c) {
  const r = kubectl(c, 'kubectl get events -A --field-selector metadata.namespace!=kube-system');
  return `<pre class="eventos">${escapar(r.saida.trim() || 'Nenhum evento.')}</pre>`;
}
