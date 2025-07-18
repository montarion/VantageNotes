// collaboration.ts
import { EditorView, ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { collab, receiveUpdates, sendableUpdates, getSyncedVersion } from "npm:@codemirror/collab";
import { Extension,Annotation  } from "npm:@codemirror/state";
import { Logger } from "../common/logger.ts";
const log = new Logger({ namespace: "Collaboration", minLevel: "debug" });
// Utility function to send updates to your server (you can customize this)
import { sendUpdates } from "../common/websockets.ts";
import { loadFile } from "../common/navigation.ts";

export const userEvent = Annotation.define<string>();

// Plugin: watches for doc changes and sends updates to server
export const collabPlugin = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {}

  update(update: ViewUpdate) {
    log.debug("collabPlugin update() fired", update);

    if (!update.docChanged) return;
    log.debug("Updating!")
    const sendable = sendableUpdates(update.state);
    log.debug(sendable)
    if (sendable && sendable.updates && sendable.updates.length > 0) {
      sendUpdates(sendable.updates, getSyncedVersion(update.state));
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
export function applyServerUpdates(view: EditorView, updates: any[] = [], version: number) {
    if (!view?.state) {
      console.trace("No editor state, cannot apply server updates");
      return;
    }
    if (!updates) {
      console.warn("No updates provided, skipping applyServerUpdates");
      return;
    }
    // Check if the updates contain the synthetic full document update
  if (
    updates.length === 1 &&
    updates[0]?.type === "full-replace" &&
    typeof updates[0].content === "string"
  ) {
    // Full document replacement:
    const fullText = updates[0].content;

    // Create a transaction to replace entire doc content
    const transaction = view.state.update({
      changes: { from: 0, to: view.state.doc.length, insert: fullText },
      annotations: userEvent.of("full-replace"),
    });

    view.dispatch(transaction);

    // After full replace, update the collaboration state version to server's version
    // (You might need to update your collaboration state manually here if necessary)
    // For example:
    // view.dispatch({ effects: setCollabVersion.of(version) });

    return;
  }

  // Otherwise, assume normal incremental collaboration updates
  const tr = receiveUpdates(view.state, updates, version);
  view.dispatch(tr);
  }
