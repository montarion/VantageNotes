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
  crosshairCursor, lineNumbers, highlightActiveLineGutter,drawSelection,
  dropCursor,
  highlightSpecialChars
} from "npm:@codemirror/view@6.36.3"

// Language-related features
import {
  defaultHighlightStyle, syntaxHighlighting, indentOnInput,
  bracketMatching, foldGutter, foldKeymap
} from "npm:@codemirror/language"

// Editing history and keymaps
import {
  defaultKeymap, history, historyKeymap
} from "npm:@codemirror/commands"

// Search functionality
import {
  searchKeymap, highlightSelectionMatches
} from "npm:@codemirror/search"

// Autocomplete and bracket closing
import {
  autocompletion, completionKeymap, closeBrackets,
  closeBracketsKeymap
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
import { testHighlightPlugin } from '../cm_plugins/highlight.ts';

// Import tab management functions
import { getActiveTab, openEditorTab, switchToTab } from "./tabs.ts";

const EDITOR_PANE_ID = "main"; // Your main editor pane id

// Editor configuration state
let filename = "test";
let saveTimeout;

const log = new Logger({ namespace: 'Editor', minLevel: 'debug' });

// Extensions that are injected dynamically or from outside
export const outsideExtensions = [
  transclusionActiveField,
  createAutoSavePlugin(saveFile, 500),
]

// Main set of editor extensions, plugins and UI features
export const extensions = [
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
  EditorView.theme({
    "&": { height: "100%" }
  }),

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
  EditorView.lineWrapping,
]

// Singleton CodeMirror instance
let editorView: EditorView | null = null;

/**
 * Creates a new CodeMirror EditorView instance (stateless helper).
 * @param content - Initial text content.
 * @param parent - DOM node to mount editor.
 */
//export function newEditorView(content: String, parent:Element){
//  return new EditorView({
//    doc: content,
//    extensions: [
//      ...extensions,
//      ...outsideExtensions
//    ],
//    parent: parent,
//  });
//}

/**
 * Creates (or reuses) a CodeMirror editor instance and returns the view object.
 * @param docText - the document text to load into the editor
 * @param targetElement - DOM element to mount the editor into
 * @returns {EditorView | null}
 */
export function newEditor(
  docText: string,
  targetElement: Element = document.createElement("div")
): EditorView {

  //if (editorView) {
  //  editorView.setState(EditorState.create({
  //    doc: docText,
  //    extensions: [...extensions, ...outsideExtensions],
  //  }));
  //  // Move editor DOM if needed
  //  if (editorView.dom.parentElement !== targetElement) {
  //    targetElement.innerHTML = "";
  //    targetElement.appendChild(editorView.dom);
  //  }
  //  return editorView;
  //}
  // Create a new editor instance
  targetElement.innerHTML = "";
  editorView = new EditorView({
    state: EditorState.create({
      doc: docText,
      extensions: [...extensions, ...outsideExtensions],
    }),
    parent: targetElement,
  });
  log.debug(editorView)
  return editorView;
}

/**
 * Opens the currently active editor tab or opens the specified filename in the editor pane.
 * If no active tab exists and no filename is specified, opens the default "todo" file.
 * @param filename Optional filename to open
 */
export async function openActiveEditorTab(filename?: string) {
  if (filename) {
    await openEditorTab(EDITOR_PANE_ID, filename);
    return;
  }

  const activeTab = getActiveTab(EDITOR_PANE_ID);
  if (activeTab) {
    switchToTab(EDITOR_PANE_ID, activeTab.id);
  } else {
    await openEditorTab(EDITOR_PANE_ID, "todo");
  }
}
