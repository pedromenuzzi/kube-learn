// @vitest-environment node
// Detalhes que o golden não pega (dependem do relógio ou de mais de um caso): o fuso do CronJob, os avisos do
// PodSecurity agrupados, o EndpointSlice com quem está saindo e o pod de imagePullPolicy Never que nunca sobe.
import { describe, expect, it } from 'vitest';
import { criarCluster } from '../src/k8s/cluster.js';
import { kubectl } from '../src/k8s/kubectl/index.js';
import { isoNoFuso, errosDoFuso } from '../src/k8s/cron.js';

const rodar = (c, cmd, arquivos) => kubectl(c, cmd, { arquivos });
const cron = (nome, horario, fuso) => `apiVersion: batch/v1
kind: CronJob
metadata:
  name: ${nome}
spec:
  schedule: "${horario}"
${fuso ? `  timeZone: ${fuso}\n` : ''}  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: c
            image: busybox:1.36
            command: ["true"]
`;

describe('CronJob com spec.timeZone', () => {
  it('roda no horário do fuso e anota o horário com o deslocamento dele', () => {
    const c = criarCluster(); // o relógio começa em 2026-10-16 12:00 UTC (9h em São Paulo)
    rodar(c, 'kubectl apply -f a.yaml -f b.yaml', { 'a.yaml': cron('sp', '0 10 * * *', 'America/Sao_Paulo'), 'b.yaml': cron('utc', '0 10 * * *') });
    c.avancar('61m'); // 13h UTC = 10h em São Paulo
    const jobs = c.listar('Job').filter((j) => j.metadata.ownerReferences?.[0]?.kind === 'CronJob');
    expect(jobs.map((j) => j.metadata.name)).toEqual([`sp-${Date.UTC(2026, 9, 16, 13) / 60_000}`]);
    expect(jobs[0].metadata.annotations['batch.kubernetes.io/cronjob-scheduled-timestamp']).toBe('2026-10-16T10:00:00-03:00');
    expect(c.obter('CronJob', 'default', 'sp').status.lastScheduleTime).toBe('2026-10-16T13:00:00Z');
  });

  it('formata e valida o fuso como o Go', () => {
    expect(isoNoFuso(Date.UTC(2026, 9, 16, 13), 'America/Sao_Paulo')).toBe('2026-10-16T10:00:00-03:00');
    expect(isoNoFuso(Date.UTC(2026, 9, 16, 13), 'Asia/Kolkata')).toBe('2026-10-16T18:30:00+05:30');
    expect(isoNoFuso(Date.UTC(2026, 9, 16, 13), 'UTC')).toBe('2026-10-16T13:00:00Z');
    expect(isoNoFuso(Date.UTC(2026, 9, 16, 13))).toBe('2026-10-16T13:00:00Z');
    expect(errosDoFuso('America/Sao_Paulo')).toEqual([]);
    expect(errosDoFuso('Brazil/East')).toEqual([]);
    expect(errosDoFuso('america/sao_paulo')).toEqual(['unknown time zone america/sao_paulo']);
    expect(errosDoFuso('+03:00')).toEqual(['unknown time zone +03:00']);
    expect(errosDoFuso('Local')).toEqual(['timeZone must be an explicit time zone as defined in https://www.iana.org/time-zones']);
    expect(errosDoFuso('')).toEqual(['timeZone must be nil or non-empty string']);
  });
});

