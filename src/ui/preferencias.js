// Preferências de acessibilidade: tema (automático, claro, escuro, alto contraste), tamanho do texto e
// reduzir movimento. Aplicadas como atributos no <html> (o CSS faz o resto) e guardadas no navegador.
import { ler, gravar, CHAVES } from '../armazenamento.js';

const PADRAO = { tema: 'auto', texto: '100', movimento: 'normal' };

export function aplicarPreferencias(p = ler(CHAVES.preferencias, PADRAO)) {
  const h = document.documentElement;
  const pref = { ...PADRAO, ...p };
  if (pref.tema === 'auto') delete h.dataset.tema;
  else h.dataset.tema = pref.tema;
  h.dataset.texto = pref.texto;
  h.dataset.movimento = pref.movimento;
  return pref;
}

/** O botão "Aa" do topo abre um <dialog> com as opções. `aoMudar` redesenha a página (o navio usa as cores do tema). */
export function montarPreferencias(botao, aoMudar) {
  const dialogo = document.createElement('dialog');
  dialogo.className = 'preferencias';
  dialogo.setAttribute('aria-labelledby', 'pref-titulo');
  dialogo.innerHTML = `
    <form method="dialog">
      <h2 id="pref-titulo">Acessibilidade</h2>
      <fieldset><legend>Tema</legend>
        ${[['auto', 'Automático (do sistema)'], ['claro', 'Claro'], ['escuro', 'Escuro'], ['contraste', 'Alto contraste']]
    .map(([v, r]) => `<label><input type="radio" name="tema" value="${v}"> ${r}</label>`).join('')}
      </fieldset>
      <p><label for="pref-texto">Tamanho do texto</label>
        <select id="pref-texto" name="texto">${['100', '112', '125', '150'].map((v) => `<option value="${v}">${v}%</option>`).join('')}</select></p>
      <p><label><input type="checkbox" name="movimento" value="reduzido"> Reduzir movimento</label></p>
      <p><button type="submit" class="botao">Fechar</button></p>
    </form>`;
  document.body.append(dialogo);
  const form = dialogo.querySelector('form');
  const preencher = () => {
    const p = aplicarPreferencias();
    form.tema.value = p.tema;
    form.texto.value = p.texto;
    form.movimento.checked = p.movimento === 'reduzido';
  };
  form.addEventListener('change', () => {
    const p = { tema: form.tema.value, texto: form.texto.value, movimento: form.movimento.checked ? 'reduzido' : 'normal' };
    gravar(CHAVES.preferencias, p);
    aplicarPreferencias(p);
    aoMudar?.();
  });
  botao.addEventListener('click', () => {
    preencher();
    dialogo.showModal();
  });
  preencher();
}
