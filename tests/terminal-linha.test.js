// @vitest-environment node
// O terminal do aluno: o que o bash junta (&&, ||, ;, os canos para grep/head/tail/wc/sort/awk/base64, o 2>&1), o
// kubectl run --rm -i/-it (o pod de depuração) e o rollout status que desiste no progressDeadlineSeconds, rápido. E os
// reflexos do exame (alias, export, > /tmp/x.yaml 2>&1, o \" nas aspas duplas) e o rollback com o change-cause certo.
import { describe, expect, it } from 'vitest';
import { criarCluster } from '../src/k8s/cluster.js';
import { rodarLinha, COMANDOS, conhece } from '../src/k8s/linha.js';
import { montarCluster } from '../src/conteudo/clusters.js';

function cluster() {
  const c = criarCluster();
  rodarLinha(c, 'kubectl create deployment loja --image=nginx:1.27 --replicas=3 && kubectl create deployment web --image=nginx:1.27 && kubectl expose deployment loja --port=80', {});
  c.avancar('1m');
  return c;
}

describe('o bash do terminal: && || ; e os canos', () => {
  const c = cluster();
  const arquivos = { 'pod.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: x\nspec:\n  containers:\n  - name: c\n    image: nginx\n' };
  const rodar = (linha) => rodarLinha(c, linha, arquivos);

  it('kubectl get pods | grep loja | wc -l', () => {
    expect(rodar('kubectl get pods | grep loja | wc -l')).toMatchObject({ stdout: '3\n', codigo: 0 });
    expect(rodar('kubectl get pods | grep -c loja').stdout).toBe('3\n');
    expect(rodar('kubectl get pods | grep -v NAME | grep -vi loja | wc -l').stdout).toBe('1\n');
  });

  it('o grep sem nada achado sai com 1 e em silêncio; o grep básico só alterna com \\|', () => {
    expect(rodar('kubectl get pods | grep nada')).toMatchObject({ saida: '', codigo: 1 });
    expect(rodar("kubectl get pods | grep 'loja|web'").codigo).toBe(1);
    expect(rodar("kubectl get pods | grep 'loja\\|web' | wc -l").stdout).toBe('4\n');
    expect(rodar('kubectl get pods | grep -E "loja|web" | wc -l').stdout).toBe('4\n');
    expect(rodar('kubectl get pods | grep -o "loja-[a-z0-9]*" | head -1').stdout).toMatch(/^loja-[a-z0-9]+\n$/);
  });

  it('head, tail, sort, awk', () => {
    const tudo = rodar('kubectl get pods').stdout.split('\n');
    expect(rodar('kubectl get pods | head -n 2').stdout).toBe(`${tudo.slice(0, 2).join('\n')}\n`);
    expect(rodar('kubectl get pods | head -2 | tail -1').stdout).toBe(`${tudo[1]}\n`);
    expect(rodar('kubectl get pods | tail -n +2 | wc -l').stdout).toBe('4\n');
    expect(rodar("kubectl get pods | awk 'NR>1 {print $1}' | sort -r").stdout.split('\n')[0]).toMatch(/^web-/);
    expect(rodar("kubectl get pods | awk '{print $NF}' | head -1").stdout).toBe('AGE\n');
  });

  it('&&, || e ; seguem o código de saída', () => {
    expect(rodar('kubectl get pod nada && echo sim || echo nao')).toMatchObject({ stdout: 'nao\n', stderr: 'Error from server (NotFound): pods "nada" not found\n', codigo: 0 });
    expect(rodar('kubectl get deploy loja ; kubectl get deploy nada').codigo).toBe(1);
    expect(rodar('kubectl get pod nada 2>/dev/null || echo faltou')).toMatchObject({ saida: 'faltou\n', codigo: 0 });
    expect(rodar('kubectl get pod nada 2>&1 | grep -c NotFound').stdout).toBe('1\n');
    expect(rodar('kubectl get pods &&')).toMatchObject({ codigo: 2, stderr: "bash: syntax error near unexpected token `&&'\n" });
  });

  it('o && e o | de dentro das aspas são do contêiner', () => {
    const r = rodar("kubectl exec deploy/loja -- sh -c 'echo a && echo b'");
    expect(r).toMatchObject({ stdout: 'a\nb\n', codigo: 0 });
  });

  it('base64 como antes, agora em linhas de 76; cat e arquivos do editor; kubectl apply -f -', () => {
    expect(rodar("echo -n 'oi' | base64 | base64 -d").stdout).toBe('oi');
    expect(rodar("kubectl get secret nada -o jsonpath='{.data.x}' | base64 -d")).toMatchObject({ saida: 'Error from server (NotFound): secrets "nada" not found\n', codigo: 1 });
    expect(rodar(`echo -n '${'x'.repeat(60)}' | base64`).stdout.split('\n').map((l) => l.length)).toEqual([76, 4, 0]);
    expect(rodar('cat pod.yaml | grep image').stdout).toBe('    image: nginx\n');
    expect(rodar('grep -n image pod.yaml').stdout).toBe('8:    image: nginx\n');
    expect(rodar('cat nada.yaml')).toMatchObject({ stderr: 'cat: nada.yaml: No such file or directory\n', codigo: 1 });
    expect(rodar('kubectl create deployment api --image=nginx:1.27 --dry-run=client -o yaml | kubectl apply -f -').stdout).toBe('deployment.apps/api created\n');
    expect(rodar('echo "a: 1" > novo.yaml && cat novo.yaml')).toMatchObject({ stdout: 'a: 1\n', arquivoGravado: 'novo.yaml' });
  });

  it('o KUBE_EDITOR= da frente vai para o kubectl edit; sem ele, o pedido do editor passa inteiro', () => {
    rodar('kubectl scale deployment web --replicas=2');
    const r = rodar(`KUBE_EDITOR="sed -i 's/replicas: 2/replicas: 5/'" kubectl edit deployment web`);
    expect(r).toMatchObject({ stdout: 'deployment.apps/web edited\n', codigo: 0 });
    expect(c.obter('Deployment', 'default', 'web').spec.replicas).toBe(5);
    expect(rodar('kubectl edit deployment web').editar).toBeTruthy();
    expect(() => rodar('kubectl get deploy web && kubectl edit deployment web')).not.toThrow();
  });

  it('o que o terminal não imita diz isso, com o que ele entende', () => {
    expect(rodar('kubectl get pods | jq .')).toMatchObject({ codigo: 127, stderr: expect.stringContaining('grep, head, tail, wc, sort, awk') });
    expect(rodar('kubectl get pods | grep -A 2 loja')).toMatchObject({ codigo: 2, stderr: expect.stringContaining('-A') });
    expect(rodar('foo && kubectl get ns')).toMatchObject({ codigo: 127, stderr: 'bash: foo: command not found\n' });
    expect(COMANDOS).toEqual(expect.arrayContaining(['kubectl', 'k', 'grep', 'cat', 'ls']));
  });
});

