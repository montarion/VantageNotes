// editor.ts
// This module sets up a CodeMirror 6 editor instance with a collection of plugins/extensions.
// It includes custom Markdown enhancements, autosaving, and UI features like transclusions,
// checklists, folding, syntax highlighting, and autocomplete.

// Logging utility
import { Logger } from './logger.ts';

// Core CodeMirror view components
import {
  keymap, EditorView,
  highlightActiveLine, rectangularSelection,
  crosshairCursor, lineNumbers,drawSelection,
  dropCursor,
  highlightSpecialChars
} from "npm:@codemirror/view"

// Language-related features
import {
  defaultHighlightStyle, syntaxHighlighting, indentOnInput,
  bracketMatching
} from "npm:@codemirror/language"

// Editing history and keymaps
import {
  defaultKeymap, history, indentWithTab
} from "npm:@codemirror/commands"

// Search functionality
import {
  highlightSelectionMatches
} from "npm:@codemirror/search"

// Autocomplete and bracket closing
import {
  autocompletion, closeBrackets
} from "npm:@codemirror/autocomplete"

import { EditorState } from "npm:@codemirror/state";

// File saving and content loading
import { saveFile } from "./navigation.ts"

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
import { createAutoSavePlugin } from "../cm_plugins/autosave.ts";
import { wikilinkPlugin } from "../cm_plugins/wikilinks.ts";
import { hyperlinkPlugin } from "../cm_plugins/hyperlinks.ts";
import { transclusionPlugin, transclusionActiveField} from "../cm_plugins/transclusions.ts";

// Import tab management functions
import { getActiveTab, openEditorTab, switchToTab } from "./tabs.ts";
import { SlashCommandPlugin, slashMenuKeymap } from '../cm_plugins/slashcommands.ts';
import { fileLinkCompletions } from '../cm_plugins/autocomplete.ts';
import { tabDropToTransclusion } from '../cm_plugins/tabdropTransclusion.ts';
// collaboration functions
import { collabPlugin, setActiveDocId, setDocumentMode } from '../cm_plugins/collaboration.ts';
import { collab } from "npm:@codemirror/collab";
import { Text } from "npm:@codemirror/state";

import { getUserID} from './websockets.ts';
import { getPaneByDocID } from './pane.ts';
import { pendingUpdatesPlugin } from '../cm_plugins/pendingtext.ts';

const EDITOR_PANE_ID = "main"; // Your main editor pane id



const log = new Logger({ namespace: 'Editor', minLevel: 'debug' });

// Extensions that are injected dynamically or from outside
export const outsideExtensions = [
  transclusionActiveField,
  
]

// Main set of editor extensions, plugins and UI features
export const extensions = [
  SlashCommandPlugin,
  slashMenuKeymap,
  markdown({codeLanguages: languages}),
  tagPlugin,
  headers,
  lists,
  checklistPlugin,
  decorateCodeblockLinesPlugin,
  decorateQuoteBlocksPlugin,
  inlineCodePlugin,
  wikilinkPlugin,
  hyperlinkPlugin,
  transclusionPlugin,
  tabDropToTransclusion,
  autocompletion({ override: [fileLinkCompletions], activateOnTyping: true }),
  EditorView.theme({
    "&": { height: "100%" }
  }),
  keymap.of([
    indentWithTab,         // Enable Tab to indent
    ...defaultKeymap       // All standard shortcuts
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
]

// Singleton CodeMirror instance
let editorView: EditorView | null = null;

type CMEditor = {
  view: EditorView;
  collab_enabled: boolean;
  setValue: (code: string) => void;
  getValue: () => string;
  destroy: () => void;
  enableCollab: (version: number) => void;
};
/**
 * Creates (or reuses) a CodeMirror editor instance and returns the view object.
 * @param container - DOM element to mount the editor into
 * @returns {EditorView | null}
 */
/*
export function newEditor(container: HTMLElement, options?: { startVersion?: number, collabMode?: boolean }): CMEditor {
  const userID = getUserID()
  let startVersion = 0;
  if (options?.startVersion){
    startVersion = options.startVersion
  }

  
  const state = EditorState.create({
    doc: "",
    extensions: [
      collab({ startVersion, clientID:userID }),
      collabPlugin,
      ...extensions,
      ...outsideExtensions
    ]
  });

  const view = new EditorView({
    state,
    parent: container    
  });
  
  return {
    view,
    setValue: (docText: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: docText }
      });
    },
    getValue: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}
*/

export function newEditor(container: HTMLElement, options?: { startVersion?: number, collabMode?: boolean }): CMEditor {
  const userID = getUserID();
  let collab_enabled = false;

  let baseExtensions = [
    ...extensions,
    ...outsideExtensions
  ];

  if (options?.collabMode && options.startVersion != null) {
    baseExtensions = [
      collab({ startVersion: options.startVersion, clientID: userID }),
      collabPlugin,
      ...baseExtensions
    ];
  } else {
    baseExtensions = [
      createAutoSavePlugin(saveFile, 500),
      ...baseExtensions
    ];
  }

  const state = EditorState.create({
    doc: "",
    extensions: baseExtensions
  });

  const view = new EditorView({
    state,
    parent: container
  });

  function enableCollab(startVersion: number) {
    
    if (this.collab_enabled == false){ 
      log.debug("Enabling collaboration mode")
      const newState = EditorState.create({
        doc: view.state.doc,
        extensions: [
          collab({ startVersion, clientID: userID }),
          collabPlugin,
          pendingUpdatesPlugin,
          ...extensions,
          ...outsideExtensions
        ]
      });
      view.setState(newState);
      this.collab_enabled = true
    } else {
      log.debug("not enabling collaboration mode, already enabled.")
    }
  }

  return {
    view,
    collab_enabled: false,
    setValue: (docText: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: docText }
      });
    },
    getValue: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
    enableCollab,
  };
}

/**
 * Opens the currently active editor tab or opens the specified filename in the editor pane.
 * If no active tab exists and no filename is specified, opens the default "todo" file.
 * @param filename Optional filename to open
 */
export async function openActiveEditorTab(filename?: string) {
  if (filename) {
    await openEditorTab({paneId:EDITOR_PANE_ID, filename});
    return;
  }

  const activeTab = getActiveTab();
  if (activeTab) {
    switchToTab(EDITOR_PANE_ID, activeTab.id);
  } else {
    await openEditorTab({paneId:EDITOR_PANE_ID, filename:"todo"});
  }
}

export function resetEditorStateFromServerInit(
  docId: string,
  docText: string,
  version: number,
  mode: string
) {
  const pane = getPaneByDocID(docId);
  const view = pane?.editorInstance.view;

  if (!view) {
    console.error("❌ No editor view found for doc", docId);
    return;
  }
  log.debug("here")
  const clientID = getUserID();
  const newText = Text.of(docText.split("\n"));

  const newState = EditorState.create({
    doc: newText,
    extensions: [
      collab({ startVersion: version, clientID }),
      collabPlugin,
      ...extensions,
      ...outsideExtensions,
    ],
  });

  view.setState(newState);

  setActiveDocId(docId);
  setDocumentMode(docId, mode);

  console.debug(`✅ Reset editor state for doc ${docId} at version ${version}`);
}
