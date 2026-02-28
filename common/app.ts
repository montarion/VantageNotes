// app.ts
// stuff I'll need anywhere in the app

import { initBrowserDB } from "./browser-db.ts";
import { createDocumentManager } from "./documentManager.ts";
import { Logger } from "./logger.ts";
import { MetadataExtractor } from "./metadata.ts";
import { MetadataIndexer, createMetadataIndexer } from "./metadataindexer.ts";
import { Navigation } from "./navigation.ts";
import { Search } from "./search.ts";
const log = new Logger({ namespace: "Appcontext" });

export interface AppContext {
  documentManager: Awaited<ReturnType<typeof createDocumentManager>>;
  navigation: Navigation;
  db: DBInterface;
  metadataIndexer: MetadataIndexer;
  search: Search;
  
}

let _app: AppContext | null = null;

export function setApp(app: AppContext):AppContext {
  _app = app;
  return _app
}

export function getApp(): AppContext {
  if (!_app) {
    throw new Error("App not initialized");
  }
  return _app;
}
export async function createApp(): Promise<AppContext> {
    const db = await initBrowserDB()
    const documentManager = await createDocumentManager();
    const navigation = new Navigation();
    const metadataIndexer = createMetadataIndexer(db);
    await metadataIndexer.init()
    const search = new Search({
      mode: "remote",
    });
    
  return { documentManager, navigation, db, metadataIndexer, search};
}