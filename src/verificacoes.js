// Os testes dos exercícios. Cada teste monta um cluster novo (ou usa o do aluno, nos exercícios de terminal),
// roda os passos e confere as regras. Cada regra é um objeto com uma das chaves abaixo (e `msg` opcional):
//
//   { semErros: true }                                 todos os comandos do teste deram certo
//   { erro: 'texto' }                                  algum comando falhou com esse texto
//   { objeto: 'deployment/loja', ns, campo: 'spec.replicas', igual | contem | regex | existe }
//   { pods: 'app=loja', ns, quantidade, prontos, fase, imagem, node, reinicios: { max } }
//   { status: 'pod/x' | 'app=x', motivo: 'CrashLoopBackOff' }   motivo atual (ou o último término)
//   { endpoints: 'svc/loja', quantidade }              quantos pods prontos atrás do Service
//   { requisicao: { url, de: 'pod/x' | 'fora', host, status: 200 | 'recusada' | 'timeout' | 'dns', corpo: 'regex' } }
//                                                      ('fora' = do computador do aluno; host = cabeçalho Host)
//   { distribuicao: { url, de, host, vezes: 100, corpo: 'regex', entre: [5, 15] } }   quantas respostas casam
//   { dns: { nome, de: 'pod/x', quantidade } }         quantos endereços o nome resolve (headless = um por pod)
//   { rollout: 'deployment/loja', minDisponivel: 3 }   nunca ficou com menos pods prontos durante o teste
//   { evento: { motivo, objeto } }                     aconteceu um evento com esse motivo
//   { env: { pods: 'app=x', nome, igual | regex } }    a variável de ambiente dentro do contêiner
//   { comando: 'regex' }                               o aluno usou esse comando no terminal
//   { saida: 'regex' }                                 a saída de algum comando dos passos do teste combina
//   { vigia: { maxFalhas: 0 } }                        com `vigiar: 'http://loja'` no teste: um cliente pediu a URL a
//                                                      cada segundo dos passos, e no máximo tantas deram erro
//   { resposta: 'texto' | /regex/ | { de: 'pod/x', campo: 'spec.nodeName' } }   a resposta que o aluno digitou
//                                                      (a última forma compara com um campo do cluster do aluno)
//   { contexto: { namespace } }                        o namespace padrão do kubectl (kubectl config set-context)
//   { pode: { quem: 'ana' | 'system:serviceaccount:ns:nome', verbo: 'list', recurso: 'pods', sub, ns, resposta: true } }
//                                                      o RBAC deixa (ou não) a pessoa fazer aquilo
//   { espalhamento: { pods: 'app=x', chave: 'topology.kubernetes.io/zone', maxSkew: 1 } }   a maior diferença de
//                                                      pods entre os domínios (os valores da label nos nodes)
//
// Passos (`passos`): { comando: 'kubectl ...' }, { avancar: '30s' }, { adicionarNode: 'node-3' } (um prédio novo no condomínio)
// e { derrubarNode: 'node-2' } (o prédio fica sem luz: o kubelet dele para).
// Sem `passos`: kubectl apply -f . e 1 minuto de relógio.
import { montarCluster } from './conteudo/clusters.js';
import { kubectl, seletorDeLabels } from './k8s/kubectl/index.js';
import { acharRecurso, pluralQualificado } from './k8s/recursos.js';
import { estaPronto, http, httpDeFora, resolver } from './k8s/rede.js';
import { resumoPod } from './k8s/kubectl/tabelas.js';
import { canonico } from './k8s/aleatorio.js';
import { pode as podeFazer, quemE } from './k8s/seguranca.js';
import { parseDuracao } from './k8s/unidades.js';

