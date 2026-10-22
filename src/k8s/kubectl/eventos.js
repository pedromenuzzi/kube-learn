// O kubectl events (o comando novo, que já põe os eventos em ordem de horário): --for, --types, -A, --no-headers,
// -o yaml/jsonpath e -w. Como o events.go do kubectl: OBJECT é Kind/nome e LAST SEEN junta as repetições.
import { tabela } from '../tabwriter.js';
import { idade } from '../unidades.js';
import { acharRecurso, apiVersion } from '../recursos.js';
import { paraYaml, paraJson, jsonpath } from './formatos.js';

const FORMATOS = 'go-template,go-template-file,json,jsonpath,jsonpath-as-json,jsonpath-file,kyaml,name,template,templatefile,yaml';
const desde = (agora, ts) => (ts ? idade(agora - Date.parse(ts)) : '<unknown>');

/** "66s (x5 over 2m50s)" quando o evento se repetiu; senão, há quanto tempo foi o primeiro. */
function intervalo(e, agora) {
  const primeiro = desde(agora, e.eventTime ?? e.firstTimestamp);
  return e.count > 1 ? `${desde(agora, e.lastTimestamp)} (x${e.count} over ${primeiro})` : primeiro;
}

const linha = (e, agora, todosNs) => [...(todosNs ? [e.metadata.namespace] : []), intervalo(e, agora), e.type, e.reason, `${e.involvedObject.kind}/${e.involvedObject.name}`, (e.message ?? '').trim()];

/** kubectl events. `ns` é o namespace do comando (o -n ou o do contexto). */
export function eventos(cluster, a, s, ns) {
  const f = a.flags;
  const todosNs = !!f['all-namespaces'];
  const tipos = (f.types ?? []).flatMap((x) => x.split(',')).filter(Boolean).map((x) => x.toLowerCase());
  if (tipos.some((x) => !['normal', 'warning'].includes(x))) return s.falha('error: valid --types are Normal or Warning');
  const fmt = f.output ?? '';
  if (fmt && !['yaml', 'json', 'name'].includes(fmt) && !/^jsonpath(-as-json)?=/.test(fmt)) {
    return s.falha(`error: unable to match a printer suitable for the output format "${fmt}", allowed formats are: ${FORMATOS}`);
  }
  let alvo = null;
  if (f.for) {
    const [tipo, nome, ...resto] = f.for.split('/');
    if (!nome || resto.length) return s.falha('error: --for must be in resource/name form');
    const r = acharRecurso(tipo);
    if (!r) return s.falha(`the server doesn't have a resource type "${tipo}"`);
    alvo = { kind: r.kind, apiVersion: apiVersion(r), nome };
  }
  const casa = (e) => (!alvo || (e.involvedObject.kind === alvo.kind && e.involvedObject.apiVersion === alvo.apiVersion && e.involvedObject.name === alvo.nome))
    && (!tipos.length || tipos.includes(e.type.toLowerCase()));
  // A API devolve em ordem de nome; o kubectl reordena pelo último horário (sort.Sort: estável até 12 itens).
  const quando = (e) => Date.parse(e.lastTimestamp ?? e.eventTime);
  const lista = cluster.listar('Event', todosNs ? undefined : ns).filter(casa).sort((x, y) => quando(x) - quando(y));

  if (fmt) {
    const obj = { apiVersion: 'v1', items: lista, kind: 'EventList', metadata: {} };
    if (fmt === 'yaml') s.out(paraYaml(obj));
    else if (fmt === 'json') s.out(paraJson(obj)); // ponytail: o real escreve na ordem dos campos da struct do Go, não em ordem alfabética
    else if (fmt !== 'name') { // -o name não escreve nada para eventos (o real também não)
      try {
        s.out(jsonpath(fmt.slice(fmt.indexOf('=') + 1), obj));
      } catch (e) {
        return s.falha(`error: ${e.message}`);
      }
    }
  } else if (!lista.length) {
    s.err(todosNs ? 'No events found.\n' : `No events found in ${ns} namespace.\n`);
  } else {
    const cab = [...(todosNs ? ['NAMESPACE'] : []), 'LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'];
    s.out(tabela([...(f['no-headers'] ? [] : [cab]), ...lista.map((e) => linha(e, cluster.agora, todosNs))]));
  }
  if (!f.watch) return null;
  // -w: cada evento novo (ou que se repetiu) numa linha, alinhada sozinha.
  let visto = cluster.rv;
  return () => {
    const novos = cluster.historico.filter((h) => h.rv > visto && h.obj.kind === 'Event' && (todosNs || h.obj.metadata.namespace === ns) && casa(h.obj));
    visto = cluster.rv;
    return novos.map((h) => tabela([linha(h.obj, cluster.agora, todosNs)])).join('');
  };
}
