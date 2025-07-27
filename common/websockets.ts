// websockets.ts
import { Logger } from "./logger.ts";
import { ChangeSet } from "npm:@codemirror/state";
import { EditorView } from "npm:@codemirror/view";
import { collab, getSyncedVersion, receiveUpdates } from "npm:@codemirror/collab";
import { applyServerUpdates, getDocumentMode, setActiveDocId, setDocumentMode } from "../cm_plugins/collaboration.ts";
import { shortUUID } from "./pluginhelpers.ts";
import { getActiveTab, setContent } from "./tabs.ts";

let linkedView: EditorView | null = null;

const log = new Logger({ namespace: "Websockets", minLevel: "debug" });

let socket: WebSocket | null = null;
let docID: string;
let userID: string;

let syncedVersion = 0;

let resolveInit: ((data: { updates: any[]; version: number }) => void) | null = null;
let pendingUpdateHandlers: ((updates: any[], version: number) => void)[] = [];
let bufferedInit: { updates: any[]; version: number } | null = null;




  const docStates: Record<string, {
    view: EditorView | null;
    version: number;
    bufferedInit: { updates: any[], version: number } | null;
    resolveInit?: (data: { updates: any[]; version: number }) => void;
  }> = {};
  
  
  /**
   * Connect WebSocket (singleton).
   */
  export function connectSocket() {
    log.debug("inside connectsocket")
    if (socket) return;
    log.debug("creating new socket")
    const url = new URL(`ws://${location.hostname}:${location.port}/ws`);
    url.searchParams.append("user", encodeURIComponent(userID));
  
    socket = new WebSocket(url);
  
    socket.onopen = () => {
      log.info("✅ WebSocket connected");
    };
  
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      log.debug("Received message:", message)
      log.debug("message keys:", Object.keys(message))
      const docId = message.doc;
  
      if (!docId) {
        log.warn("⚠️ Received message with no 'doc' field:", message);
        return;
      }
  
      const state = docStates[docId];
      if (!state) {
        log.warn(`⚠️ No local state for doc '${docId}'`);
        return;
      }
  
      switch (message.type) {
        case "init":
          log.warn(message)
          log.debug(`Document ${message.doc} mode is: ${message.mode}`)
          setDocumentMode(message.doc, message.mode)
          log.debug(getDocumentMode(message.doc))
          if (message.mode == "single"){
            break
          } else if (message.mode == "collaborative") {
            if (state.view) {
              log.debug("collaborative init")
              // link to document, just in case it hadn´t happened yet
              
              applyServerUpdates(state.view, message.updates, message.version);
            } else {
              state.bufferedInit = { updates: message.updates, version: message.version };
            }
            state.version = message.version;
            state.resolveInit?.({ updates: message.updates, version: message.version });
          }
          break;
  
        case "updates":
          if (state.view) {
            applyServerUpdates(state.view, message.updates, message.version);
            state.version = message.version;
          } else {
            log.warn(`⚠️ Received updates for doc ${docId} but view not ready. state: `, state);
          }
          break;
  
        default:
          log.warn("⚠️ Unknown message type:", message.type);
      }
    };
  
    socket.onerror = (err) => log.error("WebSocket error:", err);
    socket.onclose = () => {
      console.log("🔌 WebSocket closed");
      socket = null;
    };
  }
  
  /**
   * Join a document (initial connection).
   */
  export function joinDocument(docId: string): Promise<{ updates: any[], version: number }> {
    log.debug("inside joinDocument")
    connectSocket();
  
    return new Promise((resolve) => {
      docStates[docId] = {
        view: null,
        version: 0,
        bufferedInit: null,
        resolveInit: resolve
      };
      setActiveDocId(docId)
      socket!.send(JSON.stringify({
        type: "joinDoc",
        doc: docId,
        "user_id": getUserID()
        
      }));
  
      console.log(`📨 Sent joinDoc for document: ${docId}`);
    });
  }
  
  /**
   * Link a CodeMirror view to a document.
   */
  export function linkEditorView(docId: string, view: EditorView) {
    const state = docStates[docId];
    if (!state) {
      throw new Error(`Document ${docId} not joined yet`);
    }
  
    state.view = view;
  
    if (state.bufferedInit) {
      setTimeout(() => {
        log.debug("linkeditorView")
        applyServerUpdates(view, state.bufferedInit!.updates, state.bufferedInit!.version);
        state.version = state.bufferedInit!.version;
        state.bufferedInit = null;
      }, 0);
    }
  }
  
  /**
   * Send update for a specific document.
   */
  export function sendUpdates(docId: string, changes: ChangeSet[], version: number) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ Cannot send update. WebSocket not open.");
      return;
    }
  
    socket.send(JSON.stringify({
      type: "updates",
      "doc": docId,
      version,
      updates: changes,
      "user_id": getUserID()
    }));
  }
  
  /**
   * Request resync from server for a document.
   */
  export function requestResync(docId: string) {
    socket?.send(JSON.stringify({
      type: "resync-request",
      "doc": docId,
      "user_id": getUserID()
    }));
  }
  
  
  /**
   * Util: Get current user ID (persistent)
   */
  export function getUserID(): string {
    let id = localStorage.getItem("USERID");
    if (!id) {
      id = shortUUID(6);
      localStorage.setItem("USERID", id);
    }
    return id;
  }