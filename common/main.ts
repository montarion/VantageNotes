import { runLuaScript } from "./luaVM.ts";
//import { createCollabEditor, newEditor } from "./editor.ts";
import { Navigation } from "./navigation.ts";
import { parse } from "./dslParser.ts";
import { tokenize } from "./dslTokenizer.ts";
import { matches } from "./dslEvaluator.ts";
import { sampleNotes } from "./lua/queryEngine.ts";
import { getLS, setLS } from "./helpers.ts";
import { Sidebar } from "./sidebar.ts";

import { createDocumentManager } from "./documentManager.ts";
import { YjsEditor } from "./editor.ts";
import { toast } from "./toast.ts";
import { Logger } from "./logger.ts";
import { createApp, getApp, setApp } from "./app.ts";
import { createMetadataIndexer } from "./metadataindexer.ts";
import { initBrowserDB } from "./browser-db.ts";
const log = new Logger({ namespace: "Main" });

log.debug("first init")


let app = setApp(await createApp());

log.warn(app)
app.navigation.showNavigation()
// Create a single editor container
const container = document.getElementById("editor-container")!;

// Open initial document (homepage)
const homepageDoc = await app.documentManager.open("homepage", { online: true });

const editor = new YjsEditor(container, homepageDoc);

app.navigation.setEditor(editor);

// Load last tab or default
await app.navigation.loadLastTab();


// register pwa
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/static/scripts/sw.js")
      .then(() => console.log("SW registered"))
      .catch(console.error);
  });
}

window.addEventListener("popstate", async () => {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (path) {
    await app.navigation.switchTab(path);
  }
});