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
    hidden?: (match: RegExpExecArray) => [number, number][];
    hiddenClass?: string;
    type?: string;
    getTarget?: (match: RegExpExecArray) => string;
    invalidateOnSelection?: boolean;
  };
  
  /**
   * Creates a decoration-only plugin.
   * Does NOT attach any click handlers — those are centralized.
   */
  export function createDelimitedHighlighter(spec: DelimitedSpec): Extension {
    return ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        view: EditorView;
  
        constructor(view: EditorView) {
          this.view = view;
          this.decorations = this.build(view);
        }
  
        update(update) {
          if (
            update.docChanged ||
            update.viewportChanged ||
            (spec.invalidateOnSelection && update.selectionSet)
          ) {
            this.decorations = this.build(update.view);
          }
        }
  
        build(view: EditorView): DecorationSet {
          const builder = new RangeSetBuilder<Decoration>();
          const text = view.state.doc.toString();
          const cursors = view.state.selection.ranges.map((r) => r.head);
  
          spec.regexp.lastIndex = 0;
          let m;
          while ((m = spec.regexp.exec(text))) {
            const from = m.index;
            const to = from + m[0].length;
  
            const active = cursors.some((pos) => pos > from && pos < to);
  
            const add = (ranges: [number, number][] | undefined, cls?: string) => {
              if (!ranges || !cls) return;
              for (const [a, b] of ranges) {
                builder.add(
                  a,
                  b,
                  Decoration.mark({
                    class: active ? `${cls} cm-visible` : cls,
                    attributes: {
                      "data-link": spec.type ?? "unknown",
                      "data-target": spec.getTarget ? spec.getTarget(m) : m[1] || m[0],
                    },
                  })
                );
              }
            };
  
            add(spec.prefix?.(m), spec.prefixClass);
            add(spec.hidden?.(m), spec.hiddenClass);
            add([spec.content(m)], spec.contentClass);
            add(spec.suffix?.(m), spec.suffixClass);
          }
  
          return builder.finish();
        }
      },
      { decorations: (v) => v.decorations }
    );
  }
  
  /**
   * Single centralized click handler for all link-like decorations.
   */
  export const linkClickHandler = ViewPlugin.fromClass(
    class {
      view: EditorView;
      handler: (e: MouseEvent) => void;
  
      constructor(view: EditorView) {
        this.view = view;
  
        this.handler = (e: MouseEvent) => {
          let el = e.target as HTMLElement;
  
          // find nearest element with data-target
          while (el && !el.dataset.target) el = el.parentElement;
          if (!el || el.dataset.handled) return;
  
          el.dataset.handled = "1"; // prevent double firing
          e.preventDefault();
          e.stopPropagation();
  
          const target = el.dataset.target;
          const type = el.dataset.link;
          if (target && type) {
            switch (type) {
              case "wikilink":
                window.nav.switchTab(target);
                break;
              case "markdownlink":
                window.open(target, "_blank");
                break;
              case "transclusion":
                
                break;
              case "tag":
                //window.nav.showTag(target);
                break;
            }
          }
        };
  
        view.dom.addEventListener("click", this.handler);
      }
  
      destroy() {
        this.view.dom.removeEventListener("click", this.handler);
      }
    }
  );
  