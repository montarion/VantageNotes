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
    block?: (match: RegExpExecArray) => { from: number; to: number };
    blockClass?: string;
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
            
            /* ───────────────────────── line decoration ───────────────────────── */
        
            if (spec.line && (spec.lineClass || spec.lineClassWhen)) {
              log.debug("doing lines")
              const linePos = spec.line(m);
              const extra = spec.lineClassWhen?.(m);
        
              const cls = [spec.lineClass, extra].filter(Boolean).join(" ");
        
              if (cls) {
                builder.add(
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
        
            /* ───────────────────────── block decoration ───────────────────────── */
        
            if (spec.block && spec.blockClass) {
              log.debug("doing blocks")
              const { from: bFrom, to: bTo } = spec.block(m);
              builder.add(
                bFrom,
                bTo,
                Decoration.mark({
                  class: spec.blockClass,
                  attributes: {
                    "data-link": spec.type ?? "unknown",
                    "data-target": spec.getTarget ? spec.getTarget(m) : m[0],
                  },
                })
              );
            }
        
            /* ───────────────────────── inline decorations ───────────────────────── */
            add(spec.prefix?.(m), spec.prefixClass);
            add(spec.hidden?.(m), spec.hiddenClass);
        
            if (spec.content && spec.contentClass) {
              log.debug("decorating inlines?")

              add([spec.content(m)], spec.contentClass);
            }
        
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
  
  