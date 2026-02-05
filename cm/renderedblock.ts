import { StateField, RangeSetBuilder } from "npm:@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "npm:@codemirror/view";

export type RenderedBlock = {
    from: number;
    to: number;
    widget: WidgetType;
  };
  
export type RenderedBlockSpec = {
/**
 * Called for each line index.
 * Return null if this line does not start a block.
 */
detect(
    state,
    lineNumber: number
): RenderedBlock | null;
};

class CalloutWidget extends WidgetType {
    constructor(
      readonly kind: string,
      readonly title: string,
      readonly content: string
    ) {
      super();
    }
  
    eq(other: CalloutWidget) {
      return (
        this.kind === other.kind &&
        this.title === other.title &&
        this.content === other.content
      );
    }
  
    toDOM() {
      const wrapper = document.createElement("div");
      wrapper.className = `cm-callout cm-callout-${this.kind}`;
  
      const header = document.createElement("div");
      header.className = "cm-callout-header";
      header.textContent = this.title || this.kind.toUpperCase();
  
      const body = document.createElement("div");
      body.className = "cm-callout-body";
      body.textContent = this.content;
  
      wrapper.append(header, body);
      return wrapper;
    }
  
    ignoreEvent() {
      return false; // allow cursor interaction
    }
  }
  
  function selectionIntersects(state, from, to) {
    for (const r of state.selection.ranges) {
      if (r.from < to && r.to > from) return true;
      if (r.empty && r.from >= from && r.from <= to) return true;
    }
    return false;
  }
  
  export function createRenderedBlockField(
    specs: RenderedBlockSpec[]
  ) {
    return StateField.define<DecorationSet>({
      create(state) {
        return build(state);
      },
  
      update(deco, tr) {
        if (tr.docChanged || tr.selection) {
          return build(tr.state);
        }
        return deco.map(tr.changes);
      },
  
      provide: field =>
        EditorView.decorations.from(field),
    });
  
    function build(state) {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = state.doc;
  
      for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        for (const spec of specs) {
          const block = spec.detect(state, lineNo);
          if (!block) continue;
  
          if (!selectionIntersects(state, block.from, block.to)) {
            builder.add(
              block.from,
              block.to,
              Decoration.replace({
                widget: block.widget,
                block: true
              })
            );
          }
  
          // skip ahead to end of block
          lineNo = doc.lineAt(block.to).number;
          break;
        }
      }
  
      return builder.finish();
    }
  }
  

  export const calloutRenderer: RenderedBlockSpec = {
    detect(state, lineNo) {
      const doc = state.doc;
      const line = doc.line(lineNo);
  
      const m = line.text.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
      if (!m) return null;
  
      const kind = m[1];
      const title = m[2];
      let content = "";
      let end = lineNo;
  
      for (let i = lineNo + 1; i <= doc.lines; i++) {
        const l = doc.line(i);
        if (!l.text.startsWith(">")) break;
        content += l.text.replace(/^>\s?/, "") + "\n";
        end = i;
      }
  
      return {
        from: line.from,
        to: doc.line(end).to,
        widget: new CalloutWidget(kind, title, content.trim())
      };
    }
  };

