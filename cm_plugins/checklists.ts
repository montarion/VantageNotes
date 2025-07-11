import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";
import { eventBus } from "../common/events.ts";
import { isRangeSelected, ZeroWidthWidget } from "../common/pluginhelpers.ts";
import { metadataStore, Task } from "./metadata.ts";
import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'Checklists', minLevel: 'debug' });
// Regex to match checklist items with optional indent, checkbox, and task text
const checklistRegex = /^(\s*)[-*] \[([ xX])\] (.*)$/;

class CheckboxWidget extends WidgetType {
  checked: boolean;
  onToggle: () => void;
  indent: string;
  view: EditorView;

  constructor(
    checked: boolean,
    onToggle: () => void,
    indent: string,
    view: EditorView
  ) {
    super();
    this.checked = checked;
    this.onToggle = onToggle;
    this.indent = indent;
    this.view = view;
  }

  toDOM() {
    const label = document.createElement("label");
  label.style.display = "inline-block";
  label.style.cursor = "pointer";
  label.style.userSelect = "auto";
  label.style.padding = "3px"; // 🔸 Make clickable area larger
    label.style.margin = "-2px";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = this.checked;
  box.style.marginLeft = this.indent.length + "ch";
  box.style.pointerEvents = "auto"; // Just in case

  box.onmousedown = (e) => {
    e.preventDefault(); // Avoid CodeMirror stealing focus
    this.onToggle();
  };

  label.appendChild(box);
  return label;
  }

  // Capture events before editor swallows them
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

      // Iterate over all visible ranges (viewport) in the editor for efficiency
      for (const { from, to } of view.visibleRanges) {
        let pos = from;

        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);

          // Match checklist regex for lines like "- [ ] task text"
          const match = checklistRegex.exec(line.text);

          if (match) {
            const [_, indent, boxState] = match;       // Capture indent and checkbox state
            const checked = boxState.toLowerCase() === "x"; // Checkbox is checked if 'x'
            const checkboxStart = line.from + indent.length + 2; // Position of '[' char
            const taskText = line.text.substr(6);      // Task text always starts at char 6

            // Define toggle function to update the checkbox in the document
            const onToggle = () => {
              const newChar = checked ? " " : "x";     // Toggle character inside brackets
              log.debug("UPDATING TOGGLE");
              // Dispatch a transaction to replace the checkbox state in the doc
              view.dispatch({
                changes: {
                  from: checkboxStart + 1,  // Position inside the brackets (the ' ' or 'x')
                  to: checkboxStart + 2,
                  insert: newChar
                }
              });
            };
            //if (!isRangeSelected(view, checkboxStart - 2, checkboxStart + 3)){

              // Add the checkbox widget decoration at the checkbox position
              builder.add(
                checkboxStart - 2, // Go back to the "-" so you replace the entirety of "- [ ]"
                checkboxStart + 3, // The length of "[ ]" or "[x]"
                Decoration.widget({
                  widget: new CheckboxWidget(checked, onToggle, indent, view),
                  side: 0,
                })
              );

            //}
            // Replace the original "[ ]" or "[x]" text with a zero-width widget to hide it
            //builder.add(
            //  checkboxStart,
            //  checkboxStart + 3,
            //  Decoration.replace({ widget: new ZeroWidthWidget() })
            //);

            // Collect task metadata for external use (e.g., UI, syncing)
            foundTasks.push({ text: taskText, line: line.number, checked });
          }

          // Move to next line after current one
          pos = line.to + 1;
        }
      }

      // Update the metadata store with the latest tasks found in the viewport
      metadataStore.updateTasks(foundTasks);

      // Return all decorations as a DecorationSet to be applied by CodeMirror
      return builder.finish();
    }
  },
  {
    // Register the plugin’s decorations for CodeMirror to apply
    decorations: plugin => plugin.decorations
  }
);
