// O certificado final (com o navio carregado) e a página de privacidade. As duas desenham na hora, só com o índice leve.
import { NIVEIS } from '../conteudo/indice.js';
import { calcularJornada, hojeLocal } from '../jogo/gamificacao.js';
import { ler, gravar, CHAVES, DESCRICOES, exportarTudo, apagarTudo, conferirDados, restaurar } from '../armazenamento.js';
import { aplicarPreferencias } from './preferencias.js';
import { svgSelo, htmlCertificado, linkPerfil, linkCompartilhar } from './selos.js';
import { escapar } from './util.js';
import { icone } from './icones.js';
import { t, idioma, idiomaInicial } from '../i18n.js';

export function paginaCertificado() {
  return (main) => {
    const j = calcularJornada(NIVEIS, ler(CHAVES.progresso, {}), ler(CHAVES.conquistas, {}));
    const prontos = j.niveis.filter((n) => n.concluido);
    // Os lacres que faltam aparecem como um espaço vazio (dá vontade de completar).
    const selos = `${prontos.length ? '' : `<p class="nota">${t('Nenhum lacre ainda: um nível é lacrado com 100% das missões resolvidas.')}</p>`}
      <ul class="selos">${j.niveis.map((n) => (n.concluido
    ? `<li>${svgSelo(n, { tamanho: 96 })}<span>${t('Nível {n}: {titulo}', { n: n.numero, titulo: escapar(n.titulo) })}</span></li>`
    : `<li class="selo-faltando"><span class="selo-vazio" aria-hidden="true">${icone('cadeado')}</span><span>${t('Nível {n}: {titulo}', { n: n.numero, titulo: escapar(n.titulo) })} <span class="visualmente-oculto">(${t('ainda sem lacre')})</span></span></li>`)).join('')}</ul>
      ${prontos.length ? `<p><a class="botao-secundario" href="${linkCompartilhar()}" target="_blank" rel="noopener">${icone('linkedin')} ${t('Compartilhar no LinkedIn')}</a></p>` : ''}`;
    if (!j.navioCheio) {
      main.innerHTML = `
        <p class="sobretitulo">${t('Conquistas')}</p>
        <h1 class="pixel">${t('Lacres')}</h1>
        <p>${t('Cada nível concluído (100%) é <b>lacrado</b>. Com os {n} níveis lacrados, o navio está carregado e o certificado final é liberado.', { n: NIVEIS.length })}</p>
        <h2>${t('Seus lacres ({n} de {total})', { n: prontos.length, total: NIVEIS.length })}</h2>
        ${selos}
        <p><a class="botao" href="#/trilha">${icone('trilha')} ${t('Continuar embarcando')}</a></p>`;
      return {};
    }
    // A data do certificado: o dia em que o navio ficou cheio (guardado na festa, ou na migração de quem chegou antes).
    const data = ler(CHAVES.conquistas, {}).navio ?? hojeLocal();
    const desenhar = () => {
      const nome = ler(CHAVES.nome, '');
      main.innerHTML = `
        <h1 class="pixel">${t('Certificado')}</h1>
        <form class="form-nome nao-imprimir">
          <p><label for="nome-certificado">${t('Seu nome, como deve sair no certificado')}</label><br>
            <input id="nome-certificado" name="nome" value="${escapar(nome)}" autocomplete="name" required>
            <button type="submit">${t('Salvar')}</button></p>
          <p class="nota">${t('O nome fica só neste navegador (veja a <a href="#/privacidade">privacidade</a>).')}</p>
        </form>
        ${nome ? `${htmlCertificado({ nome, data, xp: j.xp, niveis: NIVEIS })}
        <p class="nao-imprimir acoes"><button type="button" class="botao" data-imprimir>${icone('imprimir')} ${t('Imprimir ou salvar em PDF')}</button>
          <a class="botao-secundario" href="${linkPerfil(data)}" target="_blank" rel="noopener">${icone('linkedin')} ${t('Adicionar ao perfil do LinkedIn')}</a></p>` : ''}
        <h2 class="nao-imprimir">${t('Seus lacres')}</h2><div class="nao-imprimir">${selos}</div>`;
      main.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        gravar(CHAVES.nome, e.target.nome.value.trim());
        desenhar();
      });
      main.querySelector('[data-imprimir]')?.addEventListener('click', () => window.print());
    };
    desenhar();
    return {};
  };
}

/** '12 missões, 8 dias, 3 lacres': o que há num conjunto de dados (o do arquivo ou o deste navegador). */
function resumo(dados) {
  const conta = (n, um, varios) => t(n === 1 ? um : varios, { n });
  const missoes = Object.values(dados.progresso ?? {}).filter((p) => p?.status === 'resolvido').length;
  return [
    conta(missoes, '{n} missão', '{n} missões'),
    conta(dados.dias?.length ?? 0, '{n} dia', '{n} dias'),
    conta(Object.keys(dados.conquistas?.lacres ?? {}).length, '{n} lacre', '{n} lacres'),
  ].join(', ');
}

