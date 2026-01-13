import { runLuaScript } from "./luaVM.ts";
import { newEditor } from "./editor.ts";
import { Navigation } from "./navigation.ts";
import { parse } from "./dslParser.ts";
import { tokenize } from "./dslTokenizer.ts";
import { matches } from "./dslEvaluator.ts";
import { sampleNotes } from "./lua/queryEngine.ts";


const nav = new Navigation()
window.nav = nav;

await nav.updateFileList()
const editor = newEditor(document.getElementById("editor-container"))

nav.showNavigation()

nav.setEditor(editor)
await nav.loadLastTab()
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