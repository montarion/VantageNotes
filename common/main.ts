import { runLuaScript } from "./luaVM.ts";
//import { createCollabEditor, newEditor } from "./editor.ts";
import { Navigation } from "./navigation.ts";
import { parse } from "./dslParser.ts";
import { tokenize } from "./dslTokenizer.ts";
import { matches } from "./dslEvaluator.ts";
import { sampleNotes } from "./lua/queryEngine.ts";
import { getLS, setLS } from "./helpers.ts";

import { createDocumentManager } from "./documentManager.ts";
import { YjsEditor } from "./editor.ts";
import { toast } from "./toast.ts";
import { Logger } from "./logger.ts";
const log = new Logger({ namespace: "Main" });

window.toast = toast

const nav = new Navigation();
window.nav = nav

await nav.updateFileList()
window.documentManager = createDocumentManager();

// Create a single editor container
const container = document.getElementById("editor-container")!;

// Open initial document (homepage)
const homepageDoc = await window.documentManager.open("homepage", { online: true });

const editor = new YjsEditor(container, homepageDoc);

nav.setEditor(editor);

// Load last tab or default
await nav.loadLastTab();


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
    await nav.switchTab(path);
  }
});