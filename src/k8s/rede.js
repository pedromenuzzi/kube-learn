// A rede do cluster: IPs dos pods e dos Services, DNS (CoreDNS), o caminho de uma conexão
// (kube-proxy → endpoints prontos → contêiner ouvindo na porta) e a entrada de fora do cluster
// (port-forward, NodePort, LoadBalancer, Ingress e Gateway API).

export const DOMINIO = 'cluster.local';
export const IP_DNS = '10.96.0.10';
/** O endereço do controlador de Ingress (o LoadBalancer dele). */
export const IP_INGRESS = '172.18.255.10';

const FRASES = { 200: 'OK', 301: 'Moved Permanently', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
const ehIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h);

/** Domínios de busca do /etc/resolv.conf de um pod no namespace `ns`. */
export const buscaDns = (ns) => [`${ns}.svc.${DOMINIO}`, `svc.${DOMINIO}`, DOMINIO];

export const resolvConf = (ns) => `search ${buscaDns(ns).join(' ')}\nnameserver ${IP_DNS}\noptions ndots:5\n`;

export const casaSeletor = (seletor, labels = {}) => !!seletor && Object.keys(seletor).length > 0 && Object.entries(seletor).every(([k, v]) => labels[k] === v);
export const estaPronto = (pod) => pod.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True');

/** Pods prontos atrás de um Service. */
export const podsProntos = (cluster, svc) => cluster.listar('Pod', svc.metadata.namespace)
  .filter((p) => p.status?.podIP && !p.metadata.deletionTimestamp && casaSeletor(svc.spec.selector, p.metadata.labels) && estaPronto(p));

/**
 * Resolve um nome como o CoreDNS faria, a partir de um pod no namespace `ns`.
 * → { nome, ip, ips, servico } | null. Service headless (clusterIP None) devolve os IPs dos pods prontos.
 */
export function resolver(cluster, nome, ns) {
  const tentar = (fqdn) => {
    // O nome de um pod de StatefulSet: db-0.db.default.svc.cluster.local (hostname.serviço-headless.namespace).
    const mp = fqdn.match(new RegExp(`^([a-z0-9-]+)\\.([a-z0-9-]+)\\.([a-z0-9-]+)\\.svc\\.${DOMINIO.replace('.', '\\.')}$`));
    if (mp) {
      const svc = cluster.obter('Service', mp[3], mp[2]);
      const pod = svc?.spec.clusterIP === 'None' && cluster.listar('Pod', mp[3]).find((p) => p.spec.hostname === mp[1] && p.spec.subdomain === mp[2] && p.status?.podIP && (estaPronto(p) || svc.spec.publishNotReadyAddresses));
      return pod ? { nome: fqdn, ip: pod.status.podIP, ips: [pod.status.podIP] } : null;
    }
    const m = fqdn.match(new RegExp(`^([a-z0-9-]+)\\.([a-z0-9-]+)\\.svc\\.${DOMINIO.replace('.', '\\.')}$`));
    if (!m) return null;
    const svc = cluster.obter('Service', m[2], m[1]);
    if (!svc || svc.spec.type === 'ExternalName') return null;
    if (svc.spec.clusterIP === 'None') {
      const ips = podsProntos(cluster, svc).map((p) => p.status.podIP);
      return ips.length ? { nome: fqdn, ip: ips[0], ips, servico: svc } : null;
    }
    return { nome: fqdn, ip: svc.spec.clusterIP, ips: [svc.spec.clusterIP], servico: svc };
  };
  if (nome.endsWith('.')) return tentar(nome.slice(0, -1));
  const pontos = nome.split('.').length - 1;
  const candidatos = pontos >= 5 ? [nome, ...buscaDns(ns).map((d) => `${nome}.${d}`)] : [...buscaDns(ns).map((d) => `${nome}.${d}`), nome];
  for (const c of candidatos) {
    const r = tentar(c);
    if (r) return r;
  }
  return null;
}

/** Porta do contêiner para um targetPort (número ou nome). */
export function portaAlvo(pod, targetPort) {
  if (typeof targetPort === 'number') return targetPort;
  if (/^\d+$/.test(targetPort)) return Number(targetPort);
  for (const c of pod.spec.containers) {
    const p = (c.ports ?? []).find((x) => x.name === targetPort);
    if (p) return p.containerPort;
  }
  return null;
}

