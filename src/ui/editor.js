// O editor de YAML (CodeMirror 6): recuo de 2 espaços, Tab recua (Esc e depois Tab sai do editor).
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';

export function criarEditor(raiz, { texto, aoMudar, rotulo }) {
  const extensoes = (nome) => [
    basicSetup,
    yaml(),
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    keymap.of([indentWithTab]),
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
