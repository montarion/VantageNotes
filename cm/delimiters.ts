import { createDelimitedHighlighter } from "./delimiterFactory.ts";


/* ────────────────────────────── */
/* Tags (#tag)           */
/* ────────────────────────────── */
export const tagHighlighter = createDelimitedHighlighter({
    regexp: /(?<!\S)(#[a-zA-Z0-9_-]+)/g,
  
    prefix: m => [[m.index, m.index + 1]],
    content: m => [m.index + 1, m.index + m[0].length],
  
    prefixClass: "cm-tag-hash",
    contentClass: "cm-tag cm-link",
    type: "tag",
    getTarget: m => m[0],
    invalidateOnSelection: true,
  });


/* ────────────────────────────── */
/* Wikilinks ([[note]])           */
/* ────────────────────────────── */
export const wikilinkHighlighter = createDelimitedHighlighter({
    regexp: /(?<!\!)\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g,
  
    // [[
    prefix: m => [[m.index, m.index + 2]],
  
    // content to display
    content: m => {
      if (m[2]) {
        // alias exists → show alias only
        const aliasStart = m.index + 2 + m[1].length + 1; // [[note|
        return [aliasStart, aliasStart + m[2].length];
      }
  
      // no alias → show only basename
      const fullPath = m[1];
      const base = fullPath.split("/").pop()!;
      const baseOffset = fullPath.length - base.length;
      return [m.index + 2 + baseOffset, m.index + 2 + fullPath.length];
    },
  
    // ]]
    suffix: m => [[m.index + m[0].length - 2, m.index + m[0].length]],
  
    prefixClass: "cm-wikilink-bracket",
    contentClass: "cm-wikilink cm-link",
    suffixClass: "cm-wikilink-bracket",
  
    // hidden ranges: hide full path before alias or before basename
    hidden: m => {
      if (m[2]) {
        // hide everything except alias
        return [[m.index + 2, m.index + 2 + m[1].length + 1]]; // [[note|
      } else {
        // hide folders, show only basename
        const fullPath = m[1];
        const base = fullPath.split("/").pop()!;
        const folderLength = fullPath.length - base.length;
        if (folderLength > 0) {
          return [[m.index + 2, m.index + 2 + folderLength]]; // hide folders
        }
        return undefined;
      }
    },
  
    hiddenClass: "cm-hidden",
    type: "wikilink",
  
    // full path is still the target
    getTarget: m => m[1],
  
    invalidateOnSelection: true,
  });
  
  /* ────────────────────────────── */
  /* Transclusions (![[note]])      */
  /* ────────────────────────────── */
  export const transclusionHighlighter = createDelimitedHighlighter({
    regexp: /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g,
  
    // ! and [[
    prefix: m => [
      [m.index, m.index + 1],      // !
      [m.index + 1, m.index + 3],  // [[
    ],
  
    // Visible content
    content: m => {
      if (m[2]) {
        // alias exists → show alias only
        const aliasStart =
          m.index + 3 + m[1].length + 1; // ![[note|
        return [aliasStart, aliasStart + m[2].length];
      }
  
      // no alias → show target
      return [m.index + 3, m.index + 3 + m[1].length];
    },
  
    // ]]
    suffix: m => [[
      m.index + m[0].length - 2,
      m.index + m[0].length,
    ]],
  
    // 🔥 hide `note|`
    hidden: m =>
      m[2]
        ? [[
            m.index + 3,
            m.index + 3 + m[1].length + 1, // note|
          ]]
        : undefined,
  
    prefixClass: "cm-transclusion-syntax",
    contentClass: "cm-transclusion cm-link",
    suffixClass: "cm-transclusion-syntax",
    hiddenClass: "cm-hidden",
  
    type: "transclusion",
    getTarget: m => m[1],
  
    invalidateOnSelection: true,
  });
  
  /* ────────────────────────────── */
  /* Markdown hyperlinks [text](url) */
  /* ────────────────────────────── */
  export const markdownLinkHighlighter = createDelimitedHighlighter({
    // Capture [text](url) as whole
    regexp: /\[([^\]]+)\]\(([^)]+)\)/g,
  
    prefix: m => [[m.index, m.index + 1]],                       // [
    content: m => [m.index + 1, m.index + 1 + m[1].length],     // text
    suffix: m => [[m.index + 1 + m[1].length, m.index + m[0].length]], // ](url)
  
    prefixClass: "cm-link-syntax",
    contentClass: "cm-markdownlink cm-link",
    suffixClass: "cm-link-syntax",
    type: "markdownlink",
    getTarget: m => m[2],  // the URL is the target
    invalidateOnSelection: true,
  });

  /* ────────────────────────────── */
  /* Headers #* header */
  /* ────────────────────────────── */
  export const headerHighlighter = createDelimitedHighlighter({
    // start of line (^ or after \n), 1–6 #'s, space, then text
    regexp: /(^|\n)(#{1,6})\s+([^\n]+)/g,

    prefix: m => {
        const lineStart = m.index + m[1].length;
        return [[lineStart, lineStart + m[2].length + 1]]; // ###␠
    },

    content: m => {
        const lineStart = m.index + m[1].length;
        const start = lineStart + m[2].length + 1;
        return [start, start + m[3].length];
    },
  
    prefixClass: "cm-header-hash",
    contentClass: "cm-header cm-link",
  
    type: "header",
    getTarget: m => m[3], // header text
  
    invalidateOnSelection: true,
  });