describe('PodSecurity: o namespace muda de norma', () => {
  it('avisa os pods que já estão lá, um aviso por conjunto de problemas', () => {
    const c = criarCluster();
    rodar(c, 'kubectl create namespace loja');
    for (const p of ['b', 'c', 'a']) rodar(c, `kubectl run ${p} -n loja --image=nginx:1.27`);
    rodar(c, 'kubectl apply -f rede.yaml', {
      'rede.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: rede\n  namespace: loja\nspec:\n  hostNetwork: true\n  containers:\n  - name: c\n    image: nginx:1.27\n',
    });
    c.avancar('20s');
    rodar(c, 'kubectl label ns loja pod-security.kubernetes.io/enforce=baseline');
    expect(c.avisos).toEqual([
      'existing pods in namespace "loja" violate the new PodSecurity enforce level "baseline:latest"',
      'rede: host namespaces',
    ]);
    const r = rodar(c, 'kubectl apply -f ns.yaml', { 'ns.yaml': 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: loja\n  labels:\n    pod-security.kubernetes.io/enforce: restricted\n' });
    expect(r.stderr).toBe([
      // o namespace nasceu de um create: o apply avisa (como o kubectl de verdade, no golden val-apply-ns-psa)
      'Warning: resource namespaces/loja is missing the kubectl.kubernetes.io/last-applied-configuration annotation which is required by kubectl apply. kubectl apply should only be used on resources created declaratively by either kubectl create --save-config or kubectl apply. The missing annotation will be patched automatically.',
      'Warning: existing pods in namespace "loja" violate the new PodSecurity enforce level "restricted:latest"',
      'Warning: a (and 2 other pods): allowPrivilegeEscalation != false, unrestricted capabilities, runAsNonRoot != true, seccompProfile',
      'Warning: rede: allowPrivilegeEscalation != false, unrestricted capabilities, host namespaces, runAsNonRoot != true, seccompProfile',
      '',
    ].join('\n'));
    expect(c.listar('Pod', 'loja')).toHaveLength(4); // os pods continuam rodando
  });
});

describe('EndpointSlice', () => {
  it('acompanha o Service: quem está saindo fica com terminating, e a fatia some com o Service', () => {
    const c = criarCluster();
    rodar(c, 'kubectl create deployment web --image=nginx:1.27 --replicas=2');
    rodar(c, 'kubectl expose deployment web --port=80');
    c.avancar('30s');
    const fatia = () => c.listar('EndpointSlice', 'default').find((e) => e.metadata.labels['kubernetes.io/service-name'] === 'web');
    expect(fatia().metadata.name).toMatch(/^web-[bcdfghjklmnpqrstvwxz2456789]{5}$/);
    expect(fatia().endpoints.map((e) => e.conditions)).toEqual([{ ready: true, serving: true, terminating: false }, { ready: true, serving: true, terminating: false }]);
    const [p] = c.listar('Pod', 'default').filter((x) => x.metadata.labels.app === 'web');
    rodar(c, `kubectl delete pod ${p.metadata.name} --wait=false`);
    const saindo = fatia().endpoints.find((e) => e.targetRef.name === p.metadata.name);
    expect(saindo.conditions).toEqual({ ready: false, serving: true, terminating: true });
    expect(c.obter('Endpoints', 'default', 'web').subsets[0].addresses.map((a) => a.targetRef.name)).not.toContain(p.metadata.name);
    rodar(c, 'kubectl delete svc web');
    c.avancar('1s');
    expect(fatia()).toBeUndefined();
  });
});

describe('imagePullPolicy: Never', () => {
  it('sem a imagem no node, o contêiner nunca sobe (ErrImageNeverPull, de novo e de novo)', () => {
    const c = criarCluster();
    rodar(c, 'kubectl apply -f p.yaml', { 'p.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: nunca\nspec:\n  containers:\n  - name: c\n    image: busybox:1.34\n    imagePullPolicy: Never\n' });
    c.avancar('3m');
    const pod = c.obter('Pod', 'default', 'nunca');
    expect(pod.status.containerStatuses[0].state.waiting.reason).toBe('ErrImageNeverPull');
    const ev = c.listar('Event', 'default').filter((e) => e.involvedObject.name === 'nunca' && e.type === 'Warning');
    expect(ev.map((e) => e.reason).sort()).toEqual(['ErrImageNeverPull', 'Failed']);
    expect(ev.every((e) => e.count > 5)).toBe(true);
  });
});
