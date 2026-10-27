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
const politica = (egress) => `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: saida
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:${egress}
`;
const conferir = (egress, regra = { egressMinimo: 'networkpolicy/saida' }) =>
  rodarTeste({ id: 'teste', cluster: 'vazio' }, { regras: [{ semErros: true }, regra] }, 0, { arquivos: { 'saida.yaml': politica(egress) } }).regras;

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
    ['só 53/UDP (o DNS usa TCP também)', `\n  - to:${KUBE_DNS}\n    ports:\n    - protocol: UDP\n      port: 53`, 'egress: 53/UDP'],
  ])('reprova %s', (_, egress, detalhe) => {
    const [aplicou, r] = conferir(egress);
    expect(aplicou.ok, aplicou.detalhe).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toContain(detalhe);
  });

  it('reprova quando a política não existe', () => {
    expect(conferir('\n  - {}', { egressMinimo: 'networkpolicy/outra' })[1].ok).toBe(false);
  });
});
