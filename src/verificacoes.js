// Os testes dos exercícios. Cada teste monta um cluster novo (ou usa o do aluno, nos exercícios de terminal),
// roda os passos e confere as regras. Cada regra é um objeto com uma das chaves abaixo (e `msg` opcional):
//
//   { semErros: true }                                 todos os comandos do teste deram certo
//   { erro: 'texto' }                                  algum comando falhou com esse texto
//   { objeto: 'deployment/loja', ns, campo: 'spec.replicas', igual | contem | regex | existe | maiorQue }
//                                                      (maiorQue: uma quantidade, como '300Mi' ou '500m')
//   { pods: 'app=loja', ns, quantidade, prontos, fase, imagem, node, reinicios: { max } }
//   { status: 'pod/x' | 'app=x', motivo: 'CrashLoopBackOff' }   motivo atual (ou o último término)
//   { endpoints: 'svc/loja', quantidade }              quantos pods prontos atrás do Service
//   { requisicao: { url, de: 'pod/x' | 'fora', host, status: 200 | 'recusada' | 'timeout' | 'dns', corpo: 'regex' } }
//                                                      ('fora' = do computador do aluno; host = cabeçalho Host)
//   { distribuicao: { url, de, host, vezes: 100, corpo: 'regex', entre: [5, 15] } }   quantas respostas casam
//   { dns: { nome, de: 'pod/x', quantidade } }         quantos endereços o nome resolve (headless = um por pod)
//   { rollout: 'deployment/loja', minDisponivel: 3 }   nunca ficou com menos pods prontos durante o teste
//   { evento: { motivo, objeto, mensagem: 'regex' } }  aconteceu um evento com esse motivo (e essa mensagem)
//   { env: { pods: 'app=x', nome, igual | regex } }    a variável de ambiente dentro do contêiner
//   { comando: 'regex' }                               o aluno usou esse comando no terminal (a regex é testada na linha
//                                                      crua e na normalizada, e nas duas da linha expandida no shell do
//                                                      aluno, com o k, os aliases e o $do: veja formasDoComando)
//   { saida: 'regex' }                                 a saída de algum comando dos passos do teste combina
//   { vigia: { maxFalhas: 0 } }                        com `vigiar: 'http://loja'` no teste: um cliente pediu a URL a
//                                                      cada segundo dos passos, e no máximo tantas deram erro
//   { resposta: 'texto' | /regex/ | { de: 'pod/x', campo: 'spec.nodeName' } }   a resposta que o aluno digitou
//                                                      (a última forma compara com um campo do cluster do aluno)
//   { contexto: { namespace } }                        o namespace padrão do kubectl (kubectl config set-context)
//   { pode: { quem: 'ana' | 'system:serviceaccount:ns:nome', verbo: 'list', recurso: 'pods', sub, ns, resposta: true } }
//                                                      o RBAC deixa (ou não) a pessoa fazer aquilo
//   { release: { nome, ns, status, revisao, descricao } }   a release do Helm (a última revisão)
//   { espalhamento: { pods: 'app=x', chave: 'topology.kubernetes.io/zone', maxSkew: 1 } }   a maior diferença de
//                                                      pods entre os domínios (os valores da label nos nodes)
//   { egressMinimo: 'networkpolicy/x', ns }            a saída dos pods da NetworkPolicy é de menor privilégio, somando toda
//                                                      política de Egress do namespace que pega um deles: toda regra de
//                                                      egress tem `to` e `ports` (cada uma com `port`, sem faixa endPort),
//                                                      nenhum par que vale para qualquer namespace sem fixar os pods
//                                                      (namespaceSelector vazio ou só Exists, sem podSelector com label) nem
//                                                      ipBlock maior que /8, e a porta 53 vai em UDP e em TCP (o DNS usa os
//                                                      dois). Use com `msg` (a mensagem que ensina); o detalhe é a regra larga
//
// Passos (`passos`): { comando: 'kubectl ...' }, { avancar: '30s' }, { adicionarNode: 'node-3' } (um prédio novo no condomínio)
// { derrubarNode: 'node-2' } (o prédio fica sem luz: o kubelet dele para) e { zerar: true } (o vigia e o rollout começam a contar
// dali, depois que tudo subiu).
// Sem `passos`: kubectl apply -f . e 1 minuto de relógio.
import { montarCluster } from './conteudo/clusters.js';
import { seletorDeLabels } from './k8s/kubectl/index.js';
import { linhaExpandida, rodarLinha } from './k8s/linha.js';
import { palavras } from './k8s/kubectl/argv.js';
import { acharRecurso, pluralQualificado } from './k8s/recursos.js';
import { estaPronto, http, httpDeFora, resolver } from './k8s/rede.js';
import { resumoPod } from './k8s/kubectl/tabelas.js';
import { canonico } from './k8s/aleatorio.js';
import { casaLabelSelector } from './k8s/scheduler.js';
import { pode as podeFazer, quemE } from './k8s/seguranca.js';
import { parseDuracao, valorQuantidade } from './k8s/unidades.js';
import { t } from './i18n.js';

