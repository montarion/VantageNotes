import { Extension } from "npm:@codemirror/state";
import { createTreeHighlighter } from "./delimiterFactory.ts";

/**
 * Highlights #tags
 * Becomes "active" when the cursor is inside the tag
 */
export const tagHighlighter = createTreeHighlighter({
  nodeTypes: ["Paragraph", "Heading"], // only scan normal text
  regex: /(?<!\S)(#[a-zA-Z0-9_-]+)/g,

  prefix: m => [[m.index, m.index + 1]],
  content: m => [m.index + 1, m.index + m[0].length],

  prefixClass: "cm-tag-hash",
  contentClass: "cm-tag cm-link",

  invalidateOnSelection: true,
});