/** Entrega a requisição a um pod, na porta dada: só responde se o contêiner estiver ouvindo nela. */
function noPod(cluster, pod, porta, url, { origemIp = '10.244.0.1', metodo = 'GET', agente = 'curl/7.88.1' } = {}) {
  const ip = pod.status?.podIP;
  const ouvindo = cluster.kubelet.quemOuve(pod, porta);
  if (!ouvindo) return { erro: 'recusada', ip };
  const { comportamento, conteiner } = ouvindo;
  if (!comportamento.servidor.http) return { erro: 'vazia', ip };
  const fs = cluster.kubelet.fsDe(pod, conteiner);
  const r = comportamento.servidor.http(url.caminho, { hostname: pod.metadata.name, ler: (c) => fs?.ler(c), env: cluster.kubelet.estado(pod, conteiner)?.env });
  const tamanho = new TextEncoder().encode(r.corpo).length;
  if (comportamento.servidor.acesso) {
    cluster.kubelet.log(pod, conteiner, comportamento.servidor.acesso({ agora: cluster.agora, ip: origemIp, metodo, caminho: url.caminho, status: r.status, tamanho, agente }));
  }
  return {
    ip,
    status: r.status,
    frase: FRASES[r.status] ?? '',
    corpo: metodo === 'HEAD' ? '' : r.corpo,
    cabecalhos: {
      ...(comportamento.servidor.cabecalhoServidor ? { Server: comportamento.servidor.cabecalhoServidor } : {}),
      Date: new Date(cluster.agora).toUTCString(),
      'Content-Type': r.tipo,
      'Content-Length': String(tamanho),
      Connection: 'keep-alive',
    },
  };
}

/** Entrega a um Service, na porta do Service: o kube-proxy escolhe um pod pronto (rodízio). */
function noServico(cluster, svc, portaServico, url, opcoes) {
  const sp = svc.spec.ports?.find((p) => p.port === portaServico);
  if (!sp) return { erro: 'timeout', ip: svc.spec.clusterIP };
  const prontos = podsProntos(cluster, svc);
  if (!prontos.length) return { erro: 'recusada', ip: svc.spec.clusterIP };
  const chave = `${svc.metadata.uid}:${portaServico}`;
  const n = cluster.rodizio.get(chave) ?? 0;
  cluster.rodizio.set(chave, n + 1);
  const destino = prontos[n % prontos.length];
  const r = noPod(cluster, destino, portaAlvo(destino, sp.targetPort), url, opcoes);
  return { ...r, ip: svc.spec.clusterIP };
}

/**
 * Uma requisição HTTP saindo de `origem` (um pod, ou null = de dentro do cluster, sem pod).
 * → { status, frase, corpo, cabecalhos, ip } | { erro: 'dns' | 'recusada' | 'timeout' | 'vazia', ip }
 */
export function http(cluster, origem, url, opcoes = {}) {
  const ns = origem?.metadata.namespace ?? 'default';
  const op = { ...opcoes, origemIp: origem?.status?.podIP ?? '10.244.0.1' };
  if (origem && (url.host === 'localhost' || url.host === '127.0.0.1')) return noPod(cluster, origem, url.porta, url, op); // o próprio pod
  let ip = url.host;
  if (!ehIp(ip)) {
    const r = resolver(cluster, ip, ns);
    if (!r) return { erro: 'dns' };
    ip = r.ip;
  }
  const svc = cluster.listar('Service').find((s) => s.spec.clusterIP === ip);
  if (svc) return noServico(cluster, svc, url.porta, url, op);
  const pod = cluster.listar('Pod').find((p) => p.status?.podIP === ip && !p.spec.hostNetwork);
  if (!pod) return { erro: 'timeout', ip };
  return noPod(cluster, pod, url.porta, url, op);
}

// ---------- de fora do cluster (o computador do aluno) ----------

