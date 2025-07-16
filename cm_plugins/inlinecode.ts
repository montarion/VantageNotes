import {
    ViewPlugin,
    Decoration,
    DecorationSet,
    EditorView,
    ViewUpdate
  } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";
import { isRangeSelected, ZeroWidthWidget } from "../common/pluginhelpers.ts";
import { metadataStore, Task } from "./metadata.ts";

  // Match `code` (inline code with single backticks, excluding multiline)
const inlineCodeRegex = /`([^`\n]+?)`/g;

export const inlineCodePlugin = ViewPlugin.fromClass(
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
        let match: RegExpExecArray | null;

        while ((match = inlineCodeRegex.exec(text)) !== null) {
          const start = line.from + match.index;
          const end = start + match[0].length;

          // Hide the opening and closing backticks
          if (!isRangeSelected(view, start, end)){
            builder.add(start, start + 1, Decoration.replace({}));
          }
          // Decorate the inner content
          builder.add(
            start + 1,
            end - 1,
            Decoration.mark({ class: "cm-inline-code" })
          );
          if (!isRangeSelected(view, start, end)){
            builder.add(end - 1, end, Decoration.replace({}));
          }
        }

        pos = line.to + 1;
      }

      return builder.finish();
    }

    destroy() {}
  },
  {
    decorations: v => v.decorations
  }
);