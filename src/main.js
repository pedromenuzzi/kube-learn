import { resolverRota } from './rotas.js';

// Fase 0: páginas provisórias. Cada uma diz em que fase do PLANO.md (§15) fica pronta.
const PAGINAS = {
  '/': () => `
    <h1>Aprenda Kubernetes andar por andar</h1>
    <p>Um cluster simulado no navegador, <code>kubectl</code> de verdade e comparações com a vida real.
       Cada nível concluído ergue mais um andar do seu prédio, até virar arranha-céu.</p>
    <p class="obra">🚧 Em obra. A trilha abre na versão 0.1.</p>
    <p><a class="botao" href="#/trilha">Ver a trilha</a></p>`,
  '/trilha': () => emObra('A trilha', 'Fase 3'),
  '/ex': (id) => emObra(`O exercício <code>${escapar(id)}</code>`, 'Fase 2'),
  '/livre': () => emObra('O playground livre', 'Fase 2'),
  '/glossario': () => emObra('O glossário', 'Fase 3'),
  '/revisao': () => emObra('A revisão do dia', 'Fase 5'),
};

function emObra(oque, fase) {
  return `<h1>🚧 Em obra</h1><p>${oque} chega na ${fase}.</p><p><a href="#/">Voltar ao início</a></p>`;
}

function escapar(texto) {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function desenhar() {
  const main = document.getElementById('conteudo');
  const rota = resolverRota(location.hash);
  if (rota) {
    main.innerHTML = PAGINAS[rota.caminho](rota.parametro);
    document.title = `${rota.titulo} · kube-learn`;
  } else {
    main.innerHTML = '<h1>Página não encontrada</h1><p><a href="#/">Voltar ao início</a></p>';
    document.title = 'Página não encontrada · kube-learn';
  }
  // Ao trocar de página, o foco vai para o conteúdo (leitor de tela anuncia o novo título).
  if (document.activeElement !== document.body) main.focus();
}

window.addEventListener('hashchange', desenhar);
desenhar();
