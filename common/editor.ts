// editor.ts
// CodeMirror 6 editor setup with Yjs-based collaboration integration.

// Logging utility
import { Logger } from './logger.ts';

// Core CodeMirror view components
import {
  keymap, EditorView,
  highlightActiveLine, rectangularSelection,
  crosshairCursor, lineNumbers, drawSelection,
  dropCursor,
  highlightSpecialChars
} from "npm:@codemirror/view";

// Language-related features
import {
  defaultHighlightStyle, syntaxHighlighting, indentOnInput,
  bracketMatching
} from "npm:@codemirror/language";

// Editing history and keymaps
import {
  defaultKeymap, history, indentWithTab
} from "npm:@codemirror/commands";

// Search functionality
import {
  highlightSelectionMatches
} from "npm:@codemirror/search";

// Autocomplete and bracket closing
import {
  autocompletion, closeBrackets
} from "npm:@codemirror/autocomplete";

import { EditorState, StateEffect, Extension, StateField } from "npm:@codemirror/state";



// Language setup
import { markdown } from "npm:@codemirror/lang-markdown";
import { languages } from "npm:@codemirror/language-data";

// Custom CM plugins
import { tagPlugin } from "../cm_plugins/hashtag.ts";
import { headers } from "../cm_plugins/headers.ts";
import { lists } from "../cm_plugins/lists.ts";
import { checklistPlugin } from "../cm_plugins/checklists.ts";
import { decorateCodeblockLinesPlugin } from "../cm_plugins/codeblocks.ts";
import { decorateQuoteBlocksPlugin } from "../cm_plugins/quotes.ts";
import { inlineCodePlugin } from "../cm_plugins/inlinecode.ts";
import { wikilinkPlugin } from "../cm_plugins/wikilinks.ts";
import { hyperlinkPlugin, pasteLinkOnSelection } from "../cm_plugins/hyperlinks.ts";
import { transclusionPlugin, transclusionActiveField } from "../cm_plugins/transclusions.ts";

// Import tab management functions
import { getActiveTab, openEditorTab, switchToTab } from "./tabs.ts";
import { SlashCommandPlugin, slashMenuKeymap } from '../cm_plugins/slashcommands.ts';
import { fileLinkCompletions } from '../cm_plugins/autocomplete.ts';
import { tabDropToTransclusion } from '../cm_plugins/tabdropTransclusion.ts';

// Yjs and Yjs-Codemirror integration
import * as Y from 'npm:yjs';
import { yCollab } from 'npm:y-codemirror.next';
import { WebsocketProvider } from 'npm:y-websocket';

import { getUserID } from '../common/pluginhelpers.ts';
import { loadFile } from './navigation.ts';
import { updateBreadcrumb } from './topbar.ts';
import { registerJsRunner } from '../cm_plugins/jsworker.ts';
import { htmlOutputField, htmlOutputPerBlockPlugin } from '../cm_plugins/htmlOutputPlugin.ts';
const EDITOR_PANE_ID = "main"; // Your main editor pane id

const log = new Logger({ namespace: 'Editor', minLevel: 'debug' });

// Extensions that are injected dynamically or from outside
export const outsideExtensions = [
  transclusionActiveField,
];
// Main set of editor extensions, plugins and UI features (non-collab)
export const baseExtensions = [
  SlashCommandPlugin,
  slashMenuKeymap,
  markdown({ codeLanguages: languages }),
  tagPlugin,
  headers,
  lists,
  checklistPlugin,
  decorateCodeblockLinesPlugin,
  decorateQuoteBlocksPlugin,
  inlineCodePlugin,
  wikilinkPlugin,
  hyperlinkPlugin,
  pasteLinkOnSelection,
  transclusionPlugin,
  tabDropToTransclusion,
  autocompletion({ override: [fileLinkCompletions], activateOnTyping: true }),
  EditorView.theme({
    "&": { height: "100%" }
  }),
  keymap.of([
    indentWithTab,
    ...defaultKeymap,
  ]),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  lineNumbers(),
  EditorView.lineWrapping,
  htmlOutputField,
  htmlOutputPerBlockPlugin
  
];

// A StateEffect to reconfigure the Yjs collab binding dynamically
const setYCollabEffect = StateEffect.define<Extension>();
const collabDynamicExtension = EditorState.transactionExtender.of(tr => {
  for (let e of tr.effects) {
    if (e.is(setYCollabEffect)) {
      return { effects: StateEffect.appendConfig.of([e.value]) };
    }
  }
  return null;
});
// A StateField holding the current yCollab extension, default none
const yCollabField = StateField.define<Extension>({
  create() {
    return [];
  },
  update(value, tr) {
    for (let e of tr.effects) {
      if (e.is(setYCollabEffect)) {
        return e.value;
      }
    }
    return value;
  },
  
});


async function getOrCreateYjsDoc(docId: string, initialContent: string) {
  const websocketUrl = `ws://${location.hostname}:11625/ws`;
  return await createYjsCollab(docId, getUserID(), websocketUrl, initialContent);
}

