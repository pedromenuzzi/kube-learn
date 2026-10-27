// O editor de YAML (CodeMirror 6): recuo de 2 espaços e Tab recua. Para sair pelo teclado, Esc e depois Tab: a dica
// fica à mostra embaixo do editor e é a descrição dele para o leitor de tela (WCAG 2.1.2).
import { EditorState, Prec, RangeSetBuilder } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, showPanel } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentUnit, HighlightStyle, syntaxHighlighting, foldGutter, foldKeymap, indentOnInput, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { yaml } from '@codemirror/lang-yaml';
import { t } from '../i18n.js';

// Cores do tema (variáveis do CSS): o editor acompanha claro, escuro e alto contraste.
const tema = EditorView.theme({
  '&': { backgroundColor: 'var(--editor-fundo)', color: 'var(--texto)', height: '100%' },
  '.cm-content': { caretColor: 'var(--texto)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--texto)' },
  '.cm-gutters': { backgroundColor: 'var(--editor-fundo)', color: 'var(--suave)', borderRight: '1px solid var(--borda)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--editor-linha)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--destaque) 35%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--editor-fundo)', color: 'var(--suave)' },
  '.cm-panels-bottom': { borderTop: '1px solid var(--borda)' },
  '.cm-dica': { margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.8rem' },
});
const cores = syntaxHighlighting(HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.keyword], color: 'var(--sx-chave)' },
  { tag: [tags.string, tags.content, tags.attributeValue], color: 'var(--sx-texto)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--sx-numero)' },
  { tag: [tags.comment, tags.meta, tags.punctuation, tags.separator], color: 'var(--sx-comentario)' },
]));

// Recuo pendente: a linha quebrada continua 2 colunas depois do recuo da própria linha (um comentário comprido não
// volta à coluna 0, onde pareceria uma chave do YAML). Os 6px são o recuo de toda linha no CodeMirror.
const recuos = new Map();
const recuo = (n) => {
  if (!recuos.has(n)) recuos.set(n, Decoration.line({ attributes: { style: `padding-left: calc(${n}ch + 6px); text-indent: -${n}ch` } }));
  return recuos.get(n);
};
const recuoPendente = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.marcar(view);
  }

  update(u) {
    if (u.docChanged || u.viewportChanged) this.decorations = this.marcar(u.view);
  }

  marcar(view) {
    const b = new RangeSetBuilder();
    let ultima = -1;
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const linha = view.state.doc.lineAt(pos);
        if (linha.from > ultima && linha.length) b.add(linha.from, linha.from, recuo(/^ */.exec(linha.text)[0].length + 2));
        ultima = linha.from;
        pos = linha.to + 1;
      }
    }
    return b.finish();
  }
}, { decorations: (p) => p.decorations });

let editores = 0;

export function criarEditor(raiz, { texto, aoMudar, rotulo }) {
  const idDica = `editor-dica-${++editores}`;
  // Num diálogo (o do kubectl edit), o Esc fecha o diálogo, que tem a sua própria ajuda: lá a dica não vale.
  const comDica = !raiz.closest('dialog');
  const dica = comDica && showPanel.of(() => {
    const dom = document.createElement('p');
    dom.className = 'cm-dica';
    dom.id = idDica;
    dom.textContent = t('Tab recua · Esc e depois Tab sai do editor');
    return { dom };
  });
  // Só o que um editor de YAML curto usa (o basicSetup traz autocompletar e busca, ~30 kB a mais no pacote).
  const extensoes = (nome) => [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    yaml(),
    tema,
    cores,
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    keymap.of([indentWithTab]),
    // Ctrl+Enter é o atalho do Aplicar (e Ctrl+Shift+Enter, do Entregar): o editor não insere a linha em branco do padrão.
    Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => true }, { key: 'Mod-Shift-Enter', run: () => true }])),
    EditorView.lineWrapping,
    recuoPendente,
    comDica ? [dica, EditorView.contentAttributes.of({ 'aria-describedby': idDica })] : [],
    EditorView.contentAttributes.of({ 'aria-label': nome }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) aoMudar(u.state.doc.toString());
    }),
  ];
  const view = new EditorView({ parent: raiz, state: EditorState.create({ doc: texto, extensions: extensoes(rotulo) }) });
  return {
    trocar(novoTexto, novoRotulo) {
      view.setState(EditorState.create({ doc: novoTexto, extensions: extensoes(novoRotulo) }));
    },
    focar: () => view.focus(),
    destruir: () => view.destroy(),
  };
}
