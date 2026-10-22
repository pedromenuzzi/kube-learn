// @vitest-environment node
// O que depende do relógio do cluster: o CronJob que sai do suspend, os eventos que vencem e o get events -w.
import { describe, expect, it } from 'vitest';
import { criarCluster } from '../src/k8s/cluster.js';
import { kubectl } from '../src/k8s/kubectl/index.js';

const cron = (suspenso, extra = '') => `apiVersion: batch/v1
kind: CronJob
metadata:
  name: coleta
spec:
  schedule: "* * * * *"
  suspend: ${suspenso}
${extra}  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: c
            image: busybox:1.36
            command: ["echo", "oi"]
`;

function novo() {
  const c = criarCluster();
  const arquivos = {};
  return { c, arquivos, k: (linha) => kubectl(c, linha, { arquivos }) };
}

const jobs = (c) => c.listar('Job', 'default').filter((j) => j.metadata.name.startsWith('coleta-'));
const minuto = (ms) => Math.floor(ms / 60_000) * 60_000;

describe('CronJob que sai do suspend', () => {
  it('roda na hora o último horário perdido (um só), e depois segue o horário', () => {
    const { c, arquivos, k } = novo();
    arquivos['cj.yaml'] = cron(true);
    k('kubectl apply -f cj.yaml');
    c.avancar('5m');
    expect(jobs(c)).toHaveLength(0);
    c.avancarAte(() => c.agora % 60_000 === 20_000);
    arquivos['cj.yaml'] = cron(false);
    k('kubectl apply -f cj.yaml');
    expect(jobs(c)).toHaveLength(1);
    const [job] = jobs(c);
    expect(job.metadata.annotations['batch.kubernetes.io/cronjob-scheduled-timestamp']).toBe(new Date(minuto(c.agora)).toISOString().replace('.000', ''));
    expect(c.obter('CronJob', 'default', 'coleta').status.lastScheduleTime).toBe(job.metadata.annotations['batch.kubernetes.io/cronjob-scheduled-timestamp']);
    c.avancar('45s');
    expect(jobs(c)).toHaveLength(2);
  });

  it('fora do startingDeadlineSeconds, espera o próximo horário', () => {
    const { c, arquivos, k } = novo();
    arquivos['cj.yaml'] = cron(true, '  startingDeadlineSeconds: 30\n');
    k('kubectl apply -f cj.yaml');
    c.avancar('3m');
    c.avancarAte(() => c.agora % 60_000 === 40_000);
    arquivos['cj.yaml'] = cron(false, '  startingDeadlineSeconds: 30\n');
    k('kubectl apply -f cj.yaml');
    expect(jobs(c)).toHaveLength(0);
    c.avancar('20s');
    expect(jobs(c)).toHaveLength(1);
  });
});

describe('eventos', () => {
  it('vencem uma hora depois da última vez que aconteceram', { timeout: 30_000 }, () => {
    const { c, k } = novo();
    k('kubectl run relogio --image=busybox:1.36 -- sleep 99999');
    c.avancar('10s');
    expect(k('kubectl get events --field-selector involvedObject.name=relogio').stdout).toMatch(/Started/);
    c.avancar('62m');
    expect(c.eventos.some((e) => e.involvedObject.name === 'relogio' && e.reason === 'Started')).toBe(false);
    expect(c.eventos.some((e) => e.reason === 'RegisteredNode')).toBe(false);
  });

  it('o get events -w mostra os eventos novos', () => {
    const { c, k } = novo();
    const w = k('kubectl get events -w');
    k('kubectl run web --image=nginx:1.27');
    c.avancar('10s');
    const linhas = w.observar();
    expect(linhas).toMatch(/Normal\s+Scheduled\s+pod\/web/);
    expect(linhas).toMatch(/Normal\s+Started\s+pod\/web/);
  });
});

describe('o Service kubernetes', () => {
  it('volta depois de apagado, no mesmo IP', () => {
    const { k } = novo();
    expect(k('kubectl delete all --all').stdout).toMatch(/service "kubernetes" deleted/);
    expect(k('kubectl get svc kubernetes').stdout).toMatch(/kubernetes\s+ClusterIP\s+10\.96\.0\.1\s+<none>\s+443\/TCP/);
  });
});