const casaHost = (padrao, nome) => !padrao || padrao === nome || (padrao.startsWith('*.') && nome.endsWith(padrao.slice(1)) && nome.split('.').length === padrao.split('.').length);
const casaCaminho = (tipo, path, caminho) => {
  const p = path || '/';
  if (tipo === 'Exact') return caminho === p;
  if (p === '/') return true;
  const semBarra = p.replace(/\/$/, '');
  return caminho === semBarra || caminho.startsWith(`${semBarra}/`);
};

/** A classe de Ingress em vigor para um Ingress (a citada, ou a padrão do cluster). */
export function classeDoIngress(cluster, ing) {
  const classes = cluster.listar('IngressClass');
  const nome = ing.spec.ingressClassName ?? classes.find((c) => c.metadata.annotations?.['ingressclass.kubernetes.io/is-default-class'] === 'true')?.metadata.name;
  return classes.find((c) => c.metadata.name === nome) ?? null;
}

/** O controlador de Ingress: escolhe a regra pelo host e pelo caminho mais longo. */
function peloIngress(cluster, nome, url, opcoes) {
  let melhor = null;
  for (const ing of cluster.listar('Ingress')) {
    if (!classeDoIngress(cluster, ing)) continue;
    for (const regra of ing.spec.rules ?? []) {
      if (!casaHost(regra.host, nome)) continue;
      for (const p of regra.http?.paths ?? []) {
        if (!casaCaminho(p.pathType, p.path, url.caminho)) continue;
        const tam = (p.path || '/').length + (regra.host ? 1000 : 0);
        if (!melhor || tam > melhor.tam) melhor = { tam, ing, backend: p.backend.service };
      }
    }
  }
  if (!melhor) return { status: 404, frase: 'Not Found', corpo: '404 page not found\n', cabecalhos: { 'Content-Type': 'text/plain; charset=utf-8' }, ip: IP_INGRESS };
  const svc = cluster.obter('Service', melhor.ing.metadata.namespace, melhor.backend.name);
  if (!svc) return { status: 503, frase: 'Service Unavailable', corpo: 'Service Unavailable\n', cabecalhos: { 'Content-Type': 'text/plain' }, ip: IP_INGRESS };
  const porta = melhor.backend.port?.number ?? svc.spec.ports.find((p) => p.name === melhor.backend.port?.name)?.port;
  const r = noServico(cluster, svc, porta, url, opcoes);
  if (r.erro) return { status: 502, frase: 'Bad Gateway', corpo: 'Bad Gateway\n', cabecalhos: { 'Content-Type': 'text/plain' }, ip: IP_INGRESS };
  return { ...r, ip: IP_INGRESS };
}

/** Escolhe um destino pelos pesos, de forma determinística (rodízio ponderado suave). */
function porPeso(cluster, chave, refs) {
  const atual = cluster.rodizio.get(chave) ?? refs.map(() => 0);
  const total = refs.reduce((s, r) => s + (r.weight ?? 1), 0);
  let maior = 0;
  refs.forEach((r, i) => {
    atual[i] += r.weight ?? 1;
    if (atual[i] > atual[maior]) maior = i;
  });
  atual[maior] -= total;
  cluster.rodizio.set(chave, atual);
  return refs[maior];
}

/** O Gateway: acha a HTTPRoute pendurada nele que casa com o host e o caminho, e reparte pelos pesos. */
function peloGateway(cluster, gw, nome, url, opcoes) {
  const ip = gw.status?.addresses?.[0]?.value;
  let melhor = null;
  for (const rota of cluster.listar('HTTPRoute')) {
    const presa = (rota.spec.parentRefs ?? []).some((p) => p.name === gw.metadata.name && (p.namespace ?? rota.metadata.namespace) === gw.metadata.namespace);
    if (!presa) continue;
    if (rota.spec.hostnames?.length && !rota.spec.hostnames.some((h) => casaHost(h, nome))) continue;
    for (const [i, regra] of (rota.spec.rules ?? []).entries()) {
      for (const m of regra.matches?.length ? regra.matches : [{ path: { type: 'PathPrefix', value: '/' } }]) {
        const tipo = m.path?.type === 'Exact' ? 'Exact' : 'Prefix';
        if (!casaCaminho(tipo, m.path?.value, url.caminho)) continue;
        const tam = (m.path?.value ?? '/').length;
        if (!melhor || tam > melhor.tam) melhor = { tam, rota, regra, i };
      }
    }
  }
  if (!melhor || !melhor.regra.backendRefs?.length) return { status: 404, frase: 'Not Found', corpo: 'Not Found\n', cabecalhos: { 'Content-Type': 'text/plain' }, ip };
  const ref = porPeso(cluster, `${melhor.rota.metadata.uid}:${melhor.i}`, melhor.regra.backendRefs);
  const svc = cluster.obter('Service', ref.namespace ?? melhor.rota.metadata.namespace, ref.name);
  if (!svc) return { status: 500, frase: 'Internal Server Error', corpo: 'Internal Server Error\n', cabecalhos: { 'Content-Type': 'text/plain' }, ip };
  const r = noServico(cluster, svc, ref.port ?? svc.spec.ports[0].port, url, opcoes);
  if (r.erro) return { status: 503, frase: 'Service Unavailable', corpo: 'no healthy upstream\n', cabecalhos: { 'Content-Type': 'text/plain' }, ip };
  return { ...r, ip };
}

