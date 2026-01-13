// markdownHeadingPlugin.ts
import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, EditorView } from "npm:@codemirror/view";
import { syntaxTree, syntaxTreeAvailable } from "npm:@codemirror/language";

export const markdownHeadingDecorator = ViewPlugin.fromClass(
  class {
    headings: { from: number; to: number; level: number; text: string }[] = [];
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.updateHeadings(view);
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // Recompute headings & decorations if doc changed, viewport changed, or parser became available
      if (update.docChanged || update.viewportChanged || syntaxTreeAvailable(update.state)) {
        this.updateHeadings(update.view);
        this.decorations = this.buildDecorations(update.view);
      }
    }

    updateHeadings(view: EditorView) {
      const state = view.state;
      if (!syntaxTreeAvailable(state)) {
        this.headings = [];
        return;
      }

      const result = [];
      syntaxTree(state).iterate({
        enter(node) {
          if (node.type.name.startsWith("ATXHeading")) {
            const text = state.doc.sliceString(node.from, node.to);
            const level = text.match(/^(#+)/)?.[1].length ?? 1;
            result.push({ from: node.from, to: node.to, level, text });
          }
        },
      });

      this.headings = result;
    }

    buildDecorations(view: EditorView): DecorationSet {
      if (this.headings.length === 0) return Decoration.none;

      const decos: Decoration[] = [];
      for (const heading of this.headings) {
        const deco = Decoration.line({
          attributes: {
            class: `cm-heading cm-heading-${heading.level}`,
            role: "heading",
            "aria-level": heading.level,
          },
        });
        decos.push(deco.range(heading.from));
      }
      return Decoration.set(decos);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
