// A tela do exercício (e do playground): missão, editor de arquivos, terminal ligado a um cluster simulado
// que anda no tempo (1 segundo por segundo), painéis do cluster e os testes.
import { montarCluster } from '../conteudo/clusters.js';
import { proximoDe } from '../conteudo/index.js';
import { conhece, rodarLinha } from '../k8s/linha.js';
import { explicar as explicarSaida } from '../k8s/explicacoes.js';
import { explicar as explicarCampo } from '../k8s/esquema.js';
import { todosOsRecursos, acharRecurso } from '../k8s/recursos.js';
import { palavras } from '../k8s/kubectl/argv.js';
import { rodarTestes } from '../verificacoes.js';
import { ler, gravar, CHAVES, registrarDia } from '../armazenamento.js';
import { registrarComFesta } from './festa.js';
import { abrirFeedback } from './feedback.js';
import { t } from '../i18n.js';
import { hojeLocal, xpDoItem } from '../jogo/gamificacao.js';
import { criarTerminal } from './terminal.js';
import { criarEditor } from './editor.js';
import { htmlCluster, htmlRecursos, htmlEventos, htmlLegendaMapa } from './paineis.js';
import { ativarAbas, htmlAbas, escapar, minutosESegundos } from './util.js';
import { montarJanelas } from './janelas.js';
import { icone } from './icones.js';
import { compartilharResultado, htmlCompartilhar, tempoEEntregas, textoDoPlantao } from './compartilhar.js';
import { medalha, faltaParaSeguinte, nomeDaMedalha } from '../jogo/medalhas.js';

export { carregarEsquemaIngles } from '../k8s/esquema.js'; // main.js o chama antes de abrir a tela em inglês

const DIFICULDADE = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };
const SUBCOMANDOS = ['annotate', 'api-resources', 'apply', 'cluster-info', 'config', 'create', 'delete', 'describe', 'edit', 'exec', 'explain', 'expose', 'get', 'help', 'label', 'logs', 'port-forward', 'rollout', 'run', 'scale', 'set', 'version', 'wait', 'autoscale', 'top'];
/** "1 de 3 testes passou", "0 de 1 teste passaram": as quatro combinações do resumo, cada uma com a sua tradução. */
const resumoDosTestes = (ok, total) => (total > 1
  ? (ok === 1 ? t('{ok} de {total} testes passou', { ok, total }) : t('{ok} de {total} testes passaram', { ok, total }))
  : (ok === 1 ? t('{ok} de {total} teste passou', { ok, total }) : t('{ok} de {total} teste passaram', { ok, total })));
const COM_TIPO = new Set(['get', 'describe', 'delete', 'label', 'annotate', 'scale', 'explain', 'edit']);
const ajuda = () => t(`Este terminal entende o kubectl (experimente: kubectl get pods) e alguns comandos simples:
  ls            lista os arquivos do editor
  cat ARQUIVO   mostra um arquivo
  curl URL      uma requisição do SEU computador (fora do cluster): port-forward, NodePort, LoadBalancer, Ingress
  helm, git     o helm e o git das missões de Helm e GitOps (nível 10)
  ... | grep loja | wc -l   filtra a saída: grep, head, tail, wc, sort, awk '{print $1}'
  ... | base64 -d   decodifica a saída (ex.: o valor de um Secret)
  a && b        roda o b se o a deu certo (também: a || b, a ; b)
  history       os comandos que você já digitou
  clear         limpa a tela (ou Ctrl+L)
O relógio do cluster anda sozinho; o botão +30s adianta 30 segundos.
`);

/**
 * Os arquivos com que a missão abre: os que o aluno já salvou nela; numa etapa de projeto, os da etapa anterior (os
 * dele, se ele a resolveu) mais os novos desta etapa; senão, os do começo da missão (a referência).
 */
export function arquivosIniciais(item, salvos) {
  if (salvos) return salvos;
  const resolveu = item.continuaDe && ler(CHAVES.progresso, {})[item.continuaDe]?.status === 'resolvido';
  const daAnterior = resolveu ? ler(CHAVES.arquivos + item.continuaDe) : null;
  if (daAnterior) return { ...daAnterior, ...Object.fromEntries(Object.entries(item.novos ?? {}).filter(([k]) => !(k in daAnterior))) };
  return item.inicial ?? {};
}

// As últimas missões desmontadas nesta aba (a mais antiga sai): voltar a uma delas (do Glossário, ou na troca de
// idioma) continua com o mesmo cluster, histórico, cronômetro, escada de ajuda e aba Testes.
const guardadas = new Map();
const GUARDAR = 5;

