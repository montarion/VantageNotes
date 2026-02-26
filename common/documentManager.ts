// documentManager.ts
import * as Y from "npm:yjs";
import { WebsocketProvider } from "npm:y-websocket";
import { IndexeddbPersistence } from "npm:y-indexeddb";
import { Logger, Logging } from '../common/logger.ts';
import { MetadataExtractor } from "./metadata.ts";
import { createMetadataIndexer } from "./metadataindexer.ts";
import { getApp } from "./app.ts";
const log = new Logger({ namespace: 'DocumentManager', minLevel: 'debug' });

type DocumentId = string;
const WSURL = `wss://${window.location.host}/ws`;
let timers = [];
//const WSURL = `ws://${window.location.hostname}:11625/ws/`;

export type ManagedDocument = {
  id: DocumentId;
  ydoc: Y.Doc;
  ytext: Y.Text;
  text: string;
  indexeddb: IndexeddbPersistence;
  provider?: WebsocketProvider;
};

export type DocumentManager = {
  open(
    id: DocumentId,
    options?: { initialContent?: string; online?: boolean }
  ): Promise<ManagedDocument>;
  connect(id: DocumentId): Promise<void>;
  disconnect(id: DocumentId): void;
  getText(id: DocumentId): string;
  setText(id: DocumentId, text: string): void;
  destroy(id: DocumentId): void;
};

export async function createDocumentManager(): Promise<DocumentManager> {
  const docs = new Map<DocumentId, ManagedDocument>();
  
  
  

  async function open(
    docId: DocumentId,
    options?: { initialContent?: string; online?: boolean}
  ): Promise<ManagedDocument> {
    let bundle = docs.get(docId);
    if (bundle) return bundle;

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(docId);

    const indexeddb = new IndexeddbPersistence(`note:${docId}`, ydoc);
    await indexeddb.whenSynced;
    
    // Hydrate from server if empty
    if (ytext.length === 0) {
      let content = options?.initialContent;
      if (!content) {
        const res = await fetch(`/notes/${docId}`);
        if (res.ok) content = await res.text();
      }
      if (content) {
        ydoc.transact(() => {
          ytext.insert(0, content);
        });
      }
    }
    ytext.observe(() => {
      scheduleMetadataReindex(docId);
    });
    
    let provider = new WebsocketProvider(WSURL, docId, ydoc);
    provider.awareness.setLocalStateField("user", {
      id: "user-" + Math.floor(Math.random() * 1000000),
      name: "User",
    });
    await new Promise<void>((resolve) => provider.once("sync", () => resolve()));
    
    bundle = { id: docId, ydoc, ytext, text: ytext.toString(), indexeddb, provider };
    docs.set(docId, bundle);
    return bundle;
  }

  async function connect(id: DocumentId) {
    const doc = docs.get(id);
    if (!doc) throw new Error(`Document ${id} not opened`);
    if (doc.provider) return;

    doc.provider = new WebsocketProvider(WSURL, id, doc.ydoc);
    doc.provider.awareness.setLocalStateField("user", {
      id: "user-" + Math.floor(Math.random() * 1000000),
      name: "User",
    });
    await new Promise<void>((resolve) => doc.provider!.once("sync", () => resolve()));
  }

  function disconnect(id: DocumentId) {
    const doc = docs.get(id);
    if (!doc?.provider) return;

    doc.provider.awareness.setLocalState(null);
    doc.provider.destroy();
    doc.provider = undefined;
  }

  async function getText(id: DocumentId): Promise<string> {
    let doc = docs.get(id);
  
    // Already open → just return text
    if (doc) {
      return doc.ytext.toString();
    }
  
    // Not in cache → hydrate from server (offline-only, no websocket)
    const res = await fetch(`/notes/${id}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch document ${id}`);
    }
  
    const content = await res.text();
  
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(id);
  
    const indexeddb = new IndexeddbPersistence(`note:${id}`, ydoc);
    await indexeddb.whenSynced;
  
    // Only insert if empty (avoid overwriting persisted state)
    if (ytext.length === 0 && content) {
      ydoc.transact(() => {
        ytext.insert(0, content);
      });
    }
  
    ytext.observe(() => {
      scheduleMetadataReindex(id);
    });
  
    doc = {
      id,
      ydoc,
      ytext,
      text: ytext.toString(),
      indexeddb,
      provider: undefined, // explicitly no websocket
    };
  
    docs.set(id, doc);
  
    return ytext.toString();
  }

  function setText(id: DocumentId, text: string) {
    const doc = docs.get(id);
    if (!doc) throw new Error(`Document ${id} not opened`);
    doc.ydoc.transact(() => {
      doc.ytext.delete(0, doc.ytext.length);
      doc.ytext.insert(0, text);
    });
  }

  function destroy(id: DocumentId) {
    const doc = docs.get(id);
    if (!doc) return;

    disconnect(id);
    doc.indexeddb.destroy();
    doc.ydoc.destroy();
    docs.delete(id);
  }

  function scheduleMetadataReindex(docId: string) {
    clearTimeout(timers[docId]);
    timers[docId] = setTimeout(async () => {
      log.debug(`Updating ${docId} metadata!\n text is:`)
      const text = await getText(docId);
      log.debug(text)
      const metadata = await MetadataExtractor.extractMetadata(text);
      console.debug(metadata)
      const {metadataIndexer} = getApp()
      metadataIndexer.indexDocument(docId, metadata);
    }, 400);
  }

  return {
    open,
    connect,
    disconnect,
    getText,
    setText,
    destroy,
  };
}



