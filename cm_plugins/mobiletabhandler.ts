import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    keymap
  } from "npm:@codemirror/view";
  import { EditorState, Extension } from "npm:@codemirror/state";
  
export const doubleSpaceTabHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== " ") return false;
  
    const line = view.state.doc.lineAt(from);
    const beforeCursor = line.text.slice(0, from - line.from);
    const fullLine = line.text;
  
    // Match a list item with any leading space followed by "- [ ]" or "- [x]"
    const listItemMatch = /^(\s*)([-*]) \[([ xX])\]/.exec(fullLine);
    if (!listItemMatch) return false;
  
    // Check if we just typed the second space after the list item (e.g. "- [ ]  ")
    if (!beforeCursor.endsWith("  ")) return false;
  
    const [_, currentIndent, marker, checkState] = listItemMatch;
    const cleanLine = fullLine.trimStart();
  
    // Replace current indent with one more tab
    const insertPos = line.from;
    const newLine = "\t" + cleanLine;
  
    view.dispatch({
      changes: {
        from: insertPos,
        to: line.to,
        insert: newLine
      }
    });
  
    return true;
  });