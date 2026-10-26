// A tela da missão: os arquivos com que uma etapa de projeto abre e, com o simulador tropeçando (rodarTestes ou o
// relógio lançando), a tela nunca fica muda.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVES, gravar, ler } from '../src/armazenamento.js';
import { ITENS, acharItem } from '../src/conteudo/index.js';

const falhar = vi.hoisted(() => ({ testes: false, relogio: false }));
vi.mock('../src/verificacoes.js', async (original) => {
  const real = await original();
  return { ...real, rodarTestes: (...a) => { if (falhar.testes) throw new Error('teste quebrado'); return real.rodarTestes(...a); } };
});
vi.mock('../src/conteudo/clusters.js', async (original) => {
  const real = await original();
  return {
    ...real,
    montarCluster(...a) {
      const c = real.montarCluster(...a);
      const avancar = c.avancar.bind(c);
      c.avancar = (...b) => { if (falhar.relogio) throw new Error('tique quebrado'); return avancar(...b); };
      return c;
    },
  };
});

const { arquivosIniciais, montarExercicio } = await import('../src/ui/exercicio.js');

beforeEach(() => localStorage.clear());

describe('arquivosIniciais: a etapa de projeto', () => {
  const etapa = ITENS.find((i) => i.continuaDe);
  const meus = { 'meu.yaml': 'kind: Pod\n' };

  it('a etapa anterior resolvida: os arquivos do aluno, mais os novos desta etapa', () => {
    gravar(CHAVES.progresso, { [etapa.continuaDe]: { status: 'resolvido' } });
    gravar(CHAVES.arquivos + etapa.continuaDe, meus);
    expect(arquivosIniciais(etapa, null)).toEqual({ ...meus, ...etapa.novos });
  });

  it('a etapa anterior só tentada, ou nunca aberta: a referência', () => {
    gravar(CHAVES.progresso, { [etapa.continuaDe]: { status: 'tentado' } });
    gravar(CHAVES.arquivos + etapa.continuaDe, meus);
    expect(arquivosIniciais(etapa, null)).toEqual(etapa.inicial);
    localStorage.clear();
    expect(arquivosIniciais(etapa, null)).toEqual(etapa.inicial);
  });

  it('o que o aluno já salvou nesta etapa vem primeiro', () => {
    expect(arquivosIniciais(etapa, meus)).toBe(meus);
  });
});

describe('o simulador tropeça e a tela não fica muda', () => {
  let tela;
  let raiz;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    raiz = document.createElement('main');
    document.body.append(raiz);
  });
  afterEach(() => {
    tela?.destruir();
    raiz.remove();
    falhar.testes = falhar.relogio = false;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('o Entregar com rodarTestes lançando: aviso, aba Testes com o erro e a escada de ajuda anda', () => {
    const item = acharItem('kubectl-escalar');
    tela = montarExercicio(raiz, item);
    falhar.testes = true;
    const entregar = () => {
      raiz.querySelector('[data-acao=entregar]').click();
      vi.advanceTimersByTime(50);
    };
    entregar();
    expect(raiz.querySelector('.ex-aviso').textContent).toContain('O simulador tropeçou');
    expect(raiz.querySelector('.ex-aviso').className).toContain('falha');
    expect(raiz.querySelector('#lado-testes').textContent).toContain('teste quebrado');
    expect(raiz.querySelector('#lado-testes').hidden).toBe(false);
    entregar(); // a segunda entrega errada abre a dica
    expect(raiz.querySelector('.aviso-ajuda').textContent).toContain(item.dica);
    expect(ler(CHAVES.progresso, {})[item.id]).toBeUndefined(); // o defeito nosso não vira "tentado"
  });

  it('o relógio lançando avisa uma vez e para de avançar o cluster', () => {
    tela = montarExercicio(raiz, acharItem('kubectl-escalar'));
    falhar.relogio = true;
    vi.advanceTimersByTime(5000);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(raiz.querySelector('.ex-aviso').textContent).toContain('tique quebrado');
  });

  it('a missão montada de novo continua com o cluster e o histórico', () => {
    const item = acharItem('kubectl-escalar');
    tela = montarExercicio(raiz, item);
    const digitar = (linha) => {
      raiz.querySelector('.term-entrada').value = linha;
      raiz.querySelector('.term-linha').requestSubmit();
    };
    digitar('kubectl scale deployment loja --replicas=5');
    tela.destruir();
    tela = montarExercicio(raiz, item);
    expect(raiz.querySelector('.term-saida').textContent).toContain('Seu cluster continua como você deixou');
    raiz.querySelector('.term-entrada').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(raiz.querySelector('.term-entrada').value).toBe('kubectl scale deployment loja --replicas=5');
    digitar('kubectl get deploy loja -o jsonpath={.spec.replicas}');
    expect(raiz.querySelector('.term-saida').lastElementChild.textContent).toBe('5');
  });
});
