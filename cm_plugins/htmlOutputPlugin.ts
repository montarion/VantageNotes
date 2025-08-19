import { ViewPlugin, Decoration, DecorationSet, WidgetType, EditorView, ViewUpdate } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";
import { foldEffect } from "npm:@codemirror/fold";
import { getActiveTab } from "../common/tabs.ts";
import { CodeBlock } from "../common/metadata.ts";
import { foldLines } from "../common/editor.ts";

// Widget for HTML output
class HtmlOutputWidget extends WidgetType {
  html: string;
  constructor(html: string) {
    super();
    this.html = html;
  }

  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-html-output-widget";
    div.style.border = "1px solid #ccc";
    div.style.padding = "8px";
    div.style.marginTop = "4px";
    div.style.whiteSpace = "pre-wrap";
    div.style.userSelect = "text";
    div.contentEditable = "false";
    div.innerHTML = this.html;
    return div;
  }

  ignoreEvent() { return false; }

  toText() {
    const div = document.createElement("div");
    div.innerHTML = this.html;
    return div.textContent || "";
  }
}



export const htmlOutputPerBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    outputs = new Map<number, string>();
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    setOutput(codeblock: CodeBlock, html: string) {
      this.outputs.set(codeblock.toLine, html);
      foldLines(codeblock.fromLine, codeblock.toLine)
    }

    build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      for (const [fromLine, html] of this.outputs.entries()) {
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
  },
  { decorations: v => v.decorations }
);