/** Uma requisição de teste: de um pod, de dentro do cluster (sem pod) ou de fora (o computador do aluno). */
function pedir(cluster, q) {
  const m = q.url.match(/^(?:https?:\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/);
  const url = { host: m[1], porta: Number(m[2] ?? 80), caminho: m[3] ?? '/' };
  if (q.de === 'fora') return httpDeFora(cluster, url, { host: q.host });
  const origem = q.de ? cluster.obter('Pod', q.ns ?? 'default', separar(q.de).nome) : null;
  return http(cluster, origem, url);
}

const PASSOS_PADRAO = [{ comando: 'kubectl apply -f .' }, { avancar: '1m' }];
const mostrar = (v) => (v === undefined ? 'nada' : JSON.stringify(v));

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
  if ('igual' in regra) return [canonico(valor) === canonico(regra.igual), `${rotulo} = ${mostrar(regra.igual)}`, `veio ${mostrar(valor)}`];
  if ('contem' in regra) {
    const ok = Array.isArray(valor) ? valor.includes(regra.contem) : String(valor ?? '').includes(regra.contem);
    return [ok, `${rotulo} contém ${mostrar(regra.contem)}`, `veio ${mostrar(valor)}`];
  }
  if ('regex' in regra) return [new RegExp(regra.regex).test(valor && typeof valor === 'object' ? JSON.stringify(valor) : String(valor ?? '')), `${rotulo} combina com /${regra.regex}/`, `veio ${mostrar(valor)}`];
  const deveExistir = regra.existe ?? true;
  return [(valor !== undefined) === deveExistir, `${rotulo} ${deveExistir ? 'existe' : 'não existe'}`, `veio ${mostrar(valor)}`];
}

