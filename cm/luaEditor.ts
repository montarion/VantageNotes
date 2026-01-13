import { syntaxTree } from "npm:@codemirror/language";
import { EditorState } from "npm:@codemirror/state";

export type LuaBlock = {
  from: number;
  to: number;
  code: string;
};

export function findLuaBlocks(state: EditorState): LuaBlock[] {
  const blocks: LuaBlock[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "FencedCode") {
        const text = state.doc.sliceString(node.from, node.to);

        if (!text.startsWith("```lua")) return;

        const code = text
          .replace(/^```lua\s*/, "")
          .replace(/```$/, "")
          .trim();

        blocks.push({
          from: node.from,
          to: node.to,
          code
        });
      }
    }
  });

  return blocks;
}