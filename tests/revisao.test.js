// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { montarSessao, responder, termosVistos, termosDeHoje, somarDias, proximaRevisao, FORMATOS, cita } from '../src/jogo/revisao.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';
import { NIVEIS } from '../src/conteudo/index.js';
import { calcularJornada } from '../src/jogo/gamificacao.js';
import { trocarConteudo } from '../src/conteudo/traducao.js';
import * as EN from '../src/i18n/en/index.js';

const termos = GLOSSARIO.filter((g) => g.nivel <= 1);

describe('revisão do dia (Leitner)', () => {
  it('sessão nova: só cartões novos, no máximo 10, cada um com uma resposta certa', () => {
    const s = montarSessao({ termos, hoje: '2026-10-20', todos: GLOSSARIO });
    expect(s).toHaveLength(10);
    for (const c of s) {
      expect(c.opcoes.filter((o) => o.certa)).toHaveLength(1);
      expect(new Set(c.opcoes.map((o) => o.texto)).size).toBe(c.opcoes.length);
    }
    expect(new Set(s.map((c) => c.formato)).size).toBeGreaterThan(1);
  });

  it('é estável no mesmo dia', () => {
    const a = montarSessao({ termos, hoje: '2026-10-20' });
    const b = montarSessao({ termos, hoje: '2026-10-20' });
    expect(a).toEqual(b);
  });

  it('acertou sobe de caixa e volta mais tarde; errou volta amanhã', () => {
    let e = responder({}, 'pod', true, '2026-10-20');
    expect(e.pod).toEqual({ caixa: 1, proxima: '2026-10-21' });
    e = responder(e, 'pod', true, '2026-10-21');
    expect(e.pod).toEqual({ caixa: 2, proxima: '2026-10-23' });
    e = responder(e, 'pod', false, '2026-10-23');
    expect(e.pod).toEqual({ caixa: 1, proxima: '2026-10-24' });
    expect(proximaRevisao(e)).toBe('2026-10-24');
  });

  it('os vencidos vêm antes dos novos; os que não venceram ficam de fora', () => {
    const estado = { pod: { caixa: 2, proxima: '2026-10-20' }, node: { caixa: 3, proxima: '2026-10-25' } };
    const s = montarSessao({ termos, estado, hoje: '2026-10-20', max: 3 });
    expect(s[0].id).toBe('pod');
    expect(s.map((c) => c.id)).not.toContain('node');
  });

  it('somarDias vira o ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  // Muitas sessões com o glossário inteiro: todo termo passa por vários formatos.
  const dias = Array.from({ length: 40 }, (_, k) => somarDias('2026-10-01', k));
  const sessoes = dias.map((hoje) => montarSessao({ termos: GLOSSARIO, hoje, max: GLOSSARIO.length }));
  const cartoes = sessoes.flat();
  const termo = Object.fromEntries(GLOSSARIO.map((g) => [g.id, g]));

  it('os cinco formatos aparecem toda sessão, e as comparações ficam com 3 de cada 5 cartões', () => {
    expect(new Set(montarSessao({ termos, hoje: '2026-10-20', todos: GLOSSARIO }).map((c) => c.formato))).toEqual(new Set(FORMATOS));
    const conta = (fs) => cartoes.filter((c) => fs.includes(c.formato)).length / cartoes.length;
    // 3 de cada 5 são comparações (um pouco mais quando definição e exemplo entregariam a resposta)
    expect(conta(['termo', 'analogia', 'limite'])).toBeGreaterThanOrEqual(0.6);
    expect(conta(['termo', 'analogia', 'limite'])).toBeLessThan(0.67);
    expect(conta(['definicao'])).toBeGreaterThan(0.2);
    expect(conta(['exemplo'])).toBeGreaterThan(0.1);
  });

  it('é estável no mesmo dia também com os formatos novos', () => {
    expect(montarSessao({ termos: GLOSSARIO, hoje: dias[3], max: GLOSSARIO.length })).toEqual(sessoes[3]);
    expect(sessoes[3]).not.toEqual(sessoes[4]);
  });

  /** Definição e exemplo: a resposta é o termo, o texto não a entrega, e nenhum distrator também estaria certo. */
  function conferirDistratores(lista) {
    const porId = Object.fromEntries(GLOSSARIO.map((g) => [g.id, g]));
    const porNome = Object.fromEntries(GLOSSARIO.map((g) => [g.termo, g]));
    for (const c of lista.filter((x) => x.formato === 'definicao' || x.formato === 'exemplo')) {
      const g = porId[c.id];
      const texto = c.formato === 'definicao' ? g.definicao : c.codigo;
      expect(c.opcoes.find((o) => o.certa).texto).toBe(g.termo);
      expect(cita(texto, g), `${c.id}: o texto entrega a resposta`).toBe(false);
      const errados = c.opcoes.filter((o) => !o.certa).map((o) => porNome[o.texto]);
      expect(errados).toHaveLength(3);
      for (const o of errados) {
        expect(o.id).not.toBe(g.id);
        expect(cita(texto, o), `${c.id}: ${o.id} também estaria certo`).toBe(false);
        expect(o.exemplo).not.toBe(g.exemplo);
        expect(Math.abs(o.nivel - g.nivel), `${c.id}: ${o.id} é de um nível distante`).toBeLessThanOrEqual(1);
      }
    }
  }

  it('definição e exemplo: a resposta é o termo, sem distrator igual, citado no texto ou com o mesmo exemplo', () => {
    conferirDistratores(cartoes);
  });

  it('em inglês também (os termos trocam de idioma e os cartões saem dos textos traduzidos)', () => {
    trocarConteudo(EN);
    try {
      conferirDistratores(dias.flatMap((hoje) => montarSessao({ termos: GLOSSARIO, hoje, max: GLOSSARIO.length })));
    } finally {
      trocarConteudo(null);
    }
  });

  it('o cartão de exemplo mostra o exemplo do próprio termo, e só sai para quem tem exemplo', () => {
    const exemplos = cartoes.filter((c) => c.formato === 'exemplo');
    for (const c of exemplos) expect(c.codigo).toBe(termo[c.id].exemplo);
    expect(new Set(exemplos.map((c) => c.id)).size).toBeGreaterThanOrEqual(25);
    expect(cartoes.filter((c) => c.formato !== 'exemplo').every((c) => c.codigo === undefined)).toBe(true);
    // Sem exemplo, o termo cai em outro formato.
    const semExemplo = GLOSSARIO.map((g, k) => (k % 2 ? { ...g, exemplo: undefined } : g));
    for (const hoje of dias) {
      for (const c of montarSessao({ termos: semExemplo, hoje, max: semExemplo.length })) {
        if (c.formato === 'exemplo') expect(semExemplo.find((g) => g.id === c.id).exemplo).toBeTruthy();
      }
    }
  });

  it('em todo formato, a alternativa certa é uma só e as alternativas não se repetem', () => {
    for (const c of cartoes) {
      expect(c.opcoes.filter((o) => o.certa)).toHaveLength(1);
      expect(new Set(c.opcoes.map((o) => o.texto)).size).toBe(c.opcoes.length);
    }
  });
});

// O progresso de quem resolveu estes itens (e, com `niveis`, todos os itens desses níveis).
const perfil = (ids, niveis = []) => {
  const p = {};
  for (const n of niveis) for (const i of NIVEIS[n].itens) p[i.id] = { status: 'resolvido', em: '2026-10-20' };
  for (const id of ids) p[id] = { status: 'resolvido', em: '2026-10-20' };
  return calcularJornada(NIVEIS, p);
};
const vistos = (jornada) => termosVistos(GLOSSARIO, jornada).map((g) => g.id);

describe('a revisão só cobra o que a trilha já ensinou', () => {
  it('todo termo tem o item que o apresenta, e o item existe num nível menor ou igual ao do termo', () => {
    const nivelDo = Object.fromEntries(NIVEIS.flatMap((n) => n.itens.map((i) => [i.id, n.numero])));
    for (const g of GLOSSARIO) {
      expect(g.item, `${g.id}.item`).toBeTruthy();
      expect(nivelDo[g.item], `${g.id}: o item ${g.item} não está na trilha`).toBeDefined();
      expect(nivelDo[g.item], `${g.id}: o item ${g.item} é de um nível depois do termo`).toBeLessThanOrEqual(g.nivel);
    }
  });

  it('só o primeiro pod: nada de Registry nem de Tag; depois de n0-registry-e-tags, eles entram', () => {
    const primeiro = vistos(perfil(['n0-primeiro-pod']));
    expect(primeiro).not.toContain('registry');
    expect(primeiro).not.toContain('tag');
    expect(vistos(perfil(['n0-primeiro-pod', 'n0-imagem-e-conteiner']))).toEqual(['imagem', 'conteiner']);
    expect(vistos(perfil(['n0-primeiro-pod', 'n0-imagem-e-conteiner', 'n0-registry-e-tags']))).toEqual(['imagem', 'conteiner', 'registry', 'tag']);
  });

  it('quem pulou a lição não perde o termo: vale um item depois dela no mesmo nível, ou o nível passar dos 70%', () => {
    expect(vistos(perfil(['n0-quiz-latest']))).toEqual(['imagem', 'conteiner', 'registry', 'tag']);
    // o nível 1 aberto e passado (70%) sem nenhuma lição: os termos dele entram todos
    const passou = perfil(NIVEIS[1].itens.filter((i) => i.tipo !== 'licao').slice(0, 15).map((i) => i.id), [0]);
    expect(passou.niveis[1].passou).toBe(true);
    expect(vistos(passou)).toEqual(expect.arrayContaining(GLOSSARIO.filter((g) => g.nivel === 1).map((g) => g.id)));
  });

  it('nível 5 completo e só a 1ª lição do nível 6: nenhum termo apresentado depois no nível 6', () => {
    const j = perfil(['n6-licao-probes'], [0, 1, 2, 3, 4, 5]);
    const n6 = vistos(j).filter((id) => GLOSSARIO.find((g) => g.id === id).nivel === 6);
    expect(n6.sort()).toEqual(['liveness', 'readiness', 'startup']);
    const cartoes = montarSessao({ termos: termosVistos(GLOSSARIO, j), estado: Object.fromEntries(GLOSSARIO.filter((g) => g.nivel < 6).map((g) => [g.id, { caixa: 5, proxima: '2026-12-01' }])), hoje: '2026-10-26', todos: GLOSSARIO });
    expect(cartoes.map((c) => c.id).sort()).toEqual(['liveness', 'readiness', 'startup']);
  });

  // Uma alternativa errada nunca é de um nível que o aluno ainda não abriu: em cada ponto da trilha (os níveis antes
  // completos e a 1ª missão do seguinte), todas as alternativas e o limite do verdadeiro ou falso vêm de níveis abertos.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  for (const n of NIVEIS.filter((x) => x.numero > 0)) {
    it(`nenhum distrator de um nível bloqueado (nível ${n.numero - 1} completo, 1ª missão do ${n.numero})`, () => {
      const j = perfil([n.itens[0].id], NIVEIS.filter((x) => x.numero < n.numero - 1).map((x) => x.numero));
      const abertos = new Set(j.niveis.filter((x) => x.desbloqueado).map((x) => x.numero));
      const nivelDe = Object.fromEntries(GLOSSARIO.map((g) => [g.id, g.nivel]));
      const termos = termosVistos(GLOSSARIO, j);
      for (const hoje of ['2026-10-20', '2026-10-21', '2026-10-22']) {
        for (const c of montarSessao({ termos, hoje, todos: GLOSSARIO, max: termos.length })) {
          expect(abertos.has(nivelDe[c.id]), `${c.id} é de um nível bloqueado`).toBe(true);
          for (const o of c.opcoes.filter((x) => x.id in nivelDe)) expect(abertos.has(nivelDe[o.id]), `${c.id}: ${o.id}`).toBe(true);
          if (c.formato === 'limite') {
            const dono = GLOSSARIO.find((g) => c.pergunta.includes(`<q>${esc(g.limite)}</q>`));
            expect(abertos.has(dono.nivel), `${c.id}: o limite de ${dono.id}`).toBe(true);
          }
        }
      }
    });
  }
});

