// metadata.ts

import { Logger } from './logger.ts';
import { loadFile } from './navigation.ts';
import { getActivePane } from './pane.ts';
import { getActiveTab, openEditorTab } from './tabs.ts';
import yaml from 'npm:js-yaml';

const log = new Logger({ namespace: 'Metadata', minLevel: 'debug' });

const tabStores = new Map<string, MetadataStore>();

export function getMetadataStoreForTab(tabId: string): MetadataStore {
  if (!tabStores.has(tabId)) {
    tabStores.set(tabId, new MetadataStore());
  }
  return tabStores.get(tabId)!;
}
// ---------- Metadata Types ----------
export interface Header { level: number; text: string; line: number; }
export interface Tag { name: string; line: number; context: string; }
export interface Task { text: string; checked: boolean; line: number; }
export interface CodeBlock { language: string | null; fromLine: number; toLine: number; code?: string; }
export interface Wikilink { target: string; alias?: string; line: number; context: string; }
export interface Hyperlink { url: string; label: string; line: number; context: string; }
export interface Imagelink { url: string; altText: string; line: number; context: string; }
export interface PageMetadata {
  lineCount: number;
  tags: Tag[];
  headers: Header[];
  tasks: Task[];
  codeBlocks: CodeBlock[];
  wikilinks: Wikilink[];
  hyperlinks: Hyperlink[];
  images: Imagelink[];
  frontmatter?: Record<string, any>;
  text: string;
}

// ---------- Metadata Store ----------
class MetadataStore {
  private text: string;
  private frontmatter: Record<string, any>;
  private tags: Tag[] = [];
  private headers: Header[] = [];
  private tasks: Task[] = [];
  private codeBlocks: CodeBlock[] = [];
  private wikilinks: Wikilink[] = [];
  private hyperlinks: Hyperlink[] = [];
  private images: Imagelink[] = [];
  private lineCount = 0;

  

  updateTags(newTags: Required<Tag>[]) {
    newTags.forEach(t => {
      if (!this.tags.some(existing => JSON.stringify(existing) === JSON.stringify(t))) {
        this.tags.push(t);
      }
    });
  }

  updateHeaders(newHeaders: Header[]) {
    newHeaders.forEach(h => {
      if (!this.headers.some(existing => JSON.stringify(existing) === JSON.stringify(h))) {
        this.headers.push(h);
      }
    });
  }

  updateTasks(newTasks: Task[]) {
    newTasks.forEach(t => {
      if (!this.tasks.some(existing => JSON.stringify(existing) === JSON.stringify(t))) {
        this.tasks.push(t);
      }
    });
  }

  updateCodeBlocks(newBlocks: CodeBlock[]) { this.codeBlocks = newBlocks; }
  updateWikilinks(newLinks: Wikilink[]) {
    newLinks.forEach(l => {
      if (!this.wikilinks.some(existing => JSON.stringify(existing) === JSON.stringify(l))) {
        this.wikilinks.push(l);
      }
    });
  }
  updateHyperlinks(newLinks: Hyperlink[]) {
    newLinks.forEach(l => {
      if (!this.hyperlinks.some(existing => JSON.stringify(existing) === JSON.stringify(l))) {
        this.hyperlinks.push(l);
      }
    });
  }
  updateImages(newLinks: Imagelink[]) {
    newLinks.forEach(l => {
      if (!this.images.some(existing => JSON.stringify(existing) === JSON.stringify(l))) {
        this.images.push(l);
      }
    });
  }
  updateLineCount(lines: number) { this.lineCount = lines; }

  getMetadata(): PageMetadata {

    return {
      lineCount: this.lineCount,
      tags: this.tags,
      headers: this.headers,
      tasks: this.tasks,
      codeBlocks: this.codeBlocks,
      wikilinks: this.wikilinks,
      hyperlinks: this.hyperlinks,
      images: this.images,
      text: this.text,
      frontmatter: this.frontmatter
    };
  }
}

export const metadataStore = new MetadataStore();

