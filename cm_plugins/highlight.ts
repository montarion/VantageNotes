import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";

// Test plugin to highlight the first line red background
export const testHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    // Highlight first line from 0 to line length
    const line = view.state.doc.line(1);
    builder.add(line.from, line.to, Decoration.line({attributes: {style: "background-color: rgba(255,0,0,0.2)"}}));
    this.decorations = builder.finish();
  }

  update(update: ViewUpdate) {
    // no update for simplicity
  }
}, {
  decorations: v => v.decorations
});