describe('os reflexos do exame: alias, export, > /tmp/x e 2>&1', () => {
  it('alias k=kubectl em silêncio; o alias novo roda; alias sozinho lista', () => {
    const c = cluster();
    expect(rodarLinha(c, 'alias k=kubectl', {})).toMatchObject({ saida: '', codigo: 0 });
    expect(rodarLinha(c, 'alias kk=kubectl', {}).codigo).toBe(0);
    expect(conhece(c, 'kk')).toBe(true);
    expect(rodarLinha(c, 'kk get deploy loja', {})).toMatchObject({ codigo: 0, stdout: expect.stringMatching(/^NAME +READY/) });
    expect(rodarLinha(c, "alias kgp='kubectl get pods'", {}).codigo).toBe(0);
    expect(rodarLinha(c, 'kgp | grep -c loja', {}).stdout).toBe('3\n');
    expect(rodarLinha(c, 'alias', {}).stdout).toBe("alias k='kubectl'\nalias kgp='kubectl get pods'\nalias kk='kubectl'\n");
    expect(rodarLinha(c, 'alias nada', {})).toMatchObject({ codigo: 1, stderr: 'bash: alias: nada: not found\n' });
  });

  it('export do="--dry-run=client -o yaml": o $do só imprime o YAML, sem criar; aspas simples não expandem', () => {
    const c = cluster();
    expect(rodarLinha(c, 'export do="--dry-run=client -o yaml"', {})).toMatchObject({ saida: '', codigo: 0 });
    expect(conhece(c, 'export')).toBe(true);
    const r = rodarLinha(c, 'kubectl run x --image=nginx:1.27 $do', {});
    expect(r).toMatchObject({ codigo: 0, stdout: expect.stringMatching(/^apiVersion: v1\nkind: Pod\n/) });
    expect(rodarLinha(c, 'kubectl get pod x', {})).toMatchObject({ codigo: 1, stderr: 'Error from server (NotFound): pods "x" not found\n' });
    expect(rodarLinha(c, 'echo $do', {}).stdout).toBe('--dry-run=client -o yaml\n');
    expect(rodarLinha(c, 'echo "${do}!"', {}).stdout).toBe('--dry-run=client -o yaml!\n');
    expect(rodarLinha(c, "echo '$do'", {}).stdout).toBe('$do\n');
    expect(rodarLinha(c, 'echo \\$do', {}).stdout).toBe('$do\n');
    // Sem export também vale (variável do shell), e na mesma linha depois do &&.
    expect(rodarLinha(c, 'ns=kube-system && kubectl get deploy -n $ns -o name', {}).stdout).toBe('deployment.apps/coredns\n');
    // O valor não vira operador: o | de dentro da variável é só uma letra.
    rodarLinha(c, "export cano='a | b'", {});
    expect(rodarLinha(c, 'echo $cano', {}).stdout).toBe('a | b\n');
    expect(rodarLinha(c, 'export', {}).stdout).toBe('declare -x cano="a | b"\ndeclare -x do="--dry-run=client -o yaml"\ndeclare -x ns="kube-system"\n');
    expect(rodarLinha(c, 'export 1x=2', {})).toMatchObject({ codigo: 1, stderr: "bash: export: `1x=2': not a valid identifier\n" });
  });

  it('outro cluster (o Resetar) começa sem variáveis nem aliases; o mesmo cluster guarda', () => {
    const c = cluster();
    rodarLinha(c, 'export do="--dry-run=client -o yaml" && alias kk=kubectl', {});
    expect(rodarLinha(c, 'echo $do', {}).stdout).toBe('--dry-run=client -o yaml\n');
    const novo = cluster();
    expect(rodarLinha(novo, 'echo $do', {}).stdout).toBe('\n');
    expect(conhece(novo, 'kk')).toBe(false);
    expect(rodarLinha(novo, 'kk get pods', {})).toMatchObject({ codigo: 127, stderr: 'bash: kk: command not found\n' });
    expect(conhece(novo, 'X=1')).toBe(true);
    expect(conhece(novo, 'vim')).toBe(false);
  });

  it('> /tmp/x.yaml e > /opt/course/N/x.txt gravam; 2>&1 e 2>/dev/null depois do nome; extensão errada avisa', () => {
    const c = cluster();
    const arquivos = { 'pod.yaml': 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: do-editor\n' };
    const rodar = (linha) => rodarLinha(c, linha, arquivos);
    expect(rodar('kubectl get ns -o yaml > /tmp/ns.yaml')).toMatchObject({ saida: '', codigo: 0, arquivoGravado: '/tmp/ns.yaml' });
    expect(rodar('cat /tmp/ns.yaml').stdout).toMatch(/^apiVersion: v1\nitems:\n/);
    expect(rodar('kubectl get ns > /opt/course/1/ns.txt')).toMatchObject({ codigo: 0, arquivoGravado: '/opt/course/1/ns.txt' });
    expect(arquivos['/opt/course/1/ns.txt']).toMatch(/^NAME +STATUS +AGE\n/);
    expect(rodar('kubectl get po nada > x.txt 2>&1')).toMatchObject({ saida: '', codigo: 1 });
    expect(arquivos['x.txt']).toBe('Error from server (NotFound): pods "nada" not found\n');
    expect(rodar('kubectl get ns default >> lista.txt 2>/dev/null')).toMatchObject({ saida: '', codigo: 0 });
    expect(rodar('kubectl get ns nada >> lista.txt 2>/dev/null')).toMatchObject({ saida: '', codigo: 1 });
    expect(rodar('kubectl get ns default -o name >> lista.txt')).toMatchObject({ codigo: 0 });
    expect(arquivos['lista.txt']).toMatch(/^NAME +STATUS +AGE\ndefault +Active +\S+\nnamespace\/default\n$/);
    expect(rodar('kubectl get ns > "aspas.txt"').arquivoGravado).toBe('aspas.txt');
    expect(rodar('kubectl get ns > foo.exe')).toMatchObject({ codigo: 1, stderr: 'bash: foo.exe: só dá para gravar arquivos .yaml, .json ou .txt aqui\n' });
    // O -f . lê só a pasta atual: o /tmp/ns.yaml fica de fora.
    expect(rodar('kubectl apply -f .').stdout).toBe('namespace/do-editor created\n');
    expect(rodar('kubectl apply -f /tmp/ns.yaml').codigo).toBe(0);
  });

  it('a barra nas aspas duplas escapa " \\ $ e a crase: o jsonpath com {\\"\\n\\"} imprime só a imagem', () => {
    const c = cluster();
    expect(rodarLinha(c, 'kubectl get deploy web -o jsonpath="{.spec.template.spec.containers[0].image}{\\"\\n\\"}"', {})).toMatchObject({ stdout: 'nginx:1.27\n', codigo: 0 });
    expect(rodarLinha(c, 'echo "a \\"b\\" \\\\ \\$x \\n"', {}).stdout).toBe('a "b" \\ $x \\n\n');
  });

  it('create secret docker-registry e tls dizem que não são imitados, mesmo com as flags deles', () => {
    const c = cluster();
    const r = rodarLinha(c, 'kubectl create secret docker-registry regcred --docker-server=r.io --docker-username=u --docker-password=p', {});
    expect(r).toMatchObject({ codigo: 1, stderr: expect.stringContaining('kubectl create secret docker-registry') });
    expect(r.stderr).not.toContain('unknown flag');
    expect(rodarLinha(c, 'kubectl create secret tls cert --cert=a.crt --key=a.key', {}).stderr).toContain('kubectl create secret tls');
  });
});

describe('rollout undo e restart', () => {
  it('na n2-historico, o undo --to-revision=1 leva o change-cause da revisão 1 para a revisão nova', () => {
    const c = montarCluster('loja-historico', 'teste');
    expect(rodarLinha(c, 'kubectl rollout history deployment/loja', {}).stdout).toMatch(/1 +versao 1\.0: abertura da loja\n2 +versao 1\.1: carrinho novo\n3 +versao 2\.0: tudo novo/);
    expect(rodarLinha(c, 'kubectl rollout undo deployment/loja --to-revision=1', {}).stdout).toBe('deployment.apps/loja rolled back\n');
    c.avancar('30s');
    const historico = rodarLinha(c, 'kubectl rollout history deployment/loja', {}).stdout;
    expect(historico).toMatch(/2 +versao 1\.1: carrinho novo\n3 +versao 2\.0: tudo novo \(e o cliente reclamou\)\n4 +versao 1\.0: abertura da loja\n/);
    expect(c.obter('Deployment', 'default', 'loja').metadata.annotations).toMatchObject({ 'kubernetes.io/change-cause': 'versao 1.0: abertura da loja', 'deployment.kubernetes.io/revision': '4' });
  });

  it('com o rollout pausado, undo e restart recusam, como o kind', () => {
    const c = cluster();
    rodarLinha(c, 'kubectl set image deployment/web nginx=nginx:1.28', {});
    c.avancar('1m');
    rodarLinha(c, 'kubectl rollout pause deployment/web', {});
    expect(rodarLinha(c, 'kubectl rollout undo deployment/web', {})).toMatchObject({ codigo: 1, stderr: "error: you cannot rollback a paused deployment; resume it first with 'kubectl rollout resume' and try again\n" });
    expect(rodarLinha(c, 'kubectl rollout restart deployment/web', {})).toMatchObject({ codigo: 1, stderr: 'error: deployments.apps "web" can\'t restart paused deployment (run rollout resume first)\n' });
    rodarLinha(c, 'kubectl rollout resume deployment/web', {});
    expect(rodarLinha(c, 'kubectl rollout restart deployment/web', {})).toMatchObject({ codigo: 0, stdout: 'deployment.apps/web restarted\n' });
  });
});

describe('kubectl run --rm -i/-it', () => {
  it('com um comando: mostra a saída do pod e apaga o pod no fim', () => {
    const c = cluster();
    const r = rodarLinha(c, 'kubectl run tmp --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- http://loja', {});
    expect(r.codigo).toBe(0);
    expect(r.stdout).toMatch(/<title>Welcome to nginx!<\/title>[\s\S]*pod "tmp" deleted from default namespace\n$/);
    expect(c.obter('Pod', 'default', 'tmp')).toBeFalsy();
    // Com restartPolicy Always (o padrão), um comando que termina na hora também: o kubectl se anexa, mostra e apaga.
    expect(rodarLinha(c, 'kubectl run eco --rm -i --image=busybox:1.36 -- echo oi', {})).toMatchObject({ stdout: 'oi\npod "eco" deleted from default namespace\n', codigo: 0 });
    const falha = rodarLinha(c, "kubectl run falha --rm -i --restart=Never --image=busybox:1.36 -- sh -c 'echo saindo; exit 3'", {});
    expect(falha).toMatchObject({ codigo: 3, stdout: 'saindo\npod "falha" deleted from default namespace\n', stderr: expect.stringMatching(/try pressing enter\.\npod default\/falha terminated \(Error\)\n$/) });
  });

  it('com -it e um shell: abre a sessão; o exit fecha e apaga o pod', () => {
    const c = cluster();
    const r = rodarLinha(c, 'kubectl run tmp --rm -it --image=busybox:1.36 -- sh', {});
    expect(r.stderr).toBe("All commands and output from this session will be recorded in container logs, including credentials and sensitive information passed through the command prompt.\nIf you don't see a command prompt, try pressing enter.\n");
    expect(r.sessao.prompt).toBe('/ # ');
    expect(r.sessao.executar('wget -qO- http://loja').saida).toContain('Welcome to nginx!');
    expect(c.obter('Pod', 'default', 'tmp').status.phase).toBe('Running');
    const fim = r.sessao.executar('exit');
    expect(fim).toMatchObject({ sair: true, saida: "Session ended, resume using 'kubectl attach tmp -c tmp -n default -i -t' command\npod \"tmp\" deleted from default namespace\n" });
    c.avancar('1m');
    expect(c.obter('Pod', 'default', 'tmp')).toBeFalsy();
  });

  it('sem --rm, o shell que sai é reiniciado (e volta a esperar a entrada)', () => {
    const c = cluster();
    rodarLinha(c, 'kubectl run caixa -it --image=busybox:1.36', {}).sessao.executar('exit');
    c.avancar('15s');
    const p = c.obter('Pod', 'default', 'caixa');
    expect(p.status.phase).toBe('Running');
    expect(p.status.containerStatuses[0].restartCount).toBe(1);
  });

  it('os erros do run anexado são os do kubectl', () => {
    const c = cluster();
    expect(rodarLinha(c, 'kubectl run x --rm --image=busybox:1.36 -- echo oi', {}).stderr).toBe('error: --rm should only be used for attached containers\n');
    expect(rodarLinha(c, 'kubectl run x -t --image=busybox:1.36', {}).stderr).toBe('error: -i/--stdin is required for containers with -t/--tty=true\n');
    // Sem shell na imagem, o contêiner nem sobe: o kubectl desiste depois de 1 minuto e, com --rm, apaga o pod antes.
    expect(rodarLinha(c, 'kubectl run y -it --rm --image=kubelearn/loja:1.0 --command -- sh', {})).toMatchObject({ stdout: 'pod "y" deleted from default namespace\n', stderr: 'error: timed out waiting for the condition\n', codigo: 1 });
  });
});

describe('rollout status de um rollout travado', () => {
  const travar = () => {
    const c = cluster();
    rodarLinha(c, 'kubectl set image deployment/loja nginx=nginx:nao-existe', {});
    return c;
  };

  it('desiste quando o Deployment marca ProgressDeadlineExceeded (o padrão: 600 s sem progresso)', () => {
    const c = travar();
    const inicio = c.agora;
    const r = rodarLinha(c, 'kubectl rollout status deployment/loja', {});
    expect(r).toMatchObject({ codigo: 1, stderr: 'error: deployment "loja" exceeded its progress deadline\n' });
    expect((c.agora - inicio) / 1000).toBeGreaterThanOrEqual(600);
    expect((c.agora - inicio) / 1000).toBeLessThan(620);
    expect(rodarLinha(c, 'kubectl describe deploy loja', {}).stdout).toMatch(/Progressing {4}False {3}ProgressDeadlineExceeded/);
  });

  it('o --timeout continua valendo', () => {
    const c = travar();
    expect(rodarLinha(c, 'kubectl rollout status deployment/loja --timeout=10s', {})).toMatchObject({ codigo: 1, stderr: 'error: timed out waiting for the condition\n' });
  });

  it('esperar os 10 minutos sai barato', () => {
    const c = travar();
    rodarLinha(c, 'kubectl get pods', {}); // aquece
    const t0 = performance.now();
    rodarLinha(c, 'kubectl rollout status deployment/loja', {});
    expect(performance.now() - t0).toBeLessThan(500); // ~15-30 ms aqui; folga para a máquina lenta do CI
  });
});
