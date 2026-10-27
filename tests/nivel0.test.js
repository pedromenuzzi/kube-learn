// O nível 0 mão na massa: o ciclo lição → quiz → prática não fica muito tempo sem cluster, e as duas práticas
// funcionam (o teste da trilha roda a solução, o inicial e as armadilhas; aqui, o que ele não cobre).
import { describe, expect, it } from 'vitest';
import { NIVEIS } from '../src/conteudo/niveis.js';
import { montarCluster } from '../src/conteudo/clusters.js';
import { PUBLICADO } from '../src/conteudo/nivel0.js';
import { kubectl } from '../src/k8s/kubectl/index.js';
import { calcularJornada, conquistasMigradas, LIMITE_DESBLOQUEIO } from '../src/jogo/gamificacao.js';

const nivel0 = NIVEIS.find((n) => n.numero === 0).itens;
const item = (id) => nivel0.find((i) => i.id === id);
const comCluster = (i) => i.tipo === 'problema' || !!i.inicial;

describe('nível 0', () => {
  it('nunca passa de 6 itens seguidos sem cluster', () => {
    let seguidos = 0;
    let maior = 0;
    for (const i of nivel0) {
      seguidos = comCluster(i) ? 0 : seguidos + 1;
      maior = Math.max(maior, seguidos);
    }
    expect(maior).toBeLessThanOrEqual(6);
  });

  it('as práticas vêm logo depois das lições delas', () => {
    const ids = nivel0.map((i) => i.id);
    expect(ids[ids.indexOf('n0-imagem-e-conteiner') + 1]).toBe('n0-tres-conteineres');
    expect(ids[ids.indexOf('n0-registry-e-tags') + 1]).toBe('n0-tag-que-nao-existe');
  });

  it('só com os quizzes, o nível passa dos 70% e abre o nível 1', () => {
    const progresso = Object.fromEntries(nivel0.filter((i) => i.tipo === 'quiz').map((i) => [i.id, { status: 'resolvido', em: '2026-09-01' }]));
    const [n0, n1] = calcularJornada(NIVEIS, progresso).niveis;
    expect(n0.pct).toBeGreaterThanOrEqual(LIMITE_DESBLOQUEIO);
    expect(n0.pct).toBeLessThan(100);
    expect(n1.desbloqueado).toBe(true);
  });

  it('quem fechou o nível 0 antes das práticas chegarem ganha o lacre no boot, e elas viram 2 missões novas', () => {
    const quizzes = (em) => Object.fromEntries(nivel0.filter((i) => i.tipo === 'quiz').map((i) => [i.id, { status: 'resolvido', em }]));
    const depois = new Date(Date.parse(PUBLICADO) + 86_400_000).toISOString().slice(0, 10);
    const antigo = quizzes('2026-09-01');
    const m = conquistasMigradas(NIVEIS, antigo, {}, depois);
    expect(m).toEqual({ lacres: { 0: '2026-09-01' } });
    const [n0, n1] = calcularJornada(NIVEIS, antigo, m).niveis;
    expect([n0.situacao, n0.novas, n1.desbloqueado]).toEqual(['lacrado', 2, true]);
    // quem chegou depois delas e pulou as duas não ganha o lacre de graça
    expect(conquistasMigradas(NIVEIS, quizzes(depois), {}, depois)).toBeNull();
  });

  it('a última atividade no mesmo dia da publicação ainda conta como antes: o lacre fica', () => {
    const progresso = Object.fromEntries(nivel0.filter((i) => i.tipo === 'quiz').map((i) => [i.id, { status: 'resolvido', em: PUBLICADO }]));
    expect(conquistasMigradas(NIVEIS, progresso, {}, PUBLICADO)).toEqual({ lacres: { 0: PUBLICADO } });
  });

  it('o arquivo inicial das três cópias aplica sem erro (os blocos só de comentário não atrapalham)', () => {
    const c = montarCluster('vazio');
    const r = kubectl(c, 'kubectl apply -f .', { arquivos: item('n0-tres-conteineres').inicial });
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toBe('pod/copia-1 created\n');
  });

  it('a vitrine de partida está em ErrImagePull/ImagePullBackOff, e a tag certa a faz rodar na hora', () => {
    const c = montarCluster('tag-que-nao-existe');
    expect(kubectl(c, 'kubectl get pods').saida).toMatch(/vitrine\s+0\/1\s+(ErrImagePull|ImagePullBackOff)/);
    c.avancar('5m'); // a espera entre tentativas já chegou perto do teto (5 min)
    kubectl(c, 'kubectl apply -f .', { arquivos: item('n0-tag-que-nao-existe').solucao });
    // a espera é por imagem (como no kubelet real): a imagem nova é baixada na hora, sem herdar o backoff da 1.99
    c.avancar('10s');
    expect(kubectl(c, 'kubectl get pods').saida).toMatch(/vitrine\s+1\/1\s+Running/);
  });
});
