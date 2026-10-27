// O placar do Plantão do dia: uma semana sem reprise, datas impossíveis sem exceção, o texto compartilhado sem spoiler,
// o botão de compartilhar (menu do sistema, área de transferência ou campo) e a página com o chamado de hoje em destaque.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CENARIOS, DEFEITOS, montarPlantao, plantaoDoDia, NIVEL_DO_PLANTAO } from '../src/jogo/plantao.js';
import { acharItem, NIVEIS } from '../src/conteudo/index.js';
import { CHAVES, DESCRICOES, exportarTudo, gravar, apagarTudo } from '../src/armazenamento.js';
import { compartilharResultado, htmlCompartilhar, tempoEEntregas, textoDoPlantao } from '../src/ui/compartilhar.js';
import { paginaPlantao } from '../src/ui/paginas.js';
import { hojeLocal } from '../src/jogo/gamificacao.js';
import { somarDias } from '../src/jogo/revisao.js';
import { rodarTestes } from '../src/verificacoes.js';
import { montarCluster } from '../src/conteudo/clusters.js';
import { rodarLinha } from '../src/k8s/linha.js';
import * as EN from '../src/i18n/en/index.js';

/** O aluno que resolveu (ou não) o plantão, como o aluno() de tests/trilha.js (que só roda no ambiente node). */
function aluno(item, { resolvido }) {
  const arquivos = { ...(resolvido ? item.solucao : item.inicial) };
  const clusterDoAluno = montarCluster(item.cluster, item.id);
  const historico = resolvido ? item.solucaoTerminal : [];
  for (const linha of historico) rodarLinha(clusterDoAluno, linha, arquivos);
  clusterDoAluno.avancar('1m');
  return { arquivos, clusterDoAluno, historico, resposta: '' };
}

const dia = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

describe('o calendário do Plantão', () => {
  // A página mostra hoje e os 7 dias anteriores: 8 dias seguidos, 8 títulos (e 7 dias seguidos, 7).
  it('8 dias seguidos têm 8 títulos diferentes (em qualquer janela do ano)', () => {
    const titulos = Array.from({ length: 365 + 7 }, (_, i) => plantaoDoDia(dia(i)).titulo);
    for (let i = 0; i < 365; i++) expect(new Set(titulos.slice(i, i + 8)).size, `os 8 dias desde ${dia(i)}`).toBe(8);
  });

  it('o app de cada morador é um rótulo DNS válido, e nenhum se repete', () => {
    for (const c of CENARIOS) expect(c.app).toMatch(/^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/);
    expect(new Set(CENARIOS.map((c) => c.app)).size).toBe(CENARIOS.length);
    expect(CENARIOS).toHaveLength(8);
  });

  it('data impossível não abre nada, e sem exceção', () => {
    for (const id of ['plantao-2026-13-01', 'plantao-0001-01-01', 'plantao-2026-00-10', 'plantao-2026-10-00', 'plantao-1969-12-31', 'plantao-2026-02-29', 'plantao-26-10-2026', 'plantao-']) {
      expect(() => acharItem(id), id).not.toThrow();
      expect(acharItem(id), id).toBeNull();
    }
    expect(acharItem('plantao-1970-01-01').secao).toBe('plantao');
    expect(acharItem('plantao-2028-02-29').secao).toBe('plantao');
  });

  // O teste da trilha do Plantão (tests/plantao.test.js) passa por todas as duplas; aqui, os moradores novos.
  CENARIOS.slice(5).forEach((cenario) => {
    it(`${cenario.app}: monta, o conserto passa e o começo falha`, () => {
      const item = montarPlantao(`plantao-placar-${cenario.app}`, cenario, [DEFEITOS.seletor[0], DEFEITOS.imagem[0]]);
      expect(item.comoSaber).toContain('o JSON do app');
      const certo = rodarTestes(item, aluno(item, { resolvido: true }), { todos: true });
      expect(certo.flatMap((t) => t.regras.filter((x) => !x.ok).map((x) => `${x.mensagem} (${x.detalhe})`))).toEqual([]);
      expect(rodarTestes(item, aluno(item, { resolvido: false }), { todos: true }).some((t) => !t.ok)).toBe(true);
    });
  });
});

