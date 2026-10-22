// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { montarSessao, responder, termosVistos, somarDias, proximaRevisao, FORMATOS, cita } from '../src/jogo/revisao.js';
import { GLOSSARIO } from '../src/conteudo/glossario.js';
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

  it('só os termos dos níveis com missão resolvida', () => {
    const jornada = { niveis: [{ numero: 0, itens: [{ estado: 'concluido' }] }, { numero: 1, itens: [{ estado: 'disponivel' }] }] };
    expect(termosVistos(GLOSSARIO, jornada).every((t) => t.nivel === 0)).toBe(true);
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
