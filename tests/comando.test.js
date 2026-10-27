// @vitest-environment node
// A regra `comando` aceita o kubectl válido escrito de outro jeito (aspas, -n antes do verbo, -oyaml, flags em outra
// ordem, e os reflexos do exame: o k, um alias do aluno e o $do) e continua recusando o comando errado de verdade (verbo
// errado, flag faltando). O contrário das armadilhas.
import { describe, expect, it } from 'vitest';
import { ITENS, OFICINA } from '../src/conteudo/index.js';
import { formasDoComando, rodarTestes } from '../src/verificacoes.js';
import { criarCluster } from '../src/k8s/cluster.js';
import { linhaExpandida, rodarLinha } from '../src/k8s/linha.js';
import { aluno } from './trilha.js';

const item = (id) => [...ITENS, ...OFICINA].find((i) => i.id === id);
const gerar = (flags) => [`kubectl create deployment api --image=kubelearn/loja:1.0 --replicas=3 ${flags}`, 'kubectl apply -f api.yaml'];

/** Por missão: os históricos que têm de passar (aceitas) e os que têm de reprovar (recusadas). */
const CASOS = {
  'of-gerar-yaml': {
    aceitas: [
      gerar('--dry-run=client -oyaml > api.yaml'),
      gerar('-o yaml --dry-run=client > api.yaml'),
      gerar('--dry-run=client --output=yaml > api.yaml'),
      gerar('--dry-run=client -o=yaml >api.yaml'),
      ['export do="--dry-run=client -o yaml"', ...gerar('$do > api.yaml')],
      ['export do="--dry-run=client -o yaml"', ...gerar('${do} > api.yaml')],
      ['alias kc=kubectl', 'export do="--dry-run=client -o yaml"', 'kc create deploy api --image=kubelearn/loja:1.0 --replicas=3 $do > api.yaml', 'k apply -f api.yaml'],
    ],
    recusadas: [
      ['export do="-o yaml"', ...gerar('$do > api.yaml')], // o $do sem o --dry-run
      gerar('-o yaml > api.yaml'), // sem o --dry-run: criou de verdade, e o arquivo só veio junto
      ['kubectl create deployment api --image=kubelearn/loja:1.0 --replicas=3'], // sem gerar o arquivo
    ],
  },
  'n1-seletor': {
    aceitas: [["kubectl get pods -l 'equipe=suporte'"], ['kubectl get pods -l "equipe=suporte"'], ['kubectl get pods --selector equipe=suporte'], ['kubectl get po -lequipe=suporte']],
    recusadas: [['kubectl get pods --show-labels']],
  },
  'kubectl-escalar': {
    aceitas: [
      ['kubectl -n default scale deployment loja --replicas=5'], ['kubectl --namespace=default scale deploy/loja --replicas 5'],
      ['k scale deployment loja --replicas=5'], ['alias kc=kubectl', 'kc scale deployment loja --replicas=5'],
      ["alias kd='kubectl -n default'", 'kd scale deploy loja --replicas=5'], ['k get deploy && k scale deploy loja --replicas=5'],
    ],
    recusadas: [['kubectl patch deployment loja -p \'{"spec":{"replicas":5}}\''], ['k patch deployment loja -p \'{"spec":{"replicas":5}}\'']],
  },
  'n5-coleta-agora': {
    aceitas: [['kubectl create job --from=cronjob/backup teste'], ['kubectl create job teste --from cronjob/backup'], ['kubectl create job teste --from=cj/backup']],
    recusadas: [['kubectl create job teste --image=busybox:1.36 -- sh -c "echo backup feito: 128 arquivos"']],
  },
  'n8-quem-apaga': {
    aceitas: [['kubectl -n loja auth can-i delete pods --as=bruno'], ['kubectl auth can-i delete pods --as bruno --namespace loja']],
    recusadas: [['kubectl get rolebindings -n loja -o yaml']],
  },
  'n1-em-que-node': {
    aceitas: [["kubectl get pod misterio -o jsonpath='{.spec.nodeName}'"], ['kubectl get pod misterio -o yaml | grep nodeName'], ['kubectl describe pod misterio']],
    recusadas: [['kubectl get pods']],
  },
  'n3-port-forward': {
    aceitas: [['kubectl port-forward svc/loja 8080:80', 'curl 127.0.0.1:8080'], ['kubectl port-forward service/loja 8080:80', 'curl -s http://localhost:8080/']],
    recusadas: [['kubectl port-forward svc/loja 8080:80'], ['kubectl exec deploy/loja -- wget -qO- http://localhost:8080']],
  },
  'of-rotulos': {
    aceitas: [
      ["kubectl label pods -l 'app=vitrine' tier=frontend", "kubectl get pods -l 'tier=frontend'"],
      ['kubectl label -l app=vitrine po tier=frontend', 'kubectl get po --selector=tier=frontend -o wide'],
    ],
    recusadas: [['kubectl label pods -l app=vitrine tier=frontend', 'kubectl get pods --show-labels']],
  },
};

const passa = (id, historico) => rodarTestes(item(id), aluno(item(id), { resolvido: true }, { historico }), { todos: true }).every((t) => t.ok);

describe('a regra comando', () => {
  for (const [id, { aceitas, recusadas }] of Object.entries(CASOS)) {
    for (const h of aceitas) it(`${id} aceita: ${h.join(' ; ')}`, () => expect(passa(id, h)).toBe(true));
    for (const h of recusadas) it(`${id} recusa: ${h.join(' ; ')}`, () => expect(passa(id, h)).toBe(false));
  }

  it('normaliza sem mexer no comando do contêiner, e separa os comandos de uma linha', () => {
    expect(formasDoComando("kubectl -n loja get pods -l 'app=x' -oyaml | grep nome")).toContain('kubectl get pods -l app=x -o yaml -n loja | grep nome');
    expect(formasDoComando('kubectl -n loja exec -it pod -- ls -la')).toContain('kubectl exec -it pod -n loja -- ls -la');
    expect(formasDoComando('kubectl apply -f a.yaml && kubectl -n x scale deploy/a --replicas=2')).toContain('kubectl scale deploy/a --replicas=2 -n x');
  });

  it('a linha expandida troca o k, os aliases e as variáveis em cada comando, e o k de dentro das aspas fica', () => {
    const c = criarCluster();
    rodarLinha(c, "alias kc=kubectl && alias kgp='kubectl get pods' && export do='--dry-run=client -o yaml'", {});
    expect(linhaExpandida(c, 'kc run x --image=nginx $do > x.yaml && k get po | grep k; kgp -o name')).toBe('kubectl run x --image=nginx --dry-run=client -o yaml > x.yaml && kubectl get po | grep k; kubectl get pods -o name');
    expect(linhaExpandida(c, "kubectl exec x -- sh -c 'k get po'")).toBe("kubectl exec x -- sh -c 'k get po'");
    expect(linhaExpandida(criarCluster(), 'kc get po $do')).toBe('kc get po ');
  });
});
