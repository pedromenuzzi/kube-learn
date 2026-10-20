// O certificado final (com o navio carregado) e a página de privacidade.
import { NIVEIS } from '../conteudo/index.js';
import { calcularJornada } from '../jogo/gamificacao.js';
import { ler, gravar, CHAVES, DESCRICOES, exportarTudo, apagarTudo } from '../armazenamento.js';
import { svgSelo, htmlCertificado, linkPerfil, linkCompartilhar } from './selos.js';
import { escapar } from './util.js';

export function paginaCertificado() {
  return (main) => {
    const j = calcularJornada(NIVEIS, ler(CHAVES.progresso, {}));
    const prontos = j.niveis.filter((n) => n.concluido);
    const selos = prontos.length
      ? `<ul class="selos">${prontos.map((n) => `<li>${svgSelo(n, { tamanho: 120 })}<span>Nível ${n.numero}: ${escapar(n.titulo)}</span></li>`).join('')}</ul>
         <p><a href="${linkCompartilhar()}" target="_blank" rel="noopener">🔗 Compartilhar no LinkedIn</a></p>`
      : '<p class="nota">Nenhum lacre ainda: um nível é lacrado com 100% das missões resolvidas.</p>';
    if (!j.navioCheio) {
      main.innerHTML = `
        <h1 class="pixel">Lacres</h1>
        <p>Cada nível concluído (100%) é <b>lacrado</b>. Com os ${NIVEIS.length} níveis lacrados, o navio está carregado e o
           certificado final é liberado.</p>
        <h2>Seus lacres (${prontos.length} de ${NIVEIS.length})</h2>
        ${selos}
        <p><a class="botao" href="#/trilha">Continuar embarcando</a></p>`;
      return {};
    }
    // A data do certificado: o dia em que a última missão foi resolvida.
    const data = Object.values(ler(CHAVES.progresso, {})).filter((p) => p.status === 'resolvido').map((p) => p.em).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
    const desenhar = () => {
      const nome = ler(CHAVES.nome, '');
      main.innerHTML = `
        <h1 class="pixel">Certificado</h1>
        <form class="form-nome nao-imprimir">
          <p><label for="nome-certificado">Seu nome, como deve sair no certificado</label><br>
            <input id="nome-certificado" name="nome" value="${escapar(nome)}" autocomplete="name" required>
            <button type="submit">Salvar</button></p>
          <p class="nota">O nome fica só neste navegador (veja a <a href="#/privacidade">privacidade</a>).</p>
        </form>
        ${nome ? `${htmlCertificado({ nome, data, xp: j.xp, niveis: NIVEIS })}
        <p class="nao-imprimir acoes"><button type="button" class="botao" data-imprimir>🖨️ Imprimir ou salvar em PDF</button>
          <a href="${linkPerfil(data)}" target="_blank" rel="noopener">➕ Adicionar ao perfil do LinkedIn</a></p>` : ''}
        <h2 class="nao-imprimir">Seus lacres</h2><div class="nao-imprimir">${selos}</div>`;
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

export function paginaPrivacidade() {
  return (main) => {
    main.innerHTML = `
      <h1 class="pixel">Privacidade</h1>
      <p><b>Sem cadastro, sem cookies, sem rastreamento e sem servidor.</b> O kube-learn é um site estático: o cluster roda
         no seu navegador e nada do que você faz é enviado para lugar nenhum.</p>
      <p>O que o site guarda fica <b>só neste navegador</b> (no <code>localStorage</code>, com o prefixo <code>kube-learn:</code>):</p>
      <table class="tabela-simples"><thead><tr><th>Chave</th><th>O que guarda</th></tr></thead>
        <tbody>${Object.entries(DESCRICOES).map(([k, d]) => `<tr><td><code>${k}</code></td><td>${d}</td></tr>`).join('')}</tbody></table>
      <p>Pela LGPD, os dados são seus: dá para baixar uma cópia ou apagar tudo a qualquer momento.</p>
      <p class="acoes"><button type="button" class="botao" data-baixar>📥 Baixar meus dados</button>
        <button type="button" data-apagar>🗑️ Apagar meus dados</button></p>
      <p class="quiz-retorno" role="status" aria-live="polite"></p>`;
    const aviso = main.querySelector('.quiz-retorno');
    main.querySelector('[data-baixar]').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(exportarTudo(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kube-learn-meus-dados.json';
      a.click();
      URL.revokeObjectURL(a.href);
      aviso.textContent = 'Arquivo baixado: kube-learn-meus-dados.json.';
    });
    main.querySelector('[data-apagar]').addEventListener('click', () => {
      if (!confirm('Apagar todo o seu progresso, arquivos e preferências deste navegador? Não dá para desfazer.')) return;
      apagarTudo();
      aviso.textContent = 'Pronto: tudo apagado. O navio voltou vazio para o porto.';
    });
    return {};
  };
}
