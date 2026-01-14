// documentManager.ts
import * as Y from "npm:yjs";
import { WebsocketProvider } from "npm:y-websocket";
import { IndexeddbPersistence } from "npm:y-indexeddb";
import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'DocumentManager', minLevel: 'debug' });

type DocumentId = string;
const WSURL = `ws://${window.location.hostname}:11625/`;

export type ManagedDocument = {
  id: DocumentId;
  ydoc: Y.Doc;
  ytext: Y.Text;
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

export function createDocumentManager(): DocumentManager {
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
        log.debug(`Hydrating Y.Text with server content: ${content}`);
        ydoc.transact(() => {
          ytext.insert(0, content);
        });
      }
    }

    let provider;
    if (options?.online) {
      provider = new WebsocketProvider(WSURL, docId, ydoc);
      provider.awareness.setLocalStateField("user", {
        id: "user-" + Math.floor(Math.random() * 1000000),
        name: "User",
      });
      await new Promise<void>((resolve) => provider.once("sync", () => resolve()));
      log.debug(`WebSocket provider connected for ${docId}`);
    }

    bundle = { id: docId, ydoc, ytext, indexeddb, provider };
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

  function getText(id: DocumentId): string {
    const doc = docs.get(id);
    if (!doc) throw new Error(`Document ${id} not opened`);
    return doc.ytext.toString();
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

  return {
    open,
    connect,
    disconnect,
    getText,
    setText,
    destroy,
  };
}



