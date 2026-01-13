// yjsEditor.ts
import * as Y from "npm:yjs";
import { EditorState, Extension } from "npm:@codemirror/state";
import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor } from "npm:@codemirror/view";
import { history, defaultKeymap, indentWithTab } from "npm:@codemirror/commands";
import { yCollab } from "npm:y-codemirror.next";
import { WebsocketProvider } from "npm:y-websocket";
import { autocompletion, closeBrackets } from "npm:@codemirror/autocomplete";
import { markdown } from "npm:@codemirror/lang-markdown";
import { languages } from "npm:@codemirror/language-data";

export class YjsEditor {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: WebsocketProvider;
  filename: string;

  constructor(container: HTMLElement) {
    // Use current path as filename
    this.filename = window.location.pathname.slice(1) || "homepage";

    // Create Y.Doc and Y.Text
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText(this.filename);

    // Set up WebSocket provider
    const wsUrl = `ws://${window.location.hostname}:11625/ws`;
    this.provider = new WebsocketProvider(wsUrl, this.filename, this.ydoc);
    this.provider.awareness.setLocalStateField("user", { name: "User" });
    console.log(EditorState === (yCollab as any).EditorState);
    // Create the CodeMirror editor
    this.view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          yCollab(this.ytext, this.provider.awareness),
        ],
      }),
      parent: container,
    });
  }

  // Load initial content from server
  async loadFromServer() {
    const url = `/notes/${this.filename}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      const text = await res.text();
  
      // Only apply server text if the local Y.Text is empty
      this.provider.once("sync", () => {
        if (this.ytext.length === 0) {
          this.ydoc.transact(() => this.ytext.insert(0, text));
        }
      });
    } catch (err) {
      console.error("Error loading file:", err);
    }
  }

  getValue(): string {
    return this.ytext.toString();
  }

  setValue(text: string) {
    this.ydoc.transact(() => {
      this.ytext.delete(0, this.ytext.length);
      this.ytext.insert(0, text);
    });
  }

  destroy() {
    this.provider.destroy();
    this.view.destroy();
    this.ydoc.destroy();
  }
}
