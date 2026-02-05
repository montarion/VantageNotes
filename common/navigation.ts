import { YjsEditor } from "./editor";
import { Logger } from "./logger.ts";
import { getLS, Note, setLS } from "./helpers.ts";
import { MetadataExtractor } from "./metadata.ts";

const log = new Logger({ namespace: "Navigation" });

type NoteNode = {
  name: string;
  type: "file" | "folder";
  children?: NoteNode[];
};

export class Navigation {
  editor?: YjsEditor;

  notesTree: NoteNode[] = [];
  notesMap: Record<string, Note> = {};

  navdiv = document.querySelector("nav") as HTMLElement;
  sidediv = document.querySelector("#sidebar") as HTMLElement;

  // ────────────── Wiring ──────────────

  setEditor(editor: CMEditor) {
    this.editor = editor;
  }

  // ────────────── Panel controls ──────────────

  showNavigation() {
    this.updateFileList();
    if (this.navdiv) {
      this.navdiv.style.flexGrow = "1";
      this.navdiv.style.minWidth = "200px";
    }
  }

  closeNavigation() {
    if (this.navdiv) {
      this.navdiv.style.flexGrow = "0";
      this.navdiv.style.minWidth = "0px";
    }
  }

  showSidebar() {
    if (this.sidediv) {
      this.sidediv.style.flexGrow = "1";
      this.sidediv.style.minWidth = "200px";
    }
  }

  closeSidebar() {
    if (this.sidediv) {
      this.sidediv.style.flexGrow = "0";
      this.sidediv.style.minWidth = "0px";
    }
  }

  // ────────────── Navigation rendering ──────────────

  populateNavigation() {
    if (!this.navdiv) return;
    this.navdiv.innerHTML = "";

    const buildNode = (
      node: NoteNode,
      container: HTMLElement,
      parentPath = ""
    ) => {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;

      const item = document.createElement("div");
      item.className =
        node.type === "folder" ? "folder-item" : "file-item";
      item.textContent = node.name.endsWith(".md")
        ? node.name.slice(0, -3)
        : node.name;

      if (node.type === "file") {
        item.addEventListener("click", async () => {
          await this.switchTab(fullPath);
        });
      }

      if (node.type === "folder" && node.children) {
        const children = document.createElement("div");
        children.className = "folder-children";
        children.style.paddingLeft = "1rem";

        node.children.forEach(child =>
          buildNode(child, children, fullPath)
        );

        item.appendChild(children);
        item.addEventListener("click", () => {
          children.style.display =
            children.style.display === "none" ? "block" : "none";
        });
      }

      container.appendChild(item);
    };

    this.notesTree.forEach(node => buildNode(node, this.navdiv));
  }

  // ────────────── File list ──────────────

  flattenTree(nodes: NoteNode[], parentPath = ""): Note[] {
    const out: Note[] = [];

    for (const node of nodes) {
      const path = parentPath ? `${parentPath}/${node.name}` : node.name;

      if (node.type === "folder" && node.children) {
        out.push(...this.flattenTree(node.children, path));
      }

      if (node.type === "file") {
        out.push({
          path,
          id: undefined,
          title: node.name.endsWith(".md")
            ? node.name.slice(0, -3)
            : node.name,
          frontmatter: undefined,
          dirty: false,
          lastLoadedAt: undefined,
        });
      }
    }

    return out;
  }

  async updateFileList() {
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) throw new Error(res.statusText);

      const tree = (await res.json()) as NoteNode[];
      this.notesTree = tree;

      this.notesMap = {};
      for (const note of this.flattenTree(tree)) {
        this.notesMap[note.path] = note;
      }
      log.debug(this.notesMap)
      setLS("all_notes", Object.keys(this.notesMap))
      
      this.populateNavigation();
    } catch (err) {
      console.error(err);
    }
  }

  // ────────────── Tab management ──────────────

  async switchTab(docId: string) {
    if (!this.editor) return;

    const clean = docId.replace(/\.md$/, "");
    this.setTabInPath(clean);

    // Open the document via DocumentManager
    log.debug(clean)
    const doc = await window.documentManager.open(clean, { online: true });
    
    // parse metadata //TODO: make that cache
    let metadata = MetadataExtractor.extractMetadata(doc.text);
    log.debug(metadata)
    // Use the editor method to switch document cleanly
    this.editor.switchDocument(doc);
    

    this.editor.focus();
  }
  async getFile(docId: string): Promise<string> {
    // Ensure the document is opened in the document manager
    const doc = await window.documentManager.open(docId, { online: true });
    return doc.ytext.toString();
  }
  async loadLastTab() {
    const fromPath = this.getTabFromPath();
    const fromLS = getLS<string>("lastTab");

    const tab = fromPath ?? fromLS;
    if (tab) {
      await this.switchTab(tab);
    } else {
      await this.switchTab("homepage")
    }
  }

  closeTab(_docId: string) {
    // no-op for now; editor just switches
  }

  // ────────────── Path helpers ──────────────

  private getTabFromPath(): string | null {
    const clean = window.location.pathname.replace(/^\/+/, "");
    return clean || null;
  }

  private setTabInPath(filename: string) {
    history.pushState({}, "", "/" + filename);
  }
}
