//htmlOutputPlugin.ts
import { ViewPlugin, Decoration, DecorationSet, WidgetType, EditorView, ViewUpdate } from "npm:@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "npm:@codemirror/state";
import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'html', minLevel: 'debug' });

export const setHtmlOutput = StateEffect.define<string>();

export const htmlOutputField = StateField.define<string>({
  create: () => "",
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setHtmlOutput)) return e.value;
    }
    return value;
  },
});
// Effect to trigger refresh
const refreshEffect = StateEffect.define<void>();

class HtmlOutputWidget extends WidgetType {
  html: string;
  constructor(html: string) { super(); this.html = html; }
  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-html-output-widget";
    div.style.border = "1px solid #ccc";
    div.style.padding = "8px";
    div.innerHTML = this.html;
    return div;
  }
}

export const htmlOutputPerBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    outputs = new Map<number, string>();
    view: EditorView;
    interval: number;

    constructor(view: EditorView) {
      this.view = view;
      this.decorations = this.build(view);

      
    }

    update(update: ViewUpdate) {
      // Rebuild if document changed, viewport changed, or refreshEffect fired
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some(tr =>
          tr.effects.some(e => e.is(refreshEffect))
        )
      ) {
        this.decorations = this.build(update.view);
      }
    }

    setOutput(fromLine: number, html: string) {
      this.outputs.set(fromLine, html);
      // Decorations will rebuild automatically on next interval
    }

    build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const sortedOutputs = Array.from(this.outputs.entries()).sort(
        ([lineA], [lineB]) => lineA - lineB
      );

      for (const [fromLine, html] of sortedOutputs) {
        const line = view.state.doc.line(fromLine);
        builder.add(
          line.to,
          line.to,
          Decoration.widget({
            widget: new HtmlOutputWidget(html),
            side: 1,
            block: false
          })
        );
      }

      return builder.finish();
    }

    destroy() {
      clearInterval(this.interval);
    }
  },
  {
    decorations: v => v.decorations
  }
);