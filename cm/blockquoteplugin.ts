import { WidgetType } from "npm:@codemirror/view";
import { RenderedBlockSpec } from "./renderedblock.ts";

export class BlockquoteWidget extends WidgetType {
  constructor(readonly content: string) {
    super();
  }

  eq(other: BlockquoteWidget) {
    return this.content === other.content;
  }

  toDOM() {
    const el = document.createElement("blockquote");
    el.className = "cm-rendered-blockquote";
    el.textContent = this.content;
    return el;
  }

  ignoreEvent() {
    return false;
  }
}

export const blockquoteRenderer: RenderedBlockSpec = {
    detect(state, lineNo) {
      const doc = state.doc;
      const line = doc.line(lineNo);
  
      // Must start with >
      if (!line.text.startsWith(">")) return null;
  
      // Skip callouts
      if (/^>\s*\[!/.test(line.text)) return null;
  
      let content = line.text.replace(/^>\s?/, "") + "\n";
      let endLine = lineNo;
  
      for (let i = lineNo + 1; i <= doc.lines; i++) {
        const l = doc.line(i);
        if (!l.text.startsWith(">")) break;
        content += l.text.replace(/^>\s?/, "") + "\n";
        endLine = i;
      }
  
      return {
        from: line.from,
        to: doc.line(endLine).to,
        widget: new BlockquoteWidget(content.trim())
      };
    }
  };