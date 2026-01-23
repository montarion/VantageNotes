// doc.ts
import * as Y from "npm:yjs";
import type { Persistence } from "./persistence.ts";
import { log } from "../log.ts";

export class DocManager {
  private docs = new Map<string, Y.Doc>();

  constructor(private persistence?: Persistence) {}

  async get(name: string): Promise<Y.Doc> {
    let doc = this.docs.get(name);
    if (doc) return doc;

    doc = new Y.Doc();
    this.docs.set(name, doc);

    if (this.persistence) {
      await this.persistence.load(name, doc);
      doc.on("update", (update: Uint8Array) => {
        this.persistence!.storeUpdate(name, update);
      });
    }

    return doc;
  }
}
