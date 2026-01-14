import { ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { findLuaBlocks } from "./luaEditor.ts";
import { debounceAsync } from "../common/helpers.ts";
import { runLuaScript } from "../common/luaVM.ts";

const DEBOUNCETIME = 500; //ms
export function luaExecutionPlugin(runLua: (code: string) => Promise<any>) {
  let lastHashes = new Map<number, string>();
  const runLuaDebounced = debounceAsync(runLuaScript, DEBOUNCETIME);
  return ViewPlugin.fromClass(
    class {
      async update(update: ViewUpdate) {
        if (!update.docChanged) return;

        const blocks = findLuaBlocks(update.state);

        for (const block of blocks) {
          const hash = block.code; // simple hash; replace with real hash later
          const prev = lastHashes.get(block.from);

          if (prev === hash) continue;

          lastHashes.set(block.from, hash);

          try {
            
            //const result = await runLua(block.code);
            const result = await runLuaDebounced(block.code)
            console.debug("Lua result:", result);
          } catch (err) {
            console.error("Lua error:", err);
          }
        }
      }
    }
  );
}
