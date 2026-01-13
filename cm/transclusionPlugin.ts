import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
  } from "npm:@codemirror/view";
  import { StateField, RangeSetBuilder } from "npm:@codemirror/state";
  import { Navigation } from "../common/navigation.ts";
  import { Logger } from "../common/logger.ts";

  import { CMEditor, createEditorView } from "../common/editor.ts";
  const log = new Logger({namespace: 'TransclusionPlugin'})

  const TRANSCLUSION_REGEX = /!\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
  const nav = new Navigation
  /* ───────────────────────────────────────────── */
  /* Widget                                        */
  /* ───────────────────────────────────────────── */
  type TransclusionSpec = {
    filename: string;
    header: string | null;
    alias: string | null;
  };

  export class TransclusionWidget extends WidgetType {
    filename: string;
    header: string | null;
    alias: string | null;
    folded: boolean;
    editor?: EditorView;
  
    constructor(spec: TransclusionSpec) {
      super();
      this.filename = spec.filename;
      this.header = spec.header;
      this.alias = spec.alias;
      this.folded = !!spec.alias; // 👈 key rule
    }
  
    eq(other: TransclusionWidget) {
      return (
        this.filename === other.filename &&
        this.header === other.header &&
        this.alias === other.alias &&
        this.folded === other.folded
      );
    }
  
    toDOM() {
      const wrapper = document.createElement("span");
      wrapper.className = "cm-transclusion";
    
      const header = document.createElement("div");
      header.className = "cm-transclusion-header";
      header.textContent =
        this.alias ??
        this.filename + (this.header ? ` › ${this.header}` : "");
      header.onclick = () => {
        this.folded = !this.folded;
        //wrapper.replaceWith(this.toDOM());
      };
      if (!this.alias){
        wrapper.appendChild(header);
      }
    
      if (this.folded) {
        header.classList.add("is-folded");
        return wrapper;
      }
      
      const body = document.createElement("div");
      body.className = "cm-transclusion-body";
      wrapper.appendChild(body);
    
      (async () => {
        try {
          const content = await nav.getFile(this.filename);
          const shown = this.header
            ? extractHeaderSection(content, this.header)
            : content;
    
          this.editor = createEditorView({
            parent: body,
            doc: shown,
            editable: false,
            extensions: [
              EditorView.theme({
                ".cm-gutters": { display: "none" },
                "&": { backgroundColor: "transparent" },
              }),
            ],
          });
        } catch {
          body.textContent = "⚠️ Failed to load";
        }
      })();
    
      return wrapper;
    }
  
    ignoreEvent() {
      return false;
    }
  }
  
  function extractHeaderSection(
    doc: string,
    header: string
  ): string {
    const lines = doc.split("\n");
  
    const headerRegex = new RegExp(
      `^(#{1,6})\\s+${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`
    );
  
    let start = -1;
    let level = 0;
  
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(headerRegex);
      if (m) {
        start = i;
        level = m[1].length;
        break;
      }
    }
  
    if (start === -1) return "";
  
    const result = [lines[start]];
  
    for (let i = start + 1; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+/);
      if (m && m[1].length <= level) break;
      result.push(lines[i]);
    }
  
    return result.join("\n");
  }
  function buildTransclusions(state): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = state.doc.toString();
  
    TRANSCLUSION_REGEX.lastIndex = 0;
    let match;
  
    while ((match = TRANSCLUSION_REGEX.exec(text))) {
      const filename = match[1];
      const header = match[2] ?? null;
      const alias = match[3] ?? null;
      const to = match.index + match[0].length;
  
      const widget =
  isMedia(filename) 
    ? new AsyncMediaWidget(filename, alias) 
    : new TransclusionWidget({ filename, header, alias });
  
      builder.add(
        to,
        to,
        Decoration.widget({
          block: true,
          widget,
        })
      );
    }
  
    return builder.finish();
  }

  export const transclusionField = StateField.define<DecorationSet>({
    create(state) {
      return buildTransclusions(state);
    },
  
    update(deco, tr) {
      if (tr.docChanged) {
        return buildTransclusions(tr.state);
      }
      return deco.map(tr.changes);
    },
  
    provide: f =>
      EditorView.decorations.from(f),
  });

  const MEDIA_EXTENSIONS = [
    "png", "jpg", "jpeg", "gif", "webp", "svg",
    "mp4", "webm", "ogg",
    "mp3", "wav", "flac"
  ];
  
  function isMedia(url: string): boolean {
    if (/^https?:\/\//i.test(url)) {
      // Heuristic: if URL has known extension in path, fine
      const path = url.split("?")[0]; // remove query params
      const ext = path.split(".").pop()?.toLowerCase();
  
      if (ext && MEDIA_EXTENSIONS.includes(ext)) return true;
  
      // Otherwise, assume it's an image if it comes from a media CDN or looks like one
      return true; // ✅ treat any URL in ![[...]] as embeddable by default
    }
  
    // local files
    const ext = url.split(".").pop()?.toLowerCase();
    return !!ext && MEDIA_EXTENSIONS.includes(ext);
  }

  function guessMediaElement(url: string): HTMLElement {
    const path = url.split("?")[0];
    const ext = path.split(".").pop()?.toLowerCase();
  
    if (["mp4","webm","ogg"].includes(ext!)) {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      return video;
    } else if (["mp3","wav","flac"].includes(ext!)) {
      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      return audio;
    } else {
      // fallback: treat everything else as image
      const img = document.createElement("img");
      img.src = url;
      return img;
    }
  }
  
  async function detectMediaType(url: string): Promise<"image" | "video" | "audio" | "link"> {
    try {
      const resp = await fetch(url, { method: "HEAD" });
      const type = resp.headers.get("Content-Type")?.toLowerCase();
  
      if (!type) return "link";
      if (type.startsWith("image/")) return "image";
      if (type.startsWith("video/")) return "video";
      if (type.startsWith("audio/")) return "audio";
  
      return "link"; // unknown type, render as link
    } catch {
      return "link"; // network failure, fallback
    }
  }

  class MediaTransclusionWidget extends WidgetType {
    constructor(
      readonly src: string,
      readonly alias?: string | null
    ) {
      super();
    }
  
    eq(other: MediaTransclusionWidget) {
      return this.src === other.src && this.alias === other.alias;
    }
  
    toDOM() {
      const wrapper = document.createElement("div");
      wrapper.className = "cm-media-embed";
  
      const el = guessMediaElement(this.src);
      if (this.alias) el.setAttribute("alt", this.alias);
  
      wrapper.appendChild(el);
      return wrapper;
    }
  
    ignoreEvent() {
      return false;
    }
  }

  class AsyncMediaWidget extends WidgetType {
    constructor(readonly src: string, readonly alias?: string | null) {
      super();
    }
  
    eq(other: AsyncMediaWidget) {
      return this.src === other.src && this.alias === other.alias;
    }
  
    toDOM() {
      const wrapper = document.createElement("div");
      wrapper.className = "cm-media-embed";
      wrapper.textContent = "Loading…";
  
      (async () => {
        const type = await detectMediaType(this.src);
        wrapper.textContent = "";
  
        let el: HTMLElement;
  
        if (type === "image") {
          const img = document.createElement("img");
          img.src = this.src;
          img.alt = this.alias ?? "";
          el = img;
        } else if (type === "video") {
          const video = document.createElement("video");
          video.src = this.src;
          video.controls = true;
          el = video;
        } else if (type === "audio") {
          const audio = document.createElement("audio");
          audio.src = this.src;
          audio.controls = true;
          el = audio;
        } else {
          const a = document.createElement("a");
          a.href = this.src;
          a.textContent = this.alias ?? this.src;
          a.target = "_blank";
          el = a;
        }
  
        wrapper.appendChild(el);
      })();
  
      return wrapper;
    }
  
    ignoreEvent() {
      return false;
    }
  }
  