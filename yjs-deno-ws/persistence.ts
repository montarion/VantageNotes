import type { Y } from "./deps.ts";
import * as Yd from "npm:yjs";
import { ensureFile } from "jsr:@std/fs/ensure-file";
import { MetadataExtractor } from "../common/metadata.ts";
import { MetadataIndexer, createMetadataIndexer } from "../common/metadataindexer.ts";
import { createServerDB } from "../common/server-db.ts";
import { Logger } from "../common/logger.ts";
import { addToIndex, searchindex } from "../search.ts";
const log = new Logger({ namespace: "yjs.persistence" });

export abstract class Persistence {
  metadataindexer: MetadataIndexer;
  constructor(
  ) {
    this.metadataindexer = createMetadataIndexer(createServerDB("vantagenotes.db"))
  }
  async load(docName: string, doc: Y.Doc): Promise<void> {
    await this.loadImpl(docName, doc);
  }

  async storeUpdate(docName: string, update: Uint8Array): Promise<void> {

    this.beforeStoreUpdate(docName, update);

    await this.storeUpdateImpl(docName, update);

    await this.debounceAfterStoreUpdate(docName, update);
  }
  private debounceTimers = new Map<string, number>();
  private debounceDelay = 2000; // ms
  private debounceAfterStoreUpdate(
      docName: string,
      update: Uint8Array
    ) {
    const existing = this.debounceTimers.get(docName);
  
    if (existing) {
      clearTimeout(existing);
    }
  
    const timeout = setTimeout(async () => {
      try {
        await this.afterStoreUpdate(docName, update);
      } catch (err) {
        console.error("afterStoreUpdate failed:", err);
      } finally {
        this.debounceTimers.delete(docName);
      }
    }, this.debounceDelay);
  
    this.debounceTimers.set(docName, timeout);
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
    // get document text
    const doc = new Yd.Doc();
    await this.load(docName, doc);
    const text = doc.getText(docName).toString();
    
    // save file to filesystem
    const filePath = decodeURI(`./static/notes/${docName}.md`)
    await ensureFile(filePath);
    await Deno.writeTextFile(filePath, text);

    //// update database
    
    //// get metadata for text
    let metadata = await MetadataExtractor.extractMetadata(text)
    this.metadataindexer.indexDocument(docName, metadata)
    addToIndex(searchindex, docName, text, metadata)
    log.warn("UPDATED METADATA ON SERVER")

    
    doc.destroy();
  }
}