describe('a revisão de hoje', () => {
  const HOJE = '2026-10-20';
  const nivel01 = GLOSSARIO.filter((g) => g.nivel <= 1);

  it('depois de responder os 10 cartões, reabrir não traz nada: nem termo novo, nem um vencido de outro dia', () => {
    const sessao = montarSessao({ termos: nivel01, hoje: HOJE, todos: GLOSSARIO });
    expect(sessao).toHaveLength(10);
    let estado = {};
    for (const c of sessao) estado = responder(estado, c.id, true, HOJE);
    expect(montarSessao({ termos: nivel01, estado, hoje: HOJE, todos: GLOSSARIO })).toEqual([]);
    expect(termosDeHoje({ termos: nivel01, estado, hoje: HOJE })).toEqual([]);
    // um cartão de outro dia que vence hoje espera até amanhã: os 10 são a revisão do dia inteira
    const fora = nivel01.find((g) => !estado[g.id]);
    estado = { ...estado, [fora.id]: { caixa: 2, proxima: HOJE } };
    expect(montarSessao({ termos: nivel01, estado, hoje: HOJE, todos: GLOSSARIO })).toEqual([]);
    // amanhã, a revisão volta, com 10 cartões
    expect(montarSessao({ termos: nivel01, estado, hoje: somarDias(HOJE, 1), todos: GLOSSARIO }).length).toBe(10);
  });

  it('o cartão de um termo ainda não apresentado fica parado: não vem, não conta na próxima data e volta com a mesma caixa', () => {
    const estado = { tag: { caixa: 3, proxima: '2026-10-18' }, imagem: { caixa: 2, proxima: '2026-10-25' } };
    const termos = GLOSSARIO.filter((g) => g.id === 'imagem' || g.id === 'conteiner');
    expect(montarSessao({ termos, estado, hoje: HOJE, todos: GLOSSARIO }).map((c) => c.id)).toEqual(['conteiner']);
    expect(proximaRevisao(estado, termos)).toBe('2026-10-25');
    const comTag = [...termos, GLOSSARIO.find((g) => g.id === 'tag')];
    expect(termosDeHoje({ termos: comTag, estado, hoje: HOJE }).map((g) => g.id)).toEqual(['tag', 'conteiner']);
  });

  it('o plano refaz os mesmos cartões em inglês (mesmos termos, na mesma ordem e no mesmo formato)', () => {
    const pt = montarSessao({ termos: nivel01, hoje: HOJE, todos: GLOSSARIO });
    const plano = pt.map(({ id, formato }) => ({ id, formato }));
    expect(montarSessao({ termos: nivel01, hoje: HOJE, todos: GLOSSARIO, plano })).toEqual(pt);
    trocarConteudo(EN);
    try {
      const en = montarSessao({ termos: nivel01, hoje: HOJE, todos: GLOSSARIO, plano });
      expect(en.map((c) => c.id)).toEqual(pt.map((c) => c.id));
      for (const [k, c] of en.entries()) {
        expect(c.formato === pt[k].formato || c.formato === 'termo', c.id).toBe(true);
        expect(c.opcoes.filter((o) => o.certa)).toHaveLength(1);
      }
      for (const c of en) expect(c.explicacao.definicao).toBe(EN.glossario[c.id].definicao);
    } finally {
      trocarConteudo(null);
    }
  });

  it('toda alternativa leva um id (o termo, ou verdadeiro e falso), único no cartão', () => {
    for (const c of montarSessao({ termos: GLOSSARIO, hoje: HOJE, max: GLOSSARIO.length })) {
      expect(c.opcoes.every((o) => o.id)).toBe(true);
      expect(new Set(c.opcoes.map((o) => o.id)).size).toBe(c.opcoes.length);
    }
  });
});

describe('o glossário não ensina errado', () => {
  it('kubelet e Node NotReady: o StatefulSet não renasce sozinho em outro node (português e inglês)', () => {
    const textos = [GLOSSARIO, Object.entries(EN.glossario).map(([id, g]) => ({ id, ...g }))]
      .flatMap((l) => l.filter((g) => g.id === 'kubelet' || g.id === 'node-notready'));
    expect(textos).toHaveLength(4);
    for (const g of textos) {
      expect(g.limite, g.id).not.toMatch(/\(Deployment, StatefulSet\)/);
      expect(g.limite, g.id).toMatch(/out-of-service/);
    }
  });
});
