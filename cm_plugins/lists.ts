import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewPlugin,
    ViewUpdate
  } from "npm:@codemirror/view";
  import { Extension, RangeSetBuilder } from "npm:@codemirror/state";

const unorderedListRegex = /^\s*([-*+])\s+(.+)/;
const orderedListRegex = /^\s*(\d+)\.\s+(.+)/;

export const lists: Extension = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
  
      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }
  
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
  
      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const { from, to } = view.viewport;
      
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          const text = line.text;
      
          if (unorderedListRegex.test(text)) {
            builder.add(line.from, line.from, Decoration.line({ class: "cm-list cm-list-unordered" }));
          } else if (orderedListRegex.test(text)) {
            builder.add(line.from, line.from, Decoration.line({ class: "cm-list cm-list-ordered" }));
          }
      
          pos = line.to + 1;
        }
      
        return builder.finish()
      }
    },
    {
      decorations: (v) => v.decorations
    }
  );