// O editor de YAML (CodeMirror 6): recuo de 2 espaços, Tab recua (Esc e depois Tab sai do editor).
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { yaml } from '@codemirror/lang-yaml';

// Cores do tema (variáveis do CSS): o editor acompanha claro, escuro e alto contraste.
const tema = EditorView.theme({
  '&': { backgroundColor: 'var(--editor-fundo)', color: 'var(--texto)', height: '100%' },
  '.cm-content': { caretColor: 'var(--texto)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--texto)' },
  '.cm-gutters': { backgroundColor: 'var(--editor-fundo)', color: 'var(--suave)', borderRight: '1px solid var(--borda)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--editor-linha)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--destaque) 35%, transparent)' },
});
const cores = syntaxHighlighting(HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.keyword], color: 'var(--sx-chave)' },
  { tag: [tags.string, tags.content, tags.attributeValue], color: 'var(--sx-texto)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--sx-numero)' },
  { tag: [tags.comment, tags.meta, tags.punctuation, tags.separator], color: 'var(--sx-comentario)' },
]));

export function criarEditor(raiz, { texto, aoMudar, rotulo }) {
  const extensoes = (nome) => [
    basicSetup,
    yaml(),
    tema,
    cores,
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    keymap.of([indentWithTab]),
    // Ctrl+Enter é o atalho do Aplicar (e Ctrl+Shift+Enter, do Entregar): o editor não insere a linha em branco do padrão.
    Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => true }, { key: 'Mod-Shift-Enter', run: () => true }])),
    EditorView.lineWrapping,
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
