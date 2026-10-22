// @vitest-environment node
// O que o golden (tests/golden/secoes/10-oficina.js) não pega: as contas do --sort-by, o JSON patch que move e copia,
// o kubectl events -w, o patch num recurso de CRD e a mensagem honesta dos comandos que o simulador ainda não imita.
import { describe, expect, it } from 'vitest';
import { criarCluster } from '../src/k8s/cluster.js';
import { kubectl } from '../src/k8s/kubectl/index.js';
import { ordenarPor } from '../src/k8s/kubectl/colunas.js';
import { aplicarJsonPatch } from '../src/k8s/kubectl/patch.js';

const k = (c, cmd, arquivos) => kubectl(c, cmd, { arquivos });

describe('kubectl da oficina', () => {
  it('--sort-by: números no meio do nome, quantidades e quem não tem o campo', () => {
    const objs = (vs) => vs.map((v) => ({ v }));
    expect(ordenarPor(objs(['pod-10', 'pod-2', 'pod-1']), '.v').map((o) => o.v)).toEqual(['pod-1', 'pod-2', 'pod-10']);
    expect(ordenarPor(objs(['1', '500m', '2Gi', '64Mi']), '.v').map((o) => o.v)).toEqual(['500m', '1', '64Mi', '2Gi']);
    expect(ordenarPor([{ v: 2 }, { n: 'a' }, { v: 1 }, { n: 'b' }], '.v').map((o) => o.v ?? o.n)).toEqual(['b', 'a', 1, 2]);
    expect(() => ordenarPor([{ n: 1 }], '.v')).toThrow('couldn\'t find any field with path "{.v}" in the list of objects');
  });

  it('JSON patch: move, copy, o "-" do fim da lista e a operação que não se aplica', () => {
    const doc = { a: { b: 1 }, l: [1, 2] };
    expect(aplicarJsonPatch(doc, [{ op: 'move', from: '/a/b', path: '/c' }, { op: 'copy', from: '/c', path: '/l/-' }, { op: 'add', path: '/l/0', value: 0 }]))
      .toEqual({ a: {}, c: 1, l: [0, 1, 2, 1] });
    expect(aplicarJsonPatch(doc, [{ op: 'remove', path: '/l/5' }])).toBeNull();
    expect(doc).toEqual({ a: { b: 1 }, l: [1, 2] }); // o original não muda
  });

  it('kubectl events -w mostra os eventos novos de quem foi pedido', () => {
    const c = criarCluster();
    k(c, 'kubectl create deployment web --image=nginx:1.27');
    c.avancar('30s');
    const r = k(c, 'kubectl events --for deploy/web -w');
    expect(r.saida).toMatch(/ScalingReplicaSet {3}Deployment\/web {3}Scaled up replica set web-\w+ from 0 to 1/);
    k(c, 'kubectl scale deploy web --replicas=3');
    c.avancar('5s');
    expect(r.observar()).toMatch(/Scaled up replica set web-\w+ from 1 to 3\n$/);
    expect(r.observar()).toBe('');
  });

  it('patch: o strategic não vale para os recursos de um CRD; o merge vale', () => {
    const c = criarCluster();
    const crd = `apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.kube-learn.dev
spec:
  group: kube-learn.dev
  names: { kind: Backup, plural: backups, singular: backup }
  scope: Namespaced
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              guardar: { type: integer }
`;
    k(c, 'kubectl apply -f crd.yaml', { 'crd.yaml': crd });
    c.avancar('5s');
    k(c, 'kubectl apply -f b.yaml', { 'b.yaml': 'apiVersion: kube-learn.dev/v1\nkind: Backup\nmetadata:\n  name: diario\nspec:\n  guardar: 7\n' });
    expect(k(c, `kubectl patch backup diario -p '{"spec":{"guardar":3}}'`).saida).toBe('error: application/strategic-merge-patch+json is not supported by kube-learn.dev/v1, Kind=Backup: the body of the request was in an unknown format - accepted media types include: application/json-patch+json, application/merge-patch+json, application/apply-patch+yaml\n');
    expect(k(c, `kubectl patch backup diario --type merge -p '{"spec":{"guardar":3}}'`).saida).toBe('backup.kube-learn.dev/diario patched\n');
  });

  it('comando de verdade que o simulador não imita: diz isso, sem prometer nível', () => {
    const c = criarCluster();
    for (const cmd of ['kubectl debug pod/x', 'kubectl set selector svc/x app=y', 'kubectl get pods -o kyaml', 'kubectl create token default']) {
      const r = k(c, cmd);
      expect(r.codigo).toBe(1);
      expect(r.saida).toMatch(/^error: "kubectl [^"]+" existe no kubectl de verdade, mas este simulador ainda não o imita\.\n$/);
    }
  });
});
