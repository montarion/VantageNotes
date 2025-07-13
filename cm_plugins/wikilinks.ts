import { Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType, EditorView } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";
import { isRangeSelected } from "../common/pluginhelpers.ts";
import { metadataStore, Wikilink } from "./metadata.ts";
import { openEditorTab, switchToTab } from "../common/tabs.ts";

const wikilinkRegex = /\[\[([^\]|#]+(?:#[^\]|]+)?)(?:\|([^\]]+))?\]\]/g;

class WikilinkWidget extends WidgetType {
  constructor(readonly page: string, readonly display: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-wikilink";
    span.textContent = this.display;
    span.style.color = "#2a5db0";
    span.style.cursor = "pointer";
    span.onmousedown = () => {
      console.log(`Navigate to page: ${this.page}`);
      // You can emit an event or use routing here
      openEditorTab({filename: this.page})
    };
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

export const wikilinkPlugin = ViewPlugin.fromClass(
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
      const { doc } = view.state;
      const foundWikilinks: Wikilink[] = [];

      for (const { from, to } of view.visibleRanges) {
        let pos = from;

        while (pos <= to) {
          const line = doc.lineAt(pos);
          let match: RegExpExecArray | null;

          while ((match = wikilinkRegex.exec(line.text))) {
            const start = line.from + match.index;
            const end = start + match[0].length;
            const page = match[1];
            const display = match[2] || page;
            if (isRangeSelected(view, start, end)){
                builder.add(start, end, Decoration.mark({ class: "cm-wikilink" }));

            } else {
                builder.add(
                start,
                end,
                Decoration.replace({
                    widget: new WikilinkWidget(page, display),
                    inclusive: false,
                })
                );
            }
            let wikiobj = {target: page, line: line.number, context: line.text}
            if (display !== page){wikiobj["alias"] = display}
            foundWikilinks.push(wikiobj)
          }

          pos = line.to + 1;
        }
      }
      metadataStore.updateWikilinks(foundWikilinks);

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
