import { ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { findLuaBlocks } from "./luaEditor.ts";

export function luaExecutionPlugin(runLua: (code: string) => Promise<any>) {
  let lastHashes = new Map<number, string>();

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
            const result = await runLua(block.code);
            console.debug("Lua result:", result);
          } catch (err) {
            console.error("Lua error:", err);
          }
        }
      }
    }
  );
}
