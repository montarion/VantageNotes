// server.ts
import {
    syncProtocol,
    awarenessProtocol,
    encoding,
    decoding,
  } from "./deps.ts";
  import { DocManager } from "./doc.ts";
  import { log } from "../log.ts";
  import * as Y from "npm:yjs";
  
  const MESSAGE_SYNC = 0;
  const MESSAGE_AWARENESS = 1;
  
  interface Room {
    doc: Y.Doc;
    awareness: awarenessProtocol.Awareness;
    sockets: Set<WebSocket>;
  }
  
  // Map room name → Room object
  const rooms = new Map<string, Room>();
  
  export function createYjsHandler(
    docManager: DocManager,
    options?: { basePath?: string },
  ) {
    return async (req: Request): Promise<Response> => {
  
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 400 });
      }
  
      const { socket, response } = Deno.upgradeWebSocket(req);
      const url = new URL(req.url);
      const basePath = options?.basePath ?? "/static/notes/";
      let pathname = url.pathname;

  
      // Normalize path
      if (basePath !== "/" && pathname.startsWith(basePath)) {
        pathname = pathname.slice(basePath.length);
      }
      pathname = pathname.replace(/^\/+/, "").replace(/\/+$/, "").slice(3);

      const docName = pathname || "default";
  
      
  
      // --- Get or create room ---
      let room = rooms.get(docName);
      if (!room) {
        const doc = await docManager.get(docName);
        const awareness = new awarenessProtocol.Awareness(doc);
  
        room = { doc, awareness, sockets: new Set() };
        rooms.set(docName, room);
  
        // Attach a single update listener per doc
        doc.on("update", (update: Uint8Array) => {
          // Persist update (non-blocking)
          if (docManager["persistence"]) {
            docManager["persistence"].storeUpdate(docName, update).catch(console.error);
          }
  
          // Broadcast to all connected sockets
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.writeUpdate(encoder, update);
          const msg = encoding.toUint8Array(encoder);
  
          for (const s of room!.sockets) {
            if (s.readyState === WebSocket.OPEN) s.send(msg);
          }
        });
      }
  
      const { doc, awareness, sockets } = room;
      sockets.add(socket);
  
      // Assign a unique clientID for this socket
      const clientID = Math.floor(Math.random() * 0xffffffff);
      socket["_clientID"] = clientID;

  
      // --- WS Handlers ---
      socket.onopen = () => {
        // Send full document state
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, doc);
        socket.send(encoding.toUint8Array(encoder));
        // Send current awareness of all clients
        const allStates = Array.from(awareness.getStates().keys());
        if (allStates.length > 0) {
          const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
            awareness,
            allStates,
          );
          if (awarenessUpdate) {
            const enc = encoding.createEncoder();
            encoding.writeVarUint(enc, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(enc, awarenessUpdate);
            socket.send(encoding.toUint8Array(enc));
          }
        }
      };
  
      socket.onmessage = (event) => {
        const data = new Uint8Array(event.data);
        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);
  
        try {
          if (messageType === MESSAGE_SYNC) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
          
            syncProtocol.readSyncMessage(decoder, encoder, doc);
          
            socket.send(encoding.toUint8Array(encoder));
          } else if (messageType === MESSAGE_AWARENESS) {
            const update = decoding.readVarUint8Array(decoder);
            awarenessProtocol.applyAwarenessUpdate(awareness, update, socket);
  
            // Broadcast awareness update to other clients
            const enc = encoding.createEncoder();
            encoding.writeVarUint(enc, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(enc, update);
            const msg = encoding.toUint8Array(enc);
  
            for (const s of sockets) {
              if (s.readyState === WebSocket.OPEN && s !== socket) {
                s.send(msg);
              }
            }
          }
        } catch (e) {
          console.error("WS message processing error:", e);
        }
      };
  
      socket.onclose = () => {
        sockets.delete(socket);
        awarenessProtocol.removeAwarenessStates(
          awareness,
          Array.from(awareness.getStates().keys()),
          socket
        );  
        if (sockets.size === 0) rooms.delete(docName);
  
      };
  
      return response;
    };
  }
  