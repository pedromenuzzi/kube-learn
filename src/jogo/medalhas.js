// As medalhas da Oficina do kubectl: ouro até a meta do exercício, prata até o dobro, bronze por resolver. A melhor
// medalha sai do recorde guardado (o menor tempo, que nunca piora), então ela também nunca rebaixa.
// ponytail: se uma meta for apertada depois, a medalha derivada do recorde pode cair; aí, guardar a medalha também.
import { t } from '../i18n.js';

// O tempo como a tela mostra (m:ss arredonda o segundo): 0:30 numa meta de 0:30 é ouro, e nunca "faltam 0:00".
const noSegundo = (ms) => Math.round(ms / 1000) * 1000;

/** 'ouro' | 'prata' | 'bronze' para um tempo `ms` num exercício de meta `meta` (ms). */
export function medalha(ms, meta) {
  const s = noSegundo(ms);
  return s <= meta ? 'ouro' : s <= 2 * meta ? 'prata' : 'bronze';
}

/** Quanto falta (ms) para a medalha seguinte, e qual é ela; no ouro, null. */
export function faltaParaSeguinte(ms, meta) {
  const m = medalha(ms, meta);
  if (m === 'ouro') return null;
  return m === 'prata' ? { seguinte: 'ouro', falta: noSegundo(ms) - meta } : { seguinte: 'prata', falta: noSegundo(ms) - 2 * meta };
}

/** O nome da medalha, para a tela (o texto vai junto da cor). */
export const nomeDaMedalha = (m) => ({ ouro: t('Ouro'), prata: t('Prata'), bronze: t('Bronze') })[m];
