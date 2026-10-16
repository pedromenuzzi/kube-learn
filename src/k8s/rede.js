// A rede do cluster: IPs dos pods e dos Services, DNS (CoreDNS) e o caminho de uma conexão
// (kube-proxy → endpoints prontos → contêiner ouvindo na porta).

export const DOMINIO = 'cluster.local';
export const IP_DNS = '10.96.0.10';

const FRASES = { 200: 'OK', 301: 'Moved Permanently', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };

/** Domínios de busca do /etc/resolv.conf de um pod no namespace `ns`. */
export const buscaDns = (ns) => [`${ns}.svc.${DOMINIO}`, `svc.${DOMINIO}`, DOMINIO];

export const resolvConf = (ns) => `search ${buscaDns(ns).join(' ')}\nnameserver ${IP_DNS}\noptions ndots:5\n`;

/** Resolve um nome como o CoreDNS faria, a partir de um pod no namespace `ns`. → { nome, ip, servico } | null */
export function resolver(cluster, nome, ns) {
  const tentar = (fqdn) => {
    const m = fqdn.match(new RegExp(`^([a-z0-9-]+)\\.([a-z0-9-]+)\\.svc\\.${DOMINIO.replace('.', '\\.')}$`));
    if (!m) return null;
    const svc = cluster.obter('Service', m[2], m[1]);
    if (!svc || svc.spec.type === 'ExternalName') return null;
    return { nome: fqdn, ip: svc.spec.clusterIP, servico: svc };
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

/**
 * Uma requisição HTTP saindo de `origem` (um pod, ou null = de fora do cluster).
 * → { status, frase, corpo, cabecalhos, ip } | { erro: 'dns' | 'recusada' | 'timeout' | 'vazia', ip }
 */
export function http(cluster, origem, url, { agente = 'curl/7.88.1', metodo = 'GET' } = {}) {
  const ns = origem?.metadata.namespace ?? 'default';
  let ip = url.host;
  let destino;
  let porta = url.porta;

  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const r = resolver(cluster, ip, ns);
    if (!r) return { erro: 'dns' };
    ip = r.ip;
  }
  const svc = cluster.listar('Service').find((s) => s.spec.clusterIP === ip);
  if (svc) {
    const sp = svc.spec.ports.find((p) => p.port === porta);
    if (!sp) return { erro: 'timeout', ip }; // o kube-proxy não tem regra para essa porta: o pacote se perde
    const prontos = cluster.listar('Pod', svc.metadata.namespace)
      .filter((p) => p.status?.podIP && !p.metadata.deletionTimestamp && casaSeletor(svc.spec.selector, p.metadata.labels) && estaPronto(p));
    if (!prontos.length) return { erro: 'recusada', ip };
    const chave = `${svc.metadata.uid}:${porta}`;
    const n = cluster.rodizio.get(chave) ?? 0;
    cluster.rodizio.set(chave, n + 1);
    destino = prontos[n % prontos.length];
    porta = portaAlvo(destino, sp.targetPort);
  } else {
    destino = cluster.listar('Pod').find((p) => p.status?.podIP === ip && !p.spec.hostNetwork);
    if (!destino) return { erro: 'timeout', ip };
  }

  const ouvindo = cluster.kubelet.quemOuve(destino, porta);
  if (!ouvindo) return { erro: 'recusada', ip };
  const { comportamento, conteiner } = ouvindo;
  if (!comportamento.servidor.http) return { erro: 'vazia', ip };
  const r = comportamento.servidor.http(url.caminho, { hostname: destino.metadata.name });
  const tamanho = new TextEncoder().encode(r.corpo).length;
  if (comportamento.servidor.acesso) {
    cluster.kubelet.log(destino, conteiner, comportamento.servidor.acesso({
      agora: cluster.agora, ip: origem?.status?.podIP ?? '10.244.0.1', metodo, caminho: url.caminho, status: r.status, tamanho, agente,
    }));
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

/** O seletor (matchLabels) casa com as labels? Seletor vazio ou ausente não casa com nada. */
export const casaSeletor = (seletor, labels = {}) => !!seletor && Object.keys(seletor).length > 0 && Object.entries(seletor).every(([k, v]) => labels[k] === v);
export const estaPronto = (pod) => pod.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True');
