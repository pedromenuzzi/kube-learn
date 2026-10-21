// Ícones de traço (24×24), desenhados aqui mesmo, para a interface: são enfeite (aria-hidden), o texto ao lado é
// que diz o que o botão faz. O conteúdo das lições continua com emoji; a "moldura" do site usa estes.

const TRACOS = {
  trilha: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9 3 3-3 3M12.5 15H17"/>',
  livro: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7.5h8M8 11h6"/>',
  cartas: '<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m7.5 13 2 2 3.5-4"/>',
  acessibilidade: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="7.2" r="1.3" fill="currentColor"/><path d="M7 10l5 1 5-1M12 11v4m0 0-2.5 4M12 15l2.5 4"/>',
  raio: '<path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12z"/>',
  chama: '<path d="M12 22c4 0 7-2.8 7-6.8 0-3.3-2.2-5.5-3.6-7.6-.6 1.7-1.6 2.9-3 3.4.4-3.3-.8-6.3-3.4-9C9.4 5 5 8.7 5 15.2 5 19.2 8 22 12 22z"/><path d="M12 22c-1.7 0-3-1.3-3-3.1 0-2 1.6-3.2 3-5 1.4 1.8 3 3 3 5 0 1.8-1.3 3.1-3 3.1z"/>',
  lacre: '<circle cx="12" cy="9" r="6"/><path d="m8.5 13.8-1.5 7.7 5-2.7 5 2.7-1.5-7.7"/><path d="m9.5 9 1.8 1.8L14.8 7.3"/>',
  voltar: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  seguir: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  divisa: '<path d="m6 9 6 6 6-6"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  certo: '<path d="m4.5 12.5 4.5 4.5 10.5-11"/>',
  entregar: '<path d="M12 16V4m-5 5 5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  avancar: '<path d="M4 6v12l8-6zm8 0v12l8-6z"/>',
  reiniciar: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  janelas: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M11 4v16M11 12h10"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  casa: '<path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  lampada: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  frasco: '<path d="M9 3h6M10 3v6L4.8 18.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9V3"/><path d="M7.2 14h9.6"/>',
  mapa: '<path d="m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  arvore: '<rect x="9" y="3" width="6" height="5" rx="1.2"/><rect x="3" y="16" width="6" height="5" rx="1.2"/><rect x="15" y="16" width="6" height="5" rx="1.2"/><path d="M12 8v4M6 16v-4h12v4"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  cadeado: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  baixar: '<path d="M12 4v12m-5-5 5 5 5-5M4 20h16"/>',
  lixeira: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V17M8 7.5v.1M12 17v-6.5m0 3.2c0-1.8 1-3.2 2.6-3.2s2.4 1 2.4 3V17"/>',
  alerta: '<path d="M10.3 3.9 1.9 18.4a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17.3v.2"/>',
  editor: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="m10 9.5-2.5 2.5 2.5 2.5M14 9.5l2.5 2.5-2.5 2.5"/>',
  imprimir: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
};

/** O SVG de um ícone (decorativo). */
export const icone = (nome, classe = 'icone') => `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${TRACOS[nome] ?? ''}</svg>`;

/** A marca: um navio porta-contêiner em pixel art (16×11). */
export const marcaNavio = () => `<svg class="marca-navio" viewBox="0 0 16 11" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
  <rect x="2" y="2" width="3" height="5" fill="#f1f1f1"/><rect x="3" y="0" width="1.5" height="2" fill="#326ce5"/>
  <rect x="6" y="5" width="2" height="2" fill="#e67e22"/><rect x="8" y="5" width="2" height="2" fill="#2e86c1"/><rect x="10" y="5" width="2" height="2" fill="#27ae60"/><rect x="12" y="5" width="2" height="2" fill="#c0392b"/>
  <rect x="7" y="3" width="2" height="2" fill="#27ae60"/><rect x="9" y="3" width="2" height="2" fill="#c0392b"/><rect x="11" y="3" width="2" height="2" fill="#e67e22"/>
  <rect x="0" y="7" width="16" height="2" fill="#1d3557"/><rect x="1" y="9" width="14" height="2" fill="#b23a48"/>
</svg>`;
