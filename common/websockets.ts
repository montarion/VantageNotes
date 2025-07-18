// websockets.ts
import { Logger } from "./logger.ts";
import { ChangeSet } from "npm:@codemirror/state";
import { EditorView } from "npm:@codemirror/view";
import { receiveUpdates } from "npm:@codemirror/collab";
import { applyServerUpdates } from "../cm_plugins/collaboration.ts";
import { shortUUID } from "./pluginhelpers.ts";

let linkedView: EditorView | null = null;

const log = new Logger({ namespace: "Websockets", minLevel: "debug" });

let socket: WebSocket | null = null;
let docID: string;
let userID: string;

let syncedVersion = 0;

let resolveInit: ((data: { updates: any[]; version: number }) => void) | null = null;
let pendingUpdateHandlers: ((updates: any[], version: number) => void)[] = [];
let bufferedInit: { updates: any[]; version: number } | null = null;


/**
 * Link a CodeMirror EditorView to this socket.
 * Automatically applies server updates.
 */
export function linkEditorView(view: EditorView) {
    log.debug("LINKING EDITOR TO SOCKET: ", view)
    linkedView = view.view;
  
    if (bufferedInit) {
      // Defer update to next tick to ensure editor is fully ready
      setTimeout(() => {
        if (linkedView) {
          applyServerUpdates(linkedView, bufferedInit.updates, bufferedInit.version);
          bufferedInit = null;
        }
      }, 0);
    }
  }


/**
 * Connect WebSocket and wait for initial document data.
 */
export function connectSocket(documentId: string, userId: string): Promise<{ updates: any[]; version: number }> {
  docID = documentId;
  userID = userId;

  const url = new URL(`ws://${location.hostname}:${location.port}/ws`);
  url.searchParams.append("doc", encodeURIComponent(docID));
  url.searchParams.append("user", encodeURIComponent(userID));

  socket = new WebSocket(url);

  const initPromise = new Promise<{ updates: any[]; version: number }>((resolve) => {
    resolveInit = resolve;
  });

  socket.onopen = () => {
    console.log("🔌 WebSocket connected");
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case "init":
        syncedVersion = msg.version;
        log.info("📥 Initial sync, version", msg.version);

        if (linkedView) {
            log.debug("69", linkedView)
          applyServerUpdates(linkedView, msg.updates, msg.version);
        } else {
          bufferedInit = { updates: msg.updates, version: msg.version };
        }

        resolveInit?.({ updates: msg.updates, version: msg.version });
        resolveInit = null;
        break;

      case "updates":
        syncedVersion = msg.version;
        log.info("📥 Received updates at version", msg.version);

        if (linkedView) {
          linkedView.dispatch(
            receiveUpdates(linkedView.state, msg.updates, msg.version)
          );
        }

        for (const handler of pendingUpdateHandlers) {
          handler(msg.updates, msg.version);
        }
        break;

      default:
        console.warn("⚠️ Unknown message type:", msg.type);
    }
  };

  socket.onclose = () => {
    console.warn("🔌 WebSocket closed. Reconnecting in 3s...");
    setTimeout(() => connectSocket(docID, userID), 3000);
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  return initPromise;
}


/**
 * Switch to a different document in the same WebSocket connection.
 * Applies the new document state to the linked editor view.
 */
export async function switchDocument(newDocId: string): Promise<{ updates: any[]; version: number }> {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }
  log.debug("Switching to new document: ", newDocId)
  docID = newDocId;
  syncedVersion = 0;
  bufferedInit = null;

  const initPromise = new Promise<{ updates: any[]; version: number }>((resolve) => {
    resolveInit = resolve;
  });

  socket.send(JSON.stringify({
    type: "switchDoc",
    doc: newDocId,
  }));

  // Wait for server to respond with new doc's init updates
  const initData = await initPromise;

  if (linkedView) {
    log.debug(linkedView)
    applyServerUpdates(linkedView, initData.updates, initData.version);
  } else {
    bufferedInit = initData;
  }

  return initData;
}


/**
 * Add handler for updates from server
 */
export function onServerUpdate(handler: (updates: any[], version: number) => void) {
  pendingUpdateHandlers.push(handler);
}

/**
 * Send local changes to server
 */
export function sendUpdates(changes: ChangeSet[], version: number) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket not open. Cannot send updates.");
    return;
  }

  const message = {
    type: "updates",
    version,
    updates: changes.map(change => change.toJSON())
  };

  socket.send(JSON.stringify(message));
}

export function getUserID(){// maybe get this from server?
    let id = localStorage.getItem("USERID")
    if (!id){ // couldn't find it
        id = shortUUID(6)
        localStorage.setItem("USERID", id)
    }
    return id
}
/**
 * Manually set synced version
 */
export function setSyncedVersion(newVersion: number) {
  syncedVersion = newVersion;
}
