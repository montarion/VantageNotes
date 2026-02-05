import { log } from "../log.ts";
import type { Y } from "./deps.ts";
import * as Yd from "npm:yjs";


export abstract class Persistence {
  async load(docName: string, doc: Y.Doc): Promise<void> {
    await this.loadImpl(docName, doc);
  }

  async storeUpdate(docName: string, update: Uint8Array): Promise<void> {

    this.beforeStoreUpdate(docName, update);

    await this.storeUpdateImpl(docName, update);

    await this.afterStoreUpdate(docName, update);
  }

  protected abstract loadImpl(
    docName: string,
    doc: Y.Doc,
  ): Promise<void>;

  protected abstract storeUpdateImpl(
    docName: string,
    update: Uint8Array,
  ): Promise<void>;

  protected beforeStoreUpdate(
    _docName: string,
    _update: Uint8Array,
  ) {}

  protected async afterStoreUpdate(
    docName: string,
    _update: Uint8Array,
  ) {

    const doc = new Yd.Doc();
    await this.load(docName, doc);
    const text = doc.getText(docName).toString();


    await Deno.writeTextFile(`./static/notes/${docName}.md`, text);
    
    doc.destroy();
  }
}
