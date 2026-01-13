import { ViewPlugin, Decoration, MatchDecorator, WidgetType, DecorationSet, EditorView } from "npm:@codemirror/view";
import { Extension } from "npm:@codemirror/state";

const wikilinkRegex = /\[\[([^\]]+?)\]\]/g;

export function wikilinkBracketsToggle(): Extension {
  const matcher = new MatchDecorator({
    regexp: wikilinkRegex,
    decoration: match => {
      const from = match.from;
      const to = match.to;

      return Decoration.set([
        // Hide opening brackets [[
        Decoration.replace({
          widget: new HiddenBracket("[["),
          inclusive: false
        }).range(from, from + 2),

        // Hide closing brackets ]]
        Decoration.replace({
          widget: new HiddenBracket("]]"),
          inclusive: false
        }).range(to - 2, to)
      ]);
    }
  });

  // Widget class to hide brackets
  class HiddenBracket extends WidgetType {
    constructor(readonly text: string) { super(); }
    toDOM() {
      const span = document.createElement("span");
      span.textContent = this.text;
      span.style.opacity = "0";          // hidden by default
      span.style.pointerEvents = "none"; // ignore clicks
      span.classList.add("cm-hidden-bracket");
      return span;
    }
  }

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view) {
      this.decorations = matcher.createDeco(view);
    }

    update(update) {
      this.decorations = matcher.updateDeco(update, this.decorations);

      // Show brackets if cursor is inside
      const cursors = update.state.selection.ranges.map(r => r.head);

      const builder = [];
      this.decorations.between(0, update.state.doc.length, (from, to, deco) => {
        if (!(deco.spec.widget instanceof HiddenBracket)) return;

        // Check if any cursor is inside this decoration
        const inside = cursors.some(pos => pos >= from && pos <= to);
        const dom = deco.spec.widget.toDOM(update.view);
        dom.style.opacity = inside ? "1" : "0";
      });
    }
  }, {
    decorations: v => v.decorations
  });
}