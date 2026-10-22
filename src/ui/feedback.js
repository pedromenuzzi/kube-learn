// O botão "Feedback" das missões, lições e quizzes: um <dialog> com uma reação, um texto livre e o contexto (a missão,
// o resultado dos testes, os últimos comandos). Nada sai daqui sozinho: abre uma issue no GitHub já preenchida, para
// o aluno revisar e enviar, ou copia o texto para mandar por onde quiser (WhatsApp, e-mail...).
import { escapar } from './util.js';
import { icone } from './icones.js';
import { t } from '../i18n.js';

const REPOSITORIO = 'https://github.com/pedromenuzzi/kube-learn';
const SITE = 'https://pedromenuzzi.github.io/kube-learn/';
export const REACOES = ['Gostei', 'Confusa', 'Fácil demais', 'Difícil demais', 'Achei um erro'];

/** O relato em Markdown (o corpo da issue). `contexto`: { testes?, comandos? }. */
export function textoDoRelato(item, { reacao, texto = '', testes, comandos = [] } = {}) {
  const tipo = item.tipo === 'quiz' ? 'Quiz' : item.tipo === 'licao' ? t('Lição') : item.secao ? t('Incidente') : t('Missão');
  return [
    `**${tipo}:** ${item.titulo} (\`${item.id}\`)${item.nivel !== undefined ? `, ${t('nível {n}', { n: item.nivel })}` : ''}`,
    `**${t('Endereço')}:** ${SITE}#/ex/${item.id}`,
    reacao && `**${t('Reação')}:** ${reacao}`,
    '',
    texto.trim() || t('_(sem comentário)_'),
    ...(testes || comandos.length ? ['', `<details><summary>${t('Contexto')}</summary>`, '',
      ...(testes ? [`${t('Testes')}: ${testes}`, ''] : []),
      ...(comandos.length ? [t('Últimos comandos:'), '```', ...comandos, '```'] : []),
      '</details>'] : []),
  ].filter((l) => l !== false && l !== undefined && l !== null).join('\n');
}

/**
 * O link que abre a issue já preenchida: o formulário .github/ISSUE_TEMPLATE/feedback.yml (que põe a etiqueta feedback para
 * qualquer pessoa), com o título e o campo "relato" preenchidos pela URL.
 */
export function linkDaIssue(item, dados = {}) {
  const titulo = `[feedback] ${item.titulo}${dados.reacao ? `: ${dados.reacao}` : ''}`;
  return `${REPOSITORIO}/issues/new?${new URLSearchParams({ template: 'feedback.yml', title: titulo, relato: textoDoRelato(item, dados) })}`;
}

/** Abre o diálogo. `contexto()` → { testes?, comandos? }, lido na hora de abrir. */
export function abrirFeedback(item, contexto = () => ({})) {
  const ctx = contexto();
  const d = document.createElement('dialog');
  d.className = 'feedback';
  d.setAttribute('aria-labelledby', 'fb-titulo');
  const junto = [t('a missão'), ctx.testes && t('o resultado dos testes'), ctx.comandos?.length && t('os últimos comandos do terminal')].filter(Boolean);
  const vaiJunto = junto.length > 1 ? t('{lista} e {ultimo}', { lista: junto.slice(0, -1).join(', '), ultimo: junto.at(-1) }) : junto[0];
  d.innerHTML = `
    <form method="dialog">
      <h2 id="fb-titulo">${icone('balao')} ${t('Como foi “{titulo}”?', { titulo: escapar(item.titulo) })}</h2>
      <fieldset class="reacoes"><legend>${t('Em uma palavra')}</legend>
        ${REACOES.map((r) => `<label><input type="radio" name="reacao" value="${t(r)}"> ${t(r)}</label>`).join('')}
      </fieldset>
      <p class="campo"><label for="fb-texto">${t('Conte mais (opcional)')}</label>
        <textarea id="fb-texto" name="texto" rows="4" placeholder="${t('O que você tentou, o que esperava, onde travou...')}"></textarea></p>
      <p class="nota">${t('Junto vai {junto}. Nada sai daqui sozinho: o GitHub abre com tudo preenchido, para você revisar antes de enviar.', { junto: vaiJunto })}</p>
      <p class="acoes-feedback">
        <a class="botao" target="_blank" rel="noopener" data-github>${icone('entregar')} ${t('Abrir no GitHub')}</a>
        <button type="button" class="botao-secundario" data-copiar>${t('Copiar o texto')}</button>
        <button type="submit" class="botao-secundario">${t('Fechar')}</button>
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
      estado.textContent = t('Copiado! Cole onde quiser: WhatsApp, e-mail, Slack.');
    } catch {
      estado.textContent = t('Não deu para copiar daqui. Use o botão do GitHub, ou selecione e copie o seu texto.');
    }
  });
  d.addEventListener('close', () => d.remove());
  d.showModal();
}