const REGRAS = {
  semErros(r, ctx) {
    const falhou = ctx.resultados.find((x) => x.codigo !== 0);
    return [!falhou, 'os comandos rodaram sem erro', falhou ? falhou.saida.trim().split('\n')[0] : ''];
  },
  erro(r, ctx) {
    const ok = ctx.resultados.some((x) => x.codigo !== 0 && x.saida.includes(r.erro));
    return [ok, `o comando falha com "${r.erro}"`, 'nenhum comando falhou com esse texto'];
  },
  objeto(r, ctx) {
    const { recurso, nome } = separar(r.objeto);
    const obj = recurso && ctx.cluster.obter(recurso.kind, recurso.namespaced ? r.ns ?? 'default' : null, nome);
    if (!obj && r.existe === false && !r.campo) return [true, `${r.objeto} não existe`];
    if (obj && r.existe === false && !r.campo) return [false, `${r.objeto} não existe`, 'ainda existe'];
    if (!obj) return [false, `${r.objeto}${r.campo ? `: ${r.campo}` : ''} existe`, `${pluralQualificado(recurso ?? { plural: r.objeto, grupo: '' })} "${nome}" não existe`];
    if (!r.campo) return [true, `${r.objeto} existe`];
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
    if (r.quantidade !== undefined) conferir(lista.length === r.quantidade, `${r.quantidade} pods`, `há ${lista.length}`);
    if (r.prontos !== undefined) conferir(prontos.length === r.prontos, `${r.prontos} prontos`, `${prontos.length} prontos de ${lista.length}`);
    if (r.fase) conferir(lista.length > 0 && lista.every((p) => p.status?.phase === r.fase), `fase ${r.fase}`, lista.map((p) => `${p.metadata.name}: ${p.status?.phase}`).join(', ') || 'nenhum pod');
    if (r.imagem) {
      const outras = lista.filter((p) => p.spec.containers[0].image !== r.imagem);
      conferir(lista.length > 0 && !outras.length, `com a imagem ${r.imagem}`, outras.length ? `${outras[0].metadata.name} usa ${outras[0].spec.containers[0].image}` : 'nenhum pod');
    }
    if (r.node) conferir(lista.length > 0 && lista.every((p) => p.spec.nodeName === r.node), `no node ${r.node}`, lista.map((p) => `${p.metadata.name}: ${p.spec.nodeName ?? 'sem node'}`).join(', '));
    if (r.reinicios?.max !== undefined) {
      const muito = lista.find((p) => (p.status?.containerStatuses ?? []).some((s) => s.restartCount > r.reinicios.max));
      conferir(!muito, `até ${r.reinicios.max} reinícios`, muito ? `${muito.metadata.name} reiniciou mais` : '');
    }
    return [ok, `pods ${r.pods}: ${partes.join(', ')}`, detalhe];
  },
  status(r, ctx) {
    const lista = r.status.includes('=') ? podsDo(ctx.cluster, r.status, r.ns) : [ctx.cluster.obter('Pod', r.ns ?? 'default', separar(r.status).nome)].filter(Boolean);
    const motivos = lista.map((p) => resumoPod(p, ctx.cluster.agora).status);
    const ultimos = lista.flatMap((p) => (p.status?.containerStatuses ?? []).map((s) => s.lastState?.terminated?.reason)).filter(Boolean);
    return [motivos.includes(r.motivo) || ultimos.includes(r.motivo), `${r.status} mostra ${r.motivo}`, motivos.length ? `está ${motivos.join(', ')}` : 'pod não encontrado'];
  },
  endpoints(r, ctx) {
    const { nome } = separar(r.endpoints, 'svc');
    const ep = ctx.cluster.obter('Endpoints', r.ns ?? 'default', nome);
    const n = (ep?.subsets ?? []).reduce((s, x) => s + (x.addresses?.length ?? 0), 0);
    return [n === r.quantidade, `o Service ${nome} tem ${r.quantidade} pods prontos atrás dele`, `tem ${n}`];
  },
  requisicao(r, ctx) {
    const q = r.requisicao;
    const res = pedir(ctx.cluster, q);
    const obtido = res.erro ?? res.status;
    const statusOk = obtido === (q.status ?? 200);
    const corpoOk = !q.corpo || new RegExp(q.corpo).test(res.corpo ?? '');
    const detalhe = statusOk ? `veio ${obtido}, mas sem /${q.corpo}/ na resposta: ${mostrar((res.corpo ?? '').trim().slice(0, 80))}` : `veio ${obtido}`;
    return [statusOk && corpoOk, `${q.url} responde ${q.status ?? 200}${q.corpo ? ` com /${q.corpo}/` : ''}`, detalhe];
  },
  distribuicao(r, ctx) {
    const q = r.distribuicao;
    const re = new RegExp(q.corpo);
    let n = 0;
    for (let i = 0; i < (q.vezes ?? 100); i++) if (re.test(pedir(ctx.cluster, q).corpo ?? '')) n++;
    const [min, max] = q.entre;
    return [n >= min && n <= max, `de ${q.vezes ?? 100} requisições a ${q.url}, entre ${min} e ${max} casam com /${q.corpo}/`, `foram ${n}`];
  },
  dns(r, ctx) {
    const q = r.dns;
    const origem = q.de ? ctx.cluster.obter('Pod', q.ns ?? 'default', separar(q.de).nome) : null;
    const res = resolver(ctx.cluster, q.nome, origem?.metadata.namespace ?? 'default');
    const n = res?.ips?.length ?? 0;
    return [n === q.quantidade, `${q.nome} resolve para ${q.quantidade} endereço${q.quantidade === 1 ? '' : 's'}`, res ? `resolve para ${n}` : 'não resolve'];
  },
  rollout(r, ctx) {
    const { nome } = separar(r.rollout, 'deployment');
    if (r.semMistura) {
      const max = ctx.versoes.get(nome) ?? 0;
      return [max <= 1, `deployment/${nome} nunca rodou duas versões ao mesmo tempo`, `chegou a ${max} versões juntas`];
    }
    const min = ctx.minimos.get(nome);
    return [min !== undefined && min >= r.minDisponivel, `deployment/${nome} nunca ficou com menos de ${r.minDisponivel} pods prontos`, `chegou a ${min ?? '?'}`];
  },
  evento(r, ctx) {
    const ok = ctx.cluster.eventos.some((e) => e.reason === r.evento.motivo && (!r.evento.objeto || `${e.involvedObject.kind.toLowerCase()}/${e.involvedObject.name}` === r.evento.objeto));
    return [ok, `aconteceu um evento ${r.evento.motivo}`, 'não aconteceu'];
  },
  env(r, ctx) {
    const q = r.env;
    const lista = podsDo(ctx.cluster, q.pods, q.ns).filter(estaPronto);
    const valores = lista.map((p) => ctx.cluster.kubelet.estado(p, p.spec.containers[0].name)?.env?.[q.nome]);
    const casa = (v) => (q.regex ? new RegExp(q.regex).test(v ?? '') : v === q.igual);
    return [lista.length > 0 && valores.every(casa), `${q.nome}${q.regex ? ` combina com /${q.regex}/` : `=${q.igual}`} dentro dos pods ${q.pods}`, lista.length ? `veio ${mostrar(valores[0])}` : 'nenhum pod pronto'];
  },
  saida(r, ctx) {
    const re = new RegExp(r.saida);
    return [ctx.resultados.some((x) => re.test(x.saida)), `a saída de um comando do teste combina com /${r.saida}/`, ctx.resultados.length ? `veio ${mostrar(ctx.resultados.at(-1).saida.trim().split('\n')[0])}` : 'nenhum comando rodou'];
  },
  vigia(r, ctx) {
    const { falhas, total } = ctx.vigia ?? { falhas: 0, total: 0 };
    return [total > 0 && falhas <= r.vigia.maxFalhas, `um cliente pedindo ${ctx.urlVigiada} a cada segundo teve no máximo ${r.vigia.maxFalhas} erro${r.vigia.maxFalhas === 1 ? '' : 's'}`, `teve ${falhas} erros em ${total} pedidos`];
  },
  comando(r, ctx) {
    const re = new RegExp(r.comando);
    return [ctx.historico.some((l) => re.test(l.trim())), `você usou um comando que combina com /${r.comando}/`, 'nenhum comando parecido no histórico'];
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
    return [ok, 'a resposta está certa', dada ? 'não é essa' : 'você ainda não respondeu (o campo fica na aba Missão)'];
  },
  pode(r, ctx) {
    const q = r.pode;
    const rec = acharRecurso(q.recurso);
    const ns = rec.namespaced ? q.ns ?? 'default' : undefined;
    const deixa = podeFazer(ctx.cluster, quemE(q.quem), { verbo: q.verbo, recurso: rec.plural, grupo: rec.grupo, sub: q.sub, ns, nome: q.nome });
    const acao = `${q.verbo} ${q.sub ? `${q.recurso}/${q.sub}` : q.recurso}${ns ? ` no namespace ${ns}` : ''}`;
    return [deixa === q.resposta, `${q.quem} ${q.resposta ? 'pode' : 'não pode'} ${acao}`, deixa ? 'pode' : 'não pode'];
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
    return [dif <= q.maxSkew, `os pods ${q.pods} estão espalhados por ${q.chave} (diferença de no máximo ${q.maxSkew})`, [...conta].map(([k, n]) => `${k}: ${n}`).join(', ')];
  },
  contexto(r, ctx) {
    const atual = ctx.cluster.contexto.namespace;
    return [atual === r.contexto.namespace, `o namespace padrão do kubectl é ${r.contexto.namespace}`, `está ${atual}`];
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
  const ctx = { resultados: [], historico, resposta, minimos: new Map(), versoes: new Map(), urlVigiada: teste.vigiar, vigia: { falhas: 0, total: 0 } };
  if (teste.noClusterDoAluno) {
    ctx.cluster = clusterDoAluno;
  } else {
    ctx.cluster = montarCluster(item.cluster, `${item.id}#${indice}`);
    for (const passo of teste.passos ?? PASSOS_PADRAO) {
      if (passo.comando) {
        ctx.resultados.push(kubectl(ctx.cluster, passo.comando, { arquivos }));
        amostrar(ctx.cluster, ctx);
      } else if (passo.adicionarNode) {
        ctx.cluster.criarNodes([{ nome: passo.adicionarNode }], ctx.cluster.listar('Node').length);
        ctx.cluster.reconciliar();
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
  const regras = ctx.cluster ? teste.regras.map((r) => conferir(r, ctx)) : [{ ok: false, mensagem: 'o cluster do terminal', detalhe: 'abra o exercício e use o terminal' }];
  return { descricao: teste.descricao, oculto: !!teste.oculto, ok: regras.every((r) => r.ok), regras };
}

/** Roda os testes do item (os ocultos só com `todos`). */
export function rodarTestes(item, opcoes = {}, { todos = false } = {}) {
  return item.testes
    .map((t, i) => [t, i])
    .filter(([t]) => todos || !t.oculto)
    .map(([t, i]) => rodarTeste(item, t, i, opcoes));
}
