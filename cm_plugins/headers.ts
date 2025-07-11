import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate
} from "npm:@codemirror/view";
import { Extension, RangeSetBuilder } from "npm:@codemirror/state";
import { isRangeSelected, ZeroWidthWidget } from "../common/pluginhelpers.ts";
import { metadataStore, Header } from "./metadata.ts";

const headerMatcher = /^(#{1,6})\s+(.*)$/;

export const headers: Extension = ViewPlugin.fromClass(
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
      const foundHeaders: Header[] = [];

      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        const match = headerMatcher.exec(line.text);

        if (match) {
          const level = match[1].length;
          const hashText = match[1];
          const headerStart = line.from;
          const headerEnd = line.to;
          const headerContentStart = headerStart + hashText.length + 1; // +1 for space

          // Hide the leading #### (but keep content)
          if (!isRangeSelected(view, headerStart, headerEnd)){
            builder.add(
              headerStart,
              headerContentStart,
              Decoration.replace({ZeroWidthWidget})
            );
          }
          // Apply the header styling to the remaining line
          builder.add(
            headerContentStart,
            headerEnd,
            Decoration.mark({
              class: `cm-header cm-header-${level}`
            })
          );

          foundHeaders.push({
            level,
            line: line.number,
            text: line.text.slice(headerContentStart - line.from) // actual header text
          });
        }

        pos = line.to + 1;
      }

      metadataStore.updateHeaders(foundHeaders);
      return builder.finish();
    }
  },
  {
    decorations: v => v.decorations
  }
);
