// O lacre de cada nível (SVG em pixel art: um contêiner da cor do nível, lacrado) e o certificado final.
import { CORES } from './navio.js';
import { escapar } from './util.js';
import { idioma, t } from '../i18n.js';

export const SITE = 'https://pedromenuzzi.github.io/kube-learn/';

/** O lacre do nível: o contêiner do nível com o lacre dourado e o número. */
export function svgSelo(nivel, { tamanho = 160 } = {}) {
  const cor = CORES[nivel.numero % CORES.length];
  const nervuras = [];
  for (let x = 9; x < 48; x += 3) nervuras.push(`<rect x="${x}" y="18" width="1" height="20" fill="#00000033"/>`);
  return `<svg class="selo-svg" role="img" aria-label="${t('Lacre do nível {n}: {titulo}', { n: nivel.numero, titulo: escapar(nivel.titulo) })}" width="${tamanho}" height="${tamanho * 1.25}" viewBox="0 0 56 70" shape-rendering="crispEdges">
    <rect width="56" height="70" rx="3" fill="#1d3557"/>
    <rect x="6" y="16" width="44" height="24" fill="${cor}"/>
    <rect x="6" y="16" width="44" height="2" fill="#ffffff44"/>
    <rect x="6" y="38" width="44" height="2" fill="#00000044"/>
    ${nervuras.join('')}
    <rect x="40" y="22" width="7" height="7" fill="#f5c518"/><rect x="42" y="24" width="3" height="3" fill="#fff3b0"/>
    <rect x="43" y="29" width="1" height="5" fill="#f5c518"/>
    <rect x="0" y="42" width="56" height="3" fill="#2a6fb0"/>
    <text x="28" y="55" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="4.6" fill="#f5c518">${t('LACRADO')}</text>
    <text x="28" y="63.4" text-anchor="middle" font-family="'Atkinson Hyperlegible', sans-serif" font-weight="700" font-size="4.6" letter-spacing="0.35" fill="#ffffff">${t('NÍVEL {n}', { n: nivel.numero })}</text>
  </svg>`;
}

export const linkCompartilhar = () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE)}`;

/** Link do LinkedIn "adicionar certificado ao perfil". */
export function linkPerfil(data) {
  const [ano, mes] = data.split('-');
  const p = new URLSearchParams({ startTask: 'CERTIFICATION_NAME', name: t('Kubernetes contêiner por contêiner (kube-learn)'), organizationName: 'kube-learn', issueYear: ano, issueMonth: String(Number(mes)), certUrl: SITE });
  return `https://www.linkedin.com/profile/add?${p}`;
}

/** O certificado final (para imprimir ou salvar em PDF pelo navegador). */
export function htmlCertificado({ nome, data, xp, niveis }) {
  const dia = idioma() === 'en' ? new Date(`${data}T12:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' }) : data.split('-').reverse().join('/');
  return `
    <article class="certificado" aria-label="${t('Certificado')}">
      <p class="cert-marca pixel">🚢 kube-learn</p>
      <h2 class="pixel">${t('Navio carregado')}</h2>
      <p>${t('Certificamos que')}</p>
      <p class="cert-nome">${escapar(nome)}</p>
      <p>${t('concluiu a trilha <b>Kubernetes contêiner por contêiner</b>: os {n} níveis, do contêiner ao cluster em produção, com {xp} XP, em {data}.', { n: niveis.length, xp, data: dia })}</p>
      <ul class="cert-niveis">${niveis.map((n) => `<li>${n.icone} ${escapar(n.titulo)}</li>`).join('')}</ul>
      <p class="nota">${t('Emitido no navegador de quem concluiu a trilha (sem servidor e sem assinatura digital).')} ${SITE}</p>
    </article>`;
}
