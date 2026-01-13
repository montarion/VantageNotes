import {
    ViewPlugin,
    Decoration,
    DecorationSet,
    EditorView,
  } from "npm:@codemirror/view";
  import { Extension, RangeSetBuilder } from "npm:@codemirror/state";
  
  type DelimitedSpec = {
    regexp: RegExp;
  
    prefix?: (match: RegExpExecArray) => [number, number][];
    content: (match: RegExpExecArray) => [number, number];
    suffix?: (match: RegExpExecArray) => [number, number][];
  
    prefixClass?: string;
    contentClass: string;
    suffixClass?: string;
  
    invalidateOnSelection?: boolean;
  };
  
  type HighlighterSpec = {
    regexp: RegExp;
    decorate: (
      from: number,
      to: number,
      visible: boolean
    ) => Decoration[];
    invalidateOnSelection?: boolean;
  };

  function buildDecorations(
    view: EditorView,
    spec: HighlighterSpec
  ): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
  
    const cursors = view.state.selection.ranges.map(r => r.head);
  
    spec.regexp.lastIndex = 0;
    let m;
  
    while ((m = spec.regexp.exec(text)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
  
      const visible = cursors.some(
        pos => pos > from && pos < to
      );
  
      for (const deco of spec.decorate(from, to, visible)) {
        builder.add(deco.from, deco.to, deco.value);
      }
    }
  
    return builder.finish();
  }
  export function mark(
    from: number,
    to: number,
    cls: string
  ) {
    return {
      from,
      to,
      value: Decoration.mark({ class: cls }),
    };
  }
  export function createHighlighter(spec: HighlighterSpec): Extension {
    return ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
  
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view, spec);
        }
  
        update(update) {
          if (
            update.docChanged ||
            update.viewportChanged ||
            (spec.invalidateOnSelection && update.selectionSet)
          ) {
            this.decorations = buildDecorations(update.view, spec);
          }
        }
      },
      {
        decorations: v => v.decorations,
      }
    );
  }
  