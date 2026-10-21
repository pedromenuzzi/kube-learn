// O botão "Feedback" das missões, lições e quizzes: um <dialog> com uma reação, um texto livre e o contexto (a missão,
// o resultado dos testes, os últimos comandos). Nada sai daqui sozinho: abre uma issue no GitHub já preenchida, para
// o aluno revisar e enviar, ou copia o texto para mandar por onde quiser (WhatsApp, e-mail...).
import { escapar } from './util.js';
import { icone } from './icones.js';

const REPOSITORIO = 'https://github.com/pedromenuzzi/kube-learn';
const SITE = 'https://pedromenuzzi.github.io/kube-learn/';
export const REACOES = ['Gostei', 'Confusa', 'Fácil demais', 'Difícil demais', 'Achei um erro'];

/** O relato em Markdown (o corpo da issue). `contexto`: { testes?, comandos? }. */
export function textoDoRelato(item, { reacao, texto = '', testes, comandos = [] } = {}) {
  const tipo = item.tipo === 'quiz' ? 'Quiz' : item.tipo === 'licao' ? 'Lição' : item.secao ? 'Incidente' : 'Missão';
  return [
    `**${tipo}:** ${item.titulo} (\`${item.id}\`)${item.nivel !== undefined ? `, nível ${item.nivel}` : ''}`,
    `**Endereço:** ${SITE}#/ex/${item.id}`,
    reacao && `**Reação:** ${reacao}`,
    '',
    texto.trim() || '_(sem comentário)_',
    ...(testes || comandos.length ? ['', '<details><summary>Contexto</summary>', '',
      ...(testes ? [`Testes: ${testes}`, ''] : []),
      ...(comandos.length ? ['Últimos comandos:', '```', ...comandos, '```'] : []),
      '</details>'] : []),
  ].filter((l) => l !== false && l !== undefined && l !== null).join('\n');
}

/** O link que abre a issue já preenchida (título, corpo e a etiqueta feedback). */
export function linkDaIssue(item, dados = {}) {
  const titulo = `[feedback] ${item.titulo}${dados.reacao ? `: ${dados.reacao}` : ''}`;
  return `${REPOSITORIO}/issues/new?${new URLSearchParams({ title: titulo, body: textoDoRelato(item, dados), labels: 'feedback' })}`;
}

/** Abre o diálogo. `contexto()` → { testes?, comandos? }, lido na hora de abrir. */
export function abrirFeedback(item, contexto = () => ({})) {
  const ctx = contexto();
  const d = document.createElement('dialog');
  d.className = 'feedback';
  d.setAttribute('aria-labelledby', 'fb-titulo');
  const junto = ['a missão', ctx.testes && 'o resultado dos testes', ctx.comandos?.length && 'os últimos comandos do terminal'].filter(Boolean);
  d.innerHTML = `
    <form method="dialog">
      <h2 id="fb-titulo">${icone('balao')} Como foi “${escapar(item.titulo)}”?</h2>
      <fieldset class="reacoes"><legend>Em uma palavra</legend>
        ${REACOES.map((r) => `<label><input type="radio" name="reacao" value="${r}"> ${r}</label>`).join('')}
      </fieldset>
      <p class="campo"><label for="fb-texto">Conte mais (opcional)</label>
        <textarea id="fb-texto" name="texto" rows="4" placeholder="O que você tentou, o que esperava, onde travou..."></textarea></p>
      <p class="nota">Junto vai ${junto.length > 1 ? `${junto.slice(0, -1).join(', ')} e ${junto.at(-1)}` : junto[0]}. Nada sai daqui
        sozinho: o GitHub abre com tudo preenchido, para você revisar antes de enviar.</p>
      <p class="acoes-feedback">
        <a class="botao" target="_blank" rel="noopener" data-github>${icone('entregar')} Abrir no GitHub</a>
        <button type="button" class="botao-secundario" data-copiar>Copiar o texto</button>
        <button type="submit" class="botao-secundario">Fechar</button>
      </p>
      <p class="nota fb-estado" role="status" aria-live="polite"></p>
    </form>`;
  document.body.append(d);
  const form = d.querySelector('form');
  const dados = () => ({ reacao: form.reacao.value, texto: form.texto.value, ...ctx });
  const atualizar = () => { d.querySelector('[data-github]').href = linkDaIssue(item, dados()); };
  form.addEventListener('input', atualizar);
  atualizar();
  d.querySelector('[data-copiar]').addEventListener('click', async () => {
    const estado = d.querySelector('.fb-estado');
    try {
      await navigator.clipboard.writeText(textoDoRelato(item, dados()));
      estado.textContent = 'Copiado! Cole onde quiser: WhatsApp, e-mail, Slack.';
    } catch {
      estado.textContent = 'Não deu para copiar daqui. Use o botão do GitHub, ou selecione e copie o seu texto.';
    }
  });
  d.addEventListener('close', () => d.remove());
  d.showModal();
}
