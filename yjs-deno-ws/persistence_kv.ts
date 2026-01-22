import { Persistence } from "./persistence.ts";
import * as Y from "npm:yjs";

export class KvPersistence implements Persistence {
  constructor(private kv: Deno.Kv) {}

  async load(docName: string, doc: Y.Doc) {
    const updates = this.kv.list<Uint8Array>({
      prefix: ["yjs", docName, "update"],
    });

    for await (const entry of updates) {
      Y.applyUpdate(doc, entry.value);
    }
  }

  async storeUpdate(docName: string, update: Uint8Array) {
    const key = ["yjs", docName, "update", crypto.randomUUID()];
    await this.kv.set(key, update);
  }
}
