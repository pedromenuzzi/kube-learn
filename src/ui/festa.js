// As comemorações. Na primeira vez que um item da trilha é resolvido, o helicóptero traz o contêiner (na cor do nível)
// e o assenta na pilha; quando um nível abre, uma faixa avisa; quando um nível fecha, o lacre dourado é carimbado na
// tela; com o último lacre, o navio apita. Nada bloqueia a tela, e com "reduzir movimento" a animação não roda (os
// avisos ficam). O som é opcional (preferências).
import { NIVEIS } from '../conteudo/index.js';
import { calcularJornada, novidades, xpDoItem, hojeLocal } from '../jogo/gamificacao.js';
import { ler, gravar, CHAVES, registrarResultado } from '../armazenamento.js';
import { CORES, desenharNavio, pintarConteiner, pintarHelicoptero, semMovimento, tamanho } from './navio.js';
import { svgSelo, linkCompartilhar } from './selos.js';
import { tocar } from './sons.js';
import { escapar } from './util.js';
import { icone } from './icones.js';
import { t } from '../i18n.js';

const jornada = () => calcularJornada(NIVEIS, ler(CHAVES.progresso, {}), ler(CHAVES.conquistas, {}));

/**
 * Registra o resultado e, se o item acabou de ser resolvido pela primeira vez, comemora. O lacre e o navio ganhos ficam
 * guardados (missão nova que chegar depois não tira, e a festa não repete). → se foi a primeira vez.
 */
export function registrarComFesta(item, resolvido) {
  const jaEra = ler(CHAVES.progresso, {})[item.id]?.status === 'resolvido';
  const antes = jornada();
  registrarResultado(item.id, resolvido);
  if (!resolvido || jaEra) return false;
  const eventos = novidades(antes, jornada());
  const ganhos = eventos.filter((e) => e.tipo !== 'desbloqueio');
  if (ganhos.length) {
    const c = ler(CHAVES.conquistas, {});
    for (const e of ganhos) {
      if (e.tipo === 'lacre') c.lacres = { ...c.lacres, [e.nivel.numero]: hojeLocal() };
      else c.navio = hojeLocal();
    }
    gravar(CHAVES.conquistas, c);
  }
  comemorar(item, eventos);
  return true;
}

function comemorar(item, eventos) {
  tocar('embarque');
  const naTrilha = item.nivel !== undefined;
  if (naTrilha && !semMovimento()) embarque(CORES[item.nivel % CORES.length], tamanho(item), xpDoItem(item));
  for (const e of eventos.filter((x) => x.tipo === 'desbloqueio')) faixa(e.nivel);
  const cartoes = eventos.filter((x) => x.tipo !== 'desbloqueio');
  if (cartoes.length) setTimeout(() => cartao(cartoes), semMovimento() || !naTrilha ? 0 : 2300); // depois que o contêiner pousa
}

// ---------- o contêiner que chega de helicóptero ----------
const W = 72;
const H = 44;

function embarque(cor, largura, xp) {
  const caixa = document.createElement('div');
  caixa.className = 'festa-embarque';
  caixa.setAttribute('aria-hidden', 'true');
  caixa.innerHTML = `<canvas width="${W}" height="${H}"></canvas><span class="festa-xp pixel">+${xp} XP</span>`;
  document.body.append(caixa);
  const ctx = caixa.querySelector('canvas').getContext('2d');
  const r = (c, x, y, w, h) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  // A cena é uma janelinha com céu e mar (as cores do céu vêm do tema, como no navio da trilha).
  const tema = getComputedStyle(document.documentElement);
  const ceu = ctx.createLinearGradient(0, 0, 0, H);
  ceu.addColorStop(0, tema.getPropertyValue('--ceu-topo').trim() || '#5b8fd6');
  ceu.addColorStop(1, tema.getPropertyValue('--ceu-baixo').trim() || '#cfe6fb');
  const w = largura * 10 - 1;
  const alvo = Math.round(W / 2 - w / 2); // onde o contêiner pousa
  const conves = H - 11;
  const mar = conves + 3;
  const pousado = conves - 12; // em cima da fileira de baixo
  const hy = 3;
  const suave = (x) => 1 - (1 - Math.min(Math.max(x, 0), 1)) ** 3;
  const inicio = performance.now();
  const quadro = (agora) => {
    const t = (agora - inicio) / 1000;
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, W, H);
    r('#2a6fb0', 0, mar, W, H - mar);
    r('#1d4f80', 0, mar + 5, W, H - mar - 5);
    for (let x = Math.round((t * 8) % 8) - 8; x < W; x += 8) r('#ffffff55', x, mar + 2, 3, 1);
    // o convés e a fileira de baixo (dois contêineres já embarcados)
    r('#1d3557', 4, conves, W - 8, 3);
    r('#b23a48', 7, conves + 3, W - 14, 3);
    pintarConteiner(r, alvo - 6, conves - 6, 1, '#5d6d7e');
    pintarConteiner(r, alvo + 4, conves - 6, 1, '#7f8c8d');
    // o helicóptero chega da esquerda, desce o cabo, solta e vai embora pela direita
    const meio = alvo + Math.floor(w / 2);
    const cx = t < 1.3 ? Math.round(-14 + (meio + 14) * suave(t / 0.9)) : Math.round(meio + (W + 30 - meio) * suave((t - 1.3) / 0.7));
    const descida = t < 0.9 ? 0 : suave((t - 0.9) / 0.4);
    const topo = Math.round(hy + 9 + (pousado - hy - 9) * descida);
    if (t < 1.3) {
      r('#3a3a3a', cx, hy + 4, 1, topo - hy - 4); // cabo
      pintarConteiner(r, cx - Math.floor(w / 2), topo, largura, cor);
    } else {
      pintarConteiner(r, alvo, pousado + (t < 1.38 ? -1 : 0), largura, cor); // um quique ao pousar
    }
    pintarHelicoptero(r, cx, hy, Math.floor(t * 12) % 2 === 0);
    if (t < 2.4) requestAnimationFrame(quadro);
    else caixa.remove();
  };
  requestAnimationFrame(quadro);
}