export function montarExercicio(raiz, item) {
  const anterior = guardadas.get(item.id);
  const temArquivos = !item.terminal || !!item.comArquivos || Object.keys(item.inicial ?? {}).length > 0;
  const pedeResposta = item.testes?.some((t) => t.regras.some((r) => 'resposta' in r));
  const chaveArquivos = CHAVES.arquivos + item.id;
  const estado = {
    arquivos: { ...arquivosIniciais(item, ler(chaveArquivos)) },
    atual: null,
    cluster: anterior?.cluster ?? montarCluster(item.cluster, `${item.id}:aluno`),
    resposta: '',
  };
  estado.atual = Object.keys(estado.arquivos)[0] ?? null;
  const caixasVistas = new Set();

  // A Oficina do kubectl corre contra o relógio (de verdade, não o do cluster): vale o recorde e a medalha de cada
  // exercício. O Plantão do dia também tem relógio, sem recorde nem meta: o tempo da primeira vez vai para o resultado
  // do dia, e o tempo e as entregas em andamento ficam guardados (plantaoAberto) até resolver: recarregar não zera.
  // O relógio só anda com a tela da missão aberta e visível (o relógio real é permitido aqui: o determinismo é do src/k8s).
  const naOficina = item.secao === 'oficina';
  const noPlantao = item.secao === 'plantao';
  const comRelogio = naOficina || noPlantao;
  const recorde = naOficina ? ler(CHAVES.recordes, {})[item.id] : null;
  const aberto = noPlantao ? ler(CHAVES.plantaoAberto, {})[item.id] : null;
  let acumulado = anterior?.acumulado ?? aberto?.ms ?? 0; // o tempo até a última pausa
  let desde = document.hidden ? null : performance.now(); // desde quando o relógio anda (null: parado)
  let terminouEm = anterior?.terminouEm ?? null;
  const tempo = () => terminouEm ?? acumulado + (desde === null ? 0 : performance.now() - desde);
  const zerarRelogio = () => {
    acumulado = 0;
    desde = document.hidden ? null : performance.now();
    terminouEm = null;
  };
  const chipRecorde = (ms) => `<span class="chip chip-recorde medalha-${medalha(ms, item.meta)}">${icone('lacre')} ${nomeDaMedalha(medalha(ms, item.meta))} · ${t('Recorde: {tempo}', { tempo: minutosESegundos(ms) })}</span>`;
  const xp = item.secao ? 0 : xpDoItem(item);
  const voltarPara = { troubleshooting: 'Troubleshooting', oficina: t('Oficina'), plantao: t('Plantão do dia') }[item.secao] ?? t('Trilha');
  raiz.innerHTML = `
    <div class="ex${temArquivos ? '' : ' ex-so-terminal'}">
      <header class="ex-topo">
        <a class="voltar" href="#/${item.secao ?? 'trilha'}">${icone('voltar')}<span class="visualmente-oculto">${['troubleshooting', 'plantao'].includes(item.secao) ? t('Voltar ao') : t('Voltar à')} </span>${voltarPara}</a>
        <h1>${escapar(item.titulo)}</h1>
        ${item.projeto ? `<span class="chip chip-projeto">${icone('arvore')} ${escapar(item.projeto.titulo)} · ${t('etapa {etapa} de {total}', item.projeto)}</span>` : ''}
        ${item.dificuldade ? `<span class="chip chip-${item.dificuldade}">${t(DIFICULDADE[item.dificuldade])}</span>` : ''}${xp ? `<span class="chip">${xp} XP</span>` : ''}
        ${ler(CHAVES.progresso, {})[item.id]?.status === 'resolvido' ? `<span class="chip chip-ok">${icone('certo')} ${t('Resolvida')}</span>` : ''}
        ${comRelogio ? `<span class="chip chip-cronometro">${icone('relogio')} ${t('Seu tempo')} <span class="cronometro-tempo">${minutosESegundos(tempo())}</span></span>` : ''}${naOficina ? `<span class="chip chip-meta">${icone('alvo')} ${t('Meta: {tempo}', { tempo: minutosESegundos(item.meta) })}</span>${recorde ? chipRecorde(recorde) : ''}` : ''}
      </header>
      <div class="ex-acoes">
        ${temArquivos ? `<button type="button" class="botao" data-acao="aplicar" title="Ctrl+Enter">${icone('play')} ${t('Aplicar')}</button>` : `<button type="button" class="botao" data-acao="conferir" title="Ctrl+Enter">${icone('certo')} ${t('Conferir')}</button>`}
        ${item.testes?.length ? `<button type="button" class="botao-forte" data-acao="entregar" title="Ctrl+Shift+Enter">${icone('entregar')} ${t('Entregar')}</button>` : ''}
        <span class="separador" aria-hidden="true"></span>
        <button type="button" data-acao="avancar" title="${t('Adianta o relógio do cluster em 30 segundos')}">${icone('avancar')} +30s</button>
        <button type="button" data-acao="resetar">${icone('reiniciar')}<span class="rotulo">${t('Resetar cluster')}</span></button>
        <button type="button" data-acao="arrumacao" title="${t('Volta as janelas para o lugar e o tamanho de começo')}">${icone('janelas')}<span class="rotulo">${t('Arrumação padrão')}</span></button>
        <button type="button" data-acao="feedback" title="${t('Conte como foi esta missão')}">${icone('balao')}<span class="rotulo">Feedback</span></button>
        ${comRelogio ? '' : '<span class="relogio" aria-hidden="true"></span>'}
      </div>
      <div class="ex-aviso" role="status" aria-live="polite"></div>
      <div class="ex-janelas"></div>
    </div>`;

  const corpo = (html) => {
    const d = document.createElement('div');
    d.className = 'corpo';
    d.innerHTML = html;
    return d;
  };
  const corpos = {
    missao: { titulo: t('Missão'), corpo: corpo(htmlAbas('lado', [
      { id: 'missao', rotulo: `${icone('alvo')} ${t('Missão')}` },
      ...(item.vidaReal ? [{ id: 'vida', rotulo: `${icone('casa')} ${t('Na vida real')}` }] : []),
      ...(item.manual?.length ? [{ id: 'manual', rotulo: `${icone('livro')} Manual` }] : []),
      ...(item.solucao || item.solucaoTerminal ? [{ id: 'solucao', rotulo: `${icone('lampada')} ${t('Solução')}` }] : []),
      ...(item.testes?.length ? [{ id: 'testes', rotulo: `${icone('frasco')} ${t('Testes')}` }] : []),
    ], t('Sobre a missão'))) },
    ...(temArquivos ? {
      arquivos: { titulo: t('Arquivos'), corpo: corpo(`
        <div class="ex-arquivos">
          <ul class="abas arquivos" aria-label="${t('Arquivos')}"></ul>
          <button type="button" class="mini" data-acao="novo-arquivo" aria-label="${t('Novo arquivo')}">${icone('mais')} ${t('arquivo')}</button>
        </div>
        <div class="ex-editor"></div>`) },
    } : {}),
    paineis: { titulo: t('Terminal e cluster'), corpo: corpo(htmlAbas('baixo', [
      { id: 'terminal', rotulo: `${icone('terminal')} Terminal` },
      { id: 'cluster', rotulo: `${icone('mapa')} ${t('Mapa')}` },
      { id: 'recursos', rotulo: `${icone('arvore')} ${t('Recursos')}` },
      { id: 'eventos', rotulo: `${icone('lista')} ${t('Eventos')}` },
    ], t('Terminal e painéis do cluster'))) },
  };
  const janelas = montarJanelas(raiz.querySelector('.ex-janelas'), corpos);

  const $ = (s) => raiz.querySelector(s);
  const aviso = $('.ex-aviso');
  let tempoDoAviso = 0;
  let origemDoAviso = null; // o botão que pediu o aviso (Aplicar, Entregar, Conferir, +30s)
  /** Fecha o aviso; se o foco estava nele, volta para o botão que o pediu (ou para o Entregar), não cai no <body>. */
  const fecharAviso = () => {
    clearTimeout(tempoDoAviso);
    const tinhaFoco = aviso.contains(document.activeElement);
    aviso.replaceChildren();
    if (tinhaFoco) (origemDoAviso ?? $('[data-acao=entregar]') ?? $('[data-acao=aplicar]') ?? $('[data-acao=conferir]')).focus();
  };
  /** O aviso flutua sobre a tela (não empurra as janelas) e some sozinho; o de missão cumprida fica, com o link da próxima. */
  // `ajuda`: { texto, aba, rotulo } — a ajuda do degrau (a dica, o Manual, a Solução), com o botão que abre a aba.
  // `compartilhar`: o texto do botão "Compartilhar resultado" (o do Plantão do dia).
  const avisar = (texto, { tipo = 'info', proximo, ajuda, refazer, compartilhar } = {}) => {
    clearTimeout(tempoDoAviso);
    aviso.className = `ex-aviso ${tipo}`;
    aviso.innerHTML = `${tipo === 'info' ? '' : icone(tipo === 'ok' ? 'certo' : 'fechar')}<div class="aviso-texto"><span>${escapar(texto)}</span>`
      + (proximo ? `<a href="#/ex/${proximo.id}">${t('Próxima: {titulo}', { titulo: escapar(proximo.titulo) })} ${icone('seguir')}</a>` : '')
      + (ajuda ? `<span class="aviso-ajuda">${icone('lampada')} ${escapar(ajuda.texto)}</span><button type="button" class="link-botao" data-acao="abrir-aba" data-aba="${ajuda.aba}">${escapar(ajuda.rotulo)}</button>` : '')
      + (refazer ? `<button type="button" class="link-botao" data-acao="refazer">${icone('reiniciar')} ${t('Tentar de novo')}</button>` : '')
      + (compartilhar ? htmlCompartilhar(compartilhar) : '')
      + `</div><button type="button" class="aviso-fechar" data-acao="fechar-aviso" aria-label="${t('Fechar o aviso')}">${icone('fechar')}</button>`;
    if (!proximo && !ajuda && !compartilhar) tempoDoAviso = setTimeout(fecharAviso, tipo === 'info' ? 4000 : 8000);
  };

  // ---------- lado: missão, vida real, manual, solução, testes ----------
  $('#lado-missao').innerHTML = `
    <div class="enunciado">${item.enunciado}</div>
    ${item.comoSaber ? `<h2>${t('Como saber que deu certo')}</h2><p>${item.comoSaber}</p>` : ''}
    ${pedeResposta ? `<form class="resposta-aluno"><p><label for="resposta-aluno">${escapar(item.rotuloResposta ?? t('Sua resposta'))}</label><br>
      <input id="resposta-aluno" name="resposta" autocomplete="off" spellcheck="false"> <button type="submit">${t('Guardar resposta')}</button></p></form>` : ''}
    ${item.dica ? `<details><summary>${t('Dica')}</summary><p><code>${escapar(item.dica)}</code></p></details>` : ''}`;
  $('.resposta-aluno')?.addEventListener('submit', (e) => {
    e.preventDefault();
    estado.resposta = e.target.resposta.value;
    avisar(t('Resposta guardada. Agora clique em Conferir.'));
  });
  $('#resposta-aluno')?.addEventListener('input', (e) => { estado.resposta = e.target.value; });
  if (item.vidaReal) {
    $('#lado-vida').innerHTML = `<p class="vida">${escapar(item.vidaReal)}</p>${item.limite ? `<h2>${t('Onde a comparação quebra')}</h2><p>${escapar(item.limite)}</p>` : ''}`;
  }
  if (item.manual?.length) {
    $('#lado-manual').innerHTML = item.manual.map((m) => {
      const [tipo, ...cam] = m.split('.');
      return `<pre class="manual">${escapar(explicarCampo(acharRecurso(tipo), cam).saida)}</pre>`;
    }).join('') + `<p class="nota">${t('No terminal, <code>kubectl explain</code> mostra o mesmo para qualquer campo.')}</p>`;
  }
  if (item.solucao || item.solucaoTerminal) {
    $('#lado-solucao').innerHTML = `<p>${t('Tente antes! Se travar, a solução está aqui.')}</p>
      <button type="button" data-acao="ver-solucao">${t('Ver a solução')}</button><div class="solucao" hidden></div>`;
  }
  const abasLado = ativarAbas(corpos.missao.corpo);
  const abasBaixo = ativarAbas(corpos.paineis.corpo, () => atualizarPaineis());
  $('#baixo-cluster').innerHTML = `${htmlLegendaMapa(false)}<div class="mapa-conteudo"></div>`;
  $('#baixo-cluster').addEventListener('change', (e) => {
    if (e.target.name !== 'sistema') return;
    estado.verSistema = e.target.checked;
    atualizarPaineis();
  });

  // ---------- arquivos e editor ----------
  let editor = null;
  const salvar = () => gravar(chaveArquivos, estado.arquivos);
  const desenharArquivos = () => {
    const lista = $('.ex-arquivos .arquivos');
    lista.innerHTML = Object.keys(estado.arquivos).map((nome) => `
      <li class="arquivo${nome === estado.atual ? ' atual' : ''}">
        <button type="button" class="aba-arquivo"${nome === estado.atual ? ' aria-current="true"' : ''} data-arquivo="${escapar(nome)}">${escapar(nome)}</button>
        <button type="button" class="mini" data-apagar="${escapar(nome)}" aria-label="${t('Apagar {arquivo}', { arquivo: escapar(nome) })}">${icone('fechar')}</button>
      </li>`).join('');
  };
  if (temArquivos) {
    editor = criarEditor($('.ex-editor'), {
      texto: estado.arquivos[estado.atual] ?? '',
      rotulo: `Editor: ${estado.atual ?? t('sem arquivo')}`,
      aoMudar: (texto) => {
        if (!estado.atual) return;
        estado.arquivos[estado.atual] = texto;
        salvar();
      },
    });
    desenharArquivos();
    $('.ex-arquivos').addEventListener('click', (e) => {
      const abrir = e.target.closest('[data-arquivo]')?.dataset.arquivo;
      const apagarNome = e.target.closest('[data-apagar]')?.dataset.apagar;
      if (abrir) {
        estado.atual = abrir;
        editor.trocar(estado.arquivos[abrir], `Editor: ${abrir}`);
        desenharArquivos();
      } else if (apagarNome && confirm(t('Apagar {arquivo}?', { arquivo: apagarNome }))) {
        delete estado.arquivos[apagarNome];
        estado.atual = Object.keys(estado.arquivos)[0] ?? null;
        editor.trocar(estado.atual ? estado.arquivos[estado.atual] : '', `Editor: ${estado.atual ?? t('sem arquivo')}`);
        salvar();
        desenharArquivos();
      } else if (e.target.closest('[data-acao=novo-arquivo]')) {
        const nome = prompt(t('Nome do arquivo (termina em .yaml):'), 'novo.yaml')?.trim();
        if (!nome) return;
        if (!/^[\w.-]+\.ya?ml$/.test(nome)) return alert(t('Use só letras, números, ponto, hífen e termine em .yaml.'));
        estado.arquivos[nome] ??= '';
        estado.atual = nome;
        editor.trocar(estado.arquivos[nome], `Editor: ${nome}`);
        salvar();
        desenharArquivos();
        editor.focar();
      }
    });
  }

  // ---------- terminal ----------
  let diaMarcado = false;
  function executar(linha) {
    // KUBE_EDITOR="sed -i ..." kubectl edit ...: o editor vem antes do comando (como no shell de verdade).
    const [cmd] = palavras(linha).filter((p, i) => i || !p.startsWith('KUBE_EDITOR='));
    if (cmd === 'clear') return { limpar: true };
    if (cmd === 'help') return { saida: ajuda() };
    if (cmd === 'history') return { saida: terminal.historico.map((l, i) => `  ${i + 1}  ${l}\n`).join('') };
    if (!conhece(estado.cluster, cmd)) {
      const texto = `bash: ${cmd}: command not found\n`;
      return { saida: texto, codigo: 127, partes: [{ fluxo: 'err', texto }], caixas: [{ titulo: t('Aqui o terminal só fala kubectl'), texto: t('Use <code>kubectl ...</code>, ou <code>help</code> para ver os outros comandos.') }] };
    }
    let r;
    try {
      r = rodarLinha(estado.cluster, linha, estado.arquivos);
    } catch (erro) {
      return tropecou(erro);
    }
    // Um comando que deu certo já é estudo (no Playground também): conta para a sequência de dias, uma vez por visita.
    if (r.codigo === 0 && !diaMarcado) {
      diaMarcado = true;
      registrarDia(hojeLocal());
    }
    if (r.arquivoGravado && editor) {
      estado.atual = r.arquivoGravado;
      editor.trocar(estado.arquivos[estado.atual], `Editor: ${estado.atual}`);
      salvar();
      desenharArquivos();
    }
    return enfeitar(r);
  }

  /** Um defeito do simulador não pode deixar o terminal mudo: diz o que houve e pede o relato (o Feedback leva os comandos). */
  function tropecou(erro) {
    console.error(erro);
    const texto = `${t('erro interno do simulador: {erro}', { erro: erro.message })}\n`;
    return { saida: texto, codigo: 1, partes: [{ fluxo: 'err', texto }], caixas: [{ titulo: t('O simulador tropeçou'), texto: t('Isso é um defeito nosso, não seu. Se puder, conte pelo botão <b>Feedback</b>: ele já leva os últimos comandos.') }] };
  }

  /** As caixas "Na vida real" e os painéis depois do comando; no kubectl edit, também depois de cada vez que o editor fecha. */
  function enfeitar(r) {
    const caixas = explicarSaida(r.saida, { falhou: r.codigo !== 0 }).filter((c) => r.codigo !== 0 || !caixasVistas.has(c.chave));
    for (const c of caixas) caixasVistas.add(c.chave);
    setTimeout(atualizarPaineis);
    if (!r.editar) return { ...r, caixas };
    const { concluir } = r.editar;
    return {
      ...r,
      caixas,
      editar: {
        ...r.editar,
        concluir(texto) {
          try {
            return enfeitar(concluir(texto));
          } catch (erro) {
            return tropecou(erro);
          }
        },
      },
    };
  }

  function completar(linha) {
    // O -n já digitado escolhe o namespace (e sai da conta das palavras): kubectl logs -n estoque <Tab>.
    const comNs = linha.match(/(?:^|\s)(?:-n|--namespace)(?:=|\s+)(\S+)(?=\s)/);
    const ns = comNs?.[1] ?? estado.cluster.contexto.namespace;
    const ps = (comNs ? linha.replace(comNs[0], ' ') : linha).trimStart().split(/\s+/);
    const ultimo = ps.at(-1);
    const base = linha.slice(0, linha.length - ultimo.length);
    const opcoes = (lista) => lista.filter((o) => o.startsWith(ultimo)).map((o) => `${base}${o}`);
    const nomes = (r) => estado.cluster.listar(r.kind, r.namespaced ? ns : undefined).map((o) => o.metadata.name);
    if (ps.length === 1) return opcoes(['kubectl', 'curl', 'clear', 'help', 'ls', 'cat', 'history']);
    if (ps[0] === 'cat' || ps.at(-2) === '-f') return opcoes(['.', ...Object.keys(estado.arquivos)]);
    if (ps[0] !== 'kubectl') return [];
    if (['-n', '--namespace'].includes(ps.at(-2))) return opcoes(nomes(acharRecurso('namespaces')));
    if (ps.length === 2) return opcoes(SUBCOMANDOS);
    const sub = ps[1];
    if (ultimo.includes('/')) {
      const [tipo] = ultimo.split('/');
      const r = acharRecurso(tipo);
      return r ? opcoes(nomes(r).map((n) => `${tipo}/${n}`)) : [];
    }
    if (COM_TIPO.has(sub) && ps.length === 3) return opcoes(todosOsRecursos().map((r) => r.plural));
    if (['logs', 'exec'].includes(sub)) return opcoes(nomes(acharRecurso('pods')));
    if (COM_TIPO.has(sub) && ps.length >= 4) {
      const r = acharRecurso(ps[2]);
      return r ? opcoes(nomes(r)) : [];
    }
    return [];
  }

  const terminal = criarTerminal($('#baixo-terminal'), { executar, completar });
  if (anterior) {
    terminal.lembrar(anterior.historico);
    terminal.escrever(t('Seu cluster continua como você deixou (Resetar cluster recomeça).'), 'term-info');
  } else {
    terminal.escrever(`${t('Cluster pronto. Digite help para ajuda.')}${item.terminal ? ` ${t('Nesta missão, use o terminal.')}` : ''}`, 'term-info');
  }

  // ---------- painéis ----------
  // O relógio chama isto a cada segundo: o painel só é reescrito quando muda (reescrever apaga a seleção de texto e a
  // posição do leitor de tela). Os Eventos mudam a cada segundo só pela idade: esses, a cada 5 segundos ou com evento novo.
  const pintado = {};
  const pintar = (seletor, html) => {
    if (pintado[seletor] !== html) $(seletor).innerHTML = pintado[seletor] = html;
  };
  let eventosEm = 0;
  const atualizarPaineis = () => {
    const visivel = (id) => !$(`#baixo-${id}`).hidden;
    if (visivel('cluster')) pintar('#baixo-cluster .mapa-conteudo', htmlCluster(estado.cluster, { sistema: estado.verSistema }));
    if (visivel('recursos')) pintar('#baixo-recursos', htmlRecursos(estado.cluster));
    if (visivel('eventos') && (estado.cluster.eventos.length !== pintado.quantosEventos || estado.cluster.agora - eventosEm >= 5000)) {
      pintado.quantosEventos = estado.cluster.eventos.length;
      eventosEm = estado.cluster.agora;
      pintar('#baixo-eventos', htmlEventos(estado.cluster));
    }
    if (comRelogio) return; // um relógio só na tela: o seu tempo
    const seg = Math.floor((estado.cluster.agora - Date.UTC(2026, 9, 16, 12)) / 1000);
    $('.relogio').innerHTML = `${icone('relogio')}${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
  };

  // ---------- testes ----------
  let ultimoTeste = null; // para o feedback
  let resultados = anterior?.resultados ?? null; // os últimos: a aba Testes volta com eles
  function mostrarTestes(lista, todos) {
    resultados = { lista, todos };
    const total = lista.length;
    const ok = lista.filter((r) => r.ok).length;
    const ocultosNaoRodados = !todos ? item.testes.filter((t) => t.oculto).length : 0;
    $('#lado-testes').innerHTML = `
      <p class="resumo ${ok === total ? 'ok' : 'falha'}">${resumoDosTestes(ok, total)}</p>
      <ol class="testes">${lista.map((t) => `
        <li class="${t.ok ? 'ok' : 'falha'}">
          <p>${icone(t.ok ? 'certo' : 'fechar')} ${t.oculto ? `${icone('cadeado')} ` : ''}${escapar(t.descricao)}</p>
          <ul>${t.regras.filter((r) => !t.oculto || !r.ok).map((r) => `<li>${r.ok ? '✔' : '✘'} ${escapar(r.mensagem)}${!r.ok && !t.oculto && r.detalhe ? ` <span class="detalhe">(${escapar(r.detalhe)})</span>` : ''}</li>`).join('')}</ul>
        </li>`).join('')}</ol>
      ${ocultosNaoRodados ? `<p class="nota">${icone('cadeado')} ${ocultosNaoRodados > 1 ? t('Mais {n} testes ocultos rodam quando você clicar em Entregar.', { n: ocultosNaoRodados }) : t('Mais {n} teste oculto roda quando você clicar em Entregar.', { n: ocultosNaoRodados })}</p>` : ''}`;
    ultimoTeste = todos ? t('{ok} de {total} passaram (entregue)', { ok, total }) : t('{ok} de {total} passaram (só os visíveis)', { ok, total });
    return { ok, total };
  }
  if (resultados) mostrarTestes(resultados.lista, resultados.todos);

  /** Para o relógio da Oficina, guarda o recorde se bateu e devolve a mensagem: a medalha, o tempo e quanto falta. */
  const tempoDaOficina = () => {
    terminouEm ??= tempo();
    const recordes = ler(CHAVES.recordes, {});
    const antes = recordes[item.id];
    const feito = minutosESegundos(terminouEm);
    if (!antes || terminouEm < antes) gravar(CHAVES.recordes, { ...recordes, [item.id]: Math.round(terminouEm) });
    // O chip do topo acompanha o recorde (desenhado ao abrir, não pode contradizer o aviso).
    const chip = chipRecorde(Math.min(antes ?? Infinity, Math.round(terminouEm)));
    const velho = raiz.querySelector('.chip-recorde');
    if (velho) velho.outerHTML = chip;
    else raiz.querySelector('.chip-meta')?.insertAdjacentHTML('afterend', chip);
    const cabeca = { ouro: t('Ouro!'), prata: t('Prata!'), bronze: t('Bronze!') }[medalha(terminouEm, item.meta)];
    const quando = !antes ? t('Feito em {tempo}.', { tempo: feito })
      : terminouEm < antes ? t('Novo recorde: {tempo}! (era {antes})', { tempo: feito, antes: minutosESegundos(antes) })
        : t('Feito em {tempo}. O recorde continua {antes}.', { tempo: feito, antes: minutosESegundos(antes) });
    const proxima = faltaParaSeguinte(terminouEm, item.meta);
    const falta = !proxima ? t('Dentro da meta de {meta}.', { meta: minutosESegundos(item.meta) })
      : proxima.seguinte === 'ouro' ? t('Faltam {falta} para o ouro.', { falta: minutosESegundos(proxima.falta) })
        : t('Faltam {falta} para a prata.', { falta: minutosESegundos(proxima.falta) });
    return `${cabeca} ${quando} ${falta}`;
  };
  // A escada de ajuda: cada entrega errada abre um degrau (a dica, o Manual, a Solução), sem tirar XP.
  let falhas = anterior?.falhas ?? aberto?.entregas ?? 0;
  let acertosAntes = anterior?.acertosAntes ?? null;
  /** O Plantão em andamento: o tempo até agora e as entregas (erradas) ficam guardados, por id, até resolver. */
  const pausar = () => {
    acumulado = tempo();
    desde = null;
    if (noPlantao && terminouEm === null && !ler(CHAVES.plantoes, {})[item.id]) gravar(CHAVES.plantaoAberto, { ...ler(CHAVES.plantaoAberto, {}), [item.id]: { ms: Math.round(acumulado), entregas: falhas } });
  };
  /** Para o relógio do Plantão e avisa. A primeira vez que resolve fica guardada: é o resultado do dia, o compartilhado. */
  const avisarPlantao = () => {
    terminouEm ??= tempo();
    const abertos = ler(CHAVES.plantaoAberto, {});
    delete abertos[item.id];
    gravar(CHAVES.plantaoAberto, abertos);
    const agora = { ms: Math.round(terminouEm), entregas: falhas + 1 };
    const plantoes = ler(CHAVES.plantoes, {});
    const antes = plantoes[item.id];
    if (!antes) gravar(CHAVES.plantoes, { ...plantoes, [item.id]: agora });
    const texto = !antes || (antes.ms === agora.ms && antes.entregas === agora.entregas)
      ? t('Incidente resolvido em {placar}. O morador agradece!', { placar: tempoEEntregas(agora) })
      : t('Incidente resolvido em {placar}. Vale o resultado da primeira vez: {antes}.', { placar: tempoEEntregas(agora), antes: tempoEEntregas(antes) });
    avisar(texto, { tipo: 'ok', compartilhar: textoDoPlantao(item, antes ?? agora) });
  };
  const degrauDeAjuda = () => {
    const solucao = item.solucao || item.solucaoTerminal ? { texto: t('Travou? A aba Solução tem a referência, e ver não tira XP.'), aba: 'solucao', rotulo: t('Abrir a Solução') } : null;
    if (falhas === 2 && item.dica) {
      $('#lado-missao details')?.setAttribute('open', '');
      return { texto: t('Dica: {dica}', { dica: item.dica }), aba: 'missao', rotulo: t('Ver na missão') };
    }
    if (falhas === 3 && item.manual?.length) return { texto: t('A aba Manual tem os campos certos, com a explicação de cada um.'), aba: 'manual', rotulo: t('Abrir o Manual') };
    return falhas >= 3 ? solucao : null;
  };
  /** O aviso da vitória: o XP é o do item (a lição também vale); resolvida de novo não ganha XP nem contêiner. */
  const textoDaVitoria = (festa) => {
    if (!festa) return t('Resolvida de novo: bom treino!');
    return item.tipo === 'licao' ? t('Lição concluída! +{xp} XP. Mais um contêiner embarcado no seu navio.', { xp })
      : t('Missão cumprida! +{xp} XP. Mais um contêiner embarcado no seu navio.', { xp });
  };

  /**
   * Um defeito do simulador nunca deixa a tela muda: o aviso conta o que houve (com o texto do tropecou, que cita o
   * botão Feedback). `entrega`: o erro foi nos testes, então a aba Testes mostra o erro e conta como entrega errada.
   */
  const guardar = (fn, { entrega = false } = {}) => (...args) => {
    try {
      return fn(...args);
    } catch (erro) {
      const { saida, caixas: [caixa] } = tropecou(erro);
      const texto = `${caixa.titulo}: ${saida.trim()}. ${caixa.texto.replace(/<[^>]+>/g, '')}`;
      if (!entrega) return avisar(texto, { tipo: 'falha' });
      falhas += 1;
      ultimoTeste = saida.trim();
      $('#lado-testes').innerHTML = `<p class="resumo falha">${escapar(caixa.titulo)}</p><pre>${escapar(saida)}</pre>`;
      abasLado.selecionar('testes');
      avisar(texto, { tipo: 'falha', ajuda: degrauDeAjuda() });
    }
  };

  // `doAplicar`: o Aplicar só troca a aba Missão pela Testes quando algo falha (os passos da missão ficam à vista).
  function testar(todos, doAplicar = false) {
    avisar(todos ? t('Rodando todos os testes, inclusive os ocultos…') : t('Rodando os testes visíveis…'));
    registrarDia(hojeLocal());
    setTimeout(guardar(() => {
      const resultados = rodarTestes(item, {
        arquivos: estado.arquivos, historico: terminal.historico, resposta: estado.resposta, clusterDoAluno: estado.cluster,
      }, { todos });
      const { ok, total } = mostrarTestes(resultados, todos);
      if (todos) {
        const resolvido = ok === total;
        const festa = registrarComFesta(item, resolvido);
        if (resolvido && !$('.ex-topo .chip-ok')) $('.ex-topo').insertAdjacentHTML('beforeend', `<span class="chip chip-ok">${icone('certo')} ${t('Resolvida')}</span>`);
        if (resolvido && naOficina) avisar(tempoDaOficina(), { tipo: 'ok', proximo: proximoDe(item), refazer: true });
        else if (resolvido && item.secao === 'plantao') avisarPlantao();
        else if (resolvido) avisar(item.secao ? t('Incidente resolvido! O morador agradece.') : textoDaVitoria(festa), { tipo: 'ok', proximo: proximoDe(item) });
        else {
          falhas += 1;
          const melhorou = acertosAntes !== null && ok > acertosAntes ? ` (${t('antes eram {n}: quase lá!', { n: acertosAntes })})` : '';
          acertosAntes = ok;
          avisar(`${resumoDosTestes(ok, total)}${melhorou}. ${t('Veja o que faltou na aba Testes.')}`, { tipo: 'falha', ajuda: degrauDeAjuda() });
        }
      } else if (ok === total && doAplicar && item.tipo === 'licao') {
        avisar(t('Aplicado! Agora siga os passos da missão.'), { tipo: 'ok' });
      } else {
        avisar(ok === total ? t('Testes visíveis: {ok} de {total} passaram. Agora é só entregar.', { ok, total }) : t('Testes visíveis: {ok} de {total} passaram. Veja a aba Testes.', { ok, total }), { tipo: ok === total ? 'ok' : 'falha' });
      }
      if (!doAplicar || ok < total) abasLado.selecionar('testes');
    }, { entrega: true }), 30);
  }

  // ---------- botões e atalhos ----------
  const acoes = {
    aplicar() {
      abasBaixo.selecionar('terminal');
      // Nas missões de Kustomize, o botão aplica as pastas que os testes aplicam (apply -f . leria o kustomization.yaml).
      const pastas = [...new Set(item.testes?.filter((t) => !t.oculto).map((t) => t.passos?.[0]?.comando).filter((l) => /^kubectl apply -k /.test(l ?? '')))];
      for (const linha of pastas.length ? pastas : ['kubectl apply -f .']) terminal.rodar(linha);
      // No celular as janelas ficam empilhadas: a saída do Aplicar fica à vista (e a linha do terminal acima da barra de
      // baixo), não 1.600 px abaixo do botão.
      if (matchMedia('(max-width: 60rem)').matches) $('#baixo-terminal').scrollIntoView({ block: 'center' });
      if (item.testes?.some((t) => !t.oculto)) testar(false, true);
    },
    conferir: () => testar(false),
    entregar: () => testar(true),
    avancar: guardar(() => {
      estado.cluster.avancar('30s');
      terminal.tique();
      atualizarPaineis();
      avisar(t('O relógio do cluster andou 30 segundos.'));
    }),
    'fechar-aviso': fecharAviso,
    'abrir-aba': (botao) => abasLado.selecionar(botao.dataset.aba),
    compartilhar: compartilharResultado,
    feedback: () => abrirFeedback(item, () => ({ testes: ultimoTeste, comandos: terminal.historico.slice(-10) })),
    // Oficina: de novo do zero, sem perguntar (o cluster, os arquivos e o relógio voltam ao começo).
    refazer: guardar(() => {
      estado.cluster = montarCluster(item.cluster, `${item.id}:aluno`);
      relogioTravado = false;
      estado.arquivos = { ...(item.inicial ?? {}) };
      caixasVistas.clear();
      terminal.reiniciar();
      terminal.escrever(t('De novo, do zero: o relógio voltou a contar.'), 'term-info');
      zerarRelogio();
      aviso.replaceChildren();
      atualizarPaineis();
      terminal.focar();
    }),
    resetar: guardar(() => {
      if (!confirm(t('Voltar o cluster para o começo da missão? (Seus arquivos ficam.)'))) return;
      estado.cluster = montarCluster(item.cluster, `${item.id}:aluno`);
      relogioTravado = false;
      // Na Oficina, o cluster do começo põe o cronômetro no começo também (o recorde vale do zero ao fim).
      if (naOficina) zerarRelogio();
      caixasVistas.clear();
      terminal.reiniciar();
      terminal.escrever(t('Cluster recriado do zero.'), 'term-info');
      atualizarPaineis();
    }),
    'ver-solucao'() {
      const div = $('.solucao');
      div.hidden = false;
      // Os comandos (missão de terminal) e os arquivos consertados (quando o conserto também mexe neles).
      const arquivos = Object.entries(item.solucao ?? {});
      const mudam = !item.solucaoTerminal || arquivos.some(([n, t]) => item.inicial?.[n] !== t);
      div.innerHTML = (item.diagnostico ? `<h3>${t('O que estava quebrado')}</h3>${item.diagnostico}` : '')
        + (item.solucaoTerminal ? `<pre>${escapar(item.solucaoTerminal.join('\n'))}</pre>` : '')
        + (arquivos.length && mudam ? arquivos.map(([n, t]) => `<h3>${escapar(n)}</h3><pre>${escapar(t)}</pre>`).join('') + `<button type="button" data-acao="usar-solucao">${t('Copiar para o editor')}</button>` : '');
    },
    arrumacao: () => janelas.restaurar(),
    'usar-solucao'() {
      if (!confirm(t('Trocar seus arquivos pela solução?'))) return;
      estado.arquivos = { ...item.solucao };
      estado.atual = Object.keys(estado.arquivos)[0];
      editor.trocar(estado.arquivos[estado.atual], `Editor: ${estado.atual}`);
      salvar();
      desenharArquivos();
    },
  };
  // O <main> e o document continuam depois que a missão sai: os ouvintes saem junto, no destruir().
  const fim = new AbortController();
  raiz.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao]');
    if (['aplicar', 'entregar', 'conferir', 'avancar'].includes(alvo?.dataset.acao)) origemDoAviso = alvo;
    if (acoes[alvo?.dataset.acao]) acoes[alvo.dataset.acao](alvo);
  }, { signal: fim.signal });
  const teclas = (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.target.closest?.('dialog')) return;
    e.preventDefault();
    const nome = e.shiftKey ? (item.testes?.length ? 'entregar' : null) : (temArquivos ? 'aplicar' : 'conferir');
    if (!nome) return;
    origemDoAviso = $(`[data-acao=${nome}]`);
    acoes[nome]();
  };
  document.addEventListener('keydown', teclas, { signal: fim.signal });
  // O relógio da Oficina e do Plantão para com a aba escondida (e o Plantão guarda o tempo: recarregar não zera).
  if (comRelogio) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pausar();
      else if (desde === null) desde = performance.now();
    }, { signal: fim.signal });
    addEventListener('pagehide', pausar, { signal: fim.signal });
  }

  // ---------- relógio: 1 segundo do cluster por segundo de verdade ----------
  // Se o simulador tropeça num tique, o relógio para (e avisa uma vez só) até o cluster ser recriado.
  let relogioTravado = false;
  const relogio = setInterval(guardar(() => {
    if (comRelogio) $('.cronometro-tempo').textContent = minutosESegundos(tempo()); // parado: o tempo final
    if (document.hidden || relogioTravado) return;
    relogioTravado = true;
    estado.cluster.avancar(1000);
    terminal.tique();
    atualizarPaineis();
    relogioTravado = false;
  }), 1000);
  atualizarPaineis();

  return {
    destruir() {
      clearInterval(relogio);
      pausar(); // fora da tela da missão, o relógio não anda
      guardadas.delete(item.id);
      guardadas.set(item.id, { cluster: estado.cluster, historico: [...terminal.historico], acumulado, terminouEm, falhas, acertosAntes, resultados });
      if (guardadas.size > GUARDAR) guardadas.delete(guardadas.keys().next().value);
      clearTimeout(tempoDoAviso);
      fim.abort();
      editor?.destruir();
      janelas.destruir();
    },
  };
}
