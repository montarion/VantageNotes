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

log.debug("logtes1")
window.toast = toast

const nav = new Navigation();
window.nav = nav
log.debug("logtest2")

await nav.updateFileList()
window.documentManager = createDocumentManager();
log.debug("logtest3")

// Create a single editor container
const container = document.getElementById("editor-container")!;
log.debug("logtest4")

// Open initial document (homepage)
const homepageDoc = await window.documentManager.open("homepage", { online: true });
log.debug("logtest5")

log.debug("opened homepage")
const editor = new YjsEditor(container, homepageDoc);
log.debug("created editor")
editor.setValue(homepageDoc.text)
log.debug("explicitly set text")
// Wire Navigation to the editor
nav.setEditor(editor);

// Load last tab or default
//await nav.loadLastTab();




await runLuaScript(`
  PKM.query()
  .tag("todo")
  .olderThan(30)
  .select("id", "title")
  .sortBy("ageDays", "desc")
  .limit(2)
  .run()
  :each(function(note)
  print(note)
      print(note.id, note.title)
  end)
`);

window.addEventListener("popstate", async () => {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (path) {
    await nav.switchTab(path);
  }
});