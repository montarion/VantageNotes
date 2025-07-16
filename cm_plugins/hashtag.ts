import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from "npm:@codemirror/view";
import { Extension, RangeSetBuilder } from "npm:@codemirror/state";
import { metadataStore, Tag } from "./metadata.ts";
import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'Hashtag', minLevel: 'debug' });
// Matches tags that end with space, newline or end of line
const tagMatcher = /#(\w+)(?=\s|$)/g;


export const tagPlugin: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.buildDecorations(update.view);
        metadataStore.updateLineCount(update.view.state.doc.lines);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const { from, to } = view.viewport;
    
      const foundTags: Tag[] = [];

      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        const text = line.text;
    
        // Reset regex state per line
        tagMatcher.lastIndex = 0;
    
        let match: RegExpExecArray | null;
        while ((match = tagMatcher.exec(text)) !== null) {
          const tag = match[0];
          const tagStart = line.from + match.index;
          const tagEnd = tagStart + tag.length;
    
          // Ensure it's a complete tag (followed by space, newline, or end of text)
          const afterChar = text[match.index + tag.length] || " ";
          const isComplete =
            afterChar === " " || afterChar === "\n" || match.index + tag.length === text.length;
    
          if (!isComplete) continue;
    
          // Optional: skip if cursor is inside tag
          const { main } = view.state.selection;
          const cursorInside = main.from >= tagStart && main.from <= tagEnd;
          if (cursorInside) continue;
    
          // Add decoration
          foundTags.push({ name: tag, line: line.number, context: line });

          builder.add(tagStart, tagEnd, Decoration.mark({ class: "cm-tag" }));
        }
    
        pos = line.to + 1;
      }
      metadataStore.updateTags(foundTags);
      return builder.finish();
  }},
  {
    decorations: (v) => v.decorations,
  }
);
