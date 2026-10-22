// @vitest-environment node
// O kubectl edit pelo pedido de edição (o caminho da tela): salvar com mudança, sem mudança, o erro que reabre o editor
// e a desistência; o que o golden (tests/golden/secoes/50-editar.js) não pega: consertar depois do erro, o que mudou
// enquanto o editor estava aberto e o sed do KUBE_EDITOR.
import { describe, expect, it } from 'vitest';
import { criarCluster } from '../src/k8s/cluster.js';
import { kubectl } from '../src/k8s/kubectl/index.js';
import { kubeEditor } from '../src/k8s/kubectl/editar.js';

const WEB = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
`;

function comWeb() {
  const c = criarCluster();
  kubectl(c, 'kubectl apply -f web.yaml', { arquivos: { 'web.yaml': WEB } });
  c.avancar('30s');
  return c;
}
const replicas = (c) => c.obter('Deployment', 'default', 'web').spec.replicas;

describe('kubectl edit', () => {
  it('abre o objeto como o get -o yaml, debaixo do cabeçalho, e salva a mudança', () => {
    const c = comWeb();
    const r = kubectl(c, 'kubectl edit deployment web');
    expect(r.saida).toBe('');
    expect(r.editar.titulo).toBe('kubectl edit deployment.apps/web');
    expect(r.editar.arquivo).toMatch(/^\/tmp\/kubectl-edit-\d+\.yaml$/);
    expect(r.editar.texto).toBe(`# Please edit the object below. Lines beginning with a '#' will be ignored,
# and an empty file will abort the edit. If an error occurs while saving this file will be
# reopened with the relevant failures.
#
${kubectl(c, 'kubectl get deploy web -o yaml').saida}`);
    const fim = r.editar.concluir(r.editar.texto.replace('replicas: 1', 'replicas: 3'));
    expect([fim.saida, fim.codigo, fim.editar]).toEqual(['deployment.apps/web edited\n', 0, undefined]);
    expect(replicas(c)).toBe(3);
  });

  it('sair sem salvar (o mesmo texto, ou só comentários e espaços a mais) não muda nada', () => {
    const c = comWeb();
    const { editar } = kubectl(c, 'kubectl edit deploy/web');
    const rv = c.obter('Deployment', 'default', 'web').metadata.resourceVersion;
    expect(editar.concluir(editar.texto).saida).toBe('Edit cancelled, no changes made.\n');
    expect(editar.concluir(`# meu comentário\n${editar.texto}\n\n`).saida).toBe('Edit cancelled, no changes made.\n');
    expect(c.obter('Deployment', 'default', 'web').metadata.resourceVersion).toBe(rv);
  });

  it('o erro reabre o editor com o motivo no topo; sair sem consertar desiste e guarda uma cópia', () => {
    const c = comWeb();
    const { editar } = kubectl(c, 'kubectl edit deploy/web');
    const r = editar.concluir(editar.texto.replace(/^ {2}replicas: 1$/m, '  replicas: -1'));
    expect(r.stderr).toBe('error: deployments.apps "web" is invalid\n');
    expect(r.codigo).toBe(1);
    expect(r.editar.texto).toContain('#\n# deployments.apps "web" was not valid:\n# * spec.replicas: Invalid value: -1: must be greater than or equal to 0\n#\napiVersion: apps/v1\n');
    expect(r.editar.texto).toContain('  replicas: -1\n'); // o que o aluno escreveu volta para ele consertar
    const fim = r.editar.concluir(r.editar.texto);
    expect(fim.saida).toBe(`A copy of your changes has been stored to "${r.editar.arquivo}"\nerror: Edit cancelled, no valid changes were saved.\n`);
    expect([fim.codigo, fim.editar, replicas(c)]).toEqual([1, undefined, 1]);
  });

  it('consertar no editor reaberto salva tudo o que mudou desde o começo (como o real)', () => {
    const c = comWeb();
    const { editar } = kubectl(c, 'kubectl edit deploy/web');
    const r = editar.concluir(editar.texto.replace(/^ {2}replicas: 1$/m, '  replicas: 4').replaceAll('app: web', 'app: outro'));
    expect(r.editar.texto).toContain('# * spec.selector: Invalid value: {"matchLabels":{"app":"outro"}}: field is immutable\n');
    const fim = r.editar.concluir(r.editar.texto.replaceAll('app: outro', 'app: web'));
    expect([fim.saida, fim.codigo]).toEqual(['deployment.apps/web edited\n', 0]);
    expect(replicas(c)).toBe(4);
  });

  it('o patch vai do original para o editado: o que mudou enquanto o editor estava aberto continua', () => {
    const c = comWeb();
    const { editar } = kubectl(c, 'kubectl edit deploy/web');
    kubectl(c, 'kubectl scale deploy web --replicas=2');
    expect(editar.concluir(editar.texto.replace('image: nginx:1.27', 'image: nginx:1.28')).saida).toBe('deployment.apps/web edited\n');
    const d = c.obter('Deployment', 'default', 'web');
    expect([d.spec.replicas, d.spec.template.spec.containers[0].image]).toEqual([2, 'nginx:1.28']);
  });

  it('o KUBE_EDITOR com sed: BRE, o & e o \\1, linha a linha', () => {
    const sed = (expr, texto) => kubeEditor(`sed -i '${expr}'`)(texto).texto;
    expect(sed('s/a\\(b\\)c/[&|\\1]/', 'abc abc\nabc')).toBe('[abc|b] abc\n[abc|b]');
    expect(sed('s/b+/x/g', 'b+b+ bb')).toBe('xx bb');
    expect(sed('s|/|\\n|; s/^$/vazio/', '/\n')).toBe('\n\nvazio');
    expect(kubeEditor('vim')).toBeNull();
    expect(kubectl(comWeb(), 'KUBE_EDITOR=vim kubectl edit deploy/web').codigo).toBe(1);
  });
});
