//delimiters.ts

import { findIndentedBlock, previousLineIsQuote } from "../common/helpers.ts";
import { Logger } from "../common/logger.ts";
import { createDelimitedHighlighter } from "./delimiterFactory.ts";
const log = new Logger({ namespace: "Delimiter" });

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


  /* ────────────────────────────── */
/* Blockquotes (> quote)          */
/* ────────────────────────────── */
export const blockquoteHighlighter = createDelimitedHighlighter({
  regexp: /(^|\n)(>+)\s*([^\n]*)/g,

  line: m => m.index + m[1].length,

  prefix: m => {
    const start = m.index + m[1].length;
    return [[start, start + m[2].length + 1]];
  },

  content: m => {
    const start = m.index + m[1].length + m[2].length + 1;
    return [start, start + m[3].length];
  },

  prefixClass: "cm-quote-marker",
  contentClass: "cm-quote",
  lineClass: "cm-quote-line",

  /** 🔥 NEW */
  lineClassWhen: m =>
    previousLineIsQuote(m) ? null : "cm-quote-start",


  type: "blockquote",
  invalidateOnSelection: true,
});

/* ────────────────────────────── */
/* Horizontal rule (---)           */
/* ────────────────────────────── */
export const hrHighlighter = createDelimitedHighlighter({
  regexp: /(^|\n)(-{3,}|\*{3,}|_{3,})(?=\n|$)/g,

  line: m => m.index + m[1].length,
  lineClass: "cm-hr",
  // hide the actual --- text
  hidden: m => {
    const start = m.index + m[1].length;
    return [[start, start + m[2].length + 1]];
  },

  hiddenClass: "cm-hidden",
  type: "thematic-break",
  invalidateOnSelection: true,
});

/* ────────────────────────────── */
/* Code blocks (```lang … ```)    */
/* ────────────────────────────── */
export const codeBlockHighlighter = createDelimitedHighlighter({
  regexp: /(^|\n)(```+)([^\n]*)\n([\s\S]*?)(?:\n)?(\2)(?=\n|$)/g,

  // 🔥 always hide fences + lang
  hidden: m => {
    const openStart = m.index + m[1].length;
    const openEnd = openStart + m[2].length + m[3].length;

    const closeStart = m.index + m[0].lastIndexOf(m[5]);
    const closeEnd = closeStart + m[5].length;

    return [
      [openStart, openEnd],   // ```lang
      [closeStart, closeEnd], // ```
    ];
  },

  hiddenClass: "cm-hidden",

  // only decorate the code body
  block: m => {
    const start =
      m.index +
      m[1].length +
      m[2].length +
      m[3].length +
      1;

    return {
      from: start,
      to: start + m[4].length,
    };
  },

  blockClass: "cm-code cm-code-block",

  type: "code-fence",
  invalidateOnSelection: true,
});


/* ────────────────────────────── */
/* Inline code (`code`)           */
/* ────────────────────────────── */
export const inlineCodeHighlighter = createDelimitedHighlighter({
  // single backticks, no whitespace-only content
  regexp: /(?<!`)`([^`\n]+)`/g,

  // hide the backticks
  hidden: m => {
    const openTick = m.index;
    const closeTick = m.index + m[0].length - 1;

    return [
      [openTick, openTick + 1],     // `
      [closeTick, closeTick + 1],   // `
    ];
  },

  hiddenClass: "cm-hidden",

  // visible content
  content: m => [
    m.index + 1,
    m.index + 1 + m[1].length,
  ],

  contentClass: "cm-code cm-code-inline",

  type: "inline-code",
  invalidateOnSelection: true,
});



// admonitions
export const admonitionHighlighter = createDelimitedHighlighter({
  regexp: /(^|\n)!!!\s+([a-zA-Z0-9_-]+)(?:\s+(.*))?/g,

  // header line decoration
  line: m => m.index + m[1].length,
  lineClass: "cm-admonition-header",

  // hide !!!
  hidden: m => {
    const start = m.index + m[1].length;
    return [[start, start + 3]];
  },
  hiddenClass: "cm-hidden",

  // decorate the TYPE
  prefix: m => {
    const start = m.index + m[1].length + 4; // !!!␠
    return [[start, start + m[2].length]];
  },

  // decorate the TITLE (if any)
  content: m => {
    if (!m[3]) return undefined as any;
    const start =
      m.index + m[1].length + 4 + m[2].length + 1;
    return [start, start + m[3].length];
  },

  prefixClass: "cm-admonition-type",
  contentClass: "cm-admonition-title",

  // body block (unchanged)
  block: m => {
    const text = m.input;
    const headerEnd =
      text.indexOf("\n", m.index) + 1;

    return findIndentedBlock(text, headerEnd);
  },
  blockClass: "cm-admonition-body",

  type: "admonition",
  getTarget: m => m[2], // still the type
  invalidateOnSelection: true,
});

/* ────────────────────────────── */
/* Entity references (@thing|alias) */
/* ────────────────────────────── */
export const atReferenceHighlighter = createDelimitedHighlighter({
  regexp: /(?<!\S)@([^|\s]+)(?:\|([^\s]+))?/g,

  // @
  prefix: m => [[m.index, m.index + 1]],

  // visible content
  content: m => {
    if (m[2]) {
      // alias
      const aliasStart =
        m.index + 1 + m[1].length + 1; // @name|
      return [aliasStart, aliasStart + m[2].length];
    }

    // no alias → show name
    return [m.index + 1, m.index + 1 + m[1].length];
  },

  // hide canonical name when alias exists
  hidden: m =>
    m[2]
      ? [[
          m.index + 1,
          m.index + 1 + m[1].length + 1, // name|
        ]]
      : undefined,

  prefixClass: "cm-entity-at",
  contentClass: "cm-entity cm-link",
  hiddenClass: "cm-hidden",

  type: "entity",
  getTarget: m => m[1], // canonical id

  invalidateOnSelection: true,
});


/* ────────────────────────────── */
/* Semantics (::a::b/c|alias)     */
/* ────────────────────────────── */
export const semanticHighlighter = createDelimitedHighlighter({
  regexp: /(?<!\S)::([^|\s]+(?:::[^|\s]+)*)(?:\|([^\s]+))?/g,

  // ::
  prefix: m => [[m.index, m.index + 2]],

  content: m => {
    if (m[2]) {
      // alias exists
      const aliasStart =
        m.index + 2 + m[1].length + 1; // ::path|
      return [aliasStart, aliasStart + m[2].length];
    }

    // no alias → show last segment only
    const parts = m[1].split("::");
    const last = parts[parts.length - 1];
    const offset = m[1].length - last.length;

    return [
      m.index + 2 + offset,
      m.index + 2 + m[1].length,
    ];
  },

  // hide everything except alias or last segment
  hidden: m => {
    if (m[2]) {
      return [[
        m.index + 2,
        m.index + 2 + m[1].length + 1, // path|
      ]];
    }

    const parts = m[1].split("::");
    if (parts.length <= 1) return undefined;

    const hideLen =
      m[1].length - parts[parts.length - 1].length;

    return [[
      m.index + 2,
      m.index + 2 + hideLen,
    ]];
  },

  prefixClass: "cm-semantic-colon",
  contentClass: "cm-semantic",
  hiddenClass: "cm-hidden",

  type: "semantic",
  getTarget: m => m[1], // full semantic path

  invalidateOnSelection: true,
});
