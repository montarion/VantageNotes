//infobar.ts
import {
    ViewPlugin, Decoration, DecorationSet, WidgetType, EditorView, ViewUpdate
  } from "@codemirror/view";
import {EditorState} from "npm:@codemirror/state"
import {showPanel, getPanel} from "npm:@codemirror/view"
import { getActivePane, getPane } from "../common/pane.ts";
import { Logger } from '../common/logger.ts';

const log = new Logger({ namespace: 'Infobar', minLevel: 'debug' });

function infoBarPanel(view) {
    let dom = document.createElement("div")
    dom.className = "cm-infobar"
    //dom.textContent = "Connecting…"  // initial text
  
    return {
      dom,
      // Optionally, update contents on editor changes:
      update(update) {
        let doc = update.state.doc
        let cursorPos = update.state.selection.main.head
        let line = doc.lineAt(cursorPos)
        let infostring = `Words: ${countWords(doc.toString())} | 
        Line ${line.number}, Col ${cursorPos - line.from + 1} | 
        ${getConnectionStatus()}`
        dom.textContent = infostring
        log.warn(infostring)
      }
    }
  }
  
  function countWords(text) {
    return (text.match(/\b\w+\b/g) || []).length
  }
  function getConnectionStatus(): string{
    return getPane(getActivePane()).editorInstance?.status
  }

export const infoBarExtension = showPanel.of(infoBarPanel)

