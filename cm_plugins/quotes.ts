import { ViewPlugin, Decoration } from "npm:@codemirror/view";
import { RangeSetBuilder } from "npm:@codemirror/state";

function getQuoteBlockRanges(doc) {
  const lines = doc.toString().split("\n");
  const ranges = [];
  let start = null;

  for (let i = 0; i < lines.length; i++) {
    const isQuote = /^\s*>/.test(lines[i]);

    if (isQuote && start === null) {
      start = i;
    } else if (!isQuote && start !== null) {
      ranges.push({ fromLine: start, toLine: i - 1 });
      start = null;
    }
  }

  // Handle quote block at end of file
  if (start !== null) {
    ranges.push({ fromLine: start, toLine: lines.length - 1 });
  }

  return ranges;
}

function isInQuoteBlock(lineNumber, quoteBlockRanges) {
  return quoteBlockRanges.some(({ fromLine, toLine }) =>
    lineNumber >= fromLine && lineNumber <= toLine
  );
}

export const decorateQuoteBlocksPlugin = ViewPlugin.fromClass(
  class {
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
      const quoteBlockRanges = getQuoteBlockRanges(view.state.doc);

      for (const { from, to } of view.visibleRanges) {
        let pos = from;

        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const lineNumber = view.state.doc.lineAt(pos).number - 1;

          const block = quoteBlockRanges.find(
            ({ fromLine, toLine }) =>
              lineNumber >= fromLine && lineNumber <= toLine
          );

          if (block) {
            const isFirstLine = lineNumber === block.fromLine;
            const className = isFirstLine
              ? "cm-blockquote-title"
              : "cm-blockquote";

            builder.add(line.from, line.from, Decoration.line({ class: className }));
          }

          pos = line.to + 1;
        }
      }

      return builder.finish();
    }

    destroy() {}
  },
  {
    decorations: (v) => v.decorations,
  }
);
