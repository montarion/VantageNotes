import { Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType, EditorView } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";
import { isRangeSelected } from "../common/pluginhelpers.ts";
import { metadataStore, Wikilink } from "../common/metadata.ts";
import { openEditorTab } from "../common/tabs.ts";
import { loadFile } from "../common/navigation.ts"; // <-- your existing async loader
import { Logger } from "../common/logger.ts";

const log = new Logger({ namespace: 'wikilinks', minLevel: 'debug' });


const wikilinkRegex = /\[\[([^\]|#]+(?:#[^\]|]+)?)(?:\|([^\]]+))?\]\]/g;

const brokenLinks = new Set<string>();

// Debounced checking of page existence
const checkedLinks = new Set<string>();
async function checkWikilinksExistence(view: EditorView, links: string[]) {
  const toCheck = links.filter(link => !checkedLinks.has(link));
  for (const link of toCheck) {
    checkedLinks.add(link);
    let res = await loadFile(link);
    if (res.length > 0){
      brokenLinks.delete(link);
    } else  {
      log.debug("result", res)
      brokenLinks.add(link);
    }
  }

  requestIdleCallback(() => {
    view.dispatch({ effects: [] });
  });
  
}

class WikilinkWidget extends WidgetType {
  constructor(readonly page: string, readonly display: string, readonly broken: boolean) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = this.broken ? "cm-wikilink cm-wikilink-broken" : "cm-wikilink";
    span.textContent = this.display;
    span.style.color = this.broken ? "red" : "#2a5db0";
    span.style.cursor = "pointer";
    span.onmousedown = () => {
      
        openEditorTab({ filename: this.page });
      
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
      const seenPages: Set<string> = new Set();

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

            const isBroken = brokenLinks.has(page);
            seenPages.add(page);

            if (isRangeSelected(view, start, end)) {
              builder.add(start, end, Decoration.mark({ class: isBroken ? "cm-wikilink-broken" : "cm-wikilink" }));
            } else {
              builder.add(
                start,
                end,
                Decoration.replace({
                  widget: new WikilinkWidget(page, display, isBroken),
                  inclusive: false,
                })
              );
            }

            const wikiobj: Wikilink = { target: page, line: line.number, context: line.text };
            if (display !== page) wikiobj.alias = display;
            foundWikilinks.push(wikiobj);
          }

          pos = line.to + 1;
        }
      }

      metadataStore.updateWikilinks(foundWikilinks);

      checkWikilinksExistence(view, [...seenPages]); // Async file check

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