function createYjsCollab(docId: string, userID: string, websocketUrl: string) {
  return new Promise<{ ydoc: Y.Doc; provider: WebsocketProvider; collabExtension: Extension }>(resolve => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(docId);

    const provider = new WebsocketProvider(websocketUrl, docId, ydoc);
    provider.awareness.setLocalStateField("user", { id: userID, name: userID });

    provider.once("sync", (isSynced: boolean) => {
      console.log("✅ WebSocket sync complete");
      resolve({
        ydoc,
        provider,
        collabExtension: yCollab(ytext, provider.awareness),
      });
    });

    provider.on("status", (event: { status: string }) => {
      console.log("WebSocket status:", event.status);
    });
  });
}


export type CMEditor = {
  view: EditorView;
  collab_enabled: boolean;
  setValue: (docId: string, code: string) => void;
  getValue: () => string;
  destroy: () => void;
  bindCollaboration: (docId: string, websocketUrl: string) => void;
  getInstance: () => void;
};

export function newEditor(container: HTMLElement): CMEditor {
  log.debug("Creating new editor");
  //container.innerHTML = ""

  // StateEffect and StateField scoped per editor instance
  const setCollabBinding = StateEffect.define<{ ydoc: Y.Doc | null; provider: WebsocketProvider | null }>();

  const collabStateField = StateField.define<{ ydoc: Y.Doc | null; provider: WebsocketProvider | null }>({
    create() {
      return { ydoc: null, provider: null };
    },
    update(value, tr) {
      for (let ef of tr.effects) {
        if (ef.is(setCollabBinding)) return ef.value;
      }
      return value;
    }
  });

  // Create initial editor state without collab binding
  const state = EditorState.create({
    doc: "",
    extensions: [
      ...baseExtensions,
      ...outsideExtensions,
      collabStateField
    ]
  });

  const view = new EditorView({
    state,
    parent: container
  });

  async function bindCollaboration(docId: string, initialContent = "") {
    log.debug(`Binding collaboration for docId=${docId}`);

    // Clean up old provider and Y.Doc if any
    const oldBinding = view.state.field(collabStateField, false);
    if (oldBinding?.provider) {
      log.debug("Destroying old provider");
      oldBinding.provider.awareness.setLocalState(null);
      oldBinding.provider.destroy();
    }
    if (oldBinding?.ydoc) {
      oldBinding.ydoc.destroy();
    }

    // Create new Y.Doc and provider
    const websocketUrl = `ws://${location.hostname}:11625/ws`;
    const ydoc = new Y.Doc();

    updateBreadcrumb(docId);

    const provider = new WebsocketProvider(websocketUrl, docId, ydoc);
    provider.awareness.setLocalStateField("user", {
      id: getUserID(),
      name: getUserID(),
    });

    provider.on("status", e => log.debug(`[WS ${docId}] status: ${e.status}`));

    await new Promise<void>(resolve => provider.once("sync", () => resolve()));

    // Load initial content if Y.Text is empty
    const ytext = ydoc.getText(docId);
    if (ytext.length === 0) {
      initialContent = await loadFile(docId);
      if (initialContent) ytext.insert(0, initialContent);
    }

    // Rebuild editor state with yCollab
    view.setState(EditorState.create({
      doc: ytext.toString(),
      extensions: [
        ...baseExtensions,
        ...outsideExtensions,
        yCollab(ytext, provider.awareness),
        collabDynamicExtension,
        collabStateField,
        //jsRunner()
      ]
    }));

    // Track new binding for cleanup
    view.dispatch({ effects: setCollabBinding.of({ ydoc, provider }) });

    registerJsRunner(view);
  }

  function updateFromServer(newText: string) {
    const { ydoc } = view.state.field(collabStateField);
    if (!ydoc) {
      log.debug("No Y.Doc bound; cannot update from server");
      return;
    }
    const ytext = ydoc.getText(docId);
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, newText);
    });
    log.debug("Updated editor content from server push");
  }

  return {
    view,
    collab_enabled: Boolean(view.state.field(collabStateField).ydoc),
    setValue: (docId: string, docText: string) => {
      const { ydoc } = view.state.field(collabStateField);
      if (!ydoc) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: docText }
        });
        return;
      }
      const ytext = ydoc.getText(docId);
      ydoc.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, docText);
      });
    },
    getValue: () => view.state.doc.toString(),
    destroy: () => {
      const { ydoc, provider } = view.state.field(collabStateField);
      if (provider) {
        provider.awareness.setLocalState(null);
        provider.destroy();
      }
      if (ydoc) ydoc.destroy();
      view.destroy();
    },
    bindCollaboration,
    updateFromServer,
  };
}




/**
 * Opens the currently active editor tab or opens the specified filename in the editor pane.
 * If no active tab exists and no filename is specified, opens the default "todo" file.
 * @param filename Optional filename to open
 */
export async function openActiveEditorTab(filename?: string) {
  if (filename) {
    await openEditorTab({ paneId: EDITOR_PANE_ID, filename });
    return;
  }

  const activeTab = getActiveTab();
  if (activeTab) {
    switchToTab(EDITOR_PANE_ID, activeTab.id);
  } else {
    await openEditorTab({ paneId: EDITOR_PANE_ID, filename: "todo" });
  }
}
