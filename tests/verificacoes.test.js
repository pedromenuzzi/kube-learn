// @vitest-environment node
// A regra egressMinimo (src/verificacoes.js): a saída da NetworkPolicy de menor privilégio, e o que a reprova.
import { describe, expect, it } from 'vitest';
import { rodarTeste } from '../src/verificacoes.js';

const KUBE_DNS = `
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
      podSelector:
        matchLabels:
          k8s-app: kube-dns`;
const PORTAS_53 = `
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53`;
const politica = (egress, nome = 'saida') => `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${nome}
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:${egress}
`;
const POD = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: web\nspec:\n  containers:\n  - name: web\n    image: nginx:1.27\n';
const conferir = (egress, regra = { egressMinimo: 'networkpolicy/saida' }, extras = {}) =>
  rodarTeste({ id: 'teste', cluster: 'vazio' }, { regras: [{ semErros: true }, regra] }, 0, { arquivos: { 'saida.yaml': politica(egress), ...extras } }).regras;

describe('egressMinimo', () => {
  it('passa com o DNS do jeito certo: o kube-dns do kube-system, 53/UDP e 53/TCP', () => {
    expect(conferir(`\n  - to:${KUBE_DNS}${PORTAS_53}`).map((r) => r.ok)).toEqual([true, true]);
  });

  it.each([
    ['egress: [{}] (tudo)', '\n  - {}', 'egress[0]: {}'],
    ['sem to (qualquer destino)', `\n  - ports:${PORTAS_53.split('ports:')[1]}`, 'egress[0]: {"ports"'],
    ['sem ports (qualquer porta)', `\n  - to:${KUBE_DNS}`, 'egress[0]: {"to"'],
    ['protocolo sem porta', `\n  - to:${KUBE_DNS}\n    ports:\n    - protocol: UDP`, 'egress[0]'],
    ['namespaceSelector vazio (todos os namespaces)', `\n  - to:\n    - namespaceSelector: {}${PORTAS_53}`, 'egress[0]'],
    ['ipBlock 0.0.0.0/0 (a internet inteira)', `\n  - to:\n    - ipBlock:\n        cidr: 0.0.0.0/0${PORTAS_53}`, 'egress[0]'],
    ['namespaceSelector só com Exists (todos os namespaces)', `\n  - to:\n    - namespaceSelector:\n        matchExpressions:\n        - key: kubernetes.io/metadata.name\n          operator: Exists${PORTAS_53}`, 'egress[0]'],
    ['ipBlock 0.0.0.0/1 + 128.0.0.0/1 (a internet inteira, em duas metades)', `\n  - to:\n    - ipBlock:\n        cidr: 0.0.0.0/1\n    - ipBlock:\n        cidr: 128.0.0.0/1${PORTAS_53}`, 'egress[0]'],
    ['endPort (uma faixa de portas)', `\n  - to:${KUBE_DNS}\n    ports:\n    - protocol: UDP\n      port: 53\n    - protocol: TCP\n      port: 1\n      endPort: 65535`, 'egress[0]'],
    ['só 53/UDP (o DNS usa TCP também)', `\n  - to:${KUBE_DNS}\n    ports:\n    - protocol: UDP\n      port: 53`, 'egress: 53/UDP'],
  ])('reprova %s', (_, egress, detalhe) => {
    const [aplicou, r] = conferir(egress);
    expect(aplicou.ok, aplicou.detalhe).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toContain(detalhe);
  });

  it('passa com o padrão da documentação: namespaceSelector {} e o podSelector do kube-dns', () => {
    expect(conferir(`\n  - to:\n    - namespaceSelector: {}\n      podSelector:\n        matchLabels:\n          k8s-app: kube-dns${PORTAS_53}`).map((r) => r.ok)).toEqual([true, true]);
  });

  it('as políticas se somam: uma 2ª NetworkPolicy com a 53 sem to, que pega os mesmos pods, reprova', () => {
    const outra = { 'web.yaml': POD, 'libera-dns.yaml': politica(`\n  - ports:${PORTAS_53.split('ports:')[1]}`, 'libera-dns') };
    const [aplicou, r] = conferir(`\n  - to:${KUBE_DNS}${PORTAS_53}`, undefined, outra);
    expect(aplicou.ok, aplicou.detalhe).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toContain('networkpolicy/libera-dns egress[0]');
    // Sem pod que as duas peguem, a outra não conta.
    expect(conferir(`\n  - to:${KUBE_DNS}${PORTAS_53}`, undefined, { 'libera-dns.yaml': outra['libera-dns.yaml'] })[1].ok).toBe(true);
  });

  it('reprova quando a política não existe', () => {
    expect(conferir('\n  - {}', { egressMinimo: 'networkpolicy/outra' })[1].ok).toBe(false);
  });
});