// ---------- o nível que abre ----------
function faixa(nivel) {
  const el = document.createElement('div');
  el.className = 'festa-faixa';
  el.innerHTML = `${icone('trilha')}<span><b>${t('Nível {n} desbloqueado:', { n: nivel.numero })}</b> ${escapar(nivel.titulo)}</span>
    <a href="#/trilha">${t('Ver na trilha')}</a><button type="button" class="aviso-fechar" aria-label="${t('Fechar')}">${icone('fechar')}</button>`;
  document.body.append(el);
  anunciar(t('Nível {n} desbloqueado: {titulo}.', { n: nivel.numero, titulo: nivel.titulo }));
  const tirar = () => el.remove();
  el.addEventListener('click', (e) => e.target.closest('a, button') && tirar());
  setTimeout(tirar, 9000);
}

// ---------- o lacre carimbado e o navio carregado ----------
function cartao([evento, ...resto]) {
  if (!evento) return;
  const lacre = evento.tipo === 'lacre';
  const voltar = document.activeElement;
  const d = document.createElement('dialog');
  d.className = `festa-cartao festa-${evento.tipo}`;
  d.setAttribute('aria-labelledby', 'festa-titulo');
  d.innerHTML = lacre ? `
    <div class="festa-selo">${svgSelo(evento.nivel, { tamanho: 150 })}</div>
    <h2 id="festa-titulo" class="pixel">${t('Nível {n} lacrado!', { n: evento.nivel.numero })}</h2>
    <p>${escapar(evento.nivel.titulo)}: ${t('todas as missões resolvidas. Os contêineres deste nível ganharam o lacre dourado.')}</p>
    <p class="acoes"><button type="button" class="botao" data-fechar>${resto.length ? t('Continuar') : t('Seguir viagem')}</button>
      <a class="botao-secundario" href="#/certificado">${icone('lacre')} ${t('Seus lacres')}</a>
      <a class="link-seta" href="${linkCompartilhar()}" target="_blank" rel="noopener">${icone('linkedin')} ${t('Compartilhar')}</a></p>` : `
    <canvas class="navio" aria-hidden="true"></canvas>
    <h2 id="festa-titulo" class="pixel">${t('Navio carregado!')}</h2>
    <p>${t('Os {n} níveis lacrados: você atravessou o Kubernetes do primeiro contêiner ao GitOps. Que viagem.', { n: NIVEIS.length })}</p>
    <p class="acoes"><a class="botao" href="#/certificado">${icone('lacre')} ${t('Ver o certificado')}</a>
      <button type="button" class="botao-secundario" data-fechar>${t('Fechar')}</button></p>`;
  document.body.append(d);
  d.showModal(); // modal de verdade: o Tab não escapa para a página escurecida atrás
  const pararNavio = lacre ? null : desenharNavio(d.querySelector('canvas'), jornada());
  tocar(lacre ? 'lacre' : 'navio');
  anunciar(lacre ? t('Nível {n} lacrado!', { n: evento.nivel.numero }) : t('Navio carregado! Todos os níveis lacrados.'));
  d.querySelector('[data-fechar]').focus();
  const tirar = () => {
    pararNavio?.();
    d.close();
    d.remove();
    removeEventListener('hashchange', tirar);
  };
  const fechar = () => {
    tirar();
    voltar?.focus?.();
    cartao(resto);
  };
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar]')) fechar();
    else if (e.target.closest('a[href^="#"]')) tirar();
  });
  d.addEventListener('cancel', (e) => { // Esc
    e.preventDefault();
    fechar();
  });
  addEventListener('hashchange', tirar);
}

/** O leitor de tela fica sabendo (a região #festa-anuncio está no index.html desde o começo: região nova não é anunciada). */
function anunciar(texto) {
  const r = document.getElementById('festa-anuncio');
  if (r) r.textContent = texto;
}
