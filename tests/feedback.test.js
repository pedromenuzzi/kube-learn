// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { linkDaIssue, textoDoRelato } from '../src/ui/feedback.js';

const missao = { id: 'n3-ramal', titulo: 'O ramal da loja', tipo: 'problema', nivel: 3 };

describe('o feedback', () => {
  it('o relato leva a missão, a reação, o texto e o contexto', () => {
    const t = textoDoRelato(missao, { reacao: 'Confusa', texto: 'Não entendi o targetPort.', testes: '1 de 2 passaram (entregue)', comandos: ['kubectl get svc'] });
    expect(t).toContain('**Missão:** O ramal da loja (`n3-ramal`), nível 3');
    expect(t).toContain('#/ex/n3-ramal');
    expect(t).toContain('**Reação:** Confusa');
    expect(t).toContain('Não entendi o targetPort.');
    expect(t).toContain('Testes: 1 de 2 passaram (entregue)');
    expect(t).toContain('```\nkubectl get svc\n```');
  });

  it('sem reação, texto nem contexto, o relato continua legível', () => {
    const t = textoDoRelato({ id: 'ts-fila-parada', titulo: 'A fila que não anda', tipo: 'problema', secao: 'troubleshooting' });
    expect(t).toContain('**Incidente:** A fila que não anda');
    expect(t).toContain('_(sem comentário)_');
    expect(t).not.toContain('Contexto');
    expect(t).not.toContain('undefined');
  });

  it('o link abre a issue preenchida, com a etiqueta feedback', () => {
    const u = new URL(linkDaIssue(missao, { reacao: 'Gostei', texto: 'Muito bom & claro' }));
    expect(u.origin + u.pathname).toBe('https://github.com/pedromenuzzi/kube-learn/issues/new');
    expect(u.searchParams.get('title')).toBe('[feedback] O ramal da loja: Gostei');
    expect(u.searchParams.get('labels')).toBe('feedback');
    expect(u.searchParams.get('body')).toContain('Muito bom & claro');
  });
});
