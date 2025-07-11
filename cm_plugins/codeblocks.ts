// singularCodeblockPlugin.js
import { markdown } from "npm:@codemirror/lang-markdown";
import { languages } from "npm:@codemirror/language-data";
import { ViewPlugin, Decoration, DecorationSet, WidgetType  } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";

import { isRangeSelected, ZeroWidthWidget} from "../common/pluginhelpers.ts";
import { metadataStore, CodeBlock } from "./metadata.ts";

import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'Codeblocks', minLevel: 'debug' });

function getCodeBlockRanges(doc) {
  const text = doc.toString();
  const fenceRegex = /^```.*$/gm;
  let match;
  const fences = [];

  while ((match = fenceRegex.exec(text)) !== null) {
    fences.push(match.index);
  }

  const ranges = [];
  for (let i = 0; i + 1 < fences.length; i += 2) {
    ranges.push({ from: fences[i], to: fences[i + 1] + 3 }); // +3 to cover closing ```
  }
  
  return ranges;
}

function isInCodeBlock(lineFrom, lineTo, codeBlockRanges) {
  return codeBlockRanges.some(({ from, to }) => lineFrom >= from && lineTo <= to);
}

export const decorateCodeblockLinesPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.build(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.build(update.view);
    }
  }

  build(view) {
    const builder = new RangeSetBuilder();
    const codeBlockRanges = getCodeBlockRanges(view.state.doc);
    const foundCodeBlocks: CodeBlock[] = [];
  
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
  
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
  
        const fenceRange = codeBlockRanges.find(range =>
          line.from === range.from || line.from === (range.to - line.length)
        );
  
        if (fenceRange) {
          const lineNumber = view.state.doc.lineAt(line.from).number;
  
          // If opening fence
          if (line.from === fenceRange.from) {
            // Extract language label (e.g. ```js)
            const langMatch = line.text.match(/^```(\w+)?/);
            const language = langMatch?.[1] ?? null;
  
            const toLineNumber = view.state.doc.lineAt(fenceRange.to).number;
  
            foundCodeBlocks.push({
              fromLine: lineNumber,
              toLine: toLineNumber,
              language
            });
  
            builder.add(line.from, line.from, Decoration.line({ class: "cm-codeblock-label" }));
          } else {
            builder.add(line.from, line.from, Decoration.line({ class: "cm-codeblock" }));
          }
  
          // Hide the opening/closing ```
          builder.add(line.from, line.from + 3, Decoration.replace({ widget: new ZeroWidthWidget() }));
        } else if (isInCodeBlock(line.from, line.to, codeBlockRanges)) {
          builder.add(line.from, line.from, Decoration.line({ class: "cm-codeblock" }));
        }
  
        pos = line.to + 1;
      }
    }
  
    // Optionally update metadata store here if you want live sync:
    metadataStore.updateCodeBlocks(foundCodeBlocks);
  
    return builder.finish();
  }
  

  destroy() {}
}, {
  decorations: v => v.decorations
});