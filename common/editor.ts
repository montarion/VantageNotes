// yjsEditor.ts
import * as Y from "npm:yjs";
import { EditorState, Extension, StateEffect } from "npm:@codemirror/state";
import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from "npm:@codemirror/view";
import { history, defaultKeymap, indentWithTab } from "npm:@codemirror/commands";
import { yCollab } from "npm:y-codemirror.next";
import { autocompletion, closeBrackets } from "npm:@codemirror/autocomplete";
import { markdown, markdownLanguage } from "npm:@codemirror/lang-markdown";
import { languages } from "npm:@codemirror/language-data";
import { Table } from "npm:@lezer/markdown";
import {
  defaultHighlightStyle, syntaxHighlighting, indentOnInput,
  bracketMatching, syntaxTree
} from "npm:@codemirror/language";
import { ManagedDocument } from "./documentManager.ts";
import { Logger } from "./logger.ts";
import { linkClickHandler } from "../cm/delimiterFactory.ts";
import { headerHighlighter, tagHighlighter, wikilinkHighlighter, transclusionHighlighter, markdownLinkHighlighter } from "../cm/delimiters.ts";
import { runLuaScript } from "./luaVM.ts";
import { frontmatterField } from "../cm/frontmatterPlugin.ts";
import { markdownListDecorator } from "../cm/markdownListDecorator.ts";
import { markdownHeadingDecorator } from "../cm/markdownHeadingPlugin.ts";
import { luaExecutionPlugin } from "../cm/luaExecutionPlugin.ts";
import { createTransclusionField } from "../cm/transclusionPlugin.ts";
import { markdownHrDecorator } from "../cm/markdownHrDecorator.ts";

const log = new Logger({ namespace: "Editor" });

export const baseExtensions = [
  markdown({
    base: markdownLanguage.configure({
      extensions: [Table],
    }),
    codeLanguages: languages,
   }),
  autocompletion({ override: ["homepage"], activateOnTyping: true }),
  keymap.of([indentWithTab, ...defaultKeymap]),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  EditorView.lineWrapping,
  headerHighlighter,
  tagHighlighter,
  wikilinkHighlighter,
  transclusionHighlighter,
  markdownLinkHighlighter,
  luaExecutionPlugin(runLuaScript),
  markdownHeadingDecorator,
  markdownListDecorator,
  frontmatterField,
  createTransclusionField(),
  linkClickHandler,
  markdownHrDecorator,
  //clickableLinks,
];
export class YjsEditor {
  view: EditorView;
  doc: ManagedDocument;

  constructor(container: HTMLElement, doc: ManagedDocument) {
    this.doc = doc;

    const extensions: Extension[] = [
      ...baseExtensions,
      yCollab(this.doc.ytext, this.doc.provider?.awareness),

    ];

    this.view = new EditorView({
      state: EditorState.create({
        doc: this.doc.ytext.toString(),
        extensions,
      }),
      parent: container,
    });
  }

  /** Get current editor content */
  getValue(): string {
    return this.doc.ytext.toString();
  }

  /** Set editor content (updates Y.Text) */
  setValue(text: string) {
    this.doc.ydoc.transact(() => {
      this.doc.ytext.delete(0, this.doc.ytext.length);
      this.doc.ytext.insert(0, text);
    });
  }

  /** Focus editor */
  focus() {
    this.view.focus();
  }

  /** Switch to a new ManagedDocument (for tabs) */
  switchDocument(newDoc: ManagedDocument) {
    this.doc = newDoc;
  
    // Replace editor state completely
    const state = EditorState.create({
      doc: newDoc.ytext.toString(),
      extensions:[
        ...baseExtensions,
        yCollab(newDoc.ytext, newDoc.provider?.awareness),
      ],
    });
  
    this.view.setState(state);
  }

  /** Destroy editor (does not destroy Y.Doc) */
  destroy() {
    this.view.destroy();
  }
}

/**
 * Helper to create a read-only CodeMirror editor for display purposes.
 * Useful for transclusions, previews, etc.
 */
export function createReadOnlyEditor(parent: HTMLElement, content: string): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: content,
      extensions: [
        ...baseExtensions,
        EditorView.editable.of(false),      // read-only
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        history(),
        closeBrackets(),
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": {
            backgroundColor: "transparent",
            padding: "4px",
          },
        }),
      ],
    }),
    parent,
  });
}