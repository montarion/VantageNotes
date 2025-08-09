// collaboration.ts
import { EditorView, ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { collab, receiveUpdates, sendableUpdates, getSyncedVersion } from "npm:@codemirror/collab";
import { Extension,Annotation, ChangeSet, Text } from "npm:@codemirror/state";
import { Logger } from "../common/logger.ts";
const log = new Logger({ namespace: "Collaboration plugin", minLevel: "debug" });
import { generateClientUpdateID, lsGet, lsSet } from "../common/pluginhelpers.ts";
import { getPaneByDocID } from "../common/pane.ts";
import { addPendingUpdateFromChangeSet, confirmPendingUpdate, pendingUpdateAnnotation } from "./pendingtext.ts";

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
  let modes = lsGet("documentmodes") || {}
  return modes[id] || "single"
  
}



export function sendUpdatesToServer() {
  const docId = getActiveDocId();
  const view = getPaneByDocID(docId)?.editorInstance.view;
  if (!view) return;

  const version = getSyncedVersion(view.state);
  const sendable = sendableUpdates(view.state);

  log.warn(sendable);

  if (sendable && sendable.length > 0) {
    const realupdates = sendable.map((u) => {
      const id = generateClientUpdateID();

      
      addPendingUpdateFromChangeSet(id, u.changes);
      

      

      return {
        clientID: u.clientID,
        changes: u.changes,
      };
    });

    log.warn("realupdates", realupdates);
    log.debug(`🚀 Sending updates for ${docId} at version ${version}`);
    //sendUpdates(docId, realupdates);
  }
}

// Plugin: watches for doc changes and sends updates to server
export const collabPlugin = ViewPlugin.fromClass(
  class {
    private debounceTimer: number | null = null;
    private maxWaitTimer: number | null = null;
    private readonly debounceDelay = 10;
    private readonly maxWaitDelay = this.debounceDelay*10;

    constructor(private readonly view: EditorView) {}

    update(update: ViewUpdate) {
      if (!(update.docChanged || update.selectionSet)) return;
      log.debug("triggered")
      log.debug(getDocumentMode(getActiveDocId()))
      if (getDocumentMode(getActiveDocId()) !== "collaborative") return;
      this.scheduleUpdate();
    }

    scheduleUpdate() {
      // Clear previous debounce timer
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = window.setTimeout(() => {
        this.flushUpdates;
      }, this.debounceDelay);

      // Set up max wait fallback
      if (this.maxWaitTimer === null) {
        this.maxWaitTimer = window.setTimeout(() => {
          this.flushUpdates();
        }, this.maxWaitDelay);
      }
    }

    flushUpdates() {
      sendUpdatesToServer()

      // Clear timers
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (this.maxWaitTimer !== null) {
        clearTimeout(this.maxWaitTimer);
        this.maxWaitTimer = null;
      }
    }

    destroy() {
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }
      if (this.maxWaitTimer !== null) {
        clearTimeout(this.maxWaitTimer);
      }
    }
  }
);

/**
 * Call this during editor setup to enable collaborative editing.
 */
export function createCollabExtensions(startVersion: number, clientID: string): Extension[] {
  return [
    collab({ startVersion, clientID }),
    collabPlugin
  ];
}

function isFullTextChange(change: any): change is [number, string] {
  return (
    Array.isArray(change) &&
    change.length === 1 &&
    typeof change[0][0] === "number" &&
    typeof change[0][1] === "string"
  );
}


/**
 * Applies updates received from the server to the editor.
 */
export function applyServerUpdates(
  view: EditorView,
  updates: { clientID: string; changes: any }[],
  version: number
) {
  log.debug("applying server updates")
  log.debug(`Version check! client is at ${getSyncedVersion(view.state)}, server is at ${version}`)
  
  const deserialized = updates.map((u) => {
    if (isFullTextChange(u.changes)) {
      log.debug("fulltextchange")
      const newText = u.changes[0][1];
      const docLength = view.state.doc.length;

      return {
        clientID: u.clientID,
        changes: ChangeSet.of([
          {
            from: 0,
            to: docLength,
            insert: Text.of(newText.split("\n")),
          },
        ]),
      };
    }
    log.debug("normal update")
    return {
      clientID: u.clientID,
      changes: ChangeSet.fromJSON(u.changes, view.state.doc),
    };
  });
  log.debug("receiving updates")
  try {
    // ✅ Clear matching pending updates
    updates.forEach((u) => {
      if (u.clientID === lsGet("userID")) {
        confirmPendingUpdate(u.clientID); // this removes the greyed-out decoration
      }
    });
    const tr = receiveUpdates(view.state, deserialized, version);
    view.dispatch(tr);
    log.debug(`New client version is ${getSyncedVersion(view.state)}`)
  } catch (err) {
    console.error("❌ Failed to apply updates, requesting resync. - ", err);
    //requestResync(getActiveDocId());
  }
}