describe('o resultado para compartilhar', () => {
  it('diz o dia, o título, o tempo e as entregas, com o link do Plantão', () => {
    const item = plantaoDoDia('2026-10-26');
    expect(textoDoPlantao(item, { ms: 462_000, entregas: 3 })).toBe(`kube-learn · Plantão 26/10 🚒 ${item.titulo} · resolvido em 7:42 · 3 entregas · https://pedromenuzzi.github.io/kube-learn/#/plantao`);
    expect(tempoEEntregas({ ms: 59_600, entregas: 1 })).toBe('1:00 · 1 entrega');
  });

  // Nada do diagnóstico, do campo mudado nem dos comandos: as palavras do <code> e do <i> do diagnóstico, os termos
  // técnicos (camelCase), as linhas que o conserto muda e os comandos da dica e da solução. O nome do app e a chave
  // `app` do rótulo estão em todo plantão (e o app está no título): não são spoiler.
  const palavras = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((p) => p.length > 1 && !/^\d+$/.test(p));
  const linhasMudadas = (a, b) => Object.keys(a).flatMap((f) => {
    const [la, lb] = [a[f].split('\n'), b[f].split('\n')];
    return [...la.filter((l) => !lb.includes(l)), ...lb.filter((l) => !la.includes(l))];
  });
  const tipos = Object.keys(DEFEITOS);
  const duplas = tipos.flatMap((a, i) => tipos.slice(i + 1).flatMap((b) => DEFEITOS[a].flatMap((da) => DEFEITOS[b].map((db) => [`${a} + ${b}`, da, db]))));

  it(`nenhuma das ${duplas.length} duplas de defeitos vaza no texto`, () => {
    const vazou = duplas.flatMap(([nome, a, b], i) => {
      const cenario = CENARIOS[i % CENARIOS.length];
      const item = montarPlantao(`plantao-spoiler-${i}`, cenario, [a, b]);
      const tecnicas = [...item.diagnostico.matchAll(/<(code|i)>(.*?)<\/\1>/g)].map((m) => m[2]).join(' ');
      const camel = item.diagnostico.replace(/<[^>]+>/g, ' ').match(/\b\w*[a-z][A-Z]\w*\b|\b[A-Z]{2,}\w*\b/g) ?? [];
      const spoilers = new Set(palavras([tecnicas, ...camel, ...linhasMudadas(item.inicial, item.solucao), item.dica, ...item.solucaoTerminal].join(' ')));
      spoilers.delete(cenario.app);
      spoilers.delete('app');
      expect(spoilers.size, nome).toBeGreaterThan(5);
      const texto = textoDoPlantao(item, { ms: 462_000, entregas: 3 });
      return palavras(texto).filter((p) => spoilers.has(p)).map((p) => `${nome}: ${p}`);
    });
    expect(vazou).toEqual([]);
  });
});

describe('o botão Compartilhar resultado', () => {
  const montar = () => {
    document.body.innerHTML = `<p>${htmlCompartilhar('kube-learn · Plantão 26/10 🚒 A padaria fora do ar · resolvido em 7:42 · 3 entregas')}</p>`;
    return document.querySelector('[data-acao=compartilhar]');
  };
  const TEXTO = 'kube-learn · Plantão 26/10 🚒 A padaria fora do ar · resolvido em 7:42 · 3 entregas';
  afterEach(() => vi.unstubAllGlobals());

  it('com o menu do sistema, compartilha o texto e não copia nada', async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    const botao = montar();
    await compartilharResultado(botao);
    expect(share).toHaveBeenCalledWith({ text: TEXTO });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('fechar o menu sem escolher fica calado', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share: async () => { throw new DOMException('cancelado', 'AbortError'); }, clipboard: { writeText } });
    const botao = montar();
    await compartilharResultado(botao);
    expect(writeText).not.toHaveBeenCalled();
    expect(botao.nextElementSibling.textContent).toBe('');
  });

  it('sem o menu, copia e avisa "Copiado" na região viva', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const botao = montar();
    await compartilharResultado(botao);
    expect(writeText).toHaveBeenCalledWith(TEXTO);
    expect(botao.nextElementSibling.getAttribute('role')).toBe('status');
    expect(botao.nextElementSibling.textContent).toBe('Copiado');
  });

  it('sem nenhum dos dois, mostra o texto num campo somente leitura, já selecionado', async () => {
    vi.stubGlobal('navigator', {});
    const botao = montar();
    await compartilharResultado(botao);
    const campo = botao.nextElementSibling.querySelector('input');
    expect(campo.readOnly).toBe(true);
    expect(campo.value).toBe(TEXTO);
    expect(document.activeElement).toBe(campo);
  });
});

