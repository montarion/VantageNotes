import {
    ViewPlugin,
    WidgetType,
    Decoration,
    DecorationSet,
    EditorView,
  } from "npm:@codemirror/view";
  
  import { StateField, RangeSetBuilder } from "npm:@codemirror/state";

class CalloutWidget extends WidgetType {
  constructor(
    readonly kind: string,
    readonly title: string,
    readonly content: string,
    readonly from: number
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

  toDOM(view:EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = `cm-callout cm-callout-${this.kind}`;

    const header = document.createElement("div");
    header.className = "cm-callout-header";
    header.textContent = this.title || this.kind.toUpperCase();

    const body = document.createElement("div");
    body.className = "cm-callout-body";
    body.textContent = this.content;

    wrapper.append(header, body);
    wrapper.addEventListener("click", (e) => {
      e.preventDefault(); // don't let CM steal focus weirdly
      e.stopPropagation();
      console.log("clicked wrapper")
  
      view.dispatch({
        selection: { anchor: this.from + 1 },
        scrollIntoView: true
      });
    });
    return wrapper;
  }

  ignoreEvent(event: Event) {
    if (event.type === "mousedown") return true;
    return false;
  }
}

function selectionIntersects(state, from: number, to: number) {
    for (const r of state.selection.ranges) {
      if (r.from < to && r.to > from) return true;
      if (r.empty && r.from >= from && r.from <= to) return true;
    }
    return false;
  }

export const calloutField = StateField.define<DecorationSet>({
    create(state) {
      return buildCallouts(state);
    },
  
    update(deco, tr) {
      if (tr.docChanged || tr.selection) {
        return buildCallouts(tr.state);
      }
      return deco.map(tr.changes);
    },
  
    provide: field =>
      EditorView.decorations.from(field)
  });

  function buildCallouts(state) {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = state.doc;

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const match = line.text.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
        if (!match) continue;

        const kind = match[1].toLowerCase();
        const title = match[2];

        let content = "";
        let endLine = i;

        for (let j = i + 1; j <= doc.lines; j++) {
        const l = doc.line(j);
        if (!l.text.startsWith(">")) break;
        content += l.text.replace(/^>\s?/, "") + "\n";
        endLine = j;
        }

        const from = line.from;
        const to = doc.line(endLine).to;

        // 👇 THIS IS THE MAGIC
        if (!selectionIntersects(state, from, to)) {
        builder.add(
            from,
            to,
            Decoration.replace({
              widget: new CalloutWidget(kind, title, content.trim(), from),
              block: true
            })
        );
        }

        i = endLine;
    }

    return builder.finish();
}

  