// markdownListDecorator.ts
import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, EditorView } from "npm:@codemirror/view";
import { syntaxTree, syntaxTreeAvailable } from "npm:@codemirror/language";
import { Transaction } from "npm:@codemirror/state";

export type ListItem = { from: number; to: number; text: string; checked?: boolean; indent: number };

class CheckboxWidget extends WidgetType {
    checked: boolean;
    from: number;
    view: EditorView;
  
    constructor(view: EditorView, from: number, checked: boolean) {
      super();
      this.view = view;
      this.from = from;
      this.checked = checked;
    }
  
    toDOM() {
      const wrapper = document.createElement("span");
      wrapper.className = "cm-checklist-widget";
      wrapper.setAttribute("role", "checkbox");
      wrapper.setAttribute("aria-checked", String(this.checked));
  
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = this.checked;
      box.tabIndex = -1; // prevent focus stealing
  
      wrapper.appendChild(box);
  
      // 👇 THIS is the key part
      wrapper.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
  
      return wrapper;
    }
  
    toggle() {
      const line = this.view.state.doc.lineAt(this.from);
      const newText = line.text.replace(
        /^(\s*-\s*\[)[^\]]*(\])/,
        `$1${this.checked ? " " : "x"}$2`
      );
  
      this.view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
        annotations: [
          Transaction.userEvent.of("input.checkbox"),
        ],
        scrollIntoView: true,
      });
      
    }
  
    ignoreEvent() {
      return false; // IMPORTANT: let widget fully handle events
    }
  }
class RadioDotWidget extends WidgetType {
  indent: number;

  constructor(indent: number) {
    super();
    this.indent = indent;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-list-widget";
    span.style.marginLeft = `${this.indent * 1.5}em`; // indent based on nesting
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

export const markdownListDecorator = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    listItems: ListItem[] = [];

    constructor(view: EditorView) {
      this.scanListItems(view);
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTreeAvailable(update.state)) {
        this.scanListItems(update.view);
        this.decorations = this.buildDecorations(update.view);
        
      }
      

    }

    scanListItems(view: EditorView) {
      const state = view.state;
      this.listItems = [];

      if (!syntaxTreeAvailable(state)) return;

      syntaxTree(state).iterate({
        enter: (node) => {
          if (node.type.name === "ListItem") {
            const text = state.doc.sliceString(node.from, node.to);
            const isCheckedMatch = text.match(/^\s*-\s*\[([^\]]*)\]/);
            const checked = isCheckedMatch ? isCheckedMatch[1].trim() !== "" : undefined;

            // compute indentation: count spaces/tabs at start of line
            const indentMatch = text.match(/^(\s*)/);
            const indent = indentMatch ? Math.floor(indentMatch[1].length / 2) : 0;

            this.listItems.push({ from: node.from, to: node.to, text, checked, indent });
          }
        },
      });
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decos: Decoration[] = [];

      const cursorPositions = view.state.selection.ranges.map(r => ({ from: r.from, to: r.to }));

      for (const item of this.listItems) {
        const matchCheckbox = item.text.match(/^(\s*-\s*\[[^\]]*\])/);
        const matchNormal = item.text.match(/^(\s*-\s+)/);

        let showMarkdown = false;
        const rangeStart = matchCheckbox?.index ?? matchNormal?.index ?? 0;
        
        const rangeEnd = rangeStart + (matchCheckbox?.[0].length ?? matchNormal?.[0].length ?? 0);
        // cursor inside the marker? show original markdown
        for (const sel of cursorPositions) {
          if (sel.from <= rangeEnd+item.from && sel.to >= rangeStart+item.from) {
            showMarkdown = true;
            break;
          }
        }

        if (item.checked !== undefined) {
          // checklist
          if (showMarkdown) {
            continue; // show normal markdown
          } else if (matchCheckbox) {
            decos.push(
              Decoration.replace({
                widget: new CheckboxWidget(view, item.from, item.checked),
                inclusive: false,
              }).range(item.from + rangeStart, item.from + rangeEnd)
            );
          }
        } else {
          // normal list
          if (showMarkdown) {
            continue; // show normal markdown
          } else if (matchNormal) {
            decos.push(
              Decoration.replace({
                widget: new RadioDotWidget(item.indent),
                inclusive: false,
              }).range(item.from + rangeStart, item.from + rangeEnd)
            );
          }
        }
      }

      return Decoration.set(decos);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
