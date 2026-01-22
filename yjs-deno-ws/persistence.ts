import type { Y } from "./deps.ts";

export interface Persistence {
  load(docName: string, doc: Y.Doc): Promise<void>;
  storeUpdate(docName: string, update: Uint8Array): Promise<void>;
}
