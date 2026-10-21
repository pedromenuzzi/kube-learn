// O terminal: digita uma linha, mostra a saída, guarda o histórico (↑/↓), completa com Tab, acompanha -w e -f
// (as linhas novas chegam a cada tique do relógio) e vira o shell do contêiner no `exec -it`.
import { escapar } from './util.js';
import { icone } from './icones.js';

const PROMPT = 'aluno@kube-learn:~$';
const MAX_LINHAS = 1500;

/**
 * opções: executar(linha) → { saida, codigo, observar?, sessao?, caixas? }; completar(linha) → [opções].
 */
export function criarTerminal(raiz, { executar, completar }) {
  raiz.classList.add('terminal');
  raiz.innerHTML = `
    <div class="term-saida" role="log" aria-live="polite" aria-label="Saída do terminal"></div>
    <form class="term-linha">
      <label class="term-prompt" for="term-entrada">${PROMPT}</label>
      <input id="term-entrada" class="term-entrada" autocomplete="off" autocapitalize="off" spellcheck="false"
        aria-describedby="term-ajuda">
    </form>
    <p id="term-ajuda" class="term-ajuda">↑/↓ histórico · Tab completa · Ctrl+C para · Ctrl+L limpa</p>`;
  const saida = raiz.querySelector('.term-saida');
  const entrada = raiz.querySelector('input');
  const rotulo = raiz.querySelector('.term-prompt');
  const historico = [];
  let posicao = 0;
  let observador = null;
  let sessao = null;

  const rolar = () => {
    while (saida.childElementCount > MAX_LINHAS) saida.firstElementChild.remove();
    saida.scrollTop = saida.scrollHeight;
  };
  const escrever = (texto, classe = '') => {
    if (!texto) return;
    const pre = document.createElement('pre');
    pre.className = classe;
    pre.textContent = texto.replace(/\n$/, '');
    saida.append(pre);
    rolar();
  };
  const caixa = (c) => {
    const div = document.createElement('div');
    div.className = 'term-caixa';
    div.innerHTML = `<p class="term-caixa-titulo">${icone('lampada')} ${escapar(c.titulo)}</p><p>${c.texto}</p>${c.vidaReal ? `<p class="term-caixa-vida">Na vida real: ${escapar(c.vidaReal)}</p>` : ''}`;
    saida.append(div);
    rolar();
  };
  const pararObservador = () => {
    if (!observador) return;
    observador = null;
    escrever('^C');
  };

  function rodar(linha, { mostrar = true } = {}) {
    pararObservador();
    const prompt = sessao ? sessao.prompt : `${PROMPT} `;
    if (mostrar) escrever(`${prompt}${linha}`, 'term-comando');
    if (!linha.trim()) return null;
    if (sessao) {
      const r = sessao.executar(linha);
      escrever(r.saida);
      if (r.sair) {
        sessao = null;
        rotulo.textContent = PROMPT;
      }
      return r;
    }
    historico.push(linha);
    posicao = historico.length;
    const r = executar(linha);
    if (r.limpar) {
      saida.replaceChildren();
      return r;
    }
    for (const p of r.partes ?? [{ texto: r.saida, fluxo: 'out' }]) escrever(p.texto, p.fluxo === 'err' ? 'term-erro' : '');
    for (const c of r.caixas ?? []) caixa(c);
    if (r.observar) observador = r.observar;
    if (r.sessao) {
      sessao = r.sessao;
      rotulo.textContent = sessao.prompt.trim();
    }
    return r;
  }

  raiz.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const linha = entrada.value;
    entrada.value = '';
    rodar(linha);
  });

  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!historico.length) return;
      e.preventDefault();
      posicao = Math.max(0, Math.min(historico.length, posicao + (e.key === 'ArrowUp' ? -1 : 1)));
      entrada.value = historico[posicao] ?? '';
    } else if (e.key === 'Tab' && entrada.value.trim() && !sessao) {
      // Com texto, o Tab completa; com a linha vazia, ele segue para o próximo elemento da página.
      const opcoes = completar(entrada.value);
      if (!opcoes.length) return;
      e.preventDefault();
      if (opcoes.length === 1) entrada.value = opcoes[0];
      else {
        const comum = opcoes.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
        if (comum.length > entrada.value.length) entrada.value = comum;
        else escrever(opcoes.map((o) => o.split(' ').pop()).join('  '));
      }
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      if (observador) pararObservador();
      else {
        escrever(`${PROMPT} ${entrada.value}^C`, 'term-comando');
        entrada.value = '';
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      saida.replaceChildren();
    }
  });

  raiz.addEventListener('click', (e) => {
    if (!window.getSelection()?.toString() && e.target === saida) entrada.focus();
  });

  return {
    rodar,
    escrever,
    focar: () => entrada.focus(),
    limpar: () => saida.replaceChildren(),
    /** Chamado a cada tique do relógio: as linhas novas do -w / -f. */
    tique() {
      if (observador) escrever(observador());
    },
    get historico() {
      return historico;
    },
    /** Põe linhas no histórico (as de antes da troca de idioma): ↑ traz a última. */
    lembrar(linhas) {
      historico.push(...linhas);
      posicao = historico.length;
    },
  };
}