// ---------- Metadata Extraction ----------
export function extractMetadataFromText(text: string): PageMetadata {
  const lines = text.split(/\r?\n/);

  let frontmatter: Record<string, any> | undefined;
  let contentStart = 0;

  // ---------- Frontmatter ----------
  if (lines[0].trim() === "---") {
    const endIndex = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (endIndex > 0) {
      const yamlBlock = lines.slice(1, endIndex).join("\n");
      try {
        frontmatter = yaml.load(yamlBlock) as Record<string, any>;
        
      } catch (e) {
        log.error("Failed to parse YAML frontmatter:", e);
      }
      contentStart = endIndex + 1;
    }
  }
  
  const headers: Header[] = [];
  const tasks: Task[] = [];
  const tags: Tag[] = [];
  const wikilinks: Wikilink[] = [];
  const hyperlinks: Hyperlink[] = [];
  const codeBlocks: CodeBlock[] = [];
  const images: Imagelink[] = [];

  let inCodeBlock = false;
  let codeBlockStartLine = 0;
  let codeBlockLanguage: string | null = null;
  let codeBlockContent: string[] = [];

  lines.slice(contentStart).forEach((line, idx) => {
    const lineNumber = idx + 1 + contentStart;

    // ---------- Headers ----------
    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      headers.push({ level: headerMatch[1].length, text: headerMatch[2], line: lineNumber });
    }

    if (frontmatter){
      if (!("title" in frontmatter)) {
        const firstH1 = headers.find(h => h.level === 1);
        if (firstH1) frontmatter.title = firstH1.text;
      }
    }
    // ---------- Tasks ----------
    const taskMatch = line.match(/^[-*] \[( |x|X)\] (.+)/);
    if (taskMatch) {
      tasks.push({ checked: taskMatch[1].toLowerCase() === "x", text: taskMatch[2], line: lineNumber });
    }

    // ---------- Tags ----------
    const tagMatches = [...line.matchAll(/#(\w+)/g)];
    tagMatches.forEach(t => tags.push({ name: t[1], line: lineNumber, context: line }));

    // ---------- Wikilinks ----------
    const wikilinkMatches = [...line.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
    wikilinkMatches.forEach(m =>
      wikilinks.push({ target: m[1], alias: m[2] || undefined, line: lineNumber, context: m[0] })
    );

    // ---------- Hyperlinks ----------
    const linkMatches = [...line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    linkMatches.forEach(m => hyperlinks.push({ label: m[1], url: m[2], line: lineNumber, context: m[0] }));

    // ---------- Images ----------
    const imageMatches = [...line.matchAll(/!\[(.*?)\]\((.*?)\)/g)];
    imageMatches.forEach(m => images.push({ altText: m[1], url: m[2], line: lineNumber, context: m[0] }));

    // ---------- Code Blocks ----------
    const codeBlockStartMatch = line.match(/^```(\w+)?/);
    if (codeBlockStartMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockStartLine = lineNumber;
        codeBlockLanguage = codeBlockStartMatch[1] || "plain";
        codeBlockContent = [];
      } else {
        // closing code block
        inCodeBlock = false;
        codeBlocks.push({
          language: codeBlockLanguage,
          fromLine: codeBlockStartLine,
          toLine: lineNumber,
          code: codeBlockContent.join("\n"),
        });
      }
      return; // skip further processing on this line
    }

    if (inCodeBlock) codeBlockContent.push(line);

    

    
  });

  return {
    frontmatter,
    lineCount: lines.length,
    headers,
    tasks,
    tags,
    wikilinks,
    hyperlinks,
    codeBlocks,
    images,
    text,
  };
}



export function getMetadata(text: string) {
  return extractMetadataFromText(text);
  
}

// ---------- Metadata Panel ----------
export async function showMetadataPanel(tabId: string) {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) { log.error("Sidebar not found"); return; }
  sidebar.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "search-result-panel panel";
  panel.innerHTML = `
    <div class="panel-header">Metadata (click to toggle)</div>
    <div class="panel-content" id="metadata-panel">
      <p>Loading metadata...</p>
    </div>
  `;
  sidebar.appendChild(panel);

  try {
    let tab = getActiveTab()
    const metadata = tab.metadata;
    
    // save metadata for this tab
    const store = getMetadataStoreForTab(tabId);
    store.updateTags(metadata.tags);
    store.updateHeaders(metadata.headers);
    store.updateTasks(metadata.tasks);
    store.updateCodeBlocks(metadata.codeBlocks);
    store.updateWikilinks(metadata.wikilinks);
    store.updateHyperlinks(metadata.hyperlinks);
    store.updateImages(metadata.images);
    //store.updateLineCount(metadata.lineCount);

    const content = panel.querySelector(".panel-content")!;
    content.innerHTML = "";
    content.append(renderMetadata(store.getMetadata(), tab?.title));
  } catch (e) {
    log.error("Failed to load metadata:", e);
    panel.querySelector(".panel-content")!.innerHTML = "<p>Error loading metadata</p>";
  }
}

function renderMetadata(metadata: PageMetadata, filename: string): HTMLElement {
  const container = document.createElement("div");

  const createSection = (title: string, children: (HTMLElement | string)[]) => {
    const section = document.createElement("div");
    section.className = "panel";
    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = `${title} (click to toggle)`;

    // Toggle visibility
    const content = document.createElement("div");
    content.className = "panel-content";
    if (!children.length) content.textContent = "None";
    else children.forEach(c => typeof c === "string" ? content.appendChild(document.createTextNode(c)) : content.appendChild(c));

    header.addEventListener("click", () => {
      content.style.display = content.style.display === "none" ? "block" : "none";
    });

    section.appendChild(header);
    section.appendChild(content);
    return section;
  };

  const renderList = (items: any[], type: string) => items.map(item => {
    const el = document.createElement("a");
    el.href = "#";
    el.className = type;

    // Helper to scroll editor
    const scrollToLine = (line: number) => {
      const editor = openEditorTab({paneId:getActivePane(), filename}); // assume returns a CodeMirror-like instance
      if (!editor) return;
      editor.scrollToLine(line - 1); // zero-based index
      editor.setCursor({ line: line - 1, ch: 0 });
      editor.focus();
    };

    if (type === "cm-tag") { el.dataset.tag = item.name; el.textContent = `#${item.name}`; }
    if (type === "meta-header") {
      el.dataset.header = item.text;
      el.textContent = `H${item.level}: ${item.text}`;
      el.addEventListener("click", e => { e.preventDefault(); scrollToLine(item.line); });
    }
    if (type === "meta-task") {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = item.checked;
      cb.dataset.task = item.text;
      cb.addEventListener("click", e => e.stopPropagation()); // prevent label click
      label.appendChild(cb);
      label.append(` ${item.text}`);
      label.addEventListener("click", () => scrollToLine(item.line));
      return label;
    }
    if (type === "cm-wikilink") {
      el.dataset.wikilink = item.target;
      el.textContent = `[[${item.target}${item.alias ? `|${item.alias}` : ""}]]`;
      el.addEventListener("click", e => { e.preventDefault(); openEditorTab(item.target); });
    }
    if (type === "meta-link") { el.href = item.url; el.textContent = item.label || item.url; }
    if (type === "meta-code") {
      el.dataset.codeLang = item.language || "plain";
      el.textContent = item.language || "plain";
      el.addEventListener("click", () => scrollToLine(item.fromLine));
    }

    return el;
  }).flat();

  if (metadata.tags?.length) container.appendChild(createSection("Tags", renderList(metadata.tags, "cm-tag")));
  if (metadata.headers?.length) container.appendChild(createSection("Headers", renderList(metadata.headers, "meta-header")));
  if (metadata.tasks?.length) container.appendChild(createSection("Tasks", renderList(metadata.tasks, "meta-task")));
  if (metadata.wikilinks?.length) container.appendChild(createSection("Wikilinks", renderList(metadata.wikilinks, "cm-wikilink")));
  if (metadata.hyperlinks?.length) container.appendChild(createSection("Links", renderList(metadata.hyperlinks, "meta-link")));
  if (metadata.codeBlocks?.length) container.appendChild(createSection("Languages", renderList(metadata.codeBlocks, "meta-code")));
  if (metadata.images?.length) container.appendChild(createSection("Images", metadata.images.map(img => {
    const i = document.createElement("img");
    i.src = img.url;
    i.alt = img.altText || "";
    i.style.maxWidth = "100px";
    return i;
  })));

  return container;
}
