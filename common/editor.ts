// editor.ts
import { Logger } from './logger.ts';
import {
  keymap, EditorView,
  rectangularSelection, crosshairCursor,
  drawSelection, dropCursor,
  highlightSpecialChars, lineNumbers, scrollPastEnd,
} from "npm:@codemirror/view";

import {
  defaultHighlightStyle, syntaxHighlighting,
  indentOnInput, bracketMatching, syntaxTree 
} from "npm:@codemirror/language";

import { defaultKeymap, history, indentWithTab } from "npm:@codemirror/commands";
import { EditorState, StateEffect, StateField, EditorSelection, Extension  } from "npm:@codemirror/state";
import { autocompletion, closeBrackets } from "npm:@codemirror/autocomplete";

import { markdown } from "npm:@codemirror/lang-markdown";
import { languages } from "npm:@codemirror/language-data";

// Yjs
import * as Y from 'npm:yjs';
import { yCollab } from 'npm:y-codemirror.next';
import { WebsocketProvider } from 'npm:y-websocket';


import { luaExecutionPlugin } from '../cm/luaExecutionPlugin.ts';
import { runLuaScript } from './luaVM.ts';
import { markdownHeadingDecorator } from '../cm/markdownHeadingPlugin.ts';
import { markdownListDecorator } from '../cm/markdownListDecorator.ts';
import { frontmatterField } from '../cm/frontmatterPlugin.ts';
import { transclusionField } from '../cm/transclusionPlugin.ts';
import { headerHighlighter, markdownLinkHighlighter, tagHighlighter, transclusionHighlighter, wikilinkHighlighter} from '../cm/delimiters.ts';
import { clickableLinks } from '../cm/clickableLinks.ts';
import { linkClickHandler } from '../cm/delimiterFactory.ts';

const log = new Logger({ namespace: 'Editor', minLevel: 'debug' });

const outsideExtensions = [
  

]
export const baseExtensions = [
  markdown({codeLanguages: languages }),
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
  transclusionField,
  linkClickHandler,
  //clickableLinks,
];


export type CreateEditorOptions = {
  parent: HTMLElement;
  doc?: string;
  extensions?: Extension[];
  editable?: boolean;
};

export function createEditorView({
  parent,
  doc = "",
  extensions = [],
  editable = true,
}: CreateEditorOptions): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      ...baseExtensions,
      ...extensions,
      EditorView.editable.of(editable),
      EditorView.theme({
        "&": { 
          height: "100%",
        },
      })
    ],
  });
  

  return new EditorView({
    state,
    parent,
  });
}

// For dynamically adding yCollab
const setYCollabEffect = StateEffect.define<Extension>();
const collabDynamicExtension = EditorState.transactionExtender.of(tr => {
  for (const e of tr.effects) {
    if (e.is(setYCollabEffect)) return { effects: StateEffect.appendConfig.of([e.value]) };
  }
  return null;
});




export type CMEditor = {
  view: EditorView;
  collab_enabled: boolean;
  setValue: (docId: string, text: string) => void;
  getValue: () => string;
  resetEditor: (text: string) => void;
  destroy: () => void;
  bindCollaboration: (docId: string, initialContent?: string) => Promise<void>;
  status: "connecting" | "connected" | "disconnected";
};

export function newEditor(container: HTMLElement, initialText = ""): CMEditor {
  log.debug("Creating new editor");
  const yjsDocs = new Map<string, { ydoc: Y.Doc; provider: WebsocketProvider }>();
  const setCollabBinding = StateEffect.define<{ ydoc: Y.Doc | null; provider: WebsocketProvider | null }>();

  const collabStateField = StateField.define<{ ydoc: Y.Doc | null; provider: WebsocketProvider | null }>({
    create() { return { ydoc: null, provider: null }; },
    update(value, tr) {
      for (const ef of tr.effects) if (ef.is(setCollabBinding)) return ef.value;
      return value;
    }
  });

  const view = createEditorView({
    parent: container,
    doc: initialText,
    extensions: [
      collabStateField,
      ...outsideExtensions,
    ],
  });

  function addYCollab(view: EditorView, ytext: Y.Text, awareness: any) {
    view.dispatch({
      effects: StateEffect.appendConfig.of([
        yCollab(ytext, awareness)
      ])
    });
  }

  
async function bindCollaboration(docId: string, initialContent = "") {
  log.debug(`Binding collaboration for docId=${docId}`);

  let ydoc: Y.Doc;
  let provider: WebsocketProvider;

  if (yjsDocs.has(docId)) {
    // reuse existing Y.Doc & provider
    ({ ydoc, provider } = yjsDocs.get(docId)!);
    log.debug(`Reusing existing Yjs provider for ${docId}`);
  } else {
    // create new Y.Doc + WebSocketProvider
    ydoc = new Y.Doc();
    provider = new WebsocketProvider(
      `ws://${location.hostname}:11625/ws`,
      docId,
      ydoc
    );
    provider.awareness.setLocalStateField("user", { id: "1", name: "!" });

    await new Promise<void>(resolve => provider.once("sync", () => resolve()));

    const ytext = ydoc.getText(docId);
    if (ytext.length === 0 && initialContent) {
      ydoc.transact(() => ytext.insert(0, initialContent));
    }

    yjsDocs.set(docId, { ydoc, provider });
  }

  const ytext = ydoc.getText(docId);

  // Attach yCollab to the editor
  view.dispatch({
    effects: StateEffect.appendConfig.of([
      yCollab(ytext, provider.awareness)
    ])
  });

  // Update collab state field
  view.dispatch({ effects: setCollabBinding.of({ ydoc, provider }) });
}
  
  
  
  

  function setValue(docId: string, text: string) {
    const { ydoc } = view.state.field(collabStateField);
    if (!ydoc) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      return;
    }
    const ytext = ydoc.getText(docId);
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, text);
    });
  }

  function resetEditor(text: string) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 } });
    view.dispatch({ effects: StateEffect.reconfigure.of([...baseExtensions, collabStateField]) });
  }

  return {
    view,
    collab_enabled: Boolean(view.state.field(collabStateField).ydoc),
    setValue,
    getValue: () => view.state.doc.toString(),
    resetEditor,
    destroy: () => {
      const { ydoc, provider } = view.state.field(collabStateField);
      if (provider) { provider.awareness.setLocalState(null); provider.destroy(); }
      if (ydoc) ydoc.destroy();
      view.destroy();
    },
    bindCollaboration,
    get status() {
      const { provider } = view.state.field(collabStateField);
      return provider?.wsconnected ? "connected" : provider?.wsconnecting ? "connecting" : "disconnected";
    }
  };
}
