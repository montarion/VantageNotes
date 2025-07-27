// collaboration.ts
import { EditorView, ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { collab, receiveUpdates, sendableUpdates, getSyncedVersion } from "npm:@codemirror/collab";
import { Extension,Annotation, ChangeSet, Text } from "npm:@codemirror/state";
import { Logger } from "../common/logger.ts";
const log = new Logger({ namespace: "Collaboration", minLevel: "debug" });
import { sendUpdates } from "../common/websockets.ts";
import { lsGet, lsSet } from "../common/pluginhelpers.ts";

export const userEvent = Annotation.define<string>();

let activeDocId: string = "";

export function setActiveDocId(id: string) {
  activeDocId = id;
}

export function getActiveDocId(): string {
  return activeDocId;
}

export function setDocumentMode(id: string, mode:string) {
  
  let modes = lsGet("documentmodes") || {}
  modes[id] = mode
  lsSet("documentmodes", modes)
}

export function getDocumentMode(id: string): string {
  return lsGet("documentmodes")[id] || "single"
  
}

// Plugin: watches for doc changes and sends updates to server
export const collabPlugin = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {}

  update(update: ViewUpdate) {
    if (!(update.docChanged || update.selectionSet)) return;

    if (getDocumentMode(getActiveDocId()) != "collaborative") return; // not doing anything collaborative 
  

    const version = getSyncedVersion(update.state);
    const sendable = sendableUpdates(update.state);

    const docId = getActiveDocId(); // 🔥 dynamic tracking

    if (sendable && sendable.length > 0) {
      let realupdates = sendable.map((u) => ({
        clientID: u.clientID,
        changes: u.changes
      }))
      log.warn("realupdates", realupdates)
      
      log.debug(`Detected updates to ${docId} at version ${version}`);
      sendUpdates(
        docId,
        realupdates,
        version
      );
    }
  }
});

/**
 * Call this during editor setup to enable collaborative editing.
 */
export function createCollabExtensions(startVersion: number, clientID: string): Extension[] {
  return [
    collab({ startVersion, clientID }),
    collabPlugin
  ];
}

/**
 * Applies updates received from the server to the editor.
 */
export function applyServerUpdates(view: EditorView,
  updates: { clientID: string; changes: any }[],
  version: number
) {
  log.debug("Applying updates", updates)
  const deserialized = updates.map((u) => ({
    clientID: u.clientID,
    changes: ChangeSet.fromJSON(u.changes, view.state.doc)//, Text.of(view.state.doc.toString().split("\n")))
  }));
  log.warn("deserialized:", deserialized)
  const tr = receiveUpdates(view.state, deserialized, version);
  view.dispatch(tr);
}
