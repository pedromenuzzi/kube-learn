// Pequenos ajudantes de interface.

export const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Abas acessíveis (padrão WAI-ARIA): setas trocam de aba, Home/End vão para a primeira/última.
 * `raiz` contém [role=tab] com aria-controls apontando para os [role=tabpanel].
 */
export function ativarAbas(raiz, aoTrocar) {
  const abas = [...raiz.querySelectorAll('[role=tab]')];
  const selecionar = (aba, focar = true, avisar = true) => {
    for (const a of abas) {
      const ativa = a === aba;
      a.setAttribute('aria-selected', String(ativa));
      a.tabIndex = ativa ? 0 : -1;
      document.getElementById(a.getAttribute('aria-controls')).hidden = !ativa;
    }
    if (focar) aba.focus();
    if (avisar) aoTrocar?.(aba.dataset.aba);
  };
  for (const a of abas) {
    a.addEventListener('click', () => selecionar(a));
    a.addEventListener('keydown', (e) => {
      const i = abas.indexOf(a);
      const alvo = { ArrowRight: abas[(i + 1) % abas.length], ArrowLeft: abas[(i - 1 + abas.length) % abas.length], Home: abas[0], End: abas.at(-1) }[e.key];
      if (alvo) {
        e.preventDefault();
        selecionar(alvo);
      }
    });
  }
  selecionar(abas.find((a) => a.getAttribute('aria-selected') === 'true') ?? abas[0], false, false);
  return { selecionar: (nome) => selecionar(abas.find((a) => a.dataset.aba === nome), false) };
}

/** HTML de um conjunto de abas: [{ id, rotulo }] → tablist e painéis vazios. */
export function htmlAbas(prefixo, abas, rotulo) {
  return `<div role="tablist" aria-label="${rotulo}" class="abas">${abas.map((a, i) => `<button type="button" role="tab" id="${prefixo}-aba-${a.id}" data-aba="${a.id}" aria-controls="${prefixo}-${a.id}" aria-selected="${i === 0}">${a.rotulo}</button>`).join('')}</div>`
    + abas.map((a) => `<div role="tabpanel" id="${prefixo}-${a.id}" aria-labelledby="${prefixo}-aba-${a.id}" class="painel" tabindex="0"></div>`).join('');
}