/** Os nomes que o "DNS da empresa" conhece: os hosts dos Ingresses e das HTTPRoutes apontam para a entrada certa. */
export function resolverDeFora(cluster, nome) {
  if (cluster.listar('Ingress').some((i) => classeDoIngress(cluster, i) && (i.spec.rules ?? []).some((r) => r.host && casaHost(r.host, nome)))) return IP_INGRESS;
  for (const rota of cluster.listar('HTTPRoute')) {
    if (!(rota.spec.hostnames ?? []).some((h) => casaHost(h, nome))) continue;
    for (const p of rota.spec.parentRefs ?? []) {
      const gw = cluster.obter('Gateway', p.namespace ?? rota.metadata.namespace, p.name);
      const ip = gw?.status?.addresses?.[0]?.value;
      if (ip) return ip;
    }
  }
  return null;
}

/**
 * Uma requisição feita do computador do aluno (fora do cluster). `host` é o cabeçalho Host (curl -H 'Host: ...').
 * Chega por port-forward (localhost), NodePort (IP de node), LoadBalancer, Ingress ou Gateway.
 */
export function httpDeFora(cluster, url, opcoes = {}) {
  const op = { ...opcoes, origemIp: '172.18.0.1' };
  const nome = opcoes.host ?? url.host;
  let ip = url.host;
  if (ip === 'localhost' || ip === '127.0.0.1') {
    const f = cluster.encaminhamentos.find((e) => e.local === url.porta);
    if (!f) return { erro: 'recusada', ip: '127.0.0.1' };
    const pod = cluster.obter('Pod', f.ns, f.pod);
    if (!pod) return { erro: 'vazia', ip: '127.0.0.1' };
    return { ...noPod(cluster, pod, f.remota, url, op), ip: '127.0.0.1' };
  }
  if (!ehIp(ip)) {
    ip = resolverDeFora(cluster, ip);
    if (!ip) return { erro: 'dns' };
  }
  const node = cluster.listar('Node').find((n) => n.status.addresses.some((a) => a.address === ip));
  if (node) {
    const svc = cluster.listar('Service').find((s) => s.spec.ports?.some((p) => p.nodePort === url.porta));
    if (!svc) return { erro: 'recusada', ip };
    return { ...noServico(cluster, svc, svc.spec.ports.find((p) => p.nodePort === url.porta).port, url, op), ip };
  }
  const lb = cluster.listar('Service').find((s) => s.status?.loadBalancer?.ingress?.some((i) => i.ip === ip));
  if (lb) return { ...noServico(cluster, lb, url.porta, url, op), ip };
  if (ip === IP_INGRESS && cluster.listar('IngressClass').length) {
    if (url.porta !== 80 && url.porta !== 443) return { erro: 'recusada', ip };
    return peloIngress(cluster, nome, url, op);
  }
  const gw = cluster.listar('Gateway').find((g) => g.status?.addresses?.some((a) => a.value === ip));
  if (gw) {
    if (!gw.spec.listeners.some((l) => l.port === url.porta)) return { erro: 'recusada', ip };
    return peloGateway(cluster, gw, nome, url, op);
  }
  return { erro: 'timeout', ip };
}