export function paginaPrivacidade() {
  return (main) => {
    main.innerHTML = `
      <p class="sobretitulo">${t('Seus dados')}</p>
      <h1 class="pixel">${t('Privacidade')}</h1>
      <p>${t('<b>Sem cadastro, sem cookies, sem rastreamento e sem servidor.</b> O kube-learn é um site estático: o cluster roda no seu navegador e nada do que você faz é enviado para lugar nenhum.')}</p>
      <p>${t('O que o site guarda fica <b>só neste navegador</b> (no <code>localStorage</code>, com o prefixo <code>kube-learn:</code>):')}</p>
      <table class="tabela-simples"><thead><tr><th>${t('Chave')}</th><th>${t('O que guarda')}</th></tr></thead>
        <tbody>${Object.entries(DESCRICOES).map(([k, d]) => `<tr><td><code>${k}</code></td><td>${t(d)}</td></tr>`).join('')}</tbody></table>
      <p>${t('O botão <b>Feedback</b> também não envia nada sozinho: ele abre uma issue no GitHub já preenchida (pública, na sua conta, só se você clicar em enviar lá) ou copia o texto para você mandar por onde quiser.')}</p>
      <p>${t('Pela LGPD, os dados são seus: dá para baixar uma cópia ou apagar tudo a qualquer momento.')}</p>
      <p class="acoes"><button type="button" class="botao" data-baixar>${icone('baixar')} ${t('Baixar meus dados')}</button>
        <button type="button" class="botao-perigo" data-apagar>${icone('lixeira')} ${t('Apagar meus dados')}</button></p>
      <p>${t('Estuda em outro aparelho, ou limpou o navegador? O arquivo do <b>Baixar meus dados</b> traz tudo de volta: progresso, dias, lacres, revisão, recordes e os arquivos das missões.')}</p>
      <p><label for="restaurar-arquivo">${t('Restaurar de um arquivo')}</label><br>
        <input type="file" id="restaurar-arquivo" accept="application/json"></p>
      <p class="quiz-retorno" role="status" aria-live="polite"></p>
      <dialog class="feedback restaurar" aria-labelledby="restaurar-titulo" aria-describedby="restaurar-resumo">
        <form method="dialog">
          <h2 id="restaurar-titulo">${t('Trocar os dados deste navegador?')}</h2>
          <div id="restaurar-resumo"></div>
          <p><button type="submit" class="botao" value="restaurar">${t('Restaurar')}</button>
            <button type="submit" class="botao-secundario" value="">${t('Cancelar')}</button></p>
        </form>
      </dialog>`;
    const aviso = main.querySelector('.quiz-retorno');
    main.querySelector('[data-baixar]').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(exportarTudo(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kube-learn-meus-dados.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); // depois que o download começou
      aviso.textContent = t('Arquivo baixado: kube-learn-meus-dados.json.');
    });
    main.querySelector('[data-apagar]').addEventListener('click', () => {
      if (!confirm(t('Apagar todo o seu progresso, arquivos e preferências deste navegador? Não dá para desfazer.'))) return;
      apagarTudo();
      location.reload(); // o tema, o idioma e o placar voltam ao padrão
    });

    // Restaurar: confere o arquivo inteiro antes de gravar qualquer coisa; com progresso aqui, pergunta antes de trocar.
    const entrada = main.querySelector('#restaurar-arquivo');
    const dialogo = main.querySelector('dialog');
    let dados = null;
    const falhar = (texto, valores) => {
      aviso.className = 'quiz-retorno falha';
      aviso.textContent = t(texto, valores);
    };
    const aplicar = () => {
      const problema = restaurar(dados);
      if (problema) return falhar(problema.texto, problema.valores);
      if (idiomaInicial() !== idioma()) return location.reload(); // outro idioma no arquivo: o site todo é redesenhado nele
      aplicarPreferencias();
      aviso.className = 'quiz-retorno ok';
      aviso.textContent = t('Pronto: seus dados voltaram ({resumo}).', { resumo: resumo(dados) });
    };
    entrada.addEventListener('change', async () => {
      const arquivo = entrada.files[0];
      entrada.value = ''; // o mesmo arquivo de novo também dispara
      if (!arquivo) return;
      try {
        dados = JSON.parse(await arquivo.text());
      } catch {
        return falhar('Este arquivo não é um JSON: escolha o arquivo do Baixar meus dados.');
      }
      const problema = conferirDados(dados);
      if (problema) return falhar(problema.texto, problema.valores);
      if (!Object.keys(ler(CHAVES.progresso, {})).length) return aplicar();
      dialogo.querySelector('#restaurar-resumo').innerHTML = `
        <p>${t('Neste navegador: {resumo}.', { resumo: resumo(exportarTudo()) })}</p>
        <p>${t('No arquivo: {resumo}.', { resumo: resumo(dados) })}</p>
        <p class="nota">${t('O que está aqui é trocado pelo que está no arquivo (os dois não se juntam).')}</p>`;
      dialogo.returnValue = '';
      dialogo.showModal();
    });
    dialogo.addEventListener('close', () => {
      if (dialogo.returnValue === 'restaurar') aplicar();
      else {
        aviso.className = 'quiz-retorno';
        aviso.textContent = t('Nada mudou: os dados deste navegador continuam como estavam.');
      }
      entrada.focus();
    });
    return {};
  };
}
