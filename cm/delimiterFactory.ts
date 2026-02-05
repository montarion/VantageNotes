// DelimiterFactory.ts
import {
    ViewPlugin,
    Decoration,
    DecorationSet,
    EditorView,
  } from "npm:@codemirror/view";
  import { Extension, RangeSetBuilder } from "npm:@codemirror/state";
import { Logger } from "../common/logger.ts";
  const log = new Logger({ namespace: "DelimiterFactory" });
  type DelimitedSpec = {
    regexp: RegExp;
  
    prefix?: (match: RegExpExecArray) => [number, number][];
    content?: (match: RegExpExecArray) => [number, number];
    suffix?: (match: RegExpExecArray) => [number, number][];
  
    hidden?: (match: RegExpExecArray) => [number, number][];
  
    /** NEW */
    line?: (match: RegExpExecArray) => number; // line start position
    lineClassWhen?: (match: RegExpExecArray) => string | null;
    prefixClass?: string;
    contentClass?: string;
    suffixClass?: string;
    hiddenClass?: string;
    lineClass?: string; // NEW
  

    /* Block-level decoration */
    block?: (match: RegExpExecArray, view: EditorView) => { from: number; to: number } | undefined;
    blockClass?: string;
    type?: string;
    getTarget?: (match: RegExpExecArray) => string;
    invalidateOnSelection?: boolean;
  };
  
  /**
   * Creates a decoration-only plugin.
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
          const cursors = view.state.selection.ranges.map(r => r.head);
        
          spec.regexp.lastIndex = 0;
          let m;
        
          const resolveClass = (cls: string | ((match: RegExpExecArray) => string) | undefined, match: RegExpExecArray) =>
            typeof cls === "function" ? cls(match) : cls;
        
          while ((m = spec.regexp.exec(text))) {
            const from = m.index;
            const to = from + m[0].length;
            const active = cursors.some(pos => pos > from && pos < to);
        
            const pending: Array<{ from: number; to: number; deco: Decoration }> = [];
        
            const push = (a: number, b: number, deco: Decoration) => {
              pending.push({ from: a, to: b, deco });
            };
        
            const add = (ranges: [number, number][] | undefined, cls?: string | ((m: RegExpExecArray) => string)) => {
              if (!ranges || !cls) return;
              const resolvedCls = resolveClass(cls, m);
              for (const [a, b] of ranges) {
                push(
                  a,
                  b,
                  Decoration.mark({
                    class: active ? `${resolvedCls} cm-visible` : resolvedCls,
                    attributes: {
                      "data-link": spec.type ?? "unknown",
                      "data-target": spec.getTarget ? spec.getTarget(m) : m[1] || m[0],
                    },
                  })
                );
              }
            };
        
            /* ───────────────────────── line decoration ───────────────────────── */
            if (spec.line) {
              const linePos = spec.line(m);
        
              let cls = resolveClass(spec.lineClass, m);
              if (spec.lineClassWhen) {
                const extra = spec.lineClassWhen(m);
                cls = [cls, extra].filter(Boolean).join(" ");
              }
        
              if (cls) {
                push(
                  linePos,
                  linePos,
                  Decoration.line({
                    class: active ? `${cls} cm-visible` : cls,
                    attributes: {
                      "data-link": spec.type ?? "unknown",
                      "data-target": spec.getTarget ? spec.getTarget(m) : m[0],
                    },
                  })
                );
              }
            }
        
            /* ───────────────────────── inline decorations ───────────────────────── */
            add(spec.prefix?.(m), spec.prefixClass);
            add(spec.hidden?.(m), spec.hiddenClass);
            if (spec.content && spec.contentClass) {
              add([spec.content(m)], spec.contentClass);
            }
            add(spec.suffix?.(m), spec.suffixClass);
        
            /* ───────────────────────── block decoration ───────────────────────── */
            if (spec.block && spec.blockClass) {
              //const { from: bFrom, to: bTo } = spec.block(m);
              const block = spec.block(m, view);
              if (!block || block.from >= block.to) continue;

              const { from: bFrom, to: bTo } = block;
              let lineStart = bFrom;
              while (lineStart <= bTo) {
                const lineEnd = view.state.doc.lineAt(lineStart).to;
                const cls = resolveClass(spec.blockClass, m);
                push(
                  lineStart,
                  lineStart,
                  Decoration.line({
                    class: cls,
                    attributes: {
                      "data-link": spec.type ?? "unknown",
                      "data-target": spec.getTarget ? spec.getTarget(m) : m[0],
                    },
                  })
                );
                lineStart = lineEnd + 1;
              }
            }
        
            /* ───────────────────────── flush in order ───────────────────────── */
            pending
              .sort((a, b) => a.from - b.from || a.to - b.to)
              .forEach(({ from, to, deco }) => builder.add(from, to, deco));
          }
        
          return builder.finish();
        }
        
      },
      { decorations: v => v.decorations }
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
  
  