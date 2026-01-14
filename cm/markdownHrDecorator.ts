// markdownHrDecorator.ts
import {
    ViewPlugin,
    EditorView,
    Decoration,
    DecorationSet,
    ViewUpdate,
    WidgetType
  } from "npm:@codemirror/view";
  import { syntaxTree } from "npm:@codemirror/language";
  
  function syntaxTreeAvailable(state: EditorState) {
    return syntaxTree(state).length > 0;
  }
  
  export class HrWidget extends WidgetType {
    toDOM() {
      const el = document.createElement("div");
      el.className = "cm-hr";
      return el;
    }
  
    ignoreEvent() {
      return true;
    }
  }
  export const markdownHrDecorator = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
  
      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }
  
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTreeAvailable(update.state)
        ) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
  
      buildDecorations(view: EditorView): DecorationSet {
        const state = view.state;
        if (!syntaxTreeAvailable(state)) return Decoration.none;
  
        const decos: Decoration[] = [];
  
        syntaxTree(state).iterate({
          from: view.viewport.from,
          to: view.viewport.to,
          enter(node) {
            if (node.type.name === "ThematicBreak") {
              // Hide the `---`
              decos.push(
                Decoration.replace({
                  block: true,
                  widget: new HrWidget(),
                }).range(node.from, node.to)
              );
            }
          },
        });
  
        return Decoration.set(decos);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
  