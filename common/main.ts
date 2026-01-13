import { runLuaScript } from "./luaVM.ts";
//import { createCollabEditor, newEditor } from "./editor.ts";
import { Navigation } from "./navigation.ts";
import { parse } from "./dslParser.ts";
import { tokenize } from "./dslTokenizer.ts";
import { matches } from "./dslEvaluator.ts";
import { sampleNotes } from "./lua/queryEngine.ts";
import { getLS, setLS } from "./helpers.ts";


import { YjsEditor } from "./editor.ts";

const container = document.getElementById("editor-container");
if (!container) throw new Error("No editor container found");

const editor = new YjsEditor(container);

// Fetch initial content from server
await editor.loadFromServer();

// Example: set/get value
console.log("Current content:", editor.getValue());



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