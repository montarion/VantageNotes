import { StateField, RangeSetBuilder } from "npm:@codemirror/state";
import { Decoration, EditorView } from "npm:@codemirror/view";

export const calloutField = StateField.define({
  create: build,
  update(deco, tr) {
    if (tr.docChanged) return build(tr.state);
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f)
});

function build(state) {
  const builder = new RangeSetBuilder();
  const doc = state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const m = line.text.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
    if (!m) continue;

    const kind = m[1].toLowerCase();
    let endLine = i;

    // header line decoration
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        attributes: {
          class: `cm-callout cm-callout-${kind}`,
          "data-callout": kind
        }
      })
    );

    // body lines
    for (let j = i + 1; j <= doc.lines; j++) {
      const l = doc.line(j);
      if (!l.text.startsWith(">")) break;

      builder.add(
        l.from,
        l.from,
        Decoration.line({
          attributes: {
            class: "cm-callout-body"
          }
        })
      );

      endLine = j;
    }

    i = endLine;
  }

  return builder.finish();
}