/** Uma requisição de teste: de um pod, de dentro do cluster (sem pod) ou de fora (o computador do aluno). */
function pedir(cluster, q) {
  const m = q.url.match(/^(?:https?:\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/);
  const url = { host: m[1], porta: Number(m[2] ?? 80), caminho: m[3] ?? '/' };
  if (q.de === 'fora') return httpDeFora(cluster, url, { host: q.host });
  const origem = q.de ? cluster.obter('Pod', q.ns ?? 'default', separar(q.de).nome) : null;
  return http(cluster, origem, url);
}

const PASSOS_PADRAO = [{ comando: 'kubectl apply -f .' }, { avancar: '1m' }];
const mostrar = (v) => (v === undefined ? t('nada') : JSON.stringify(v));

/** Lê um caminho como 'spec.template.spec.containers[0].image' ou 'metadata.annotations["kubernetes.io/change-cause"]'. */
export function ler(obj, caminho) {
  const partes = [...caminho.matchAll(/\["([^"]+)"\]|\[(\d+)\]|([^.[\]]+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  return partes.reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), obj);
}

function separar(alvo, padrao = 'pod') {
  const [tipo, nome] = alvo.includes('/') ? alvo.split('/') : [padrao, alvo];
  return { recurso: acharRecurso(tipo), nome };
}

const podsDo = (c, seletor, ns = 'default') => {
  const casa = seletorDeLabels(seletor);
  return c.listar('Pod', ns).filter((p) => !p.metadata.deletionTimestamp && casa(p.metadata.labels));
};

function comparar(valor, regra, rotulo) {
  const veio = t('veio {valor}', { valor: mostrar(valor) });
  if ('igual' in regra) return [canonico(valor) === canonico(regra.igual), `${rotulo} = ${mostrar(regra.igual)}`, veio];
  if ('contem' in regra) {
    const ok = Array.isArray(valor) ? valor.includes(regra.contem) : String(valor ?? '').includes(regra.contem);
    return [ok, t('{alvo} contém {valor}', { alvo: rotulo, valor: mostrar(regra.contem) }), veio];
  }
  if ('maiorQue' in regra) return [valorQuantidade(valor) > valorQuantidade(regra.maiorQue), t('{alvo} maior que {valor}', { alvo: rotulo, valor: regra.maiorQue }), veio];
  if ('regex' in regra) return [new RegExp(regra.regex).test(valor && typeof valor === 'object' ? JSON.stringify(valor) : String(valor ?? '')), t('{alvo} combina com /{re}/', { alvo: rotulo, re: regra.regex }), veio];
  const deveExistir = regra.existe ?? true;
  return [(valor !== undefined) === deveExistir, deveExistir ? t('{alvo} existe', { alvo: rotulo }) : t('{alvo} não existe', { alvo: rotulo }), veio];
}

const SEPARADORES = new Set(['&&', '||', ';']);

/** Um comando do kubectl com as flags na forma de sempre: -o yaml, -l x, -n x (depois do verbo) e --from=x. */
function normalizarKubectl(p) {
  const fim = p.findIndex((x, i) => i && /^(\||\d?>)/.test(x)); // o cano e o redirecionamento terminam o comando
  const corpo = fim === -1 ? p : p.slice(0, fim);
  const saida = [];
  for (let i = 0; i < corpo.length; i++) {
    const x = corpo[i];
    if (x === '--') break; // daqui em diante é o comando do contêiner (exec, run): fica como está
    const curta = x.match(/^-([onl])=?(.+)$/); // -oyaml, -o=yaml, -nloja, -lapp=x
    const longa = x.match(/^--(output|namespace|selector)(?:=(.*))?$/);
    if (curta) saida.push(`-${curta[1]}`, curta[2]);
    else if (longa) saida.push({ output: '-o', namespace: '-n', selector: '-l' }[longa[1]], ...(longa[2] === undefined ? [] : [longa[2]]));
    else if (x === '--from' && i + 1 < corpo.length) saida.push(`--from=${corpo[++i]}`);
    else saida.push(x);
  }
  // o -n antes do verbo (kubectl -n loja get pods) vai para o fim das flags: kubectl get pods -n loja
  const globais = [];
  while (saida[1] === '-n' && saida.length > 3) globais.push(...saida.splice(1, 2));
  const traco = corpo.indexOf('--');
  return [...saida, ...globais, ...(traco === -1 ? [] : corpo.slice(traco)), ...(fim === -1 ? [] : p.slice(fim))];
}

/**
 * As formas de uma linha do histórico que a regra `comando` aceita: a linha crua, a normalizada (sem aspas, com as flags
 * na forma de sempre) e cada comando dela separado por &&, || ou ;. Assim `kubectl -n x get pods -l 'a=b'` casa com
 * /^kubectl\s+get\s+pods\s+-l\s*a=b/.
 */
export function formasDoComando(linha) {
  const comandos = [[]];
  for (const x of palavras(linha.trim())) {
    if (SEPARADORES.has(x)) comandos.push(x, []);
    else comandos.at(-1).push(x);
  }
  const normalizados = comandos.map((c) => (Array.isArray(c) ? (c[0] === 'kubectl' ? normalizarKubectl(c) : c).join(' ') : c));
  return [linha.trim(), normalizados.join(' '), ...normalizados.filter((c, i) => i % 2 === 0)];
}

const REGRAS = {
  semErros(r, ctx) {
    const falhou = ctx.resultados.find((x) => x.codigo !== 0);
    return [!falhou, t('os comandos rodaram sem erro'), falhou ? falhou.saida.trim().split('\n')[0] : ''];
  },
  erro(r, ctx) {
    const ok = ctx.resultados.some((x) => x.codigo !== 0 && x.saida.includes(r.erro));
    return [ok, t('o comando falha com "{erro}"', { erro: r.erro }), t('nenhum comando falhou com esse texto')];
  },
  objeto(r, ctx) {
    const { recurso, nome } = separar(r.objeto);
    const obj = recurso && ctx.cluster.obter(recurso.kind, recurso.namespaced ? r.ns ?? 'default' : null, nome);
    if (!obj && r.existe === false && !r.campo) return [true, t('{alvo} não existe', { alvo: r.objeto })];
    if (obj && r.existe === false && !r.campo) return [false, t('{alvo} não existe', { alvo: r.objeto }), t('ainda existe')];
    if (!obj) return [false, t('{alvo} existe', { alvo: `${r.objeto}${r.campo ? `: ${r.campo}` : ''}` }), t('{alvo} não existe', { alvo: `${pluralQualificado(recurso ?? { plural: r.objeto, grupo: '' })} "${nome}"` })];
    if (!r.campo) return [true, t('{alvo} existe', { alvo: r.objeto })];
    return comparar(ler(obj, r.campo), r, `${r.objeto}: ${r.campo}`);
  },
  pods(r, ctx) {
    const lista = podsDo(ctx.cluster, r.pods, r.ns);
    const prontos = lista.filter(estaPronto);
    const partes = [];
    let ok = true;
    let detalhe = '';
    const conferir = (cond, texto, d) => {
      partes.push(texto);
      if (!cond && ok) {
        ok = false;
        detalhe = d;
      }
    };
    if (r.quantidade !== undefined) conferir(lista.length === r.quantidade, `${r.quantidade} pods`, t('há {n}', { n: lista.length }));
    if (r.prontos !== undefined) conferir(prontos.length === r.prontos, t('{n} prontos', { n: r.prontos }), t('{n} prontos de {total}', { n: prontos.length, total: lista.length }));
    if (r.fase) conferir(lista.length > 0 && lista.every((p) => p.status?.phase === r.fase), t('fase {fase}', { fase: r.fase }), lista.map((p) => `${p.metadata.name}: ${p.status?.phase}`).join(', ') || t('nenhum pod'));
    if (r.imagem) {
      const outras = lista.filter((p) => p.spec.containers[0].image !== r.imagem);
      conferir(lista.length > 0 && !outras.length, t('com a imagem {imagem}', { imagem: r.imagem }), outras.length ? t('{pod} usa {imagem}', { pod: outras[0].metadata.name, imagem: outras[0].spec.containers[0].image }) : t('nenhum pod'));
    }
    if (r.node) conferir(lista.length > 0 && lista.every((p) => p.spec.nodeName === r.node), t('no node {node}', { node: r.node }), lista.map((p) => `${p.metadata.name}: ${p.spec.nodeName ?? t('sem node')}`).join(', '));
    if (r.reinicios?.max !== undefined) {
      const muito = lista.find((p) => (p.status?.containerStatuses ?? []).some((s) => s.restartCount > r.reinicios.max));
      conferir(!muito, t('até {n} reinícios', { n: r.reinicios.max }), muito ? t('{pod} reiniciou mais', { pod: muito.metadata.name }) : '');
    }
    return [ok, `pods ${r.pods}: ${partes.join(', ')}`, detalhe];
  },
  status(r, ctx) {
    const lista = r.status.includes('=') ? podsDo(ctx.cluster, r.status, r.ns) : [ctx.cluster.obter('Pod', r.ns ?? 'default', separar(r.status).nome)].filter(Boolean);
    const motivos = lista.map((p) => resumoPod(p, ctx.cluster.agora).status);
    const ultimos = lista.flatMap((p) => (p.status?.containerStatuses ?? []).map((s) => s.lastState?.terminated?.reason)).filter(Boolean);
    return [motivos.includes(r.motivo) || ultimos.includes(r.motivo), t('{alvo} mostra {motivo}', { alvo: r.status, motivo: r.motivo }), motivos.length ? t('está {valor}', { valor: motivos.join(', ') }) : t('pod não encontrado')];
  },
  endpoints(r, ctx) {
    const { nome } = separar(r.endpoints, 'svc');
    const ep = ctx.cluster.obter('Endpoints', r.ns ?? 'default', nome);
    const n = (ep?.subsets ?? []).reduce((s, x) => s + (x.addresses?.length ?? 0), 0);
    return [n === r.quantidade, t('o Service {nome} tem {n} pods prontos atrás dele', { nome, n: r.quantidade }), t('tem {n}', { n })];
  },
  requisicao(r, ctx) {
    const q = r.requisicao;
    const res = pedir(ctx.cluster, q);
    const obtido = res.erro ?? res.status;
    const statusOk = obtido === (q.status ?? 200);
    const corpoOk = !q.corpo || new RegExp(q.corpo).test(res.corpo ?? '');
    const detalhe = statusOk ? t('veio {valor}, mas sem /{re}/ na resposta: {corpo}', { valor: obtido, re: q.corpo, corpo: mostrar((res.corpo ?? '').trim().slice(0, 80)) }) : t('veio {valor}', { valor: { recusada: t('recusada'), vazia: t('vazia') }[obtido] ?? obtido });
    const pedido = { url: q.url, status: q.status ?? 200, re: q.corpo };
    return [statusOk && corpoOk, q.corpo ? t('{url} responde {status} com /{re}/', pedido) : t('{url} responde {status}', pedido), detalhe];
  },
  distribuicao(r, ctx) {
    const q = r.distribuicao;
    const re = new RegExp(q.corpo);
    let n = 0;
    for (let i = 0; i < (q.vezes ?? 100); i++) if (re.test(pedir(ctx.cluster, q).corpo ?? '')) n++;
    const [min, max] = q.entre;
    return [n >= min && n <= max, t('de {vezes} requisições a {url}, entre {min} e {max} casam com /{re}/', { vezes: q.vezes ?? 100, url: q.url, min, max, re: q.corpo }), t('foram {n}', { n })];
  },
  dns(r, ctx) {
    const q = r.dns;
    const origem = q.de ? ctx.cluster.obter('Pod', q.ns ?? 'default', separar(q.de).nome) : null;
    const res = resolver(ctx.cluster, q.nome, origem?.metadata.namespace ?? 'default');
    const n = res?.ips?.length ?? 0;
    const esperado = { nome: q.nome, n: q.quantidade };
    return [n === q.quantidade, q.quantidade === 1 ? t('{nome} resolve para {n} endereço', esperado) : t('{nome} resolve para {n} endereços', esperado), res ? t('resolve para {n}', { n }) : t('não resolve')];
  },
  rollout(r, ctx) {
    const { nome } = separar(r.rollout, 'deployment');
    if (r.semMistura) {
      const max = ctx.versoes.get(nome) ?? 0;
      return [max <= 1, t('deployment/{nome} nunca rodou duas versões ao mesmo tempo', { nome }), t('chegou a {n} versões juntas', { n: max })];
    }
    const min = ctx.minimos.get(nome);
    return [min !== undefined && min >= r.minDisponivel, t('deployment/{nome} nunca ficou com menos de {n} pods prontos', { nome, n: r.minDisponivel }), t('chegou a {n}', { n: min ?? '?' })];
  },
  evento(r, ctx) {
    const { motivo, objeto, mensagem } = r.evento;
    const re = mensagem && new RegExp(mensagem);
    const ok = ctx.cluster.eventos.some((e) => e.reason === motivo && (!objeto || `${e.involvedObject.kind.toLowerCase()}/${e.involvedObject.name}` === objeto) && (!re || re.test(e.message)));
    return [ok, re ? t('aconteceu um evento {motivo} com /{re}/', { motivo, re: mensagem }) : t('aconteceu um evento {motivo}', { motivo }), t('não aconteceu')];
  },
  env(r, ctx) {
    const q = r.env;
    const lista = podsDo(ctx.cluster, q.pods, q.ns).filter(estaPronto);
    const valores = lista.map((p) => ctx.cluster.kubelet.estado(p, p.spec.containers[0].name)?.env?.[q.nome]);
    const casa = (v) => (q.regex ? new RegExp(q.regex).test(v ?? '') : v === q.igual);
    return [lista.length > 0 && valores.every(casa), q.regex ? t('{nome} combina com /{re}/ dentro dos pods {pods}', { nome: q.nome, re: q.regex, pods: q.pods }) : t('{nome}={valor} dentro dos pods {pods}', { nome: q.nome, valor: q.igual, pods: q.pods }), lista.length ? t('veio {valor}', { valor: mostrar(valores[0]) }) : t('nenhum pod pronto')];
  },
  saida(r, ctx) {
    const re = new RegExp(r.saida);
    return [ctx.resultados.some((x) => re.test(x.saida)), t('a saída de um comando do teste combina com /{re}/', { re: r.saida }), ctx.resultados.length ? t('veio {valor}', { valor: mostrar(ctx.resultados.at(-1).saida.trim().split('\n')[0]) }) : t('nenhum comando rodou')];
  },
  vigia(r, ctx) {
    const { falhas, total } = ctx.vigia ?? { falhas: 0, total: 0 };
    const vigia = { url: ctx.urlVigiada, n: r.vigia.maxFalhas };
    return [total > 0 && falhas <= r.vigia.maxFalhas, r.vigia.maxFalhas === 1 ? t('um cliente pedindo {url} a cada segundo teve no máximo {n} erro', vigia) : t('um cliente pedindo {url} a cada segundo teve no máximo {n} erros', vigia), t('teve {falhas} erros em {total} pedidos', { falhas, total })];
  },
  comando(r, ctx) {
    const re = new RegExp(r.comando);
    const formas = (l) => [l, linhaExpandida(ctx.clusterDoAluno, l)].flatMap(formasDoComando);
    return [ctx.historico.some((l) => formas(l).some((f) => re.test(f))), t('você usou um comando que combina com /{re}/', { re: r.comando }), t('nenhum comando parecido no histórico')];
  },
  resposta(r, ctx) {
    const dada = String(ctx.resposta ?? '').trim();
    let ok;
    if (r.resposta instanceof RegExp) ok = r.resposta.test(dada.toLowerCase());
    else if (typeof r.resposta === 'object') {
      const { recurso, nome } = separar(r.resposta.de);
      const obj = ctx.cluster?.obter(recurso.kind, recurso.namespaced ? r.resposta.ns ?? 'default' : null, nome);
      ok = !!obj && dada.toLowerCase() === String(ler(obj, r.resposta.campo)).toLowerCase();
    } else ok = dada.toLowerCase() === String(r.resposta).toLowerCase();
    return [ok, t('a resposta está certa'), dada ? t('não é essa') : t('você ainda não respondeu (o campo fica na aba Missão)')];
  },
  pode(r, ctx) {
    const q = r.pode;
    const rec = acharRecurso(q.recurso);
    const ns = rec.namespaced ? q.ns ?? 'default' : undefined;
    const deixa = podeFazer(ctx.cluster, quemE(q.quem), { verbo: q.verbo, recurso: rec.plural, grupo: rec.grupo, sub: q.sub, ns, nome: q.nome });
    const verbo = `${q.verbo} ${q.sub ? `${q.recurso}/${q.sub}` : q.recurso}`;
    const acao = { quem: q.quem, acao: ns ? t('{acao} no namespace {ns}', { acao: verbo, ns }) : verbo };
    return [deixa === q.resposta, q.resposta ? t('{quem} pode {acao}', acao) : t('{quem} não pode {acao}', acao), deixa ? t('pode') : t('não pode')];
  },
  release(r, ctx) {
    const q = r.release;
    const rev = ctx.cluster.helm?.releases.get(`${q.ns ?? 'default'}/${q.nome}`)?.at(-1);
    if (!rev) return [false, t('a release {nome} existe', { nome: q.nome }), t('não existe (helm list)')];
    const confere = [['status', rev.status, 'status'], ['revisao', rev.revisao, t('revisao')], ['descricao', rev.descricao, t('descricao')]].filter(([k]) => q[k] !== undefined);
    const errado = confere.find(([k, v]) => v !== q[k]);
    return [!errado, t('a release {nome}: {campos}', { nome: q.nome, campos: confere.map(([k, , rotulo]) => `${rotulo} ${q[k]}`).join(', ') || t('existe') }), errado ? t('{campo} é {valor}', { campo: errado[2], valor: errado[1] }) : ''];
  },
  espalhamento(r, ctx) {
    const q = r.espalhamento;
    const conta = new Map(ctx.cluster.listar('Node').map((n) => n.metadata.labels?.[q.chave]).filter((v) => v !== undefined).map((v) => [v, 0]));
    for (const p of podsDo(ctx.cluster, q.pods, q.ns).filter((x) => x.spec.nodeName)) {
      const v = ctx.cluster.obter('Node', null, p.spec.nodeName)?.metadata.labels?.[q.chave];
      if (conta.has(v)) conta.set(v, conta.get(v) + 1);
    }
    const valores = [...conta.values()];
    const dif = valores.length ? Math.max(...valores) - Math.min(...valores) : 0;
    return [dif <= q.maxSkew, t('os pods {pods} estão espalhados por {chave} (diferença de no máximo {n})', { pods: q.pods, chave: q.chave, n: q.maxSkew }), [...conta].map(([k, n]) => `${k}: ${n}`).join(', ')];
  },
  egressMinimo(r, ctx) {
    const ns = r.ns ?? 'default';
    const { nome } = separar(r.egressMinimo, 'networkpolicy');
    const np = ctx.cluster.obter('NetworkPolicy', ns, nome);
    if (!np) return [false, r.egressMinimo, t('{alvo} não existe', { alvo: r.egressMinimo })];
    // As políticas se somam: vale toda NetworkPolicy de saída que pega um dos pods desta (uma 2ª "libera-dns" também).
    const pods = ctx.cluster.listar('Pod', ns).filter((p) => casaLabelSelector(np.spec.podSelector ?? {}, p.metadata.labels));
    const deSaida = (x) => (x.spec.policyTypes ?? ['Ingress', ...(x.spec.egress ? ['Egress'] : [])]).includes('Egress');
    const politicas = ctx.cluster.listar('NetworkPolicy', ns).filter((x) => x.metadata.name === nome
      || (deSaida(x) && pods.some((p) => casaLabelSelector(x.spec.podSelector ?? {}, p.metadata.labels))));
    const regras = politicas.flatMap((x) => (x.spec.egress ?? []).map((e, i) => [`networkpolicy/${x.metadata.name} egress[${i}]`, e]));
    // Fixa = escolhe pelo valor da label (matchLabels ou In); vazio, Exists, DoesNotExist e NotIn pegam qualquer um.
    const fixa = (s) => !!s && (Object.keys(s.matchLabels ?? {}).length > 0 || (s.matchExpressions ?? []).some((e) => e.operator === 'In'));
    // ponytail: ipBlock largo pelo prefixo (< /8), não pela soma dos blocos; some os blocos se alguém juntar 256 /8.
    const parLargo = (par) => (par.namespaceSelector && !fixa(par.namespaceSelector) && !fixa(par.podSelector)) || Number(par.ipBlock?.cidr?.split('/')[1] ?? 32) < 8;
    const portaLarga = (p) => p.port === undefined || (p.endPort !== undefined && p.endPort > p.port);
    const larga = regras.find(([, e]) => !e.to?.length || !e.ports?.length || e.ports.some(portaLarga) || e.to.some(parLargo));
    const portas53 = new Set(regras.flatMap(([, e]) => e.ports ?? []).filter((p) => String(p.port) === '53').map((p) => p.protocol ?? 'TCP'));
    const semDns = portas53.size && !(portas53.has('UDP') && portas53.has('TCP'));
    const detalhe = larga ? `${larga[0]}: ${JSON.stringify(larga[1])}` : `egress: 53/${[...portas53].join(', 53/')}`;
    return [!larga && !semDns, `${r.egressMinimo}: egress (to, ports)`, detalhe];
  },
  contexto(r, ctx) {
    const atual = ctx.cluster.contexto.namespace;
    return [atual === r.contexto.namespace, t('o namespace padrão do kubectl é {ns}', { ns: r.contexto.namespace }), t('está {valor}', { valor: atual })];
  },
};

export const TIPOS_DE_REGRA = Object.keys(REGRAS);

/** Confere uma regra. → { ok, mensagem, detalhe } */
export function conferir(regra, ctx) {
  const tipo = TIPOS_DE_REGRA.find((t) => t in regra);
  if (!tipo) throw new Error(`regra desconhecida: ${JSON.stringify(regra)}`);
  const [ok, mensagem, detalhe] = REGRAS[tipo](regra, ctx);
  return { ok, mensagem: regra.msg ?? mensagem, detalhe: ok ? '' : detalhe };
}

/** Pods prontos e versões rodando de cada Deployment agora (para a regra rollout), e o cliente vigiando a URL. */
function amostrar(cluster, ctx) {
  if (ctx.urlVigiada) {
    ctx.vigia.total++;
    if (pedir(cluster, { url: ctx.urlVigiada }).status !== 200) ctx.vigia.falhas++;
  }
  for (const d of cluster.listar('Deployment', 'default')) {
    const sel = Object.entries(d.spec.selector.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',');
    const pods = podsDo(cluster, sel);
    const nome = d.metadata.name;
    ctx.minimos.set(nome, Math.min(ctx.minimos.get(nome) ?? Infinity, pods.filter(estaPronto).length));
    // Contam também os pods ainda terminando: eles continuam atendendo.
    const vivos = cluster.listar('Pod', 'default').filter((p) => seletorDeLabels(sel)(p.metadata.labels) && p.status?.phase === 'Running');
    ctx.versoes.set(nome, Math.max(ctx.versoes.get(nome) ?? 0, new Set(vivos.map((p) => p.spec.containers[0].image)).size));
  }
}

/**
 * Roda um teste. ctx: { arquivos, historico, resposta, clusterDoAluno }.
 * → { descricao, oculto, ok, regras: [{ ok, mensagem, detalhe }] }
 */
export function rodarTeste(item, teste, indice, { arquivos = {}, historico = [], resposta, clusterDoAluno } = {}) {
  const ctx = { resultados: [], historico, resposta, clusterDoAluno, minimos: new Map(), versoes: new Map(), urlVigiada: teste.vigiar, vigia: { falhas: 0, total: 0 } };
  if (teste.noClusterDoAluno) {
    ctx.cluster = clusterDoAluno;
  } else {
    ctx.cluster = montarCluster(item.cluster, `${item.id}#${indice}`);
    for (const passo of teste.passos ?? PASSOS_PADRAO) {
      if (passo.comando) {
        ctx.resultados.push(rodarLinha(ctx.cluster, passo.comando, { ...arquivos }));
        amostrar(ctx.cluster, ctx);
      } else if (passo.adicionarNode) {
        ctx.cluster.criarNodes([{ nome: passo.adicionarNode }], ctx.cluster.listar('Node').length);
        ctx.cluster.reconciliar();
      } else if (passo.zerar) {
        Object.assign(ctx, { minimos: new Map(), versoes: new Map(), vigia: { falhas: 0, total: 0 } });
      } else if (passo.derrubarNode) {
        ctx.cluster.derrubarNode(passo.derrubarNode);
      } else if (passo.avancar) {
        const fim = ctx.cluster.agora + parseDuracao(passo.avancar);
        while (ctx.cluster.agora < fim) {
          ctx.cluster.avancar(1000);
          amostrar(ctx.cluster, ctx);
        }
      }
    }
  }
  ctx.cluster?.ativar(); // os tipos dos CRDs deste cluster
  const regras = ctx.cluster ? teste.regras.map((r) => conferir(r, ctx)) : [{ ok: false, mensagem: t('o cluster do terminal'), detalhe: t('abra o exercício e use o terminal') }];
  return { descricao: teste.descricao, oculto: !!teste.oculto, ok: regras.every((r) => r.ok), regras };
}

/** Roda os testes do item (os ocultos só com `todos`). */
export function rodarTestes(item, opcoes = {}, { todos = false } = {}) {
  return item.testes
    .map((t, i) => [t, i])
    .filter(([t]) => todos || !t.oculto)
    .map(([t, i]) => rodarTeste(item, t, i, opcoes));
}
