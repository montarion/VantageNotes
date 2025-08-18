// codeblocks.ts
import { markdown } from "npm:@codemirror/lang-markdown";
import { languages } from "npm:@codemirror/language-data";
import { ViewPlugin, Decoration, DecorationSet, WidgetType  } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";

import { isRangeSelected, ZeroWidthWidget } from "../common/pluginhelpers.ts";
import { metadataStore, CodeBlock } from "./metadata.ts";

import { Logger } from '../common/logger.ts';
import { runCode, runnerMap } from "./jsworker.ts";
import { getActivePane, GetPane } from "../common/pane.ts";
import { htmlOutputPerBlockPlugin } from "./htmlOutputPlugin.ts";
const log = new Logger({ namespace: 'Codeblocks', minLevel: 'debug' });

// A widget to show the codeblock label (e.g. "css", "javascript")
class CodeblockLabelWidget extends WidgetType {
  constructor(readonly language: string | null) {
    super();
  }

  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-codeblock-label";
    el.textContent = this.language?.replaceAll("`", "") ?? "codeblock"; // show language name
    return el;
  }
}

// Run JS block and attach result
async function handleJSCodeBlock(view, codeBlock: CodeBlock) {
  //const runner = runnerMap.get(view);
  //if (!runner) return;

  
  const result = await runCode(view, codeBlock);
  log.warn("the code result was:", result)
  // Schedule update after current editor update to avoid dispatch-in-update error
  //setTimeout(() => {
  //  const plugin = view.plugin(htmlOutputPerBlockPlugin);
  //  
  //  //plugin?.setOutput(codeBlock.toLine, result);
  //});
  
}

// Helpers to detect code blocks
function getCodeBlockRanges(doc) {
  const text = doc.toString();
  const fenceRegex = /^```.*$/gm;
  let match;
  const fences: number[] = [];

  while ((match = fenceRegex.exec(text)) !== null) {
    fences.push(match.index);
  }

  const ranges = [];
  for (let i = 0; i + 1 < fences.length; i += 2) {
    ranges.push({ from: fences[i], to: fences[i + 1] + 3 }); // +3 to cover closing ```
  }
  
  return ranges;
}

function isInCodeBlock(lineFrom: number, lineTo: number, codeBlockRanges: { from: number; to: number }[]) {
  return codeBlockRanges.some(({ from, to }) => lineFrom >= from && lineTo <= to);
}

// Main plugin
export const decorateCodeblockLinesPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.build(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.build(update.view);

      // Re-run JS code blocks if the document changed
      if (update.docChanged) {
        const changedLines = new Set<number>();
        update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          const lineStart = update.view.state.doc.lineAt(fromB).number;
          const lineEnd = update.view.state.doc.lineAt(toB).number;
          for (let i = lineStart; i <= lineEnd; i++) changedLines.add(i);
        });

        const jsBlocks = metadataStore.codeBlocks.filter(cb => cb.language === "javascript");
        const view = update.view;
        for (const block of jsBlocks) {
          // If any changed line intersects this block, re-run it
          if ([...changedLines].some(line => line >= block.fromLine && line <= block.toLine)) {
            handleJSCodeBlock(view, block);
          }
        }
      }
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
  
          if (line.from === fenceRange.from) {
            // Opening fence line
            const langMatch = line.text.match(/^```(\w+)?/);
            const language = langMatch?.[1] ?? null;
            const toLineNumber = view.state.doc.lineAt(fenceRange.to).number;
            const codeStartPos = line.to + 1;
            const codeEndPos = fenceRange.to - 4; // up to the closing fence
            const codeText = view.state.doc.sliceString(codeStartPos, codeEndPos);
  
            const codeBlock: CodeBlock = {
              fromLine: lineNumber,
              toLine: toLineNumber,
              language,
              code: codeText
            };
  
            foundCodeBlocks.push(codeBlock);
  
            if (language === "javascript") {
              runCode(view, codeBlock); 
            }
  
            builder.add(line.from, line.from, Decoration.line({ class: "cm-codeblock-label" }));
            builder.add(line.from, line.to, Decoration.replace({ widget: new CodeblockLabelWidget(language), block: false })
            );
          } else if (line.from === fenceRange.to - line.length) {
            // Closing fence line
            builder.add(line.from, line.to, Decoration.replace({ widget: new ZeroWidthWidget() }));
          } else {
            // Actual code lines inside the block
            builder.add(line.from, line.from, Decoration.line({ class: "cm-codeblock" }));
          }
        } else if (isInCodeBlock(line.from, line.to, codeBlockRanges)) {
          // Lines inside a block but not fence lines
          builder.add(line.from, line.from, Decoration.line({ class: "cm-codeblock" }));
        }
  
        pos = line.to + 1;
      }
    }
  
    metadataStore.updateCodeBlocks(foundCodeBlocks);
    return builder.finish();
  }
  

  destroy() {}
}, {
  decorations: v => v.decorations
});
