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


export function lsSet(key, value){
  if (!Object.keys(localStorage).includes(key)){
    log.warn(`${key} was not yet in localstorage, now added.`)
    localStorage.setItem(key, JSON.stringify({}))

  }
  log.debug("Value is: ", value)
  localStorage.setItem(key, JSON.stringify(value))
}

export function lsGet(key){
  if (Object.keys(localStorage).includes(key)){
    return JSON.parse(localStorage.getItem(key))
  }
  return null
}

export function generateClientUpdateID(): string {
  return "update-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
}


/**
 * Util: Get current user ID (persistent)
 */
export function getUserID(): string {
  let id = localStorage.getItem("USERID");
  if (!id) {
    id = shortUUID(6);
    localStorage.setItem("USERID", id);
  }
  return id;
}