// @vitest-environment node
// Os índices que deixam o cluster rápido (por kind, por nome e os eventos por objeto) dizem sempre o mesmo que
// varrer tudo, como o listar, o obter e o evento faziam antes.
import { describe, expect, it } from 'vitest';
import { criarCluster } from '../src/k8s/cluster.js';
import { kubectl } from '../src/k8s/kubectl/index.js';

const porNsENome = (a, b) => (a.metadata.namespace ?? '').localeCompare(b.metadata.namespace ?? '') || a.metadata.name.localeCompare(b.metadata.name);

function conferir(c) {
  const todos = [...c.objetos.values()];
  for (const kind of new Set(todos.map((o) => o.kind))) {
    const doKind = todos.filter((o) => o.kind === kind);
    expect(c.listar(kind)).toEqual(doKind.sort(porNsENome));
    for (const ns of new Set(doKind.map((o) => o.metadata.namespace))) {
      expect(c.listar(kind, ns), `${kind} em ${ns}`).toEqual(doKind.filter((o) => o.metadata.namespace === ns));
    }
  }
  for (const o of todos) expect(c.obter(o.kind, o.metadata.namespace, o.metadata.name)).toBe(o);
  expect(c.obter('Pod', 'default', 'nao-existe')).toBeUndefined();
  for (const e of c.eventos) expect(c.eventosDo(e.involvedObject.uid)).toEqual(c.eventos.filter((x) => x.involvedObject.uid === e.involvedObject.uid));
}

describe('índices do cluster', () => {
  it('acompanham criação, remoção, namespace apagado e eventos vencidos', () => {
    const c = criarCluster();
    const k = (linha) => expect(kubectl(c, linha).codigo, linha).toBe(0);
    conferir(c);
    k('kubectl create namespace loja');
    k('kubectl create deployment web --image=nginx:1.27 --replicas=3 -n loja');
    k('kubectl create deployment api --image=nginx:1.27 --replicas=2');
    c.avancar('30s');
    conferir(c);
    k('kubectl scale deployment api --replicas=5');
    k('kubectl delete pod -n loja --all --wait=false');
    c.avancar('30s');
    conferir(c);
    k('kubectl delete namespace loja --wait=false');
    c.avancar('2h'); // o namespace some e os eventos vencem
    conferir(c);
  });
});
