// htmlOutputPlugin.ts
import {
  ViewPlugin, Decoration, DecorationSet, WidgetType, EditorView, ViewUpdate
} from "npm:@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "npm:@codemirror/state";
import { PageMetadata } from "../common/metadata.ts";
import { getActiveTab } from "../common/tabs.ts";
import { getActivePane, getPane } from "../common/pane.ts";
import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'HtmlOutputPlugin', minLevel: 'debug' });
/** One rendered output per fenced block you want to hide/replace */
export type HtmlOutputEntry = {
  fromLine: number;   // opening ``` line (1-based)
  toLine: number;     // closing ``` line (1-based)
  html: string;       // rendered HTML to show instead
};

/** Effect to (re)place all outputs */
export const setHtmlOutputs = StateEffect.define<HtmlOutputEntry[]>();

/** StateField storing the current outputs */
export const htmlOutputField = StateField.define<HtmlOutputEntry[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHtmlOutputs)) return e.value;
    return value;
  }
});

/** Helper to update outputs from app code */
export function applyHtmlOutputs(view: EditorView, entries: HtmlOutputEntry[]) {
  view.dispatch({ effects: setHtmlOutputs.of(entries) });
}

/** Block widget that shows the rendered HTML; copy/paste yields plain text */
class HtmlOutputWidget extends WidgetType {
  constructor(private html: string) { super(); }
  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-html-output-widget";
    div.innerHTML = this.html;
    div.style.border = "1px solid #ccc";
    div.style.borderRadius = "5px";
    div.style.padding = "8px";
    div.style.margin = "6px 0";


    try {
      // Try to parse JSON
      log.debug("trying to parse json", this.html)
      const json = JSON.parse(this.html);
      div.textContent = JSON.stringify(json, null, 4); // pretty-print
    } catch{
      // Fallback: treat as raw HTML
      div.innerHTML = this.html;
    }
    return div;
  }
  ignoreEvent() { return false; }
  toText() {
    const div = document.createElement("div");
    div.innerHTML = this.html;
    return div.textContent || "";
  }
}

/** The plugin: hides code lines + inserts widgets when cursor not inside */
export const htmlOutputPerBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    constructor(private view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.startState.field(htmlOutputField) !== update.state.field(htmlOutputField)
      ) {
        this.decorations = this.build(update.view);
      }
    }
    
    
    private build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const entries = [...view.state.field(htmlOutputField)]; // copy
    
      // sort by fromLine ascending
      entries.sort((a, b) => a.fromLine - b.fromLine);
    
      const sel = view.state.selection.main;
    
      for (const { fromLine, toLine, html } of entries) {
        const startLine = view.state.doc.line(fromLine);
        const endLine = view.state.doc.line(toLine)
        const fromPos = startLine.from;
        const toPos = endLine.to;
        const cursorInside = sel.from <= toPos && sel.to >= fromPos;
        
        if (!cursorInside) {
          // Then hide lines (line decorations) **after** the widget
          for (let ln = fromLine; ln < toLine; ln++) {
            const l = view.state.doc.line(ln);
            builder.add(l.from, l.from, Decoration.line({ attributes: { class: "cm-hidden-code-line" } }));
          }
          //builder.add(startLine.from, endLine.from, Decoration.line({ attributes: { class: "cm-hidden-code-line" } }));
          // Insert **widget first**
          builder.add(
            endLine.from,
            endLine.from,
            Decoration.widget({ widget: new HtmlOutputWidget(html), block: false, side:1 })
          );
        } else {
          // remove me
          log.warn(`Cursor is inside fence${fromPos}-${toPos} at position:${sel.to}`)
        }
      }
    
      return builder.finish();
    }
  },
  { decorations: v => v.decorations }
);

/** Minimal theme: actually hide the lines we mark */
export const htmlOutputTheme = EditorView.baseTheme({
  ".cm-hidden-code-line": { display: "none" },
  ".cm-html-output-widget": { /* style overrides, if you want */ }
});

export function refreshWidgetsFromMetadata(view: EditorView, meta: PageMetadata) {
  let pane = getPane(getActivePane())
  let tab = getActiveTab()
  const entries = tab?.metadata.codeBlocks
    .filter(b => (b.language || "").toLowerCase() === "javascript")
    .map(b => ({
      fromLine: b.fromLine,
      toLine: b.toLine,
      html: b.code //renderJsToHtml(b.code ?? "")
    }));
  applyHtmlOutputs(pane.editorInstance?.view, entries);
}

/** Set or update a single output range (like old setOutput) */
export function setOutput(view: EditorView, entry: HtmlOutputEntry) {
  const current = view.state.field(htmlOutputField, false) || [];

  // Remove any previous entry that overlaps exactly the same lines
  const filtered = current.filter(
    e => e.fromLine !== entry.fromLine || e.toLine !== entry.toLine
  );

  // Merge the new entry
  const merged = [...filtered, entry];

  // Sort by fromLine so decorations apply in document order
  merged.sort((a, b) => a.fromLine - b.fromLine);

  // Dispatch the effect
  view.dispatch({ effects: setHtmlOutputs.of(merged) });
}