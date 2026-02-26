import {

    EditorView,
  } from "npm:@codemirror/view";

export const clickHandler = EditorView.domEventHandlers({
    click(event, view) {
      const target = event.target as HTMLElement;
  
      if (target.dataset.action === "run-code") {
        console.log("run clicked");
        return true; // handled
      }
      if (target.closest(".cm-callout")){
        console.log("clicked callout")
      }
  
      return false;
    }
  });