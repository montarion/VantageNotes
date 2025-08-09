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
import { IndexeddbPersistence } from 'npm:y-indexeddb';

import { getUserID } from '../common/pluginhelpers.ts';

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

function createYjsCollab(docId: string, userID: string, websocketUrl: string, initialContent = "") {
  return new Promise<{ ydoc: Y.Doc; provider: WebsocketProvider; collabExtension: Extension }>(resolve => {
    const ydoc = new Y.Doc();

    // IndexedDB persistence for offline support
    const persistence = new IndexeddbPersistence(docId, ydoc);
    persistence.whenSynced.then(() => {
      console.log("✅ IndexeddbPersistence synced");

      const ytext = ydoc.getText("codemirror");

      // Insert initial content only if ytext is empty
      if (ytext.length === 0 && initialContent) {
        ytext.insert(0, initialContent);
        console.log("✅ Inserted initial content to empty Yjs doc");
      }

      // WebSocket provider for online collaboration
      const provider = new WebsocketProvider(websocketUrl, docId, ydoc);
      provider.awareness.setLocalStateField('user', { id: userID, name: userID });

      // Resolve when the websocket sync is done
      provider.once('sync', (isSynced: boolean) => {
        if (isSynced) {
          console.log("✅ WebSocket sync complete");
          resolve({
            ydoc,
            provider,
            collabExtension: yCollab(ytext, provider.awareness),
          });
        }
      });

      // Optional: Handle connection status changes
      provider.on('status', (event: { status: string }) => {
        console.log("WebSocket status:", event.status);
      });
    });
  });
}

export type CMEditor = {
  view: EditorView;
  collab_enabled: boolean;
  setValue: (code: string) => void;
  getValue: () => string;
  destroy: () => void;
  bindCollaboration: (docId: string, websocketUrl: string) => void;
};

export function newEditor(container: HTMLElement): CMEditor {
  log.debug("Creating new editor")
  const userID = getUserID();

  let ydoc: Y.Doc | null = null;
  let yjsProvider: WebsocketProvider | null = null;

  // Initial extensions WITHOUT yCollab binding
  let extensions = [
    ...baseExtensions,
    ...outsideExtensions,
    yCollabField,
    collabDynamicExtension,
  ];

  const state = EditorState.create({
    doc: "",
    extensions,
  });
  log.debug("State created")
  
  const view = new EditorView({
    state,
    parent: container,
  });
  log.debug("view created")

  
  // Dynamically bind Yjs collab to this editor instance
  async function bindCollaboration(docId: string, initialContent = "") {
    if (yjsProvider) yjsProvider.destroy();
    if (ydoc) ydoc.destroy();
  
    const websocketUrl = `ws://${location.hostname}:11625/ws`;
    const yjs = await createYjsCollab(docId, userID, websocketUrl, initialContent);
  
    ydoc = yjs.ydoc;
    yjsProvider = yjs.provider;
  
    const ytext = ydoc.getText("codemirror");
    const newDoc = ytext.toString();
  
    view.setState(EditorState.create({
      doc: newDoc,
      extensions: [
        ...baseExtensions,
        ...outsideExtensions,
        yjs.collabExtension,
        collabDynamicExtension,
      ],
    }));
  
    log.debug("✅ Collaboration bound and state preserved");
  }
  
  
  log.debug("bindcollaboration defined")

  log.debug("new editor created")

  return {
    view,
    collab_enabled: false,
    setValue: (docText: string) => {
      log.debug(ydoc);
      if (ydoc) {
        const ytext = ydoc.getText("codemirror"); 
        if (ytext.length === 0) {
          ytext.insert(0, "default");
        }
        ydoc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, docText);
        });
      } else {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: docText },
        });
      }
    },
    getValue: () => view.state.doc.toString(),
    destroy: () => {
      view.destroy();
      if (yjsProvider) yjsProvider.destroy();
      if (ydoc) ydoc.destroy();
    },
    bindCollaboration,
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
