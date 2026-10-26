// LimitRange e ResourceQuota: o que o apiserver confere ao criar um pod (os plugins LimitRanger e ResourceQuota) e o
// controlador que mantém o "usado" de cada cota em dia.
import { cpuMili, bytes, textoCpu, textoMemoria } from './unidades.js';

const TERMINAIS = new Set(['Succeeded', 'Failed']);
const RECURSOS = ['cpu', 'memory'];
const ehCpu = (r) => r.endsWith('cpu');
const valor = (r, q) => (ehCpu(r) ? cpuMili(q) : bytes(q));
const texto = (r, v) => (r === 'pods' || !/(cpu|memory|storage)$/.test(r) ? String(v) : ehCpu(r) ? textoCpu(v) : textoMemoria(v));

/** LimitRanger: põe os requests e limits padrão em quem não disse nada e confere mínimos e máximos. Erro → mensagem. */
export function aplicarLimites(c, pod) {
  const regras = c.listar('LimitRange', pod.metadata.namespace).flatMap((lr) => (lr.spec?.limits ?? []).filter((l) => l.type === 'Container'));
  if (!regras.length) return null;
  const notas = [];
  for (const ct of [...(pod.spec.initContainers ?? []), ...pod.spec.containers]) {
    const res = (ct.resources ??= {});
    const pedidos = [];
    const limites = [];
    for (const r of RECURSOS) {
      const padraoLimite = regras.find((l) => l.default?.[r])?.default[r];
      const padraoPedido = regras.find((l) => l.defaultRequest?.[r])?.defaultRequest[r];
      if (!res.limits?.[r] && padraoLimite) {
        res.limits = { ...(res.limits ?? {}), [r]: padraoLimite };
        limites.push(r);
      }
      if (!res.requests?.[r] && (padraoPedido || res.limits?.[r])) {
        res.requests = { ...(res.requests ?? {}), [r]: padraoPedido ?? res.limits[r] };
        pedidos.push(r);
      }
    }
    if (pedidos.length) notas.push(`${pedidos.join(', ')} request for container ${ct.name}`);
    if (limites.length) notas.push(`${limites.join(', ')} limit for container ${ct.name}`);
    for (const l of regras) {
      for (const r of RECURSOS) {
        const usado = valor(r, res.limits?.[r] ?? res.requests?.[r]);
        if (l.max?.[r] && usado > valor(r, l.max[r])) return `maximum ${r} usage per Container is ${l.max[r]}, but limit is ${res.limits?.[r] ?? res.requests[r]}`;
        if (l.min?.[r] && valor(r, res.requests?.[r] ?? 0) < valor(r, l.min[r])) return `minimum ${r} usage per Container is ${l.min[r]}, but request is ${res.requests?.[r] ?? 0}`;
      }
    }
  }
  if (notas.length) pod.metadata.annotations = { ...(pod.metadata.annotations ?? {}), 'kubernetes.io/limit-ranger': `LimitRanger plugin set: ${notas.join('; ')}` };
  return null;
}

/** Quanto um pod pesa em cada recurso de cota. */
function pesoDoPod(pod) {
  const soma = (tipo, r) => pod.spec.containers.reduce((t, ct) => t + valor(r, ct.resources?.[tipo]?.[r] ?? 0), 0);
  return {
    pods: 1,
    'requests.cpu': soma('requests', 'cpu'), cpu: soma('requests', 'cpu'),
    'requests.memory': soma('requests', 'memory'), memory: soma('requests', 'memory'),
    'limits.cpu': soma('limits', 'cpu'), 'limits.memory': soma('limits', 'memory'),
  };
}

/** O uso atual de uma cota (pods vivos do namespace e alguns objetos contados). */
export function usoDaCota(c, quota) {
  const ns = quota.metadata.namespace;
  const pods = c.listar('Pod', ns).filter((p) => !TERMINAIS.has(p.status?.phase) && !p.metadata.deletionTimestamp);
  const uso = {};
  for (const r of Object.keys(quota.spec.hard ?? {})) {
    if (r === 'services') uso[r] = c.listar('Service', ns).length;
    else if (r === 'persistentvolumeclaims') uso[r] = c.listar('PersistentVolumeClaim', ns).length;
    else if (r === 'configmaps') uso[r] = c.listar('ConfigMap', ns).length;
    else if (r === 'secrets') uso[r] = c.listar('Secret', ns).length;
    else uso[r] = pods.reduce((t, p) => t + (pesoDoPod(p)[r] ?? 0), 0);
  }
  return uso;
}

/** ResourceQuota: o pod novo cabe nas cotas do namespace? → null, ou a mensagem do apiserver. */
export function conferirCotas(c, pod) {
  for (const q of c.listar('ResourceQuota', pod.metadata.namespace)) {
    const duros = Object.keys(q.spec.hard ?? {}).filter((r) => r in pesoDoPod(pod)).sort();
    // Cota de CPU ou memória obriga todo contêiner a dizer o seu request/limit.
    const faltando = duros.filter((r) => r !== 'pods').map((r) => {
      const [tipo, nome] = r.includes('.') ? r.split('.') : ['requests', r];
      const sem = pod.spec.containers.filter((ct) => !ct.resources?.[tipo]?.[nome]).map((ct) => ct.name);
      return sem.length ? `${r} for: ${sem.join(',')}` : null;
    }).filter(Boolean);
    if (faltando.length) return `failed quota: ${q.metadata.name}: must specify ${faltando.join('; ')}`;
    const uso = usoDaCota(c, q);
    const peso = pesoDoPod(pod);
    const limite = (r) => (r === 'pods' ? Number(q.spec.hard[r]) : valor(r, q.spec.hard[r]));
    const estoura = duros.filter((r) => uso[r] + peso[r] > limite(r));
    if (estoura.length) {
      const lista = (f) => estoura.map((r) => `${r}=${f(r)}`).join(',');
      return `exceeded quota: ${q.metadata.name}, requested: ${lista((r) => texto(r, peso[r]))}, used: ${lista((r) => texto(r, uso[r]))}, limited: ${lista((r) => q.spec.hard[r])}`;
    }
  }
  return null;
}

/** O controlador de cotas: o status (hard e used) de cada ResourceQuota. */
export function controladorDeCotas(c) {
  for (const q of c.listar('ResourceQuota')) {
    const uso = usoDaCota(c, q);
    const status = {
      hard: { ...q.spec.hard },
      used: Object.fromEntries(Object.keys(q.spec.hard ?? {}).map((r) => [r, texto(r, uso[r])])),
    };
    c.trocarStatus(q, status);
  }
}
