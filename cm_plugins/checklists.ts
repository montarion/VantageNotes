import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";
import { eventBus } from "../common/events.ts";
import { isRangeSelected, ZeroWidthWidget } from "../common/pluginhelpers.ts";
import { metadataStore, Task } from "../common/metadata.ts";
import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'Checklists', minLevel: 'debug' });
// Regex to match checklist items with optional indent, checkbox, and task text
const checklistRegex = /^(\s*)[-*] \[([ xX])\]\s*(?:\[\[([^\]#]+?)(?:#L(\d+))?\]\])?\s*(.*)$/;


class CheckboxWidget extends WidgetType {
  checked: boolean;
  onToggle: () => void;
  indent: string;
  view: EditorView;
  filename?: string;
  lineNumber?: number;

  constructor(
    checked: boolean,
    onToggle: () => void,
    indent: string,
    view: EditorView,
    filename?: string,
    lineNumber?: number
  ) {
    super();
    this.checked = checked;
    this.onToggle = onToggle;
    this.indent = indent;
    this.view = view;
    this.filename = filename;
    this.lineNumber = lineNumber;
  }

  toDOM() {
    const label = document.createElement("label");
    label.style.display = "inline-block";
    label.style.cursor = "pointer";
    label.style.userSelect = "auto";
    label.style.padding = "3px";
    label.style.margin = "-2px";

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.style.marginLeft = this.indent.length + "ch";
    box.style.pointerEvents = "auto";

    box.onmousedown = (e) => {
      e.preventDefault();
      this.onToggle();
    };

    label.appendChild(box);

    // Optional tooltip for external tasks
    if (this.filename) {
      label.title = `${this.filename}${this.lineNumber ? `#L${this.lineNumber}` : ""}`;
    }

    return label;
  }

  override eventHandlers() {
    return {
      mousedown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      click: (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onToggle();
      }
    };
  }

  override ignoreEvent() {
    return false;
  }
}


function parseTask(line: string) {
  const match = checklistRegex.exec(line);
  if (!match) return null;

  const [, indent, boxState, filename, lineNumber, taskText] = match;
  const checked = boxState.toLowerCase() === "x";
  if (filename) {
    // This is a reference to another file
    return {
      type: "external",
      filename,
      lineNumber: lineNumber ? parseInt(lineNumber, 10) : null,
      checked,
      text: taskText.trim(),
    };
  } else {
    // Local task in the current file
    return {
      type: "local",
      checked,
      text: taskText.trim(),
    };
  }
}

export const checklistPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      // Build initial decorations on creation
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // Rebuild decorations if doc or viewport changes or selection changes
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.buildDecorations(update.view);
      }

      const doc = update.state.doc;

      // Sync logic: detect checklist changes and emit events when checkboxes toggle
      if (update.docChanged) {
        for (const tr of update.transactions) {
          tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            // Extract changed text snippet with some padding for safety
            const changedText = doc.sliceString(fromB - 1, toB + 1);

            // Check if changed text matches a checkbox pattern like "[ ]" or "[x]"
            const match = changedText.match(/\[\s?[xX]?\s?\]/);

            if (match) {
              // Get the full line containing the change to find line number & context
              const line = doc.lineAt(fromB);
              const lineText = line.text;

              // Determine if checkbox is checked by testing for '[x]' pattern
              const checked = /\[[xX]\]/.test(lineText);
              // Emit an event for listeners with the checkbox's line number and state
              eventBus.emit("checkboxToggled", {
                lineNumber: line.number,
                checked,
                lineText
              });
            }
          });
        }
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const foundTasks: Task[] = [];
    
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
    
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const task = parseTask(line.text);
    
          if (task) {
            const indent = line.text.match(/^\s*/)?.[0] ?? "";
            const checkboxStart = line.from + indent.length + 2;
    
            const onToggle = () => {
              if (task.type === "external") {
                log.debug(`filename: ${task.filename} - line: ${task.lineNumber} - newstate: ${!task.checked}`)
                eventBus.emit("toggleCheckboxInFile", {
                  filename: task.filename,
                  lineNumber: task.lineNumber ?? line.number,
                  newState: !task.checked,
                });
              } else {
                const newChar = task.checked ? " " : "x";
                view.dispatch({
                  changes: {
                    from: checkboxStart + 1,
                    to: checkboxStart + 2,
                    insert: newChar,
                  },
                });
              }
            };
    
            // Insert the checkbox widget
            builder.add(
              checkboxStart - 2,
              checkboxStart + 3,
              Decoration.widget({
                widget: new CheckboxWidget(
                  task.checked,
                  onToggle,
                  indent,
                  view
                ),
                side: 0,
              })
            );
    
            // Track task metadata
            foundTasks.push({
              text: task.text,
              line: line.number,
              checked: task.checked,
            });
          }
    
          pos = line.to + 1;
        }
      }
    
      metadataStore.updateTasks(foundTasks);
      return builder.finish();
    }
  },
  {
    // Register the plugin’s decorations for CodeMirror to apply
    decorations: plugin => plugin.decorations
  }
);
