// transclusions.ts
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "npm:@codemirror/view";
import { RangeSetBuilder, Transaction, EditorState, StateField, StateEffect } from "npm:@codemirror/state";
import { extensions } from "../common/editor.ts";
import { saveFile, loadFile } from "../common/navigation.ts";
import { eventBus } from "../common/events.ts";
import { isRangeSelected } from "../common/pluginhelpers.ts";
import { Logger } from "../common/logger.ts";
import { getCurrentTab } from "../common/tabs.ts";

const log = new Logger({ namespace: "Transclusions", minLevel: "debug" });

const transclusionRegex = /!\[\[([^\]#|]+)(#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export const setTransclusionActive = StateEffect.define<boolean>();

export const transclusionActiveField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setTransclusionActive)) return e.value;
    }
    // Reset to false after every transaction if not explicitly set again
    return false;
  },
});




function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const saveTimers = new Map<string, number>();

export function saveTransclusion(
  content: string,
  target: string,
  contextFile: string,
  logger: Logger,
  delay = 500
) {
  if (!target || target.trim() === "") {
    logger.warn("⚠️ No transclusion target provided.");
    return;
  }

  if (target === contextFile) {
    logger.warn(
      `⚠️ Skipping save: Attempted to save transclusion into the current file (${contextFile}).`
    );
    return;
  }

  // Clear any pending save for this target
  if (saveTimers.has(target)) {
    clearTimeout(saveTimers.get(target));
  }

  // Debounce save
  const timer = window.setTimeout(() => {
    logger.debug(`💾 Saving transclusion to: ${target}`);
    saveFile(content, target);
    saveTimers.delete(target);
  }, delay);

  saveTimers.set(target, timer);
}

export function extractHeaderSection(content: string, header: string): string {
  const lines = content.split("\n");
  const headerRegex = new RegExp(`^#{1,6}\\s+${escapeRegExp(header)}\\s*$`);
  const nextHeaderRegex = /^#{1,6}\s+/;

  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (headerRegex.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && nextHeaderRegex.test(line)) break;
    if (inSection) sectionLines.push(line);
  }

  return sectionLines.join("\n").trim();
}

export class TransclusionWidget extends WidgetType {
  target: string;
  header?: string;
  alias?: string;
  collapsed: boolean;
  outerView?: EditorView;
  private saveTimeout: number | null = null;
  private clearTimeoutId: number | null = null;

  constructor(
    target: string,
    header?: string,
    alias?: string,
    collapsed = false,
    outerView?: EditorView
  ) {
    super();
    this.target = target;
    this.header = header;
    this.alias = alias;
    this.collapsed = collapsed;
    this.outerView = outerView;
  }

  eq(other: TransclusionWidget) {
    return (
      this.target === other.target &&
      this.header === other.header &&
      this.alias === other.alias &&
      this.collapsed === other.collapsed
    );
  }

  private setActiveTransclusion(active: boolean) {
    if (!this.outerView) return;
    this.outerView.dispatch({
      effects: setTransclusionActive.of(active),
    });
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-transclusion-widget";

    const label = document.createElement("div");
    label.className = "cm-transclusion-label";
    label.textContent = this.alias || this.header || this.target;
    label.style.fontWeight = "bold";
    label.style.cursor = "pointer";
    label.style.marginBottom = "4px";
    label.title = `Open ${this.target} in sidebar`;

    label.addEventListener("mousedown", (e) => {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent("open-transclusion-sidebar", {
          detail: this.target,
        })
      );
    });

    wrapper.appendChild(label);

    const contentEl = document.createElement("div");
    wrapper.appendChild(contentEl);

    //if (this.collapsed) {
    //  contentEl.textContent = "(collapsed while editing)";
    //  return wrapper;
    //}

    loadFile(this.target)
      .then((content) => {
        const displayContent = this.header
          ? extractHeaderSection(content, this.header)
          : content;

        const tempDiv = document.createElement("div");
        tempDiv.className = "cm-transclusion-editor";

        new EditorView({
          doc: displayContent,
          extensions: [
            EditorView.editable.of(true),
            ...extensions,
            EditorState.transactionFilter.of((tr) => {
              // Tag inner view edits as "input.transclusion"
              if (tr.docChanged && !tr.annotation(Transaction.userEvent)) {
                return tr.update({
                  annotations: tr.annotations.concat(Transaction.userEvent.of("input.transclusion")),
                });
              }
              return tr;
            }),
            EditorView.updateListener.of(update => {
              if (update.docChanged) {
                const updatedContent = update.state.doc.toString();
                log.debug("found it")
                let filename = getCurrentTab().title
                saveTransclusion(updatedContent, this.target, filename, log);
            
                // Signal active editing
                this.setActiveTransclusion(true);
            
                if (this.clearTimeoutId !== null) {
                  clearTimeout(this.clearTimeoutId);
                }
            
                this.clearTimeoutId = window.setTimeout(() => {
                  this.setActiveTransclusion(false);
                  this.clearTimeoutId = null;
                }, 100);
              }
            }),
          ],
          parent: tempDiv,
        });

        contentEl.innerHTML = "";
        contentEl.appendChild(tempDiv);
      })
      .catch((error) => {
        contentEl.textContent = `Failed to load ${this.target} - ${error}`;
      });

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}


export const transclusionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    view: EditorView;
    isCollapsed = false;
    timeout: ReturnType<typeof setTimeout> | null = null;
    debounceDelay = 500;
    widgetCache = new Map<string, TransclusionWidget>();

    constructor(view: EditorView) {
      this.view = view;
      this.decorations = this.buildDecorations(view);
      //eventBus.on("fileSaved", this.onRefresh);
    }

    onRefresh = (event: Event) => {
      if (getCurrentTab()?.title === (event as any).filename) {
        this.decorations = this.buildDecorations(this.view);
      }
    };

    update(update: ViewUpdate) {
      // Ignore changes annotated as coming from transclusion editors
      if (update.transactions.some(tr => tr.annotation(Transaction.userEvent) === "input.transclusion")) {
        return;
      }

      if (this.timeout) clearTimeout(this.timeout);

      if (update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
        return;
      }

      if (update.selectionSet) {
        transclusionRegex.lastIndex = 0;
        let match;
        while ((match = transclusionRegex.exec(update.state.doc.toString())) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          this.decorations = this.buildDecorations(update.view);
          return;
        }
      }

      if (update.docChanged) {
        if (!this.isCollapsed) {
          this.isCollapsed = true;
          this.decorations = this.buildDecorations(update.view);
        }

        this.timeout = setTimeout(() => {
          this.isCollapsed = false;
          this.decorations = this.buildDecorations(this.view);
        }, this.debounceDelay);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const docText = view.state.doc.toString();

      transclusionRegex.lastIndex = 0;
      let match;
      while ((match = transclusionRegex.exec(docText)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        const target = match[1];
        const header = match[3];
        const alias = match[4];
        const cacheKey = `${target}#${header ?? ""}|${alias ?? ""}|${this.isCollapsed}`;

        let widget = this.widgetCache.get(cacheKey);
        if (!widget) {
          widget = new TransclusionWidget(target, header, alias, this.isCollapsed, this.view);
          this.widgetCache.set(cacheKey, widget);
        }

        const deco = Decoration.widget({
          widget,
          side: 1,
          block: false,
        });

        builder.add(end, end, deco);
      }

      return builder.finish();
    }

    destroy() {
      if (this.timeout) clearTimeout(this.timeout);
    }
  },
  {
    decorations: v => v.decorations,
  }
);

export default transclusionPlugin;
