// O resultado do Plantão do dia para compartilhar, como no Wordle: o dia, o título do chamado, o tempo e as entregas.
// Sem spoiler (nada do defeito, do campo mudado nem do comando), e nada sai do navegador sem o clique.
import { t } from '../i18n.js';
import { SITE } from './selos.js';
import { escapar, minutosESegundos } from './util.js';
import { icone } from './icones.js';

/** '7:42 · 3 entregas' */
export const tempoEEntregas = ({ ms, entregas }) => `${minutosESegundos(ms)} · ${entregas === 1 ? t('1 entrega') : t('{n} entregas', { n: entregas })}`;

/** 'kube-learn · Plantão 26/10 🚒 A padaria fora do ar · resolvido em 7:42 · 3 entregas · https://…/#/plantao' */
export function textoDoPlantao(item, resultado) {
  const [, mes, dia] = item.id.slice('plantao-'.length).split('-');
  return `${t('kube-learn · Plantão {dia}/{mes} 🚒 {titulo} · resolvido em {placar}', { dia, mes, titulo: item.titulo, placar: tempoEEntregas(resultado) })} · ${SITE}#/plantao`;
}

/** O botão (o texto vai nele) e o lugar onde ele responde: 'Copiado', ou o campo com o texto. */
export const htmlCompartilhar = (texto) => `<button type="button" class="link-botao" data-acao="compartilhar" data-texto="${escapar(texto)}">${icone('entregar')} ${t('Compartilhar resultado')}</button><span class="compartilhado" role="status"></span>`;

/** O menu de compartilhar do sistema; sem ele, a área de transferência; sem as duas, o texto num campo já selecionado. */
export async function compartilharResultado(botao) {
  const texto = botao.dataset.texto;
  const status = botao.nextElementSibling;
  if (navigator.share) {
    try {
      return await navigator.share({ text: texto });
    } catch (erro) {
      if (erro.name === 'AbortError') return; // fechou o menu sem escolher
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    status.textContent = t('Copiado');
  } catch {
    status.innerHTML = `<input readonly aria-label="${t('Resultado para copiar')}" value="${escapar(texto)}">`;
    status.firstChild.focus();
    status.firstChild.select();
  }
}
