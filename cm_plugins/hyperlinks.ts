import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
  } from "npm:@codemirror/view";
  import { RangeSetBuilder } from "npm:@codemirror/state";
  import { isRangeSelected, ZeroWidthWidget } from "../common/pluginhelpers.ts";
  import { metadataStore, Hyperlink, Imagelink } from "./metadata.ts";
  import { Logger } from "../common/logger.ts";

const log = new Logger({ namespace: "hyperlinks", minLevel: "debug" });

  // Regex for hyperlinks: [label](url), not preceded by !
  const markdownLinkRegex = /(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g;
  // Regex for image links: ![alt](url)
  const imageLinkRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const rawUrlRegex = /\bhttps?:\/\/[^\s<>()]+\b/g;
  class HyperlinkWidget extends WidgetType {
    constructor(readonly label: string, readonly url: string) {
      super();
    }
  
    toDOM(): HTMLElement {
      const a = document.createElement("a");
      a.href = this.url;
      a.textContent = this.label;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "cm-hyperlink";
      a.onmousedown = (e) => {
        e.preventDefault();
        window.open(this.url, "_blank", "noopener,noreferrer");
      };

      return a;
    }
  
    ignoreEvent() {
      return false;
    }
  }
  
  class ImageWidget extends WidgetType {
    constructor(readonly alt: string, readonly url: string) {
      super();
    }
  
    toDOM(): HTMLElement {
      const img = document.createElement("img");
      img.src = this.url;
      img.alt = this.alt;
      img.title = this.alt;
      img.className = "cm-image";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "20em";
      img.onmousedown = (e) => {
        e.preventDefault();
        window.open(this.url, "_blank", "noopener,noreferrer");
      };
      return img;
    }
  
    ignoreEvent() {
      return false;
    }
  }
  
  export const hyperlinkPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
  
      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }
  
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
  
      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const foundLinks: Hyperlink[] = [];
        const foundImages: Imagelink[] = [];
      
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            const text = line.text;
            let match: RegExpExecArray | null;
      
            const alreadyMatched: [number, number][] = [];
      
            // --- Image links first ---
            while ((match = imageLinkRegex.exec(text)) !== null) {
              const [fullMatch, alt, url] = match;
              const matchStart = line.from + match.index;
              const matchEnd = matchStart + fullMatch.length;
      
              alreadyMatched.push([matchStart, matchEnd]);
      
              if (!isRangeSelected(view, matchStart, matchEnd)) {
                builder.add(
                  matchStart,
                  matchEnd,
                  Decoration.widget({
                    widget: new ImageWidget(alt, url),
                    side: 1,
                  })
                );
                if (!isRangeSelected(view, matchStart, matchEnd)){
                  builder.add(
                    matchStart,
                    matchEnd,
                    Decoration.replace({ widget: new ZeroWidthWidget() })
                  );
                }
      
                foundImages.push({
                  altText: alt,
                  url: url,
                  line: line.number,
                  context: text,
                });
              }
            }
      
            // --- Normal links, skipping image link ranges ---
            while ((match = markdownLinkRegex.exec(text)) !== null) {
              const [fullMatch, label, url] = match;
              const matchStart = line.from + match.index;
              const matchEnd = matchStart + fullMatch.length;
      
              // Skip if overlaps image match
              if (alreadyMatched.some(([start, end]) => matchStart < end && matchEnd > start)) {
                continue;
              }
      
              if (!isRangeSelected(view, matchStart, matchEnd)) {
                builder.add(
                  matchStart,
                  matchEnd,
                  Decoration.widget({
                    widget: new HyperlinkWidget(label, url),
                    side: 1,
                  })
                );
                builder.add(
                  matchStart,
                  matchEnd,
                  Decoration.replace({ widget: new ZeroWidthWidget() })
                );
      
                foundLinks.push({
                  label,
                  url,
                  line: line.number,
                  context: text,
                });
              }
            }
            
            while ((match = rawUrlRegex.exec(text)) !== null) {
                const [url] = match;
                const matchStart = line.from + match.index;
                const matchEnd = matchStart + url.length;
              
                // Skip if overlaps image or markdown links
                if (alreadyMatched.some(([start, end]) => matchStart < end && matchEnd > start)) {
                  continue;
                }
              
                if (!isRangeSelected(view, matchStart, matchEnd)) {
                  builder.add(
                    matchStart,
                    matchEnd,
                    Decoration.widget({
                      widget: new HyperlinkWidget(url, url),
                      side: 1,
                    })
                  );
                  //builder.add(
                  //  matchStart,
                  //  matchEnd,
                  //  Decoration.replace({ widget: new ZeroWidthWidget() })
                  //);
              
                  foundLinks.push({
                    label: url,
                    url,
                    line: line.number,
                    context: text,
                  });
                }
              }

            pos = line.to + 1;
          }
        }
      
        metadataStore.updateHyperlinks(foundLinks);
        metadataStore.updateImages?.(foundImages);
      
        return builder.finish();
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  );
  