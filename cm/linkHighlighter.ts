import { Extension } from "npm:@codemirror/state";
import { createHighlighter, mark } from "../cm/MarkdownHighlighterFactory.ts";

/**
 * Highlights [[wikilinks]] with a CSS class
 * Becomes "active" when the cursor is inside
 */
export function linkHighlighter(): Extension {
  return createHighlighter({
    regexp: /\[\[([^\]]+?)\]\]/g,

    invalidateOnSelection: true,

    decorate(from, to, visible) {
      const cls = visible
        ? "cm-wikilink-bracket cm-visible"
        : "cm-wikilink-bracket";

      return [
        mark(from, from + 2, cls), // [[
        mark(to - 2, to, cls),     // ]]
      ];
    },
  });
}