describe('a chave plantoes', () => {
  afterEach(() => apagarTudo());

  it('está na página de privacidade (em português e em inglês) e no "Baixar meus dados"', () => {
    expect(CHAVES.plantoes).toBe('plantoes');
    expect(DESCRICOES.plantoes).toBeTruthy();
    expect(EN.ui[DESCRICOES.plantoes]).toBeTruthy();
    gravar(CHAVES.plantoes, { 'plantao-2026-10-26': { ms: 462_000, entregas: 3 } });
    expect(exportarTudo().plantoes).toEqual({ 'plantao-2026-10-26': { ms: 462_000, entregas: 3 } });
  });
});

describe('a página do Plantão', () => {
  afterEach(() => apagarTudo());
  const abrir = async () => {
    const main = document.createElement('main');
    (await paginaPlantao())(main);
    return main;
  };
  const hoje = () => plantaoDoDia(hojeLocal()).id;

  it('quem ainda não chegou ao Nível 6 vê a recomendação, e o chamado de hoje abre com "Atender agora"', async () => {
    const main = await abrir();
    expect(main.textContent).toContain(`Recomendado a partir do Nível ${NIVEL_DO_PLANTAO}`);
    const atender = main.querySelector('.plantao-hoje a.botao-grande');
    expect(atender.textContent).toContain('Atender agora');
    expect(atender.getAttribute('href')).toBe(`#/ex/${hoje()}`);
    expect(main.querySelectorAll('ol.plantoes li')).toHaveLength(7);
  });

  it('quem chegou ao Nível 6 não vê a recomendação', async () => {
    gravar(CHAVES.progresso, { [NIVEIS[NIVEL_DO_PLANTAO].itens[0].id]: { status: 'tentado', em: hojeLocal() } });
    expect((await abrir()).textContent).not.toContain('Recomendado a partir');
  });

  it('o de hoje atendido mostra o tempo, as entregas e o Compartilhar; a lista mostra o tempo de cada dia', async () => {
    const ontem = plantaoDoDia(somarDias(hojeLocal(), -1)).id;
    const anteontem = plantaoDoDia(somarDias(hojeLocal(), -2)).id;
    gravar(CHAVES.progresso, { [hoje()]: { status: 'resolvido' }, [ontem]: { status: 'resolvido' }, [anteontem]: { status: 'resolvido' } });
    gravar(CHAVES.plantoes, { [hoje()]: { ms: 462_000, entregas: 3 }, [ontem]: { ms: 75_000, entregas: 1 } });
    const main = await abrir();
    const destaque = main.querySelector('.plantao-hoje');
    expect(destaque.textContent).toContain('Atendido em 7:42 · 3 entregas');
    expect(destaque.querySelector('a.botao-grande')).toBeNull();
    expect(destaque.querySelector('[data-acao=compartilhar]').dataset.texto).toContain('resolvido em 7:42 · 3 entregas');
    const lista = [...main.querySelectorAll('ol.plantoes li')].map((li) => li.textContent.replace(/\s+/g, ' '));
    expect(lista[0]).toContain('Atendido em 1:15');
    expect(lista[1]).toContain('Atendido'); // resolvido antes do placar existir: sem tempo
    expect(lista[1]).not.toContain('Atendido em');
    expect(lista[2]).toContain('Em aberto');
  });
});
