// codeblockplugin.ts
import { WidgetType } from "npm:@codemirror/view";
import type { RenderedBlockSpec } from "./renderedblock.ts";
import { syntaxTree } from "npm:@codemirror/language";
import { HighlightStyle, tags as t, highlightTree } from "npm:@codemirror/highlight";
import { javascript } from "npm:@codemirror/lang-javascript";
import {EditorState} from "npm:@codemirror/state";
//import { blockHighlightStyle } from "../common/helpers.ts";

import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'codeblockplugin', minLevel: 'debug' });

const mapNodeTypeToClass = (nodeType: any): string => {
    if (nodeType.is("Keyword")) return "cm-keyword";
    if (nodeType.is("String")) return "cm-string";
    if (nodeType.is("StringContent")) return "cm-string"; // plain string inside template literal
    if (nodeType.is("TemplateString")) return "cm-string";
    if (nodeType.is("InterpolationStart") || nodeType.is("InterpolationEnd")) return "cm-interpolation";
    if (nodeType.is("VariableName")) return "cm-variable";
    if (nodeType.is("VariableDefinition")) return "cm-variable-def";
    if (nodeType.is("(") || nodeType.is(")")) return "cm-paren";
    if (nodeType.is("{") || nodeType.is("}")) return "cm-brace";
    if (nodeType.is(".")) return "cm-dot";
    if (nodeType.is("PropertyName")) return "cm-property";
    if (nodeType.is("function")) return "cm-function";
    if (nodeType.is("Number")) return "cm-number";
    if (nodeType.is("Comment")) return "cm-comment";
    return "";
  };
  


  export class CodeblockWidget extends WidgetType {
    constructor(
      readonly language: string,
      readonly code: string
    ) {
      super();
    }
  
    eq(other: CodeblockWidget) {
      return this.language === other.language && this.code === other.code;
    }
  
    toDOM() {
      const wrapper = document.createElement("div");
      wrapper.className = "cm-rendered-codeblock";
  
      if (this.language) {
        const langEl = document.createElement("div");
        langEl.className = "cm-rendered-codeblock-lang";
        langEl.textContent = this.language;
        wrapper.appendChild(langEl);
      }
  
      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      pre.appendChild(codeEl);
      wrapper.appendChild(pre);
  
      this.applyHighlighting(codeEl);
  
      return wrapper;
    }
  
    applyHighlighting(container: HTMLElement) {
      let parser;
      switch (this.language.toLowerCase()) {
        case "js":
        case "javascript":
          parser = javascript();
          break;
        default:
          container.textContent = this.code;
          return;
      }
  
      const state = EditorState.create({
        doc: this.code,
        extensions: [parser]
      });
  
      const tree = syntaxTree(state);
      const text = state.doc.toString();
  
      container.innerHTML = "";
      const pos = { value: 0 };
  
      // Walk the syntax tree manually
      this.renderNode(tree.topNode, text, container, pos);
  
      // Append trailing whitespace
      if (pos.value < text.length) {
        container.appendChild(
          document.createTextNode(text.slice(pos.value))
        );
      }
    }
  
    renderNode(
      node: any,
      text: string,
      parent: HTMLElement,
      pos: { value: number }
    ) {
      // Recurse first for non-leaf nodes
      if (node.firstChild) {
        let child = node.firstChild;
        while (child) {
          this.renderNode(child, text, parent, pos);
          child = child.nextSibling;
        }
        return;
      }
  
      // Leaf node: emit whitespace before token
      if (node.from > pos.value) {
        parent.appendChild(
          document.createTextNode(text.slice(pos.value, node.from))
        );
      }
  
      const span = document.createElement("span");
      span.textContent = text.slice(node.from, node.to);
  
      // Manual class mapping
      log.debug(node.type)
      span.className = mapNodeTypeToClass(node.type)
  
      parent.appendChild(span);
      pos.value = node.to; // advance cursor
    }
  
    ignoreEvent() {
      return false;
    }
  }
  





  export const codeblockRenderer: RenderedBlockSpec = {
    detect(state, lineNo) {
      const doc = state.doc;
      const line = doc.line(lineNo);
  
      // detect code block opening
      const open = line.text.match(/^```(\w+)?$/);
      if (!open) return null;
  
      const language = open[1] ?? "";
      let code = "";
      let endLine = lineNo;
  
      for (let i = lineNo + 1; i <= doc.lines; i++) {
        const l = doc.line(i);
        if (l.text.startsWith("```")) {
          endLine = i;
          break;
        }
        code += l.text + "\n";
      }
  
      const from = line.from;
      const to = doc.line(endLine).to;
  
      // --- NEW: check if cursor is inside this block ---
      const sel = state.selection.main;
      if (sel.head >= from && sel.head <= to) {
        // cursor is inside the code block, don't render the widget
        return null;
      }
  
      // Otherwise, render the widget as usual
      return {
        from,
        to,
        widget: new CodeblockWidget(language, code.replace(/\n$/, ""))
      };
    }
  };
  

