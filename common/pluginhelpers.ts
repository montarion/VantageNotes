import { EditorView, WidgetType} from "npm:@codemirror/view";
import { v4 as uuidv4 } from 'npm:uuid';
import { Logger } from "./logger.ts";
const log = new Logger({ namespace: "Pluginhelpers", minLevel: "debug" });

export function isRangeSelected(view: EditorView, from: number, to: number): boolean {
    // disables decoration on selection.
    // Usage: if (!isRangeSelected(view, from, to)){
    //  [builder.add(...) / decoration code]
    //}
  return view.state.selection.ranges.some(range => {
    return (
      (range.empty && range.from >= from && range.from <= to) || // cursor inside
      (!range.empty && !(range.to <= from || range.from >= to))  // overlaps
    );
  });
}

export function shortUUID(length: number = 4): string {
  return uuidv4().replace("-", "").slice(0,length) 
}

export class ZeroWidthWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.style.width = "0px";
    return span;
  }
}
